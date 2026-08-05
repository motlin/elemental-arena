/** The match screen, redrawn from `S` after every move. */

import {handoffStore} from "./bridge.js";
import {badPlace, cardLabel, clickCard, doToss, lethalRaw, logit, mixPartners, sealed, startMix} from "./cards.js";
import {attackTiles, foeEls, leaveFoe, leaveSelf, liveTargets, selfEls, smashMult, startAttack} from "./combat.js";
import {COST, EL, MV, T} from "./data/index.js";
import {elColor, elName, forgeOf, isComp, wColor, wCost, wDesc, wHits, wStrip, wepDmg, wepName} from "./lookups.js";
import {checkRefill} from "./match.js";
import {
	canEnter,
	dashTargets,
	doFloat,
	doShift,
	doSmash,
	doSpin,
	doTrail,
	doUltra,
	doWipe,
	jumpTargets,
	leapTargets,
	lightTargets,
	markTargets,
	moveBudget,
	reachMap,
	seenBy,
	smashable,
	spinTiles,
	spreadTargets,
	swapTargets,
	takeCard,
	theftTargets,
	warpTargets,
	whirlList,
	wipeTiles,
} from "./movement.js";
import {$, S, ally, blind, cheb, cur, held, hidden, idx, isLit, occupantsAt, rgba, seesTile, selCard} from "./state.js";
import type {ChatMsg, Drag, GameEl, Player} from "./types.js";

/* One stable reference shared by the curtain's button and the Enter/Space shortcut, so the
   view republished on every redraw compares equal and React stays put. */
