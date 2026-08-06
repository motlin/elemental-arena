/**
 * The setup screen: the seats and their colours, the loadout, the shop, the cheat box, and the
 * doors to the simulator, the designer, the mixing table and the arena itself. React paints all of
 * it. This module hands over a description of where the save has got to and takes the changes back,
 * so `S` and `save()` stay the one account of what has been bought.
 */

import {designStore, menuStore, replayStore, simStore, tableStore} from "./bridge.js";
import type {
	ArenaSetup,
	ArsenalSetup,
	CheatState,
	DesignView,
	LoadoutChip,
	LoadoutSetup,
	MenuView,
	ScopeChip,
	SeatRow,
	ShopRow,
	ShopShelf,
	SpawnSpot,
	Swatch,
	TableView,
	TeamTally,
} from "./bridge.js";
import {BASE, EL, FUSE, MV, W, WBASE} from "./data/index.js";
import {elsOn, known, mvCost, mvOwnedMask, offFor, wsOn} from "./lookups.js";
import {ringSpots, startMatch} from "./match.js";
import {errText, save} from "./save.js";
import {flipTheme, themeLabel} from "./settings.js";
import {CHAOS, HAND0, MVUSES, NRG0, PC, PCN, PN, S, idx, nameOf, teamName} from "./state.js";
import type {Offs, ShopItem} from "./types.js";
import {redraw} from "./view.js";

/**
 * The setup screen as it stands, or nothing at all while a match has the screen. Everything that
 * changes the menu ends here, so React only ever sees the save whole.
 */
export function drawMenu(): void {
	menuStore.set(S.screen === "menu" ? menuView() : null);
}

function menuView(): MenuView {
	return {
		arena: arenaSetup(),
		loadout: loadoutSetup(),
		arsenal: arsenalSetup(),
		themeLabel: themeLabel(),
		toggleTheme: flipTheme,
		openSimulator: openSimulator,
		openDesigner: openDesigner,
		openTable,
		start: startMatch,
	};
}

/* The arena panel: who is playing, and every number the match is dealt from. */

const SWATCHES: readonly Swatch[] = PC.map((colour, i) => ({colour, name: PCN[i]!}));

function seatRows(): SeatRow[] {
	return Array.from({length: S.np}, (_, seat) => {
		const swatch = S.cols[seat]!;
		return {seat, name: S.names[swatch] ?? "", placeholder: PN[swatch]!, swatch};
	});
}

/** The colours in play, counted up in seat order, which is how the note under the seats reads. */
function teamTallies(): TeamTally[] {
	const counts = new Map<number, number>();
	for (let i = 0; i < S.np; i++) {
		const colour = S.cols[i]!;
		counts.set(colour, (counts.get(colour) ?? 0) + 1);
	}
	return [...counts].map(([colour, seats]) => ({name: teamName(colour), colour: PC[colour]!, seats}));
}

/** A number box's new value, held inside its range; an empty box falls back to the default. */
function clamp(value: number, low: number, high: number, fallback: number): number {
	return Number.isFinite(value) ? Math.max(low, Math.min(high, value)) : fallback;
}

function setSeatCount(seats: number): void {
	S.np = seats;
	if (S.who !== "all" && S.who >= S.np) S.who = "all";
	drawMenu();
}

/** A name belongs to a colour, so everyone playing that colour answers to it. */
function rename(seat: number, name: string): void {
	S.names[S.cols[seat]!] = name;
	drawMenu();
}

function recolour(seat: number, swatch: number): void {
	S.cols[seat] = swatch;
	drawMenu();
}

function arenaSetup(): ArenaSetup {
	return {
		seats: seatRows(),
		swatches: SWATCHES,
		teams: teamTallies(),
		footworkUses: S.mvUses,
		smash: S.smash,
		paintball: S.paint,
		chaos: S.chaos,
		chaosRound: S.chaosRound,
		hideHands: S.priv,
		dim: S.dim,
		hp: S.hp,
		startNrg: S.startNrg,
		openHand: S.openHand,
		setSeatCount,
		rename,
		recolour,
		setFootworkUses: (uses) => {
			S.mvUses = clamp(uses, 0, 99, MVUSES);
			drawMenu();
		},
		setSmash: (on) => {
			S.smash = on;
			drawMenu();
		},
		setPaintball: (on) => {
			S.paint = on;
			drawMenu();
		},
		setChaos: (on) => {
			S.chaos = on;
			drawMenu();
		},
		setChaosRound: (round) => {
			S.chaosRound = clamp(round, 1, 99, CHAOS);
			drawMenu();
		},
		setHideHands: (on) => {
			S.priv = on;
			drawMenu();
		},
		setDim: (dim) => {
			S.dim = dim;
			// a board painted for another grid no longer fits the one a match would be played on
			if (S.preset && S.presetDim !== S.dim) {
				S.preset = null;
				S.presetDim = 0;
			}
			drawMenu();
		},
		setHp: (hp) => {
			S.hp = hp;
			drawMenu();
		},
		setStartNrg: (energy) => {
			S.startNrg = clamp(energy, 0, 99, NRG0);
			drawMenu();
		},
		setOpenHand: (cards) => {
			S.openHand = clamp(cards, 0, 30, HAND0);
			drawMenu();
		},
	};
}

