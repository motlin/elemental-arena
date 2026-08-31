/**
 * The one-way channel from the game modules under src/game to the React tree in src/main.tsx. The
 * game publishes a plain description of a screen whenever it redraws; React subscribes and paints
 * it. Screens migrate one at a time: each one drops its markup from index.html and the writes that
 * filled it in from the renderer, and gains a store here plus a component in src/ui/.
 */

import type {SeatState} from "./seat.js";
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

/**
 * The arena as the match server last told this seat it stands, or null while no online match is
 * running. src/net/client.ts is what fills it in, and src/game/online.ts is what draws the match
 * screen out of it -- the same door hot-seat comes through, which builds its own seat view instead
 * of being sent one (src/game/hotseat.ts).
 *
 * A seat view is rebuilt whole every time the room speaks, so identity is the only comparison worth
 * making: two of them are never equal and always news.
 */
export const seatStore = createStore<SeatState | null>(null, (a, b) => a === b);

/** How the socket behind an online match is doing. */
export type NetStatus = "joining" | "playing" | "gone";

/**
 * The strip over an online match: which match this is, which seat this device holds, and anything
 * the room has said that the arena itself does not show -- a move turned down, or a socket gone.
 */
export interface OnlineView {
	readonly code: string;
	readonly seat: number;
	readonly status: NetStatus;
	/** Why the last move was turned down, or why the socket went, and null while neither happened. */
	readonly notice: string | null;
	/** The other seats of this match with nobody in them, which is a match waiting on somebody. */
	readonly away: readonly number[];
	/** Puts the notice away. The move it was about is already over either way. */
	readonly dismiss: () => void;
}

function sameOnline(a: OnlineView | null, b: OnlineView | null): boolean {
	if (a === null || b === null) return a === b;
	if (a.code !== b.code || a.seat !== b.seat || a.status !== b.status || a.notice !== b.notice) return false;
	return a.away.length === b.away.length && a.away.every((seat, i) => seat === b.away[i]);
}

export const onlineStore = createStore<OnlineView | null>(null, sameOnline);

/** One kind of card an online match would be dealt from, as the online panel reads it back. */
export interface LobbyRow {
	readonly heading: string;
	/** What is switched on for everybody, by name, or empty for a row nothing is switched on in. */
	readonly names: readonly string[];
	/** True when more are switched on than an online match will take, which is what blocks hosting. */
	readonly over: boolean;
}

/** What this device would bring to a match it opened, and the cap every row of it is held to. */
export interface LobbyLoadout {
	readonly rows: readonly LobbyRow[];
	/** How many of each kind an online match may be opened on. */
	readonly max: number;
	/** True while no row is over the cap, which is the only time a match may be opened at all. */
	readonly ready: boolean;
}

/**
 * The online panel on the setup screen: opening a match, the link it deals, and the way into
 * somebody else's.
 */
export interface LobbyView {
	/** The code of the match this device opened, or null while it has opened none. */
	readonly code: string | null;
	/** True while the room is being opened, which spends the button. */
	readonly opening: boolean;
	/** Why the last thing tried did not work, or null. */
	readonly error: string | null;
	/**
	 * The one link to hand round, or null until a match has been opened. It names no seat: whoever
	 * follows it is dealt whichever seat is still free, so the same link goes to everybody.
	 */
	readonly link: string | null;
	/** How many seats that match was dealt, which is how many people the link is good for. */
	readonly seats: number;
	/** The cards a match opened from here would be dealt from, and whether the wire will take them. */
	readonly loadout: LobbyLoadout;
	readonly host: () => void;
	/** Asks the match this device opened for a seat, which is how the host plays in it. */
	readonly sit: () => void;
	/** Follows a link, wherever it came from. */
	readonly join: (link: string) => void;
}

function sameRow(a: LobbyRow, b: LobbyRow | undefined): boolean {
	if (b === undefined || a.heading !== b.heading || a.over !== b.over) return false;
	return a.names.length === b.names.length && a.names.every((name, i) => name === b.names[i]);
}

/**
 * The loadout is rebuilt from `S` on every menu redraw, so it is compared card by card rather than
 * by identity: switching a chip on and straight off again is not news for this panel to hear.
 */