export function dropCurtain(): void {
	S.handoff = false;
	render();
}
/* The hand bar: the strip of cards scrolls, and a thumb under it says how far along it is. */
function handScroll(dir: number): void {
	const b = $("hand");
	b.scrollLeft += dir * (b.clientWidth * 0.7);
	setTimeout(updateHandArrows, 120);
}
function updateHandArrows(): void {
	const b = $("hand"),
		l = $("hleft"),
		r = $("hright");
	if (!b || !l || !r) return;
	const room = b.scrollWidth - b.clientWidth;
	l.disabled = b.scrollLeft <= 1;
	r.disabled = b.scrollLeft >= room - 1;
	drawHandBar();
}
function drawHandBar(): void {
	const b = $("hand"),
		bar = $("hbar"),
		th = $("hthumb");
	if (!b || !bar || !th) return;
	const track = bar.clientWidth || 1;
	const ratio = b.scrollWidth ? Math.min(1, b.clientWidth / b.scrollWidth) : 1;
	const w = Math.max(40, Math.round(track * ratio));
	const room = Math.max(0, b.scrollWidth - b.clientWidth);
	const pos = room ? Math.round((b.scrollLeft / room) * (track - w)) : 0;
	th.style.width = w + "px";
	th.style.left = pos + "px";
}
let barDrag: {ox: number} | null = null;
function barTo(clientX: number): void {
	const b = $("hand"),
		bar = $("hbar"),
		th = $("hthumb");
	const r = bar.getBoundingClientRect();
	const w = th.offsetWidth;
	const track = r.width - w;
	const want = Math.max(0, Math.min(track, clientX - r.left - w / 2));
	const room = Math.max(0, b.scrollWidth - b.clientWidth);
	b.scrollLeft = track ? (want / track) * room : 0;
	drawHandBar();
}
$("hleft").onclick = () => {
	handScroll(-1);
};
$("hright").onclick = () => {
	handScroll(1);
};
$("hand").addEventListener("scroll", updateHandArrows, {passive: true});
$("hbar").addEventListener("pointerdown", (e) => {
	barDrag = {ox: e.clientX};
	try {
		$("hbar").setPointerCapture(e.pointerId);
	} catch {}
	barTo(e.clientX);
	e.preventDefault();
});
addEventListener("pointermove", (e) => {
	if (barDrag) barTo(e.clientX);
});
addEventListener("pointerup", () => {
	barDrag = null;
});
addEventListener("resize", drawHandBar);
export function render(): void {
	if (S.players.length) checkRefill();
	const p = cur();
	const dark = blind(p);
	handoffStore.set(S.handoff ? {seat: p.i, name: p.name, colour: p.c, dismiss: dropCurtain} : null);
	$("endbtn").disabled = S.toss;
	$("tglyph").className = "glyph mage p" + p.i;
	$("tglyph").style.setProperty("--pc", p.c);
	$("tname").textContent = p.name;
	const paint = S.paint ? "  ·  PAINTBALL" : "";
	const smash = S.smash ? `  ·  SMASH MODE x${smashMult()}` : "";
	const chaos = S.chaos
		? S.round >= S.chaosRound
			? "  ·  CHAOS MODE"
			: S.round >= S.chaosRound - 3
				? `  ·  CHAOS IN ${S.chaosRound - S.round}`
				: ""
		: "";
	$("tround").textContent =
		`ROUND ${S.round}  ·  ${p.nrg}/${p.cap} ENERGY${p.bank ? `  ·  ${p.bank} CARRIED` : ""}${smash}${paint}${chaos}`;

	const aim = new Set(),
		sure = new Set();
	if (S.phase === "act") {
		if (S.mode === "place") {
			const sc = selCard(p);
			for (let y = 0; y < S.dim; y++)
				for (let x = 0; x < S.dim; x++) {
					const d = cheb(p.x, p.y, x, y);
					if (d > 0 && d <= 4 && !sealed(x, y) && !badPlace(sc ? sc.id : "", x, y)) aim.add(x + "," + y);
				}
		} else if (S.mode === "jump") {
			jumpTargets(p).forEach(([x, y]) => aim.add(x + "," + y));
		} else if (S.mode === "dash") {
			dashTargets(p).forEach(([x, y]) => aim.add(x + "," + y));
		} else if (S.mode === "leap") {
			leapTargets(p).forEach(([x, y]) => aim.add(x + "," + y));
		} else if (S.mode === "light") {
			lightTargets().forEach(([x, y]) => aim.add(x + "," + y));
		} else if (S.mode === "mark") {
			markTargets().forEach(([x, y]) => aim.add(x + "," + y));
		} else if (S.mode === "swap") {
			swapTargets().forEach(([x, y]) => aim.add(x + "," + y));
		} else if (S.mode === "theft") {
			theftTargets().forEach(([x, y]) => aim.add(x + "," + y));
		} else if (S.mode === "warp") {
			warpTargets(p).forEach(([x, y]) => aim.add(x + "," + y));
		} else if (S.mode === "spread") {
			spreadTargets().forEach(([x, y]) => aim.add(x + "," + y));
		} else if (S.mode === "attack") {
			const c = held(p);
			if (c) {
				attackTiles(p, c).forEach(([x, y]) => aim.add(x + "," + y));
				liveTargets(p, c).forEach(([x, y]) => {
					if (!dark || occupantsAt(x, y).some((q) => q.lit && q !== p && !ally(q, p))) sure.add(x + "," + y);
				});
			}
		}
	}

	const rmap = S.imode && S.reach.length ? reachMap() : null;
	const wl = whirlList(),
		tiles = $("board").children;
	for (let y = 0; y < S.dim; y++)
		for (let x = 0; x < S.dim; x++) {
			const n = tiles[idx(x, y)]!,
				c = S.board[idx(x, y)]!;
			n.className = "tile";
			n.innerHTML = "";
			n.title = "";
			if (c.t && seesTile(p, x, y)) {
				const d = T[c.t]!;
				n.classList.add("terr");
				if (d.solid) n.classList.add("solid");
				if (d.dead) n.classList.add("gonezone");
				if (d.gone) n.classList.add("void");
				n.style.setProperty("--tc", d.c);
				n.style.setProperty("--tcs", rgba(d.c, 0.44));
				n.title = `${d.n}: ${d.d}`;
				if (c.t === "whirl") {
					const pos = wl.findIndex((a) => a[1] === idx(x, y));
					const s = document.createElement("span");
					s.className = "wnum";
					s.textContent = String.fromCharCode(65 + (pos >> 1));
					n.appendChild(s);
				}
			} else n.style.removeProperty("--tc");
			if (aim.size) {
				if (aim.has(x + "," + y)) n.classList.add(sure.has(x + "," + y) ? "aimsure" : "aim");
			} else if (
				S.phase === "act" &&
				!S.mode &&
				!S.sel &&
				!p.rootTurns &&
				cheb(p.x, p.y, x, y) === 1 &&
				canEnter(x, y, p)
			) {
				const cost = p.float ? 1 : c.t ? T[c.t]!.enter : 1;
				if (cost <= p.nrg && cost < 50) n.classList.add("step");
			}
			if (S.warn === idx(x, y)) n.classList.add("warn");
			if (isLit(x, y)) n.classList.add("litsq");
			if (S.look === idx(x, y)) n.classList.add("look");
			if (rmap) {
				const who = rmap.get(idx(x, y));
				if (who?.length) {
					n.style.backgroundImage =
						who.length === 1
							? `linear-gradient(${rgba(who[0]!.c, 0.34)},${rgba(who[0]!.c, 0.34)})`
							: `repeating-linear-gradient(135deg,${who
									.map(
										(q: Player, z: number) =>
											`${rgba(q.c, 0.4)} ${z * 7}px,${rgba(q.c, 0.4)} ${(z + 1) * 7}px`,
									)
									.join(",")})`;
					n.classList.add("reach");
				} else n.style.removeProperty("background-image");
			} else n.style.removeProperty("background-image");
			const here = occupantsAt(x, y).filter((o) => o === p || o.lit || (!dark && !hidden(o)));
			here.forEach((o, k) => {
				const m = document.createElement("i");
				m.className = "mage p" + o.i + (o === p ? " active" : "");
				m.style.setProperty("--pc", o.c);
				if (o.lit && o !== p) m.classList.add("litp"); // the lit fighter is never shown their own glow
				if (here.length > 1) {
					// shoulder to shoulder
					m.style.inset = k ? "34% 8% 8% 34%" : "8% 34% 34% 8%";
					m.style.zIndex = o === p ? "2" : "1";
				}
				n.appendChild(m);
			});
			if (here.length) n.title = here.map((o) => `${o.name}: ${o.hp} HP`).join("  ·  ");
			if (here.length > 2) {
				const b = document.createElement("span");
				b.className = "stackn";
				b.textContent = String(here.length);
				n.appendChild(b);
			}
		}

	drawMoves();
	drawWep();
	drawActions();
	drawRoster();
	drawHand();
	drawChat();
	drawTileInfo(dark);
	$("tileinfo")
		.querySelectorAll(".rch")
		.forEach(
			(b) =>
				(b.onclick = () => {
					const i = +b.dataset["i"]!,
						at = S.reach.indexOf(i);
					if (at >= 0) S.reach.splice(at, 1);
					else S.reach.push(i);
					render();
				}),
		);
	runFx();
}
function runFx(): void {
	S.fx.forEach(([i, cls]) => {
		const n = $("board").children[i];
		if (n) {
			n.classList.remove(cls);
			void n.offsetWidth;
			n.classList.add(cls);
		}
	});
	S.fx = [];
}
function drawTileInfo(dark: boolean): void {
	const box = $("tileinfo"),
		btn = $("inspectbtn");
	btn.innerHTML = S.imode
		? 'Stop inspecting <span style="color:var(--onaccent)">I</span>'
		: 'Inspect <span style="color:var(--muted)">I</span>';
	btn.style.borderColor = S.imode ? "var(--accent)" : "";
	btn.style.background = S.imode ? "var(--accent)" : "";
	btn.style.color = S.imode ? "var(--onaccent)" : "";
	if (!S.imode) S.reach = [];
	const chooser = S.imode ? reachChooser(dark) : "";
	if (S.look == null) {
		box.innerHTML =
			(S.imode
				? "<span>Click any square to read it. Press I or Escape to go back to playing.</span>"
				: "<span>Turn on Inspect to read any square without moving.</span>") + chooser;
		return;
	}
	const i = S.look,
		x = i % S.dim,
		y = (i / S.dim) | 0,
		c = S.board[i]!,
		p = cur();
	const t = c.t && seesTile(p, x, y) ? T[c.t] : null;
	const bits: [string, string][] = [];
	if (t) {
		if (t.enter > 50) bits.push(["Entering", "impossible"]);
		else bits.push(["Entering", t.enter + " energy"]);
		if (t.end) bits.push(["Ending here", t.end + " damage"]);
		if (t.bite) bits.push(["Crossing it", t.bite + " damage"]);
		if (t.heal) bits.push(["Ending here", "heals " + t.heal]);
		if (t.aura) bits.push(["Within " + (t.rad || 2), t.aura + " damage"]);
		if (t.auraHeal) bits.push(["Within " + (t.rad || 2), "heals " + t.auraHeal]);
		if (t.gain) bits.push(["Ending here", "+" + t.gain + " energy"]);
		if (t.los) bits.push(["Standing here", "you are blind"]);
		if (t.anchor) bits.push(["Shoves", "cannot move you"]);
		if (t.ward) bits.push(["Ground effects", "cannot touch you"]);
		if (t.gone) bits.push(["Touching it", "you are gone"]);
		bits.push(["Lasts", t.life > 900 ? "permanent" : t.life + " more rounds"]);
	}
	const shown = occupantsAt(x, y).filter((q) => q === p || q.lit || !dark);
	const who = occupantsAt(x, y).length
		? shown.length
			? shown.map((q) => `${q.name}, ${q.hp} HP`).join(" and ") +
				(shown.length < occupantsAt(x, y).length ? " and someone you cannot see" : "")
			: "someone you cannot see"
		: null;
	box.innerHTML = `<b style="color:${t ? t.c : "var(--muted)"}">${t ? t.n : "Bare ground"}</b>
    <div style="margin-top:5px">${t ? t.d + "." : "Nothing has been laid here."}</div>
    ${bits.map(([a, b]) => `<div class="k"><span>${a}</span><span>${b}</span></div>`).join("")}
    ${who ? `<div class="k"><span>Standing on it</span><span>${who}</span></div>` : ""}
    <div class="k"><span>Square</span><span>${x + 1}, ${y + 1}</span></div>
    ${reachHere(i, dark)}${chooser}`;
}
function reachHere(i: number, dark: boolean): string {
	if (!S.imode || !S.reach.length) return "";
	const who = reachMap().get(i);
	if (!who?.length) return '<div class="k"><span>In reach of</span><span>nobody selected</span></div>';
	const names = who.map((q: Player) => (q === cur() || !dark ? q.name : "someone hidden")).join(", ");
	return `<div class="k"><span>In reach of</span><span>${names}</span></div>`;
}
function reachChooser(dark: boolean): string {
	const list = S.players.filter((p) => p.alive && (p === cur() || p.lit || (!dark && !hidden(p))));
	return `<div class="bhead" style="margin:14px 0 7px">Show who can reach where</div>
    <div class="bpal">${list
		.map(
			(p) =>
				`<button class="bp rch" data-i="${p.i}" aria-pressed="${S.reach.includes(p.i)}">
        <span class="d" style="background:${p.c}"></span>${p.name} · ${moveBudget(p)}</button>`,
		)
		.join("")}</div>
    ${dark ? '<span class="hint">You are blinded, so only your own reach is available.</span>' : ""}`;
}
const mvTip = (label: string): string => {
	const e = Object.values(MV).find((v) => v.n === label);
	return e ? e.d.replace(/"/g, "&quot;") : "";
};
function drawMoves(): void {
	const p = cur(),
		box = $("moves");
	if (!p.mv) {
		box.innerHTML =
			'<div class="wtop"><span class="wn" style="color:var(--muted)">No footwork</span></div>' +
			'<div class="wsub">This fighter was given no special movement.</div>';
		return;
	}
	const rooted = p.rootTurns > 0;
	const hasJ = p.mv & 1,
		hasD = p.mv & 2,
		hasL = p.mv & 4,
		hasF = p.mv & 8,
		hasS = p.mv & 16,
		hasW = p.mv & 32,
		hasR = p.mv & 64,
		hasU = p.mv & 128,
		hasG = p.mv & 256,
		hasT = p.mv & 512;
	const j = jumpTargets(p).length,
		d = dashTargets(p).length,
		l = leapTargets(p).length,
		sp = spinTiles(p).length,
		wp = wipeTiles(p).length,
		rp = warpTargets(p).length,
		up = S.board.filter((c) => c.t).length,
		gp = spreadTargets().length;
	const left = (n: number): number => S.mvUses - n;
	const btn = (
		id: string,
		label: string,
		has: boolean,
		used: number,
		targets: number,
		mode: string,
		cost: number,
	): string => {
		if (!has) return "";
		if (used >= S.mvUses) return `<button class="act" disabled>${label} · spent</button>`;
		return `<button class="act" id="${id}" aria-pressed="${S.mode === mode}" title="${mvTip(label)}"
      ${rooted || p.nrg < cost || !targets ? "disabled" : ""}>${label} · ${cost} <span style="opacity:.6">x${left(used)}</span></button>`;
	};
	box.innerHTML = `
    <div class="wtop"><span class="wn">Footwork</span>
      <span class="wd" style="font-size:11px">footwork</span></div>
${p.float ? '<div class="wsub"><span class="fx">You are in the air.</span></div>' : ""}
    <div class="wrow">
      ${btn("jmp", "Jump", !!hasJ, p.used.jump, j, "jump", COST.jump)}
      ${btn("dsh", "Dash", !!hasD, p.used.dash, d, "dash", COST.dash)}
      ${btn("lep", "Leap", !!hasL, p.used.leap, l, "leap", COST.leap)}
      ${
			hasF
				? p.float
					? '<button class="act" aria-pressed="true" disabled>Floating</button>'
					: p.used.float >= S.mvUses
						? '<button class="act" disabled>Float · spent</button>'
						: `<button class="act" id="flt" ${p.nrg < COST.float ? "disabled" : ""}>Float · ${COST.float} <span style="opacity:.6">x${left(p.used.float)}</span></button>`
				: ""
		}
      ${
			hasS
				? p.used.spin >= S.mvUses
					? '<button class="act" disabled>Spin · spent</button>'
					: `<button class="act" id="spn" ${p.nrg < COST.spin || !sp ? "disabled" : ""}>Spin · ${COST.spin} <span style="opacity:.6">x${left(p.used.spin)}</span></button>`
				: ""
		}
      ${
			hasW
				? p.used.wipe >= S.mvUses
					? '<button class="act" disabled>Wipe · spent</button>'
					: `<button class="act" id="wpe" ${p.nrg < COST.wipe || !wp ? "disabled" : ""}>Wipe · ${COST.wipe} <span style="opacity:.6">x${left(p.used.wipe)}</span></button>`
				: ""
		}
      ${
			hasR
				? p.used.warp >= S.mvUses
					? '<button class="act" disabled>Warp · spent</button>'
					: `<button class="act" id="wrp" aria-pressed="${S.mode === "warp"}"
          ${rooted || p.nrg < COST.warp || !rp ? "disabled" : ""}>Warp · ${COST.warp} <span style="opacity:.6">x${left(p.used.warp)}</span></button>`
				: ""
		}
      ${
			hasT
				? p.trail
					? `<button class="act" aria-pressed="true" disabled>Trailing ${T[p.trail]!.n}</button>`
					: p.used.trail >= S.mvUses
						? '<button class="act" disabled>Trail · spent</button>'
						: `<button class="act" id="trl" ${p.nrg < COST.trail || !S.board[idx(p.x, p.y)]!.t ? "disabled" : ""}>Trail · ${COST.trail} <span style="opacity:.6">x${left(p.used.trail)}</span></button>`
				: ""
		}
      ${
			hasU
				? p.used.ultra >= S.mvUses
					? '<button class="act" disabled>Ultraclear · spent</button>'
					: `<button class="act" id="ult" ${p.nrg < COST.ultra || !up ? "disabled" : ""}>Ultraclear · ${COST.ultra} <span style="opacity:.6">x${left(p.used.ultra)}</span></button>`
				: ""
		}
      ${
			hasG
				? p.used.spread >= S.mvUses
					? '<button class="act" disabled>Spread · spent</button>'
					: `<button class="act" id="spr" aria-pressed="${S.mode === "spread"}"
          ${p.nrg < COST.spread || !gp ? "disabled" : ""}>Spread · ${COST.spread} <span style="opacity:.6">x${left(p.used.spread)}</span></button>`
				: ""
		}
      ${
			p.mv & 32768
				? p.used.light >= S.mvUses
					? '<button class="act" disabled>Spotlight · spent</button>'
					: `<button class="act" id="lgt" aria-pressed="${S.mode === "light"}"
          ${p.nrg < COST.light || !lightTargets().length ? "disabled" : ""}>Spotlight · ${COST.light} <span style="opacity:.6">x${left(p.used.light)}</span></button>`
				: ""
		}
      ${
			p.mv & 16384
				? p.used.mark >= S.mvUses
					? '<button class="act" disabled>Mark · spent</button>'
					: `<button class="act" id="mrk" aria-pressed="${S.mode === "mark"}"
          ${p.nrg < COST.mark || !markTargets().length ? "disabled" : ""}>Mark · ${COST.mark} <span style="opacity:.6">x${left(p.used.mark)}</span></button>`
				: ""
		}
      ${
			p.mv & 8192
				? p.used.swap >= S.mvUses
					? '<button class="act" disabled>Swap · spent</button>'
					: `<button class="act" id="swp" aria-pressed="${S.mode === "swap"}"
          ${rooted || p.nrg < COST.swap || !swapTargets().length ? "disabled" : ""}>Swap · ${COST.swap} <span style="opacity:.6">x${left(p.used.swap)}</span></button>`
				: ""
		}
      ${
			p.mv & 4096
				? p.used.theft >= S.mvUses
					? '<button class="act" disabled>Theft · spent</button>'
					: `<button class="act" id="thf" aria-pressed="${S.mode === "theft"}"
          ${p.nrg < COST.theft || !theftTargets().length ? "disabled" : ""}>Theft · ${COST.theft} <span style="opacity:.6">x${left(p.used.theft)}</span></button>`
				: ""
		}
      ${
			p.mv & 2048
				? p.used.smash >= S.mvUses
					? '<button class="act" disabled>Handsmash · spent</button>'
					: `<button class="act" id="smh" ${p.nrg < COST.smash || !smashable(p) ? "disabled" : ""}
          >Handsmash · ${COST.smash} <span style="opacity:.6">x${left(p.used.smash)}</span></button>`
				: ""
		}
      ${
			p.mv & 1024
				? p.used.shift >= S.mvUses
					? '<button class="act" disabled>Shift · spent</button>'
					: `<button class="act" id="shf" aria-pressed="${S.mode === "shift"}"
          ${p.nrg < COST.shift ? "disabled" : ""}>Shift · ${COST.shift} <span style="opacity:.6">x${left(p.used.shift)}</span></button>`
				: ""
		}
      ${rooted ? '<span class="hint">Stuck in the mud this turn.</span>' : ""}
    </div>`;
	if ($("shf"))
		$("shf").onclick = () => {
			S.mode = S.mode === "shift" ? null : "shift";
			S.sel = null;
			render();
		};
	if ($("smh")) $("smh").onclick = doSmash;
	if ($("thf"))
		$("thf").onclick = () => {
			S.mode = S.mode === "theft" ? null : "theft";
			S.sel = null;
			render();
		};
	if ($("swp"))
		$("swp").onclick = () => {
			S.mode = S.mode === "swap" ? null : "swap";
			S.sel = null;
			render();
		};
	if ($("mrk"))
		$("mrk").onclick = () => {
			S.mode = S.mode === "mark" ? null : "mark";
			S.sel = null;
			render();
		};
	if ($("lgt"))
		$("lgt").onclick = () => {
			S.mode = S.mode === "light" ? null : "light";
			S.sel = null;
			render();
		};
	if ($("jmp"))
		$("jmp").onclick = () => {
			S.mode = S.mode === "jump" ? null : "jump";
			S.sel = null;
			render();
		};
	if ($("dsh"))
		$("dsh").onclick = () => {
			S.mode = S.mode === "dash" ? null : "dash";
			S.sel = null;
			render();
		};
	if ($("lep"))
		$("lep").onclick = () => {
			S.mode = S.mode === "leap" ? null : "leap";
			S.sel = null;
			render();
		};
	if ($("flt")) $("flt").onclick = doFloat;
	if ($("spn")) $("spn").onclick = doSpin;
	if ($("wpe")) $("wpe").onclick = doWipe;
	if ($("wrp"))
		$("wrp").onclick = () => {
			S.mode = S.mode === "warp" ? null : "warp";
			S.sel = null;
			render();
		};
	if ($("ult")) $("ult").onclick = doUltra;
	if ($("spr"))
		$("spr").onclick = () => {
			S.mode = S.mode === "spread" ? null : "spread";
			S.sel = null;
			render();
		};
	if ($("trl")) $("trl").onclick = doTrail;
}
function drawWep(): void {
	const p = cur(),
		c = held(p);
	if (!c) {
		$("wep").innerHTML = `<div class="wtop"><span class="wn" style="color:var(--muted)">Empty hands</span></div>
      <div class="wsub">Pick a weapon card from your hand. Holding one is free, and you can put it back.</div>`;
		return;
	}
	const dmg = wepDmg(c),
		cost = wCost(c),
		hits = wHits(c);
	const uniq = [...new Set(c.els.map((e: string) => forgeOf(e).fx))];
	const dark = blind(p);
	const tg = liveTargets(p, c).filter(
		([x, y]) => !dark || occupantsAt(x, y).some((q) => q.lit && q !== p && !ally(q, p)),
	).length;
	const poor = p.nrg < cost;
	$("wep").innerHTML = `
    <div class="wtop"><span class="wn" style="color:${wColor(c)}">${wepName(c)}</span>
      <span class="wd">${dmg}${hits > 1 ? ` x ${hits}` : ""} damage</span></div>
    <div class="wsub">${wDesc(c)} Breaks the moment you swing it.${uniq.length ? ` <span class="fx">On hit: ${uniq.join(", ")}.</span>` : ""}</div>
    <div class="wstrip" style="background:${wStrip(c)}"></div>
    ${(() => {
		const row = (label: string, opts: string[], pick: string | undefined, key: "leaveSelf" | "leaveFoe"): string =>
			opts.length < 2
				? ""
				: `<div class="wsub" style="margin-top:8px">${label}
          ${opts
				.map(
					(e: string) => `<button class="lv${e === pick ? " on" : ""}" data-k="${key}" data-e="${e}"
            style="--lc:${EL[e] ? EL[e].c : T[e]!.c}">${elName(e)}</button>`,
				)
				.join("")}</div>`;
		return (
			row("Leaves under them:", foeEls(c), leaveFoe(c), "leaveFoe") +
			row("Lays under you:", selfEls(c), leaveSelf(c), "leaveSelf")
		);
	})()}
    <div class="wrow"><button class="atk" id="atkbtn" aria-pressed="${S.mode === "attack"}"
      ${poor ? "disabled" : ""}>Swing · ${cost} energy <span style="opacity:.6">F</span></button>
      ${
			poor
				? '<span class="hint">Not enough energy this turn.</span>'
				: dark
					? '<span class="hint">Blinded. Swing where you think they are.</span>'
					: tg
						? `<span class="hint">${tg} square${tg === 1 ? "" : "s"} you can see someone on. You may swing anywhere in reach.</span>`
						: '<span class="hint">Nobody visible in reach. Swing anyway to sweep for someone hidden.</span>'
		}</div>`;
	const b = $("atkbtn");
	if (b) b.onclick = startAttack;
	$("wep")
		.querySelectorAll(".lv")
		.forEach(
			(el) =>
				(el.onclick = () => {
					if (el.dataset["k"] === "leaveSelf") c.leaveSelf = el.dataset["e"]!;
					else c.leaveFoe = el.dataset["e"]!;
					render();
				}),
		);
}
export const MODEHINT: Record<string, string | undefined> = {
	jump: "Pick a square exactly two away to land on.",
	dash: "Pick a square along a clear straight line.",
	leap: "Pick a square exactly four away to land on.",
	theft: "Pick a fighter to take a card from. You do not choose which one.",
	swap: "Pick a fighter to trade places with.",
	mark: "Pick a fighter to peek at one of their cards.",
	light: "Pick a fighter to fix a glare on for good.",
	warp: "Pick any bare, empty square on the board.",
	spread: "Pick a square with something on it to grow into a 5x5.",
};
function drawActions(): void {
	const p = cur(),
		bar = $("actbar");
	if (MODEHINT[S.mode!]) {
		bar.innerHTML = `<span class="hint">${MODEHINT[S.mode!]} Esc to cancel.</span>`;
		return;
	}
	if (S.mode === "attack") {
		bar.innerHTML = '<span class="hint">Pick a tile to strike. Esc to cancel.</span>';
		return;
	}
	if (S.mode === "place") {
		const sc = selCard(p);
		bar.innerHTML = `<span class="hint">Pick a tile within 4.${
			sc && lethalRaw(sc.id) ? ` ${elName(sc.id)} cannot be laid on a square someone is standing on.` : ""
		} Esc to cancel.</span>`;
		return;
	}
	if (S.steal != null) {
		const v = S.players[S.steal]!;
		bar.innerHTML =
			`<span class="hint">Take a card from ${v ? v.name : "them"}:</span>` +
			(v
				? v.hand
						.map((c, i) =>
							seenBy(c)
								? `<button class="act stl" data-u="${c.uid}">${cardLabel(c)}</button>`
								: `<button class="act stl facedown" data-u="${c.uid}">Card ${i + 1}</button>`,
						)
						.join("")
				: "") +
			`<button class="act" id="stlno">Cancel</button>`;
		bar.querySelectorAll(".stl").forEach(
			(b) =>
				(b.onclick = () => {
					takeCard(v, +b.dataset["u"]!);
				}),
		);
		$("stlno").onclick = () => {
			S.steal = null;
			render();
		};
		return;
	}
	if (S.toss) {
		const pick = p.hand.find((q) => q.uid === S.tossPick);
		if (!pick) {
			bar.innerHTML =
				'<span class="hint" style="color:#ff8f6b">Chaos mode. Pick a card from your hand to throw away before you do anything else.</span>';
			return;
		}
		const label = pick.k === "el" ? elName(pick.id) : wepName(pick);
		bar.innerHTML = `<span class="hint" style="color:#ff8f6b">Throw away <b style="color:var(--ink)">${label}</b>?</span>
      <button class="act" id="tossyes">Yes, bin it</button>
      <button class="act" id="tossno">Pick another</button>`;
		$("tossyes").onclick = () => {
			doToss(pick.uid);
		};
		$("tossno").onclick = () => {
			S.tossPick = null;
			render();
		};
		return;
	}
	if (S.mode === "shift") {
		bar.innerHTML = `<span class="hint">Slide everyone:</span>
      <button class="act" id="shL">&#8592; Left</button>
      <button class="act" id="shR">Right &#8594;</button>
      <button class="act" id="shU">&#8593; Up</button>
      <button class="act" id="shD">&#8595; Down</button>
      <span class="hint">Esc to cancel.</span>`;
		$("shL").onclick = () => {
			doShift(-1, 0);
		};
		$("shR").onclick = () => {
			doShift(1, 0);
		};
		$("shU").onclick = () => {
			doShift(0, -1);
		};
		$("shD").onclick = () => {
			doShift(0, 1);
		};
		return;
	}
	if (S.mode === "mix") {
		bar.innerHTML = '<span class="hint">Click any highlighted card to merge with. Esc to cancel.</span>';
		return;
	}
	const c = selCard(p),
		h = held(p),
		active = c || h;
	if (!active) {
		bar.innerHTML =
			p.rootTurns > 0
				? '<span class="hint">Stuck in the mud. You cannot move until this turn ends.</span>'
				: '<span class="hint">Click a card, or step onto a highlighted tile.</span>';
		return;
	}
	const parts = mixPartners(p, active).length;
	bar.innerHTML = `${c ? `<button class="act" id="a1" ${p.nrg < COST.place ? "disabled" : ""}>Lay on a tile · ${COST.place}</button>` : ""}
    <button class="act" id="a3" ${p.nrg < COST.merge || !parts ? "disabled" : ""}>Merge · ${COST.merge}</button>
    ${
		parts
			? '<span class="hint">Two elements fuse, two weapons combine, an element goes into a weapon.</span>'
			: '<span class="hint">Nothing in hand merges with this.</span>'
	}`;
	if ($("a1"))
		$("a1").onclick = () => {
			S.mode = "place";
			render();
		};
	$("a3").onclick = () => {
		startMix(active.uid);
	};
}
function drawRoster(): void {
	$("roster").innerHTML = S.players
		.map((p) => {
			const c = held(p),
				mine = p === cur(),
				open = !S.priv;
			const wp =
				mine || open
					? `${c ? `${wepName(c)} · ${wepDmg(c)} dmg` : "unarmed"} · ${p.hand.length} in hand`
					: `${p.hand.length} in hand`;
			const mates = S.players.filter((q) => q !== p && q.team === p.team && q.alive);
			return `<div class="pcard ${p.alive ? "" : "dead"}" style="--pc:${p.c}">
      <div class="row1"><span class="glyph mage p${p.i}"></span>
        <span class="nm">${p.name}${mates.length ? ` <span style="color:var(--muted);letter-spacing:0">+${mates.length} ally</span>` : ""}</span>
        <span class="hpn">${p.hp}</span></div>
      <div class="bar"><i style="width:${(p.hp / p.max) * 100}%;background:${p.c};box-shadow:0 0 8px ${p.c}"></i></div>
      ${
			p.cap > 12
				? `<div class="wp" style="color:#ffd24a">${mine ? p.nrg : p.cap} / ${p.cap} energy</div>`
				: `<div class="nrg">${Array.from(
						{length: p.cap},
						(_, i) => `<s class="${mine && i < p.nrg ? "f" : ""}"></s>`,
					).join("")}</div>`
		}
      ${(() => {
			if (p === cur()) return "";
			const seen = p.hand.filter((c) => seenBy(c));
			return seen.length
				? `<div class="wp" style="color:var(--accent)">seen: ${seen.map(cardLabel).join(", ")}</div>`
				: "";
		})()}
      <div class="wp">${wp}</div>
    </div>`;
		})
		.join("");
}
let drag: Drag | null = null,
	justDragged = false;
function handCards(): GameEl[] {
	return [...$("hand").querySelectorAll(".hcard")];
}
function clearSlots(): void {
	handCards().forEach((c) => {
		c.classList.remove("slotL", "slotR");
	});
}
function dropIndex(clientX: number): {idx: number; el: GameEl | null; side: string} {
	const others = handCards().filter((c) => +c.dataset["u"]! !== drag?.uid);
	for (let k = 0; k < others.length; k++) {
		const r = others[k]!.getBoundingClientRect();
		if (clientX < r.left + r.width / 2) return {idx: k, el: others[k]!, side: "slotL"};
	}
	return {idx: others.length, el: others[others.length - 1] || null, side: "slotR"};
}
function dragStart(e: PointerEvent, uid: number): void {
	if (S.phase !== "act" || S.handoff) return;
	const p = cur(),
		i = p.hand.findIndex((q) => q.uid === uid);
	if (i < 0) return;
	drag = {
		uid,
		el: e.currentTarget as GameEl,
		x0: e.clientX,
		y0: e.clientY,
		pid: e.pointerId,
		active: false,
		touch: e.pointerType !== "mouse",
	};
}
function dragMove(e: PointerEvent): void {
	if (!drag || e.pointerId !== drag.pid) return;
	const dx = e.clientX - drag.x0,
		dy = e.clientY - drag.y0;
	if (!drag.active) {
		if (Math.hypot(dx, dy) < 8) return;
		// on touch, a sideways swipe belongs to the scroller, not to us
		if (drag.touch && Math.abs(dx) > Math.abs(dy)) {
			drag = null;
			return;
		}
		drag.active = true;
		drag.el.classList.add("dragging");
		try {
			drag.el.setPointerCapture(drag.pid);
		} catch {}
	}
	e.preventDefault();
	drag.el.style.transform = `translate(${dx}px,${Math.max(-46, Math.min(0, dy))}px) scale(1.04)`;
	const box = $("hand"),
		r = box.getBoundingClientRect();
	if (e.clientX < r.left + 44) box.scrollLeft -= 14;
	else if (e.clientX > r.right - 44) box.scrollLeft += 14;
	clearSlots();
	const t = dropIndex(e.clientX);
	if (t.el) t.el.classList.add(t.side);
}
function dragEnd(e: PointerEvent | null): void {
	if (!drag || (e && e.pointerId !== drag.pid)) return;
	const d = drag;
	drag = null;
	d.el.classList.remove("dragging");
	d.el.style.transform = "";
	clearSlots();
	if (!d.active) return;
	justDragged = true;
	const p = cur(),
		from = p.hand.findIndex((q) => q.uid === d.uid);
	if (from < 0) {
		render();
		return;
	}
	drag = d;
	const to = dropIndex(e ? e.clientX : d.x0).idx;
	drag = null;
	const [card] = p.hand.splice(from, 1);
	if (card) p.hand.splice(to, 0, card);
	render();
}
addEventListener("pointermove", dragMove, {passive: false});
addEventListener("pointerup", dragEnd);
addEventListener("pointercancel", dragEnd);
function drawHand(): void {
	const p = cur();
	if (!p.hand.length) {
		$("hand").innerHTML = '<span class="hint">Nothing in hand yet.</span>';
		return;
	}
	$("hand").innerHTML = p.hand
		.map((c, i) => {
			const el = c.k === "el",
				comp = el && isComp(c.id);
			const col = el ? elColor(c.id) : wColor(c);
			const strip = el ? col : wStrip(c);
			const on = el ? S.sel === c.uid : p.held === c.uid;
			const name = el ? elName(c.id) : wepName(c);
			const f = el ? forgeOf(c.id) : null;
			const desc = el
				? `${comp && T[c.id]!.spread ? `Covers a ${T[c.id]!.spread! * 2 + 1}x${T[c.id]!.spread! * 2 + 1}. ` : ""}${T[EL[c.id] ? EL[c.id]!.t : c.id]!.d}. Forge: ${f!.mult && !f!.dmg ? f!.fx : `+${f!.dmg} damage`}.`
				: `${wDesc(c)} ${wepDmg(c)}${wHits(c) > 1 ? ` x${wHits(c)}` : ""} damage, ${wCost(c)} energy.`;
			const canMix =
				(S.toss && S.tossPick == null) || (S.mode === "mix" && mixPartners(p).some((q) => q.uid === c.uid));
			const doomed = S.toss && S.tossPick === c.uid;
			return `<button class="hcard${canMix ? " mixable" : ""}${doomed ? " doomed" : ""}" data-u="${c.uid}"
      style="--ec:${col};--strip:${strip}" aria-pressed="${on}">
      <div class="ck">${el ? (comp ? "FUSED" : "ELEMENT") : "WEAPON"} · ${i + 1}</div>
      <div class="cn">${name}</div><div class="cd">${desc}</div></button>`;
		})
		.join("");
	updateHandArrows();
	handCards().forEach((b) => {
		const uid = +b.dataset["u"]!;
		b.onpointerdown = (e) => {
			dragStart(e, uid);
		};
		b.onclick = () => {
			if (justDragged) {
				justDragged = false;
				return;
			}
			clickCard(uid);
		};
		b.setAttribute("draggable", "false");
	});
}
function chatById(id: number): ChatMsg | undefined {
	return S.chat.find((m) => m.id === id);
}
export function drawChat(): void {
	const box = $("chatlog");
	if (!box) return;
	box.innerHTML = S.chat.length
		? S.chat
				.map((m) => {
					const par = m.to ? chatById(m.to) : null;
					return `<p>${
						par
							? `<span class="quote"><b style="color:${par.c}">${par.who}</b>
            ${par.t.length > 44 ? par.t.slice(0, 44) + "…" : par.t}</span>`
							: ""
					}
          <b style="color:${m.c}">${m.who}</b><span class="rnd">r${m.r}</span>
          <button class="reply" data-id="${m.id}">reply</button><br>${m.t}</p>`;
				})
				.join("")
		: '<p class="none">Nothing said yet.</p>';
	box.querySelectorAll(".reply").forEach(
		(b) =>
			(b.onclick = () => {
				S.replyTo = +b.dataset["id"]!;
				render();
			}),
	);
	box.scrollTop = box.scrollHeight;
	const bar = $("replybar");
	const par = S.replyTo ? chatById(S.replyTo) : null;
	bar.innerHTML = par
		? `<span class="rto">replying to <b style="color:${par.c}">${par.who}</b>
        ${par.t.length > 30 ? par.t.slice(0, 30) + "…" : par.t}
        <button class="reply" id="replyx">cancel</button></span>`
		: "";
	if ($("replyx"))
		$("replyx").onclick = () => {
			S.replyTo = null;
			render();
		};
}
export function saySomething(): void {
	const el = $("chatin");
	const t = (el.value || "").trim().replace(/[<>]/g, "");
	if (!t) return;
	const p = cur();
	const par = S.replyTo ? chatById(S.replyTo) : null;
	S.chat.push({
		id: S.cid++,
		who: p ? p.name : "",
		c: p ? p.c : "var(--muted)",
		r: S.round,
		t,
		to: par ? par.id : null,
	});
	logit(par ? `to ${par.who}: \u201c${t}\u201d` : `\u201c${t}\u201d`, undefined, true);
	S.replyTo = null;
	el.value = "";
	render();
}