/* The this-match panel: what gets dealt, and whose hand it gets dealt into. */

function ensureOverride(i: number): Offs {
	if (!S.pOff[i]) S.pOff[i] = {el: [...S.elOff], w: [...S.wOff]};
	return S.pOff[i];
}

function toggleChip(kind: "el" | "w", key: string): void {
	const who = S.who;
	const list = who === "all" ? (kind === "el" ? S.elOff : S.wOff) : ensureOverride(who)[kind];
	const at = list.indexOf(key);
	if (at >= 0) list.splice(at, 1);
	else {
		const scope = who === "all" ? null : who;
		const onCount = (kind === "el" ? elsOn(scope) : wsOn(scope)).length;
		if (onCount <= 1) return; // never leave anyone with an empty pool
		list.push(key);
	}
	void save();
	drawMenu();
}

// footwork is per fighter, so it follows whichever scope you are editing
const mvHas = (k: string): boolean => (S.who === "all" ? !!(S.mvShared & MV[k]!.bit) : !!(S.mv[S.who]! & MV[k]!.bit));
const mvOwn = (i: number): number => S.mv[i]! & mvOwnedMask();
const mvDiffers = (i: number): boolean => mvOwn(i) !== (S.mvShared & mvOwnedMask());

function toggleFootwork(k: string): void {
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
	drawMenu();
}

function setAllFootwork(on: boolean): void {
	const m = mvOwnedMask();
	if (S.who === "all") {
		S.mvShared = on ? m : 0;
		for (let i = 0; i < 8; i++) S.mv[i] = S.mvShared;
	} else S.mv[S.who] = on ? m : 0;
	void save();
	drawMenu();
}

/** Puts the seat being edited back on the shared list everybody else draws from. */
function shareBack(): void {
	if (S.who !== "all") {
		delete S.pOff[S.who];
		S.mv[S.who] = S.mvShared;
	}
	void save();
	drawMenu();
}

function scopeChips(): ScopeChip[] {
	const chips: ScopeChip[] = [{who: "all", label: "Everyone", colour: "var(--accent)", own: false}];
	for (let i = 0; i < S.np; i++)
		chips.push({who: i, label: nameOf(i), colour: PC[S.cols[i]!]!, own: !!S.pOff[i] || mvDiffers(i)});
	return chips;
}

const byPrice = (a: [string, ShopItem], b: [string, ShopItem]): number =>
	(a[1].cost || a[1].price || 0) - (b[1].cost || b[1].price || 0);

function cardChips(table: Record<string, ShopItem>, bought: string[], off: string[]): LoadoutChip[] {
	return Object.entries(table)
		.sort(byPrice)
		.map(([key, v]) => ({
			key,
			name: v.n,
			colour: v.c!,
			owned: bought.includes(key),
			price: v.cost ?? v.price ?? 0,
			on: !off.includes(key),
		}));
}

function loadoutSetup(): LoadoutSetup {
	const scope = S.who === "all" ? null : S.who;
	const owned = mvOwnedMask();
	const current = S.who === "all" ? S.mvShared & owned : mvOwn(S.who);

	return {
		who: S.who,
		scopes: scopeChips(),
		elements: cardChips(EL, S.unlocked, offFor("el", scope)),
		weapons: cardChips(W, S.wunlocked, offFor("w", scope)),
		footwork: Object.entries(MV)
			.sort((a, b) => a[1].price - b[1].price)
			.map(([key, v]) => ({
				key,
				name: v.n,
				colour: "var(--accent)",
				owned: S.munlocked.includes(key),
				price: v.price,
				on: mvHas(key),
			})),
		allFootwork: current === owned,
		noFootwork: current === 0,
		anyFootwork: owned !== 0,
		setWho: (who) => {
			S.who = who;
			drawMenu();
		},
		toggleElement: (key) => {
			toggleChip("el", key);
		},
		toggleWeapon: (key) => {
			toggleChip("w", key);
		},
		toggleFootwork,
		setAllFootwork,
		share: S.who !== "all" && (!!S.pOff[S.who] || mvDiffers(S.who)) ? shareBack : null,
	};
}

/* The arsenal panel: the treasury, the shop, the cheat box and the wipe. */

function buy(key: string, price: number, bought: string[]): void {
	if (S.coins < price) return;
	S.coins -= price;
	bought.push(key);
	void save();
	drawMenu();
}

function buyAll(rows: readonly ShopRow[], bought: string[]): void {
	const left = rows.filter((row) => !row.owned);
	const due = left.reduce((a, row) => a + row.price, 0);
	if (S.coins < due) return;
	S.coins -= due;
	left.forEach((row) => bought.push(row.key));
	void save();
	drawMenu();
}