function sameLoadout(a: LobbyLoadout, b: LobbyLoadout): boolean {
	if (a.max !== b.max || a.ready !== b.ready || a.rows.length !== b.rows.length) return false;
	return a.rows.every((row, i) => sameRow(row, b.rows[i]));
}

function sameLobby(a: LobbyView | null, b: LobbyView | null): boolean {
	if (a === null || b === null) return a === b;
	return (
		a.code === b.code &&
		a.opening === b.opening &&
		a.error === b.error &&
		a.link === b.link &&
		a.seats === b.seats &&
		sameLoadout(a.loadout, b.loadout)
	);
}

export const lobbyStore = createStore<LobbyView | null>(null, sameLobby);

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

/** One fighter standing on a square, as the board paints them. */
export interface TileFighter {
	/** Seat number, which picks the glyph's `p0`..`p7` class. */
	readonly seat: number;
	/** The seat's colour, fed to the glyph as `--pc`. */
	readonly colour: string;
	/** True for the fighter whose turn it is, which marks the glyph active. */
	readonly active: boolean;
	/** True for a fighter under a glare, which is never shown to the fighter themselves. */
	readonly lit: boolean;
	/** Where the glyph sits when a square is shared, or null when it has the square to itself. */
	readonly inset: string | null;
	/** Which glyph sits on top when a square is shared, or null when only one stands there. */
	readonly z: number | null;
}

/** One square of the board. Anything the seat cannot see has already been left out. */
export interface TileView {
	/** The ground's colour for `--tc`, or null on a square that reads as bare. */
	readonly colour: string | null;
	/** The same colour at the translucency the tile's glow wants, for `--tcs`. */
	readonly shadow: string | null;
	/** True once ground has been laid here that the seat can see. */
	readonly terrain: boolean;
	readonly solid: boolean;
	/** True for ground that ends a fighter who stops on it. */
	readonly dead: boolean;
	/** True for ground that ends a fighter who touches it at all. */
	readonly gone: boolean;
	/** The letter a whirlpool is paired by, or null on every other square. */
	readonly whirl: string | null;
	/** How the square answers the move being aimed: a reachable square, one with someone on it, or neither. */
	readonly aim: "aim" | "aimsure" | null;
	/** True for a neighbouring square this turn's energy can still afford to step onto. */
	readonly step: boolean;
	/** True for the square the last shove or blast is about to land on. */
	readonly warn: boolean;
	/** True while somebody under a glare is standing here. */
	readonly litsq: boolean;
	/** True for the square Inspect is reading. */
	readonly look: boolean;
	/** The stripes saying who can reach this square, or null when nobody was asked. */
	readonly reach: string | null;
	/** The hover text: the ground, whoever is standing on it, or nothing. */
	readonly title: string;
	readonly occupants: readonly TileFighter[];
	/** How many are standing here once that is worth a badge, or null. */
	readonly stack: number | null;
}

/** One animation to replay on a square that was just hit. */
export interface FxHit {
	/** Board index of the square it plays on. */
	readonly index: number;
	/** The class whose keyframes play, restarted from the beginning. */
	readonly animation: string;
}

/** The grid a match is played on. */
export interface BoardView {
	readonly dim: number;
	/** One square per cell, row by row, `dim * dim` of them. */
	readonly tiles: readonly TileView[];
	readonly click: (x: number, y: number) => void;
	/** Animations to replay now, which the board restarts and then forgets. */
	readonly fx: readonly FxHit[];
}

/** The strip along the top: whose turn it is, and everything that ends or leaves it. */
export interface TopbarView {
	/** Seat number, which picks the glyph's `p0`..`p7` class. */
	readonly seat: number;
	readonly name: string;
	/** The seat's colour, fed to the glyph as `--pc`. */
	readonly colour: string;
	/** The round, the energy, and whichever modes are running. */
	readonly round: string;
	readonly inspecting: boolean;
	readonly toggleInspect: () => void;
	readonly openTable: () => void;
	readonly canUndo: boolean;
	readonly undo: () => void;
	/** False while chaos mode is still waiting for a card to be thrown away. */
	readonly canEndTurn: boolean;
	readonly endTurn: () => void;
	/** What the forfeit button says, which changes once it is armed. */
	readonly forfeitLabel: string;
	/** True while a second tap would drop this fighter, which colours the button. */
	readonly forfeitArmed: boolean;
	readonly forfeit: () => void;
	readonly leave: () => void;
	/** What the theme button offers, which is whichever theme is not on. */
	readonly themeLabel: string;
	readonly toggleTheme: () => void;
}

