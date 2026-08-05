/**
 * The one-way channel from the game modules under src/game to the React tree in src/main.tsx. The
 * game publishes a plain description of a screen whenever it redraws; React subscribes and paints
 * it. Screens migrate one at a time: each one drops its markup from index.html and the writes that
 * filled it in from the renderer, and gains a store here plus a component in src/ui/.
 */

import type {Frame, LogEntry} from "./types.js";

type Listener = () => void;

export interface Store<T> {
	get: () => T;
	set: (next: T) => void;
	subscribe: (listener: Listener) => () => void;
}

/**
 * The game redraws far more often than any one screen changes, so `equals` decides what counts as
 * news. Republishing an equal value is ignored, which keeps React off the treadmill and keeps the
 * snapshot stable enough for `useSyncExternalStore`, which compares snapshots by identity.
 */
function createStore<T>(initial: T, equals: (a: T, b: T) => boolean): Store<T> {
	let value = initial;
	const listeners = new Set<Listener>();
	return {
		get: () => value,
		set: (next) => {
			if (equals(value, next)) return;
			value = next;
			for (const listener of [...listeners]) listener();
		},
		subscribe: (listener) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}

/** What the handoff curtain needs to know about the seat whose turn is starting. */
export interface HandoffView {
	/** Seat number, which picks the glyph's `p0`..`p7` class. */
	readonly seat: number;
	readonly name: string;
	/** The seat's colour, fed to the glyph as `--pc`. */
	readonly colour: string;
	/** Drops the curtain and hands control back to the game. */
	readonly dismiss: () => void;
}

function sameHandoff(a: HandoffView | null, b: HandoffView | null): boolean {
	if (a === null || b === null) return a === b;
	return a.seat === b.seat && a.name === b.name && a.colour === b.colour && a.dismiss === b.dismiss;
}

export const handoffStore = createStore<HandoffView | null>(null, sameHandoff);

/** What the game-over screen needs to know about the match that just ended. */
export interface OverView {
	/** The winner's seat number, which picks the glyph's `p0`..`p7` class. */
	readonly seat: number;
	/** The winning team's colour, or a grey when nobody walked out. */
	readonly colour: string;
	/** Who holds the arena, or that nobody does. */
	readonly headline: string;
	/** Everyone who shares the win, and the coin banked for it. */
	readonly earn: string;
	/** The whole match log, oldest line first. */
	readonly log: readonly LogEntry[];
	/** Puts the replay up over the screen. */
	readonly openReplay: () => void;
	/** Drops the screen and goes back to the menu. */
	readonly back: () => void;
}

function sameOver(a: OverView | null, b: OverView | null): boolean {
	if (a === null || b === null) return a === b;
	return (
		a.seat === b.seat &&
		a.colour === b.colour &&
		a.headline === b.headline &&
		a.earn === b.earn &&
		a.log === b.log &&
		a.openReplay === b.openReplay &&
		a.back === b.back
	);
}

export const overStore = createStore<OverView | null>(null, sameOver);

/** What the power simulator needs to know about the save it was opened from. */
export interface SimView {
	/** Weapon keys the save has unlocked, cheapest first. */
	readonly weapons: readonly string[];
	/** Element keys the save has unlocked, cheapest first. */
	readonly elements: readonly string[];
	/** Fused element keys already discovered in play. */
	readonly fusions: readonly string[];
	/** The health a match starts on, which the swings-to-drop figure counts down. */
	readonly hp: number;
	/** Shuts the simulator and goes back to the setup screen. */
	readonly close: () => void;
}

/** A list is the same list whatever array it arrived in. */
function sameKeys<T>(a: readonly T[], b: readonly T[]): boolean {
	return a.length === b.length && a.every((k, i) => k === b[i]);
}

function sameSim(a: SimView | null, b: SimView | null): boolean {
	if (a === null || b === null) return a === b;
	return (
		a.hp === b.hp &&
		a.close === b.close &&
		sameKeys(a.weapons, b.weapons) &&
		sameKeys(a.elements, b.elements) &&
		sameKeys(a.fusions, b.fusions)
	);
}

export const simStore = createStore<SimView | null>(null, sameSim);

/** What the mixing table needs to know about how far the save has got. */
export interface TableView {
	/** Element keys the save has bought; the rest of the grid reads as a mystery. */
	readonly owned: readonly string[];
	/** Fused element keys already discovered in play. */
	readonly found: readonly string[];
	/** Footwork keys the save has bought. */
	readonly footwork: readonly string[];
	/** Shuts the table and goes back to whatever it was opened over. */
	readonly close: () => void;
}

function sameTable(a: TableView | null, b: TableView | null): boolean {
	if (a === null || b === null) return a === b;
	return (
		a.close === b.close &&
		sameKeys(a.owned, b.owned) &&
		sameKeys(a.found, b.found) &&
		sameKeys(a.footwork, b.footwork)
	);
}

export const tableStore = createStore<TableView | null>(null, sameTable);

/** What the replay needs to know about the match it steps back through. */
export interface ReplayView {
	/** Every frame `logit` snapshotted, oldest first. */
	readonly frames: readonly Frame[];
	/** The grid the match was played on, which every frame's board fills. */
	readonly dim: number;
	/** Shuts the replay and goes back to whatever it was opened over. */
	readonly close: () => void;
}

function sameReplay(a: ReplayView | null, b: ReplayView | null): boolean {
	if (a === null || b === null) return a === b;
	return a.dim === b.dim && a.frames === b.frames && a.close === b.close;
}

export const replayStore = createStore<ReplayView | null>(null, sameReplay);

/** Where one seat starts on the board being painted. */
export interface SpawnSpot {
	/** Board index the seat opens the match on. */
	readonly index: number;
	/** Who starts there, so the square can say so. */
	readonly name: string;
	/** The seat's colour, fed to the glyph as `--pc`. */
	readonly colour: string;
}

/** What the arena designer needs to know about the ground it is painting. */
export interface DesignView {
	/** The grid being painted, which is the one the next match is played on. */
	readonly dim: number;
	/** One terrain key per square, or null where nothing has been painted. */
	readonly preset: readonly (string | null)[];
	/** Element keys the save has unlocked, cheapest first. */
	readonly elements: readonly string[];
	/** Fused element keys already discovered in play. */
	readonly fusions: readonly string[];
	/** Where each seat starts, in seat order. */
	readonly spawns: readonly SpawnSpot[];
	/** How many seats the spawn ring is drawn for. */
	readonly seats: number;
	/** Draws the ring for a different number of seats, which the setup screen follows. */
	readonly setSeats: (seats: number) => void;
	/** Paints one square, or clears it back to bare ground with null. */
	readonly paint: (index: number, key: string | null) => void;
	/** Wipes every square the board has been painted with. */
	readonly clear: () => void;
	/** Shuts the designer and goes back to the setup screen. */
	readonly close: () => void;
}

function sameSpawns(a: readonly SpawnSpot[], b: readonly SpawnSpot[]): boolean {
	return (
		a.length === b.length &&
		a.every((spot, i) => {
			const other = b[i];
			return other !== undefined && spot.index === other.index && spot.name === other.name;
		})
	);
}

function sameDesign(a: DesignView | null, b: DesignView | null): boolean {
	if (a === null || b === null) return a === b;
	return (
		a.dim === b.dim &&
		a.seats === b.seats &&
		a.setSeats === b.setSeats &&
		a.paint === b.paint &&
		a.clear === b.clear &&
		a.close === b.close &&
		sameKeys(a.preset, b.preset) &&
		sameKeys(a.elements, b.elements) &&
		sameKeys(a.fusions, b.fusions) &&
		sameSpawns(a.spawns, b.spawns)
	);
}

export const designStore = createStore<DesignView | null>(null, sameDesign);

/** One seat on the setup screen: who plays it, and the colour they play it in. */
export interface SeatRow {
	/** Seat number, which picks the glyph's `p0`..`p7` class. */
	readonly seat: number;
	/** The name typed for this seat's colour, or "" while it still answers to the default. */
	readonly name: string;
	/** The default name, which the empty field shows. */
	readonly placeholder: string;
	/** Which swatch the seat plays, an index into `MenuView.arena.swatches`. */
	readonly swatch: number;
}

/** One colour a seat can be switched to. */
export interface Swatch {
	readonly colour: string;
	/** The short name the swatch is labelled with. */
	readonly name: string;
}

/** A side, as the note under the seats counts them up. */
export interface TeamTally {
	readonly name: string;
	readonly colour: string;
	/** How many seats play this colour. */
	readonly seats: number;
}

/** The arena panel: the seats, and every number a match is dealt from. */
export interface ArenaSetup {
	readonly seats: readonly SeatRow[];
	readonly swatches: readonly Swatch[];
	readonly teams: readonly TeamTally[];
	readonly footworkUses: number;
	readonly smash: boolean;
	readonly paintball: boolean;
	readonly chaos: boolean;
	readonly chaosRound: number;
	readonly hideHands: boolean;
	readonly dim: number;
	readonly hp: number;
	readonly startNrg: number;
	readonly openHand: number;
	readonly setSeatCount: (seats: number) => void;
	/** Renames the colour this seat plays, which renames everyone else playing it too. */
	readonly rename: (seat: number, name: string) => void;
	readonly recolour: (seat: number, swatch: number) => void;
	readonly setFootworkUses: (uses: number) => void;
	readonly setSmash: (on: boolean) => void;
	readonly setPaintball: (on: boolean) => void;
	readonly setChaos: (on: boolean) => void;
	readonly setChaosRound: (round: number) => void;
	readonly setHideHands: (on: boolean) => void;
	readonly setDim: (dim: number) => void;
	readonly setHp: (hp: number) => void;
	readonly setStartNrg: (energy: number) => void;
	readonly setOpenHand: (cards: number) => void;
}

/** One thing a fighter can be dealt or denied, as the loadout chips show it. */
export interface LoadoutChip {
	readonly key: string;
	readonly name: string;
	/** The colour the chip lights up in once it is on. */
	readonly colour: string;
	/** False while it is still in the shop, which greys the chip out. */
	readonly owned: boolean;
	/** What the shop wants for it, which the locked chip says. */
	readonly price: number;
	readonly on: boolean;
}

/** Whose loadout the chips belong to: one seat, or the shared list everybody starts from. */
export interface ScopeChip {
	readonly who: number | "all";
	readonly label: string;
	readonly colour: string;
	/** True once this seat has a list of its own, which marks the chip with a star. */
	readonly own: boolean;
}

/** The this-match panel: what gets dealt, and who it gets dealt to. */
export interface LoadoutSetup {
	readonly who: number | "all";
	readonly scopes: readonly ScopeChip[];
	readonly elements: readonly LoadoutChip[];
	readonly weapons: readonly LoadoutChip[];
	readonly footwork: readonly LoadoutChip[];
	/** True once every piece of footwork bought is on, which spends the All button. */
	readonly allFootwork: boolean;
	/** True while none of it is, which spends the None button. */
	readonly noFootwork: boolean;
	/** False before any footwork has been bought, which takes both buttons away. */
	readonly anyFootwork: boolean;
	readonly setWho: (who: number | "all") => void;
	readonly toggleElement: (key: string) => void;
	readonly toggleWeapon: (key: string) => void;
	readonly toggleFootwork: (key: string) => void;
	readonly setAllFootwork: (on: boolean) => void;
	/** Puts the seat being edited back on the shared list, or null while it is already on it. */
	readonly share: (() => void) | null;
}

/** One row of the shop: something to buy, or something already in the arsenal. */
export interface ShopRow {
	readonly key: string;
	readonly name: string;
	/** What it does, once it has been bought; before that it is a tease. */
	readonly blurb: string;
	/** The dot beside the name, or null for footwork, which wears the accent instead. */
	readonly colour: string | null;
	readonly owned: boolean;
	readonly price: number;
	/** False when the treasury is short of this row, which spends its button. */
	readonly affordable: boolean;
}

/** One shelf of the shop, and the button that sweeps up everything left on it. */
export interface ShopShelf {
	readonly heading: string;
	readonly rows: readonly ShopRow[];
	/** What the rest of the shelf costs together, or null once it is all owned. */
	readonly due: number | null;
	/** How many rows that is. */
	readonly left: number;
	/** False when the treasury is short of the lot. */
	readonly affordable: boolean;
	readonly buy: (key: string) => void;
	readonly buyAll: () => void;
}

/** How the cheat box stands: still taking guesses, out of them, or already opened. */
export type CheatState = "open" | "spent" | "accepted";

/** The arsenal panel: the treasury, the shop, the cheat box and the wipe. */
export interface ArsenalSetup {
	readonly coins: number;
	/** Why progress is not saving, or null while it is. */
	readonly saveError: string | null;
	readonly shelves: readonly ShopShelf[];
	readonly cheat: CheatState;
	/** How many guesses have been spent on the code. */
	readonly tries: number;
	/** How many there were to spend. */
	readonly triesAllowed: number;
	readonly submitCode: (code: string) => void;
	readonly resetProgress: () => void;
}

/** The setup screen, as it stands between matches. */
export interface MenuView {
	readonly arena: ArenaSetup;
	readonly loadout: LoadoutSetup;
	readonly arsenal: ArsenalSetup;
	/** What the theme button offers, which is whichever theme is not on. */
	readonly themeLabel: string;
	readonly toggleTheme: () => void;
	readonly openSimulator: () => void;
	readonly openDesigner: () => void;
	readonly openTable: () => void;
	readonly start: () => void;
}

/**
 * Unlike the screens the match redraws behind, the setup screen is only ever republished once
 * something on it has actually changed, so every publication is news. All this comparison does is
 * keep a match that is already under way from taking the screen down twice.
 */
function sameMenu(a: MenuView | null, b: MenuView | null): boolean {
	return a === null && b === null;
}

export const menuStore = createStore<MenuView | null>(null, sameMenu);