/** One shelf of the shop, priced up as a whole so the header can sweep up what is left on it. */
function shelf(heading: string, rows: ShopRow[], bought: string[]): ShopShelf {
	const left = rows.filter((row) => !row.owned);
	const due = left.reduce((a, row) => a + row.price, 0);

	return {
		heading,
		rows,
		due: left.length === 0 ? null : due,
		left: left.length,
		affordable: S.coins >= due,
		buy: (key) => {
			buy(key, rows.find((row) => row.key === key)?.price ?? 0, bought);
		},
		buyAll: () => {
			buyAll(rows, bought);
		},
	};
}

function elementShelf(): ShopShelf {
	const rows = Object.entries(EL)
		.filter(([, v]) => v.cost)
		.sort((a, b) => a[1].cost! - b[1].cost!)
		.map(([key, v]) => ({
			key,
			name: v.n,
			blurb: v.blurb ?? "",
			colour: v.c,
			owned: S.unlocked.includes(key),
			price: v.cost!,
			affordable: S.coins >= v.cost!,
		}));
	return shelf("Elements", rows, S.unlocked);
}

function weaponShelf(): ShopShelf {
	const rows = Object.entries(W)
		.filter(([, v]) => v.price)
		.sort((a, b) => a[1].price! - b[1].price!)
		.map(([key, v]) => ({
			key,
			name: v.n,
			blurb: `${v.d} ${v.dmg} damage, ${v.cost} energy.`,
			colour: v.c,
			owned: S.wunlocked.includes(key),
			price: v.price!,
			affordable: S.coins >= v.price!,
		}));
	return shelf("Weapons", rows, S.wunlocked);
}

function footworkShelf(): ShopShelf {
	const rows = Object.entries(MV)
		.sort((a, b) => a[1].price - b[1].price)
		.map(([key, v]) => ({
			key,
			name: v.n,
			blurb: `${v.d} ${mvCost(key)} energy each.`,
			colour: null,
			owned: S.munlocked.includes(key),
			price: v.price,
			affordable: S.coins >= v.price,
		}));
	return shelf("Footwork", rows, S.munlocked);
}

const CHEAT = "APPLEYUMMY";
const MAXTRIES = 5;
const normCode = (v: string): string => v.toUpperCase().replace(/[^A-Z0-9]/g, "");

function cheatState(): CheatState {
	if (S.cheat === 2) return "accepted";
	return S.tries >= MAXTRIES ? "spent" : "open";
}

function submitCode(code: string): void {
	if (cheatState() !== "open") return;
	const guess = normCode(code);
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
	void save();
	drawMenu();
	drawCodex();
}

async function wipeProgress(): Promise<void> {
	S.coins = 0;
	S.unlocked = [...BASE];
	S.wunlocked = [...WBASE];
	S.munlocked = [];
	S.mv = [0, 0, 0, 0, 0, 0, 0, 0];
	S.mvShared = 0;
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
	drawMenu();
	drawCodex();
}

function arsenalSetup(): ArsenalSetup {
	return {
		coins: S.coins,
		saveError: S.saveErr || S.loadErr,
		shelves: [elementShelf(), weaponShelf(), footworkShelf()],
		cheat: cheatState(),
		tries: S.tries,
		triesAllowed: MAXTRIES,
		submitCode,
		resetProgress: () => {
			void wipeProgress();
		},
	};
}

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
	setSeatCount(seats);
	designStore.set(designView());
}
/** Takes the designer down; a stable reference, so republishing the same board is not news. */
export function closeBuilder(): void {
	designStore.set(null);
}
function openDesigner(): void {
	presetReady();
	designStore.set(designView());
}
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
function openSimulator(): void {
	simStore.set({
		weapons: [...S.wunlocked].sort((a, b) => (W[a]!.price || 0) - (W[b]!.price || 0)),
		elements: [...S.unlocked].sort((a, b) => (EL[a]!.cost || 0) - (EL[b]!.cost || 0)),
		fusions: [...new Set(Object.values(FUSE).filter((k) => known(k)))],
		hp: S.hp,
		close: closeSim,
	});
}

/** Takes the simulator down; a stable reference, so republishing the same shelves is not news. */
export function closeSim(): void {
	simStore.set(null);
}
/**
 * The mixing table: every pair of elements crossed with every other, and the footwork palette
 * below it. The grid itself is React's to paint, so all the menu hands over is how far the save
 * has got -- what has been bought, and what has been mixed in play.
 */
export function openTable(): void {
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
/** How much of the fusion codex the save has turned up, as the arena's codex line reads it. */
export function codexLine(): string {
	const total = Object.keys(FUSE).length;
	const found = Object.keys(FUSE).filter((k) => known(FUSE[k]!)).length;
	return `${found} of ${total} fusions discovered`;
}
export function drawCodex(): void {
	// a fusion turned up mid-match reaches the arena's codex line, and the table over the board too
	redraw();
	if (tableStore.get() !== null) tableStore.set(tableView());
}
