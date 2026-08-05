/**
 * The setup screen: the seats and their colours, the shop, the loadout, the board builder and the
 * replay, plus the doors to the power simulator and the mixing table React paints.
 */

import {designStore, replayStore, simStore, tableStore} from "./bridge.js";
import type {DesignView, SpawnSpot, TableView} from "./bridge.js";
import {BASE, COST, EL, FUSE, MV, W, WBASE} from "./data/index.js";
import type {ActionKey} from "./data/index.js";
import {elsOn, known, mvOwnedMask, offFor, wsOn} from "./lookups.js";
import {ringSpots, startMatch} from "./match.js";
import {errText, save} from "./save.js";
import {$, PC, PCN, PN, S, idx, nameOf, src, teamName} from "./state.js";
import type {Offs, ShopItem} from "./types.js";

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
/** Where each seat opens the match, which the designer marks out on the board it is painting. */
function spawnSpots(): SpawnSpot[] {
	return ringSpots(S.dim, S.np).map(([x, y], seat) => ({index: idx(x, y), name: nameOf(seat), colour: PC[seat]!}));
}
/**
 * The board as it stands. The designer paints through the game rather than keeping a copy, so the
 * arena a match is fought over is the one thing either side has to agree on.
 */
function designView(): DesignView {
	return {
		dim: S.dim,
		preset: [...(S.preset ?? [])],
		elements: [...S.unlocked].sort((a, b) => (EL[a]!.cost || 0) - (EL[b]!.cost || 0)),
		fusions: [...new Set(Object.values(FUSE).filter((k) => S.codex[k]))],
		spawns: spawnSpots(),
		seats: S.np,
		setSeats: designSeats,
		paint: paintSquare,
		clear: clearBoard,
		close: closeBuilder,
	};
}
function paintSquare(index: number, key: string | null): void {
	if (!S.preset) return;
	S.preset[index] = key;
	designStore.set(designView());
}
function clearBoard(): void {
	S.preset = Array(S.dim * S.dim).fill(null);
	designStore.set(designView());
}
// the designer draws the ring for as many seats as it likes, and the setup screen follows it
function designSeats(seats: number): void {
	S.np = seats;
	$("np").value = String(S.np);
	$("npval").textContent = String(S.np);
	drawNames();
	if (S.who !== "all" && S.who >= S.np) S.who = "all";
	drawLoadout();
	designStore.set(designView());
}
/** Takes the designer down; a stable reference, so republishing the same board is not news. */
export function closeBuilder(): void {
	designStore.set(null);
}
$("builderopen").onclick = () => {
	presetReady();
	designStore.set(designView());
};
/* The replay: the frames `logit` snapshotted, handed over whole for React to step through. */
export function openReplay(): void {
	replayStore.set({frames: [...S.frames], dim: S.dim, close: closeReplay});
}
/** Takes the replay down; a stable reference, so republishing the same match is not news. */
export function closeReplay(): void {
	replayStore.set(null);
}
/**
 * The weapon simulator: a card built out of nothing, read for what it would do if it were real.
 * The card itself is React's to keep, so all the menu hands over is what the save has to build one
 * out of, taken as it stands the moment the screen goes up.
 */
$("simopen").onclick = () => {
	simStore.set({
		weapons: [...S.wunlocked].sort((a, b) => (W[a]!.price || 0) - (W[b]!.price || 0)),
		elements: [...S.unlocked].sort((a, b) => (EL[a]!.cost || 0) - (EL[b]!.cost || 0)),
		fusions: [...new Set(Object.values(FUSE).filter((k) => known(k)))],
		hp: S.hp,
		close: closeSim,
	});
};

/** Takes the simulator down; a stable reference, so republishing the same shelves is not news. */
export function closeSim(): void {
	simStore.set(null);
}
/**
 * The mixing table: every pair of elements crossed with every other, and the footwork palette
 * below it. The grid itself is React's to paint, so all the menu hands over is how far the save
 * has got -- what has been bought, and what has been mixed in play.
 */
function openTable(): void {
	tableStore.set(tableView());
}

function tableView(): TableView {
	return {
		owned: [...S.unlocked],
		found: [...new Set(Object.values(FUSE).filter((k) => known(k)))],
		footwork: [...S.munlocked],
		close: closeTable,
	};
}

/** Takes the table down; a stable reference, so republishing the same save is not news. */
export function closeTable(): void {
	tableStore.set(null);
}
["tableopen", "tableopen2", "tableopen3"].forEach((id) => {
	const b = $(id);
	if (b) b.onclick = openTable;
});
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
	// a fusion turned up mid-match reaches the table if it happens to be open over the board
	if (tableStore.get() !== null) tableStore.set(tableView());
}
