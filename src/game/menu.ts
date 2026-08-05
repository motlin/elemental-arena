/**
 * The setup screen: the seats and their colours, the shop, the loadout, the board builder, the
 * weapon simulator, the replay, and the fusion table.
 */

import {wepDmg, wepName} from "./combat.js";
import {BASE, COST, EL, FUSE, MV, PAT, T, W, WBASE, fkey} from "./data/index.js";
import type {ActionKey} from "./data/index.js";
import {
	elName,
	elsOn,
	forgeOf,
	isComp,
	known,
	madeFrom,
	mixesInto,
	mixesIntoKeys,
	mvOwnedMask,
	offFor,
	ownEl,
	parentsOf,
	terrOf,
	wCost,
	wHits,
	wsOn,
} from "./lookups.js";
import {ringSpots, startMatch} from "./match.js";
import {errText, save} from "./save.js";
import {$, PC, PCN, PN, S, idx, nameOf, rgba, src, teamName} from "./state.js";
import type {Offs, ShopItem, WeaponSpec} from "./types.js";

export function drawSeg(): void {
	$("np").value = String(S.np);
	$("npval").textContent = String(S.np);
	drawNames();
}
export function drawNames(): void {
	$("names").innerHTML = Array.from(
		{length: S.np},
		(_, i) =>
			`<div class="nrow"><span class="glyph mage p${i}" style="--pc:${PC[S.cols[i]!]!}"></span>
      <input id="nm${i}" maxlength="14" value="${(S.names[S.cols[i]!]! || "").replace(/"/g, "&quot;")}"
        placeholder="${PN[S.cols[i]!]!}" aria-label="Name for the ${PCN[S.cols[i]!]!} side">
      <span class="swatches">${PC.map(
			(c, j) =>
				`<button class="sw" data-p="${i}" data-c="${j}" style="background:${c}"
          aria-pressed="${S.cols[i] === j}" title="${PCN[j]!}"></button>`,
		).join("")}</span>
      </div>`,
	).join("");
	for (let i = 0; i < S.np; i++)
		$("nm" + i).oninput = (e) => {
			const col = S.cols[i]!;
			S.names[col] = src(e).value;
			// everyone sharing this colour answers to the same name
			for (let j = 0; j < S.np; j++) if (j !== i && S.cols[j] === col) $("nm" + j).value = src(e).value;
			drawWho();
			drawTeams();
		};

	$("names")
		.querySelectorAll(".sw")
		.forEach(
			(b) =>
				(b.onclick = () => {
					S.cols[+b.dataset["p"]!] = +b.dataset["c"]!;
					drawNames();
					drawWho();
				}),
		);
	drawTeams();
}
export function drawTeams(): void {
	const note = $("teamnote");
	if (!note) return;
	const groups: Record<number, number[]> = {};
	for (let i = 0; i < S.np; i++) {
		(groups[S.cols[i]!] = groups[S.cols[i]!] || []).push(i);
	}
	const teams = Object.entries(groups);
	note.innerHTML =
		teams
			.map(
				([c, seats]) =>
					`<span class="tm"><span class="d" style="background:${PC[+c]!}"></span>${teamName(+c)}${
						seats.length > 1 ? ` x${seats.length}` : ""
					}</span>`,
			)
			.join("") +
		(teams.length === S.np
			? '<div style="margin-top:6px">Everyone is on their own. Give two fighters the same colour to put them on a side together.</div>'
			: '<div style="margin-top:6px">A colour is a side. Everyone on it shares the name, cannot be hit by their own, and the match ends when one colour is left.</div>');
}
$("np").oninput = (e) => {
	S.np = +src(e).value;
	$("npval").textContent = String(S.np);
	drawNames();
	if (S.who !== "all" && S.who >= S.np) S.who = "all";
	drawLoadout();
};
$("priv").onchange = (e) => {
	S.priv = src(e).checked;
};
$("paint").onchange = (e) => {
	S.paint = src(e).checked;
};
$("smash").onchange = (e) => {
	S.smash = src(e).checked;
};
$("chaos").onchange = (e) => {
	S.chaos = src(e).checked;
};
function ensureOverride(i: number): Offs {
	if (!S.pOff[i]) S.pOff[i] = {el: [...S.elOff], w: [...S.wOff]};
	return S.pOff[i];
}
function toggleChip(kind: "el" | "w", key: string): boolean {
	const who = S.who;
	const list = who === "all" ? (kind === "el" ? S.elOff : S.wOff) : ensureOverride(who)[kind];
	const at = list.indexOf(key);
	if (at >= 0) list.splice(at, 1);
	else {
		const scope = who === "all" ? null : who;
		const onCount = (kind === "el" ? elsOn(scope) : wsOn(scope)).length;
		if (onCount <= 1) return false; // never leave anyone with an empty pool
		list.push(key);
	}
	void save();
	drawLoadout();
	return true;
}
function chipHTML(
	k: string,
	t: string,
	name: string,
	colour: string,
	owned: boolean,
	price: number | undefined,
	off: string[],
): string {
	return owned
		? `<button class="chip" data-t="${t}" data-k="${k}" style="--cc:${colour}"
        aria-pressed="${!off.includes(k)}">${name}</button>`
		: `<button class="chip locked" disabled title="Not bought yet. ${price} coin in the shop below."
        >${name} · ${price}</button>`;
}
// footwork is per fighter, so it follows whichever scope you are editing
const mvHas = (k: string): boolean => (S.who === "all" ? !!(S.mvShared & MV[k]!.bit) : !!(S.mv[S.who]! & MV[k]!.bit));
const mvOwn = (i: number): number => S.mv[i]! & mvOwnedMask();
const mvDiffers = (i: number): boolean => mvOwn(i) !== (S.mvShared & mvOwnedMask());
function toggleMv(k: string): void {
	const on = mvHas(k);
	if (S.who === "all") {
		if (on) S.mvShared &= ~MV[k]!.bit;
		else S.mvShared |= MV[k]!.bit;
		for (let i = 0; i < 8; i++) S.mv[i] = S.mvShared; // everyone falls back in line
	} else {
		if (on) S.mv[S.who]! &= ~MV[k]!.bit;
		else S.mv[S.who]! |= MV[k]!.bit;
	}
	void save();
	drawLoadout();
}
function setAllMv(on: boolean): void {
	const m = mvOwnedMask();
	if (S.who === "all") {
		S.mvShared = on ? m : 0;
		for (let i = 0; i < 8; i++) S.mv[i] = S.mvShared;
	} else S.mv[S.who] = on ? m : 0;
	void save();
	drawLoadout();
}
function scopeName(): string {
	return S.who === "all" ? "for everyone" : `for ${nameOf(S.who)} only`;
}
export function drawMvChips(): void {
	const host = $("mvchips");
	if (!host) return;
	const own = mvOwnedMask();
	host.innerHTML =
		Object.entries(MV)
			.sort((a, b) => a[1].price - b[1].price)
			.map(([k, v]) =>
				S.munlocked.includes(k)
					? `<button class="chip mvc" data-k="${k}" style="--cc:var(--accent)"
          aria-pressed="${mvHas(k)}">${v.n}</button>`
					: `<button class="chip locked" disabled title="Not bought yet.">${v.n} · ${v.price}</button>`,
			)
			.join("") +
		(own
			? (() => {
					const cur = S.who === "all" ? S.mvShared & own : mvOwn(S.who);
					return `<button class="chip mvall" data-set="1" ${cur === own ? "disabled" : ""}>All</button>
        <button class="chip mvall" data-set="0" ${cur === 0 ? "disabled" : ""}>None</button>`;
				})()
			: "");
	host.querySelectorAll(".mvc").forEach(
		(b) =>
			(b.onclick = () => {
				toggleMv(b.dataset["k"]!);
			}),
	);
	host.querySelectorAll(".mvall").forEach(
		(b) =>
			(b.onclick = () => {
				setAllMv(b.dataset["set"] === "1");
			}),
	);
	["fw1", "fw2", "fw3"].forEach((id) => {
		const n = $(id);
		if (n) n.textContent = scopeName();
	});
}
export function drawWho(): void {
	const opts: [number | "all", string][] = [["all", "Everyone"]];
	for (let i = 0; i < S.np; i++) opts.push([i, nameOf(i)]);
	$("whochips").innerHTML = opts
		.map(([v, label]) => {
			const own = v !== "all" && (S.pOff[v] || mvDiffers(v));
			return `<button class="chip whoc" data-w="${v}" style="--cc:${v === "all" ? "var(--accent)" : PC[S.cols[v]!]!}"
      aria-pressed="${String(S.who) === String(v)}">${label}${own ? " *" : ""}</button>`;
		})
		.join("");
	$("whochips")
		.querySelectorAll(".whoc")
		.forEach(
			(b) =>
				(b.onclick = () => {
					const v = b.dataset["w"];
					S.who = v === "all" ? "all" : +v!;
					drawLoadout();
				}),
		);
	const note = $("whonote");
	if (S.who === "all") note.innerHTML = "Editing what everyone draws and the footwork they all carry.";
	else
		note.innerHTML =
			S.pOff[S.who] || mvDiffers(S.who)
				? `Editing ${opts.find((o) => String(o[0]) === String(S.who))![1]} only, marked with a star. <button class="linkish" id="whoreset">Put them back on the shared list</button>`
				: "Editing the shared list. Change anything here and this fighter gets their own.";
	const rb = $("whoreset");
	if (rb)
		rb.onclick = () => {
			if (S.who !== "all") {
				delete S.pOff[S.who];
				S.mv[S.who] = S.mvShared;
			}
			void save();
			drawLoadout();
		};
}
export function drawLoadout(): void {
	drawWho();
	const scope = S.who === "all" ? null : S.who;
	const elOff = offFor("el", scope),
		wOff = offFor("w", scope);
	const byPrice = (a: [string, ShopItem], b: [string, ShopItem]): number =>
		(a[1].cost || a[1].price || 0) - (b[1].cost || b[1].price || 0);
	$("elchips").innerHTML = Object.entries(EL)
		.sort(byPrice)
		.map(([k, v]) => chipHTML(k, "el", v.n, v.c, S.unlocked.includes(k), v.cost, elOff))
		.join("");
	$("wchips").innerHTML = Object.entries(W)
		.sort(byPrice)
		.map(([k, v]) => chipHTML(k, "w", v.n, v.c, S.wunlocked.includes(k), v.price, wOff))
		.join("");
	["elchips", "wchips"].forEach((host) => {
		$(host)
			.querySelectorAll(".chip:not(.locked)")
			.forEach((b) => (b.onclick = () => toggleChip(b.dataset["t"] as "el" | "w", b.dataset["k"]!)));
	});
	drawMvChips();
}
export function drawShop(): void {
	$("coins").textContent = S.coins.toLocaleString();
	const warn = $("savewarn");
	if (warn) {
		const err = S.saveErr || S.loadErr;
		warn.textContent = err ? `Progress is not saving: ${err}` : "";
		warn.style.display = err ? "block" : "none";
	}
	const elRows = Object.entries(EL)
		.filter(([, v]) => v.cost)
		.sort((a, b) => a[1].cost! - b[1].cost!)
		.map(([k, v]) => {
			const own = S.unlocked.includes(k);
			return `<div class="shoprow"><div class="shopname">
      <span class="dot" style="background:${v.c};box-shadow:0 0 10px ${v.c}"></span>
      <span><b>${v.n}</b><small>${own ? v.blurb : "? ? ? Buy it to find out what it does."}</small></span></div>
      ${
			own
				? '<span class="owned">IN ARSENAL</span>'
				: `<button class="buy" data-t="el" data-k="${k}" ${S.coins < v.cost! ? "disabled" : ""}>${v.cost} coin</button>`
		}</div>`;
		})
		.join("");
	const wRows = Object.entries(W)
		.filter(([, v]) => v.price)
		.sort((a, b) => a[1].price! - b[1].price!)
		.map(([k, v]) => {
			const own = S.wunlocked.includes(k);
			return `<div class="shoprow"><div class="shopname">
      <span class="dot" style="background:${v.c};box-shadow:0 0 10px ${v.c}"></span>
      <span><b>${v.n}</b><small>${
			own ? `${v.d} ${v.dmg} damage, ${v.cost} energy.` : "? ? ? Buy it to find out what it does."
		}</small></span></div>
      ${
			own
				? '<span class="owned">IN ARSENAL</span>'
				: `<button class="buy" data-t="w" data-k="${k}" ${S.coins < v.price! ? "disabled" : ""}>${v.price} coin</button>`
		}</div>`;
		})
		.join("");
	const mRows = Object.entries(MV)
		.sort((a, b) => a[1].price - b[1].price)
		.map(([k, v]) => {
			const own = S.munlocked.includes(k);
			return `<div class="shoprow"><div class="shopname">
      <span class="dot" style="background:${own ? "var(--accent)" : "var(--muted)"};box-shadow:${own ? "0 0 10px var(--accent)" : "none"}"></span>
      <span><b>${v.n}</b><small>${
			own ? `${v.d} ${COST[k as ActionKey]} energy each.` : "? ? ? Buy it to find out what it does."
		}</small></span></div>
      ${
			own
				? '<span class="owned">IN ARSENAL</span>'
				: `<button class="buy" data-t="m" data-k="${k}" ${S.coins < v.price ? "disabled" : ""}>${v.price} coin</button>`
		}</div>`;
		})
		.join("");
	// a header button per section that sweeps up everything still unowned
	const bulk = (
		kind: string,
		entries: [string, ShopItem][],
		owned: string[],
		priceOf: (v: ShopItem) => number,
	): string => {
		const left = entries.filter(([k]) => !owned.includes(k));
		const due = left.reduce((a, [, v]) => a + priceOf(v), 0);
		if (!left.length) return `<span class="bulkdone">all owned</span>`;
		return `<button class="bulk" data-b="${kind}" ${S.coins < due ? "disabled" : ""}
      title="${left.length} left">Buy all · ${due} coin</button>`;
	};
	const elAll = bulk(
		"el",
		Object.entries(EL).filter(([, v]) => v.cost),
		S.unlocked,
		(v) => v.cost ?? 0,
	);
	const wAll = bulk(
		"w",
		Object.entries(W).filter(([, v]) => v.price),
		S.wunlocked,
		(v) => v.price ?? 0,
	);
	const mAll = bulk("m", Object.entries(MV), S.munlocked, (v) => v.price ?? 0);
	$("shop").innerHTML = `<div class="shophead">Elements${elAll}</div>${elRows}
    <div class="shophead" style="margin-top:20px">Weapons${wAll}</div>${wRows}
    <div class="shophead" style="margin-top:20px">Footwork${mAll}</div>${mRows}`;
	$("shop")
		.querySelectorAll(".bulk")
		.forEach(
			(b) =>
				(b.onclick = () => {
					const kind = b.dataset["b"];
					const list =
						kind === "el"
							? Object.entries(EL).filter(([, v]) => v.cost)
							: kind === "w"
								? Object.entries(W).filter(([, v]) => v.price)
								: Object.entries(MV);
					const owned = kind === "el" ? S.unlocked : kind === "w" ? S.wunlocked : S.munlocked;
					const priceOf = (v: ShopItem): number => (kind === "el" ? (v.cost ?? 0) : (v.price ?? 0));
					const left = list.filter(([k]) => !owned.includes(k));
					const due = left.reduce((a, [, v]) => a + priceOf(v), 0);
					if (S.coins < due) return;
					S.coins -= due;
					left.forEach(([k]) => owned.push(k));
					void save();
					drawShop();
					drawLoadout();
				}),
		);
	$("shop")
		.querySelectorAll(".buy")
		.forEach(
			(b) =>
				(b.onclick = () => {
					const k = b.dataset["k"]!;
					if (b.dataset["t"] === "el") {
						const cost = EL[k]?.cost ?? 0;
						if (S.coins < cost) return;
						S.coins -= cost;
						S.unlocked.push(k);
					} else if (b.dataset["t"] === "m") {
						const price = MV[k]?.price ?? 0;
						if (S.coins < price) return;
						S.coins -= price;
						S.munlocked.push(k);
						drawNames();
					} else {
						const price = W[k]?.price ?? 0;
						if (S.coins < price) return;
						S.coins -= price;
						S.wunlocked.push(k);
					}
					void save();
					drawShop();
					drawLoadout();
				}),
		);
}
const CHEAT = "APPLEYUMMY";
const MAXTRIES = 5;
const normCode = (v: string): string => (v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export function drawCheat(): void {
	const box = $("cheatbox"),
		msg = $("cheatmsg");
	const left = MAXTRIES - S.tries;
	if (S.cheat === 2) {
		box.style.display = "none";
		msg.textContent = "Code accepted. Treasury filled and the whole codex revealed.";
		msg.style.color = "#7dffb0";
	} else if (left <= 0) {
		box.style.display = "none";
		msg.textContent = `Out of guesses. All ${MAXTRIES} were wrong.`;
		msg.style.color = "#ff8f6b";
	} else {
		box.style.display = "flex";
		msg.textContent =
			S.tries === 0
				? `You get ${MAXTRIES} guesses. Spend them carefully.`
				: `Wrong. ${left} guess${left === 1 ? "" : "es"} left.`;
		msg.style.color = S.tries === 0 ? "var(--muted)" : "#ff8f6b";
	}
}
function trySubmitCode(): void {
	if (S.cheat === 2 || S.tries >= MAXTRIES) return;
	const guess = normCode($("cheatin").value);
	if (!guess) return;
	if (guess === CHEAT) {
		S.cheat = 2;
		S.coins = 9999999999;
		Object.values(FUSE).forEach((k) => {
			S.codex[k] = 1;
		});
	} else {
		S.tries++;
	}
	$("cheatin").value = "";
	void save();
	drawShop();
	drawCheat();
	drawCodex();
}
$("cheatgo").onclick = trySubmitCode;
$("cheatin").onkeydown = (e) => {
	if (e.key === "Enter") {
		e.preventDefault();
		trySubmitCode();
	}
};
/* The board builder: `S.preset` is the arena painted before a match, one terrain key per square. */
function presetReady(): void {
	if (!S.preset || S.presetDim !== S.dim) {
		S.preset = Array(S.dim * S.dim).fill(null);
		S.presetDim = S.dim;
	}
}
function paintedCount(): number {
	return S.preset ? S.preset.filter(Boolean).length : 0;
}
function bLabel(k: string): string {
	return k === "collapsed" ? "Break" : k === "erase" ? "Erase" : EL[k] ? EL[k].n : T[k]!.n;
}
function bColour(k: string): string {
	return k === "erase" ? "var(--muted)" : EL[k] ? EL[k].c : T[k]!.c;
}
export function drawSpawnPicker(): void {
	$("bspawn").innerHTML =
		[2, 3, 4, 5, 6, 7, 8]
			.map((n) => `<button class="bp spw" data-n="${n}" aria-pressed="${S.np === n}">${n}</button>`)
			.join("") + '<span class="hint" style="margin-left:8px">players</span>';
	$("bspawn")
		.querySelectorAll(".spw")
		.forEach(
			(b) =>
				(b.onclick = () => {
					S.np = +b.dataset["n"]!;
					$("np").value = String(S.np);
					$("npval").textContent = String(S.np);
					drawNames();
					if (S.who !== "all" && S.who >= S.np) S.who = "all";
					drawLoadout();
					drawSpawnPicker();
					buildBBoard();
				}),
		);
}
export function drawPalette(): void {
	const row = (host: string, keys: string[]): void => {
		const el = $(host);
		el.innerHTML =
			keys
				.map(
					(k) =>
						`<button class="bp mat" data-k="${k}" aria-pressed="${S.btool === k}">
        <span class="d" style="background:${bColour(k)}"></span>${bLabel(k)}</button>`,
				)
				.join("") || '<span class="hint">Nothing here yet.</span>';
		el.querySelectorAll(".mat").forEach(
			(b) =>
				(b.onclick = () => {
					S.btool = b.dataset["k"]!;
					drawPalette();
				}),
		);
	};
	row(
		"bpal",
		[...S.unlocked].sort((a, b) => (EL[a]!.cost || 0) - (EL[b]!.cost || 0)),
	);
	row(
		"bpalf",
		Object.values(FUSE).filter((k) => S.codex[k]),
	);
	row("bpalt", ["collapsed", "erase"]);
}
function paintCell(i: number): void {
	if (!S.preset) return;
	S.preset[i] = S.btool === "erase" ? null : S.btool;
	paintTile(i);
	drawSpawns();
	$("bcount").textContent = `${paintedCount()} of ${S.dim * S.dim} squares set`;
}
function paintTile(i: number): void {
	const n = $("bboard").children[i];
	if (!n) return;
	const k = S.preset?.[i];
	n.className = "tile";
	n.style.removeProperty("--tc");
	n.title = "";
	if (!k) return;
	const t = terrOf(k)!;
	n.classList.add("terr");
	if (t.solid) n.classList.add("solid");
	if (t.dead) n.classList.add("gonezone");
	n.style.setProperty("--tc", t.c);
	n.style.setProperty("--tcs", rgba(t.c, 0.44));
	n.title = `${t.n}: ${t.d}`;
}
let painting = false;
function buildBBoard(): void {
	const b = $("bboard");
	b.style.gridTemplateColumns = `repeat(${S.dim},var(--cell))`;
	const avail = Math.min(window.innerWidth - 70, 720);
	b.style.setProperty("--cell", Math.max(12, Math.min(40, Math.floor(avail / S.dim) - 2)) + "px");
	b.innerHTML = "";
	for (let i = 0; i < S.dim * S.dim; i++) {
		const t = document.createElement("div");
		t.className = "tile";
		t.onpointerdown = (e) => {
			e.preventDefault();
			painting = true;
			paintCell(i);
		};
		t.onpointerenter = () => {
			if (painting) paintCell(i);
		};
		b.appendChild(t);
	}
	for (let i = 0; i < S.dim * S.dim; i++) paintTile(i);
	drawSpawns();
	$("bcount").textContent = `${paintedCount()} of ${S.dim * S.dim} squares set`;
}
export function drawSpawns(): void {
	const b = $("bboard");
	b.querySelectorAll(".mage").forEach((m) => {
		m.remove();
	});
	b.querySelectorAll(".tile").forEach((t) => {
		t.classList.remove("willclear");
	});
	let sealed = 0;
	ringSpots(S.dim, S.np).forEach(([x, y], n) => {
		const i = idx(x, y),
			node = b.children[i];
		if (!node) return;
		const m = document.createElement("i");
		m.className = "mage p" + n;
		m.style.setProperty("--pc", PC[n]!);
		node.appendChild(m);
		const k = S.preset?.[i];
		const t = k ? terrOf(k) : null;
		if (t && (t.solid || t.gone)) {
			node.classList.add("willclear");
			sealed++;
		}
		node.title = `${nameOf(n)} starts here`;
	});
	const note = $("bspawnnote");
	if (note)
		note.textContent = sealed
			? `${sealed} spawn ${sealed === 1 ? "square has" : "squares have"} a wall or a hole on it. That is left exactly as you painted it: a hole there takes that player out on turn one.`
			: "";
}
addEventListener("pointerup", () => {
	painting = false;
});
function openBuilder(): void {
	presetReady();
	drawPalette();
	drawSpawnPicker();
	buildBBoard();
	$("builder").classList.add("on");
}
$("builderopen").onclick = openBuilder;
$("bdone").onclick = () => {
	$("builder").classList.remove("on");
};
$("bclear").onclick = () => {
	S.preset = Array(S.dim * S.dim).fill(null);
	buildBBoard();
};
/* The weapon simulator: a card built out of nothing, read for what it would do if it were real. */
const simCard: WeaponSpec = {ids: [], els: []};
export function simAdd(kind: string, k: string): void {
	if (kind === "w") simCard.ids.push(k);
	else simCard.els.push(k);
	drawSim();
}
function simDrop(kind: string, k: string): void {
	const list = kind === "w" ? simCard.ids : simCard.els;
	const at = list.lastIndexOf(k);
	if (at >= 0) list.splice(at, 1);
	drawSim();
}
export function drawSim(): void {
	const w = $("simw"),
		e = $("sime"),
		f = $("simf"),
		out = $("simout");
	w.innerHTML =
		[...S.wunlocked]
			.sort((a, b) => (W[a]!.price || 0) - (W[b]!.price || 0))
			.map(
				(k) =>
					`<button class="bp simadd" data-t="w" data-k="${k}">
      <span class="d" style="background:${W[k]!.c}"></span>${W[k]!.n} · ${W[k]!.dmg}</button>`,
			)
			.join("") || '<span class="hint">No weapons yet.</span>';
	e.innerHTML =
		[...S.unlocked]
			.sort((a, b) => (EL[a]!.cost || 0) - (EL[b]!.cost || 0))
			.map(
				(k) =>
					`<button class="bp simadd" data-t="el" data-k="${k}">
      <span class="d" style="background:${EL[k]!.c}"></span>${EL[k]!.n}</button>`,
			)
			.join("") || '<span class="hint">No elements yet.</span>';
	const found = Object.values(FUSE).filter((k) => known(k));
	f.innerHTML = found.length
		? [...new Set(found)]
				.map(
					(k) =>
						`<button class="bp simadd" data-t="el" data-k="${k}">
      <span class="d" style="background:${T[k]!.c}"></span>${T[k]!.n}</button>`,
				)
				.join("")
		: '<span class="hint">None discovered yet. Mix some in a match.</span>';

	if (simCard.ids.length) {
		const dmg = wepDmg(simCard),
			hits = wHits(simCard),
			cost = wCost(simCard),
			total = dmg * hits;
		const fit = (v: number | string): string => {
			const t = typeof v === "number" ? v.toLocaleString() : v;
			return `<b class="${t.length > 9 ? "vlong" : t.length > 6 ? "long" : ""}" title="${t}">${t}</b>`;
		};
		const fx = [...new Set(simCard.els.map((x) => forgeOf(x).fx))];
		const reach = new Set<string>();
		simCard.ids.forEach((id) => {
			PAT[W[id]!.pat]!().forEach(([dx, dy]) => reach.add(dx + "," + dy));
		});
		out.innerHTML = `<div class="simname">${wepName(simCard)}</div>
      <div class="simempty">${[...new Set(simCard.ids.map((i) => W[i]!.d))].join(" ")}</div>
      <div class="simnums">
        <div class="sn">${fit(dmg)}<span>per strike</span></div>
        <div class="sn">${fit(hits)}<span>strikes</span></div>
        <div class="sn hot">${fit(total)}<span>total damage</span></div>
        <div class="sn">${fit(cost)}<span>energy</span></div>
        <div class="sn">${fit((total / cost).toFixed(1))}<span>per energy</span></div>
        <div class="sn">${fit(reach.size)}<span>squares hit</span></div>
        <div class="sn">${fit(Math.ceil(S.hp / total))}<span>swings to drop ${S.hp} hp</span></div>
        <div class="sn">${fit(Math.max(1, cost - 1))}<span>earliest turn</span></div>
      </div>
      ${fx.length ? `<div class="simfx">On hit: ${fx.join(". ")}.</div>` : ""}
      ${partsHTML()}`;
	} else {
		out.innerHTML =
			'<div class="simempty">Add a weapon to begin. Elements on their own cannot be swung.</div>' + partsHTML();
	}
	$("sim")
		.querySelectorAll(".simadd")
		.forEach(
			(b) =>
				(b.onclick = () => {
					simAdd(b.dataset["t"]!, b.dataset["k"]!);
				}),
		);
	$("sim")
		.querySelectorAll(".ptdrop")
		.forEach(
			(b) =>
				(b.onclick = () => {
					simDrop(b.dataset["t"]!, b.dataset["k"]!);
				}),
		);
	if ($("simclear"))
		$("simclear").onclick = () => {
			simCard.ids = [];
			simCard.els = [];
			drawSim();
		};
}
// duplicates collapse into one tag with a count; the cross removes one at a time
function tallyList(list: string[]): [string, number][] {
	const order: string[] = [],
		n: Record<string, number> = {};
	list.forEach((k) => {
		if (!(k in n)) {
			order.push(k);
			n[k] = 0;
		}
		n[k]!++;
	});
	return order.map((k) => [k, n[k]!]);
}
function partsHTML(): string {
	if (!simCard.ids.length && !simCard.els.length) return "";
	const tag = (k: string, count: number, kind: string, colour: string, label: string): string =>
		`<span class="pt"><span class="d" style="background:${colour}"></span>${label}${
			count > 1 ? ` <b class="ptn">x${count}</b>` : ""
		}
      <button class="ptdrop" data-t="${kind}" data-k="${k}" title="Remove one">&times;</button></span>`;
	const bits = tallyList(simCard.ids)
		.map(([k, c]) => tag(k, c, "w", W[k]!.c, W[k]!.n))
		.concat(tallyList(simCard.els).map(([k, c]) => tag(k, c, "el", EL[k] ? EL[k].c : T[k]!.c, elName(k))));
	return `<div class="simparts">${bits.join("")}
    <button class="bp" id="simclear" style="border-color:var(--hot);color:var(--hot)">Clear</button></div>`;
}
/* The replay: stepping through the frames `logit` snapshotted, one log line at a time. */
let rvTimer: ReturnType<typeof setInterval> | null = null;
export function drawReplay(): void {
	const f = S.frames[S.rvi];
	const bar = $("rvbar"),
		cnt = $("rvcount"),
		note = $("rvnote");
	bar.max = String(Math.max(0, S.frames.length - 1));
	bar.value = String(S.rvi);
	cnt.textContent = `${S.frames.length ? S.rvi + 1 : 0} / ${S.frames.length}`;
	if (!f) {
		note.textContent = "Nothing was recorded.";
		$("rvboard").innerHTML = "";
		$("rvside").innerHTML = "";
		return;
	}
	note.innerHTML = `<b style="color:${f.c}">${f.who || "The arena"}</b>
    <span style="color:var(--muted)"> · round ${f.r}</span><br>
    <span${f.say ? ' style="font-style:italic"' : ""}>${f.say ? "says " : ""}${f.t}</span>`;

	const b = $("rvboard");
	b.style.gridTemplateColumns = `repeat(${S.dim},var(--cell))`;
	const avail = Math.min(window.innerWidth - 360, 560);
	b.style.setProperty("--cell", Math.max(11, Math.min(34, Math.floor(avail / S.dim) - 2)) + "px");
	let html = "";
	for (let i = 0; i < S.dim * S.dim; i++) {
		const k = f.board[i];
		const d = k ? T[k] : null;
		const who = f.players.find((q) => q.alive && q.y * S.dim + q.x === i);
		const cls = "tile" + (d ? " terr" : "") + (d?.solid ? " solid" : "") + (d?.dead ? " gonezone" : "");
		const style = d ? `--tc:${d.c};--tcs:${rgba(d.c, 0.44)}` : "";
		const mage = who ? `<i class="mage p${f.players.indexOf(who)}" style="--pc:${who.c}"></i>` : "";
		html += `<div class="${cls}" style="${style}" title="${d ? d.n : ""}">${mage}</div>`;
	}
	b.innerHTML = html;

	$("rvside").innerHTML = f.players
		.map(
			(q) => `
    <div class="rvp ${q.alive ? "" : "out"}" style="--pc:${q.c}">
      <div class="rvh"><span class="glyph mage p${f.players.indexOf(q)}"></span>
        <span class="rvn">${q.name}</span>
        <span class="rvhp">${q.alive ? q.hp + " hp" : "out"}</span></div>
      <div class="bar"><i style="width:${(q.hp / q.max) * 100}%;background:${q.c}"></i></div>
      <div class="rvcards" style="margin-top:7px">${
			q.hand.length
				? q.hand.map((n) => `<span class="rvc">${n}</span>`).join("")
				: '<span class="rvnone">empty hand</span>'
		}</div>
    </div>`,
		)
		.join("");
}
function rvGo(i: number): void {
	S.rvi = Math.max(0, Math.min(S.frames.length - 1, i));
	drawReplay();
}
export function rvStop(): void {
	if (rvTimer !== null) clearInterval(rvTimer);
	rvTimer = null;
	$("rvplay").textContent = "Play";
}
function rvPlay(): void {
	if (rvTimer) {
		rvStop();
		return;
	}
	if (S.rvi >= S.frames.length - 1) S.rvi = 0;
	$("rvplay").textContent = "Pause";
	rvTimer = setInterval(() => {
		if (S.rvi >= S.frames.length - 1) {
			rvStop();
			return;
		}
		rvGo(S.rvi + 1);
	}, 900);
}
function openReplay(): void {
	rvStop();
	S.rvi = 0;
	drawReplay();
	$("replay").classList.add("on");
}
$("rvopen").onclick = openReplay;
$("rvclose").onclick = () => {
	rvStop();
	$("replay").classList.remove("on");
};
$("rvprev").onclick = () => {
	rvStop();
	rvGo(S.rvi - 1);
};
$("rvnext").onclick = () => {
	rvStop();
	rvGo(S.rvi + 1);
};
$("rvplay").onclick = rvPlay;
$("rvbar").oninput = (e) => {
	rvStop();
	rvGo(+src(e).value);
};
function openSim(): void {
	drawSim();
	$("sim").classList.add("on");
}
$("simopen").onclick = openSim;
$("simclose").onclick = () => {
	$("sim").classList.remove("on");
};
function openTable(): void {
	S.tsel = S.tsel || "fire";
	buildTable();
	$("table").classList.add("on");
}
export function closeTable(): void {
	$("table").classList.remove("on");
}
["tableopen", "tableopen2", "tableopen3"].forEach((id) => {
	const b = $(id);
	if (b) b.onclick = openTable;
});
$("tclose").onclick = closeTable;
let resetArmed = false,
	resetT: ReturnType<typeof setTimeout> | null = null;
$("reset").onclick = async () => {
	const b = $("reset");
	if (!resetArmed) {
		resetArmed = true;
		b.textContent = "Tap again to wipe the treasury";
		b.style.borderColor = "#ff8f6b";
		b.style.color = "#ff8f6b";
		resetT = setTimeout(() => {
			resetArmed = false;
			b.textContent = "Reset all progress";
			b.style.borderColor = "";
			b.style.color = "";
		}, 3500);
		return;
	}
	if (resetT !== null) clearTimeout(resetT);
	resetArmed = false;
	b.style.borderColor = "";
	b.style.color = "";
	b.textContent = "Reset all progress";
	S.coins = 0;
	S.unlocked = [...BASE];
	S.wunlocked = [...WBASE];
	S.munlocked = [];
	S.mv = [0, 0, 0, 0, 0, 0, 0, 0];
	S.elOff = [];
	S.wOff = [];
	S.pOff = {};
	S.codex = {};
	S.saveErr = null;
	S.cheat = 0;
	S.tries = 0;
	try {
		await window.storage.delete("arena:v3", false);
	} catch (e) {
		S.saveErr = "delete failed: " + errText(e);
	}
	await save();
	drawShop();
	drawLoadout();
	drawCodex();
	drawCheat();
};
$("dim").oninput = (e) => {
	S.dim = +src(e).value;
	$("dimval").textContent = `${S.dim} x ${S.dim}`;
	if (S.preset && S.presetDim !== S.dim) {
		S.preset = null;
		S.presetDim = 0;
	}
};
$("hp").oninput = (e) => {
	S.hp = +src(e).value;
	$("hpval").textContent = String(S.hp);
};
$("start").onclick = startMatch;
export function drawCodex(): void {
	const total = Object.keys(FUSE).length;
	const found = Object.keys(FUSE).filter((k) => known(FUSE[k]!)).length;
	const line = $("codexline");
	if (line) line.textContent = `${found} of ${total} fusions discovered`;
	if ($("table").classList.contains("on")) buildTable();
}
export function buildTable(): void {
	const els = Object.keys(EL),
		m = $("matrix");
	m.style.gridTemplateColumns = `68px repeat(${els.length},minmax(62px,1fr))`;
	let h = '<div class="mc hdr"></div>';
	const hcol = (e: string): string => (ownEl(e) ? EL[e]!.c : "var(--muted)");
	const sel = S.tsel;
	const par = sel && !EL[sel] && known(sel) ? parentsOf(sel) : sel && EL[sel] ? [sel] : [];
	const lit = (e: string): string => (par.includes(e) ? " parent" : "");
	els.forEach(
		(e) => (h += `<div class="mc hdr elhdr${lit(e)}" data-k="${e}" style="color:${hcol(e)}">${EL[e]!.n}</div>`),
	);
	els.forEach((a) => {
		h += `<div class="mc hdr elhdr${lit(a)}" data-k="${a}" style="color:${hcol(a)};align-items:flex-end;text-align:right">${EL[a]!.n}</div>`;
		els.forEach((b) => {
			const k = FUSE[fkey(a, b)]!,
				vis = known(k);
			const madeHere =
				par.length === 2
					? (a === par[0] && b === par[1]) || (a === par[1] && b === par[0])
					: par.length === 1 && a === par[0] && b === par[0];
			h += `<div class="mc${vis ? " found" : " unknown"}${a === b ? " self" : ""}${madeHere ? " parent" : ""}" data-k="${k}" aria-pressed="${S.tsel === k}">
        <span class="d" style="background:${vis ? T[k]!.c : "var(--muted)"}"></span>
        <span>${vis ? T[k]!.n : "? ? ?"}</span></div>`;
		});
	});
	m.innerHTML = h;
	m.querySelectorAll(".mc[data-k]").forEach(
		(c) =>
			(c.onclick = () => {
				S.tsel = c.dataset["k"] ?? null;
				buildTable();
				drawDetail();
			}),
	);
	$("mvpal").innerHTML = Object.entries(MV)
		.sort((a, b) => a[1].price - b[1].price)
		.map(([k, v]) => {
			const own = S.munlocked.includes(k);
			return `<button class="bp mvref${own ? "" : " unknown"}" data-k="mv:${k}" aria-pressed="${S.tsel === "mv:" + k}">
      <span class="d" style="background:${own ? "var(--accent)" : "var(--muted)"}"></span>${v.n}</button>`;
		})
		.join("");
	$("mvpal")
		.querySelectorAll(".mvref")
		.forEach(
			(b) =>
				(b.onclick = () => {
					S.tsel = b.dataset["k"] ?? null;
					buildTable();
					drawDetail();
				}),
		);
	drawDetail();
}
export function drawDetail(): void {
	const e = S.tsel,
		box = $("tdetail");
	if (!e) {
		box.innerHTML = '<p class="thint" style="margin:0">Pick any cell above, or a piece of footwork.</p>';
		return;
	}
	if (e.startsWith("mv:")) {
		const k = e.slice(3),
			v = MV[k],
			owned = S.munlocked.includes(k);
		if (!owned) {
			box.innerHTML = `<div class="dh"><span class="d" style="background:var(--muted)"></span>
        <b>${v!.n}</b><span class="made">not bought yet</span></div>
        <div class="drow"><span>What it does</span><span>? ? ?</span></div>
        <div class="drow"><span>Price</span><span>Buy it for <em>${v!.price}</em> coin to find out.</span></div>`;
			return;
		}
		box.innerHTML = `<div class="dh"><span class="d" style="background:var(--accent)"></span>
      <b>${v!.n}</b><span class="made">in your arsenal</span></div>
      <div class="drow"><span>What it does</span><span>${v!.d}</span></div>
      <div class="drow"><span>Costs</span><span><em>${COST[k as ActionKey]}</em> energy a use</span></div>
      <div class="drow"><span>Giving it out</span><span>Hand it to a fighter on the setup screen. Each one only gets what you assign.</span></div>`;
		return;
	}
	if (!known(e)) {
		const unowned = (EL[e] ? [e] : parentsOf(e)).filter((k) => !ownEl(k));
		const head = EL[e] ? EL[e].n : "? ? ?";
		box.innerHTML = `<div class="dh"><span class="d" style="background:var(--muted)"></span>
      <b style="color:var(--muted)">${head}</b></div>
      ${
			unowned.length
				? `<div class="drow"><span>Underfoot</span><span>? ? ?</span></div>
           <div class="drow"><span>In the forge</span><span>? ? ?</span></div>
           <div class="drow"><span>Not bought</span><span>Buy ${unowned
				.map((k) => `<em>${EL[k]!.n}</em> for ${EL[k]!.cost} coin`)
				.join(" and ")} to read this.</span></div>`
				: `<div class="drow"><span>Undiscovered</span><span>Mix <em>${madeFrom(e).join("</em> or <em>")}</em>
             in a match to find out what it makes.</span></div>`
		}`;
		return;
	}
	const t = terrOf(e)!,
		f = forgeOf(e),
		from = madeFrom(e),
		into = mixesInto(e);
	const plain = wepDmg({ids: ["sword"], els: []}),
		forged = wepDmg({ids: ["sword"], els: [e]});
	const cross = wepDmg({ids: ["crossbow"], els: []}),
		fcross = wepDmg({ids: ["crossbow"], els: [e]});
	box.innerHTML = `
    <div class="dh"><span class="d" style="background:${t.c}"></span><b>${elName(e)}</b>
      <span class="made">${from.length ? from.join("  or  ") : "base element"}</span></div>
    <div class="drow"><span>Underfoot</span><span>Lays <em>${t.n}</em>: ${t.d.charAt(0).toLowerCase() + t.d.slice(1)}.</span></div>
    <div class="drow"><span>In the forge</span><span>${f.fx.charAt(0).toUpperCase() + f.fx.slice(1)}.</span></div>
    <div class="drow"><span>Sword</span><span><em>${plain}</em> becomes <em>${forged}</em></span></div>
    <div class="drow"><span>Crossbow</span><span><em>${cross}</em> becomes <em>${fcross}</em></span></div>
    ${
		into.length
			? `<div class="drow"><span>Mixes into</span><span>${mixesIntoKeys(e)
					.map((k) => (known(k) ? T[k]!.n : "? ? ?"))
					.join(", ")}</span></div>`
			: ""
	}
    ${S.codex[e] || !isComp(e) ? "" : '<div class="drow"><span>Status</span><span>Not yet discovered in play</span></div>'}`;
}