/** One button on the footwork rail. */
export interface FootworkButton {
	/** The move it works, which is also its key in a list. */
	readonly key: string;
	/** What the button says: "Jump", "Jump · spent", "Floating", "Trailing Mud". */
	readonly label: string;
	/** What it costs, or null when the button is only saying what is already happening. */
	readonly cost: number | null;
	/** How many uses are left, or null when there are none to count. */
	readonly left: number | null;
	/** What the move does, as the button's hover text. */
	readonly tip: string;
	/** True while the board is waiting for this move's target. */
	readonly aiming: boolean;
	readonly disabled: boolean;
	readonly click: (() => void) | null;
}

/** The footwork rail: every special move this fighter was given. */
export interface FootworkView {
	/** False for a fighter given no special movement at all. */
	readonly any: boolean;
	readonly floating: boolean;
	/** True while this fighter cannot move at all this turn. */
	readonly rooted: boolean;
	readonly buttons: readonly FootworkButton[];
}

/** One element a weapon can be told to leave behind. */
export interface LeaveChoice {
	readonly key: string;
	readonly name: string;
	/** The colour the choice lights up in, fed to the button as `--lc`. */
	readonly colour: string;
	readonly on: boolean;
	readonly choose: () => void;
}

/** One row of leavings: what goes under them, or what goes under you. */
export interface LeaveRow {
	readonly label: string;
	readonly options: readonly LeaveChoice[];
}

/** The weapon panel, or null while this fighter's hands are empty. */
export interface WeaponView {
	readonly name: string;
	readonly colour: string;
	/** "8", or "8 x 2" for a weapon that swings more than once. */
	readonly damage: string;
	readonly desc: string;
	/** What the elements forged into it do on a hit, or null when they only add damage. */
	readonly onHit: string | null;
	/** The gradient across the strip under the name. */
	readonly strip: string;
	readonly rows: readonly LeaveRow[];
	readonly cost: number;
	/** True while the board is waiting for a square to swing at. */
	readonly aiming: boolean;
	readonly disabled: boolean;
	readonly swing: () => void;
	/** What swinging it would find, or why it cannot be swung. */
	readonly hint: string;
}

/** A run of the action bar's hint. `strong` picks out the card a question is about. */
export interface HintPart {
	readonly text: string;
	readonly strong: boolean;
}

/** One button on the action bar. */
export interface ActionButton {
	readonly key: string;
	readonly label: string;
	readonly disabled: boolean;
	/** True for a card the seat has not been shown, which is offered face down. */
	readonly facedown: boolean;
	readonly click: () => void;
}

/** The bar under the board: what the game is waiting for, and what can be done about it. */
export interface ActionBarView {
	/** What is going on, said before the buttons. */
	readonly hint: readonly HintPart[];
	/** True while the hint is about chaos mode, which is the one that shouts. */
	readonly alarm: boolean;
	readonly buttons: readonly ActionButton[];
	/** A second line after the buttons, or null when there is nothing more to say. */
	readonly tail: string | null;
}

/** One fighter's card in the roster down the left. */
export interface RosterCard {
	/** Seat number, which picks the glyph's `p0`..`p7` class. */
	readonly seat: number;
	readonly name: string;
	/** The seat's colour, fed to the card as `--pc`. */
	readonly colour: string;
	readonly alive: boolean;
	/** How many of their side are still standing beside them. */
	readonly allies: number;
	readonly hp: number;
	/** Share of health left, between 0 and 1, which is how far the bar fills. */
	readonly health: number;
	/** The energy line for a cap too big to draw as pips, or null while the pips are drawn. */
	readonly energy: string | null;
	/** The pips, or null once the cap is drawn as a line instead. */
	readonly pips: {readonly total: number; readonly filled: number} | null;
	/** Cards of theirs this seat has peeked at, or null when it has seen none. */
	readonly seen: string | null;
	/** What they are holding, and how much of it. */
	readonly line: string;
}

/** One card in this seat's hand. */
export interface HandCard {
	readonly uid: number;
	/** "ELEMENT", "FUSED" or "WEAPON". */
	readonly kind: string;
	/** Its place in the hand, which is the number the keyboard picks it by. */
	readonly number: number;
	readonly name: string;
	readonly desc: string;
	/** The card's colour, fed to it as `--ec`. */
	readonly colour: string;
	/** The gradient down its edge, fed to it as `--strip`. */
	readonly strip: string;
	/** True while this card is the one selected or held. */
	readonly on: boolean;
	/** True while this card is one the pending merge or throw can take. */
	readonly mixable: boolean;
	/** True for the card a chaos throw is asking about. */
	readonly doomed: boolean;
}

/** The hand: the cards, and the two things that can be done to one. */
export interface HandView {
	readonly cards: readonly HandCard[];
	readonly click: (uid: number) => void;
	/** Drops a card at a new place in the hand, counted among the cards it left behind. */
	readonly reorder: (uid: number, to: number) => void;
	/** False while the hand cannot be touched at all, which is between turns. */
	readonly draggable: boolean;
}

/** A line being quoted: the one replied to, above a message or in the reply bar. */
export interface ChatQuote {
	readonly who: string;
	readonly colour: string;
	/** Already cut to length, so the view only has to print it. */
	readonly text: string;
}

/** One thing said at the table. */
export interface ChatLine {
	readonly id: number;
	readonly who: string;
	readonly colour: string;
	readonly round: number;
	readonly text: string;
	/** What it was said in answer to, or null. */
	readonly quote: ChatQuote | null;
	readonly reply: () => void;
}

/** Table talk: what has been said, and what is being said back. */
export interface ChatView {
	readonly lines: readonly ChatLine[];
	/** The line the next message answers, or null. */
	readonly replyingTo: ChatQuote | null;
	readonly cancelReply: () => void;
	readonly say: (text: string) => void;
}

/** One line of the tile readout. */
export interface TileFact {
	readonly label: string;
	readonly value: string;
}

/** One fighter the reach overlay can be drawn for. */
export interface ReachChip {
	/** Seat number, which is also its key in a list. */
	readonly seat: number;
	readonly name: string;
	readonly colour: string;
	/** How far they could move on their turn. */
	readonly budget: number;
	readonly on: boolean;
	readonly toggle: () => void;
}

/** Who the reach overlay can be drawn for, offered under the readout. */
export interface ReachChooser {
	readonly chips: readonly ReachChip[];
	/** True when this seat is blinded, which leaves only their own reach to draw. */
	readonly blinded: boolean;
}

/** The square Inspect is reading. */
export interface TileReadout {
	readonly name: string;
	/** The ground's colour, or null for bare ground, which reads in the muted grey. */
	readonly colour: string | null;
	readonly blurb: string;
	readonly facts: readonly TileFact[];
}

/** The tile inspector down the right. */
export interface InspectView {
	readonly inspecting: boolean;
	/** What to do next while no square is being read, or null once one is. */
	readonly hint: string | null;
	readonly tile: TileReadout | null;
	/** Who reach can be drawn for, or null while Inspect is off. */
	readonly chooser: ReachChooser | null;
}

/** The match screen, as it stands after the move just made. */
export interface MatchView {
	readonly topbar: TopbarView;
	readonly board: BoardView;
	readonly footwork: FootworkView;
	/** The weapon in hand, or null while this fighter's hands are empty. */
	readonly weapon: WeaponView | null;
	readonly actions: ActionBarView;
	readonly roster: readonly RosterCard[];
	readonly hand: HandView;
	readonly chat: ChatView;
	readonly inspect: InspectView;
	/** How much of the fusion codex the save has turned up. */
	readonly codex: string;
}

/**
 * Every move changes something on the match screen, so a fresh publication is always news. All this
 * comparison does is keep the screen from being taken down twice on the way back to the menu.
 */
function sameMatch(a: MatchView | null, b: MatchView | null): boolean {
	return a === null && b === null;
}

export const matchStore = createStore<MatchView | null>(null, sameMatch);
