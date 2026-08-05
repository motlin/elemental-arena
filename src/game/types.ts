/**
 * The shapes the game is written against: the board, the fighters, the cards they play, and the one
 * `S` object that holds all of it. Types only, so every other module can read this one freely.
 */

import type {ActionKey} from "./data/index.js";

/** One square of ground. `t` is what it looks like; `el` is the element card that laid it. */
export interface Cell {
	t: string | null;
	el: string | null;
	life: number;
	/** Whirlpool group id, so twinned whirls know each other. */
	wid: number;
	/** Seat that laid the tile, which is who `seesTile` lets through concealing ground. */
	by: number | null;
}

/** The weapon half of a card: the weapons fused into it and the elements forged onto them. */
export interface WeaponSpec {
	ids: string[];
	els: string[];
	/** Terrain the swing drops under the wielder. */
	leaveSelf?: string;
	/** Terrain the swing drops under the target. */
	leaveFoe?: string;
}

export interface ElCard {
	uid: number;
	k: "el";
	id: string;
	/** Set when a rival has marked the card, which turns it face up to everyone but its owner. */
	mark?: boolean;
}

export interface WepCard extends WeaponSpec {
	uid: number;
	k: "w";
	mark?: boolean;
}

export type Card = ElCard | WepCard;

/** A fighter in the match. One per seat, in seat order. */
export interface Player {
	/** Seat number, which also picks the `p0`..`p7` glyph class. */
	i: number;
	name: string;
	/** The seat's colour. */
	c: string;
	team: number;
	/** Footwork bits this seat owns, as a mask over `MV[k]!.bit`. */
	mv: number;
	/** Times each piece of footwork has been used this match. */
	used: Record<ActionKey, number>;
	/** Terrain being laid behind the fighter as they walk, if trail is running. */
	trail: string | null;
	/** Set while float is up, which lets the fighter ignore the ground until the turn ends. */
	float: boolean;
	x: number;
	y: number;
	hp: number;
	max: number;
	nrg: number;
	cap: number;
	/** Energy siphoned off the next refill. */
	drain: number;
	/** Energy carried into the next turn. */
	bank: number;
	rootTurns: number;
	darkTurns: number;
	litTurns: number;
	hand: Card[];
	/** `uid` of the card in hand, or null. */
	held: number | null;
	alive: boolean;
	/** Set while the fighter is glowing, which strips any cover they were under. */
	lit?: boolean;
}

/** One line of the match log, which is also the head of the replay frame it snapshots. */
export interface LogEntry {
	r: number;
	who: string;
	c: string;
	t: string;
	say: boolean;
}

/** A fighter as the replay remembers them: enough to redraw, nothing that can be acted on. */
interface FrameFighter {
	name: string;
	c: string;
	team: number;
	x: number;
	y: number;
	hp: number;
	max: number;
	alive: boolean;
	/** Card labels rather than cards, since a replay never plays them. */
	hand: string[];
	held: number | null;
}

/** The board and everyone on it at the moment one log line was written. */
export interface Frame extends LogEntry {
	turn: number;
	board: (string | null)[];
	players: FrameFighter[];
}

export interface ChatMsg {
	id: number;
	who: string;
	c: string;
	r: number;
	t: string;
	/** `id` of the message this one answers, or null. */
	to: number | null;
}

/** A card being dragged along the hand bar. */
export interface Drag {
	uid: number;
	el: GameEl;
	x0: number;
	y0: number;
	pid: number;
	active: boolean;
	/** Set for touch and pen, where a sideways swipe belongs to the scroller instead. */
	touch: boolean;
}

/** A tile flash the next render paints, as `[board index, class]`. */
type Fx = [number, string];

/** What the shop rows need from an element, a weapon, or a piece of footwork. */
export interface ShopItem {
	n: string;
	c?: string;
	d?: string;
	cost?: number;
	price?: number;
}

/** Cards a seat has switched off, so they never come up in that seat's hand. */
export interface Offs {
	el: string[];
	w: string[];
}

/** Everything the game knows, both between matches and during one. */
export interface GameState {
	dim: number;
	np: number;
	hp: number;
	startNrg: number;
	openHand: number;
	players: Player[];
	board: Cell[];
	turn: number;
	round: number;
	phase: string;
	names: string[];
	/** Colour index per seat, which is also the team a seat fights for. */
	cols: number[];
	/** Footwork mask per seat. */
	mv: number[];
	munlocked: string[];
	mvShared: number;
	priv: boolean;
	smash: boolean;
	mvUses: number;
	paint: boolean;
	chaos: boolean;
	chaosRound: number;
	handoff: boolean;
	theme: string;
	screen: string;
	saveErr: string | null;
	loadErr: string | null;
	cheat: number;
	tries: number;
	/** `uid` of the card a mix started from. */
	mixFrom: number | null;
	/** Seat whose card is being stolen. */
	steal: number | null;
	/** Board index the chaos round has marked to fall away next round. */
	warn: number | null;
	toss: boolean;
	tossPick: number | null;
	chat: ChatMsg[];
	cid: number;
	replyTo: number | null;
	log: LogEntry[];
	frames: Frame[];
	/** Index into `frames` the replay is parked on. */
	rvi: number;
	/** Terrain keys the board builder painted, one per tile, or null for a blank arena. */
	preset: (string | null)[] | null;
	presetDim: number;
	/** Terrain key the board builder paints with. */
	btool: string;
	/** Board index the inspector is looking at. */
	look: number | null;
	imode: boolean;
	/** Board indices the pending action reaches. */
	reach: number[];
	/** `uid` of the selected card. */
	sel: number | null;
	mode: string | null;
	wid: number;
	uid: number;
	fx: Fx[];
	coins: number;
	unlocked: string[];
	wunlocked: string[];
	elOff: string[];
	wOff: string[];
	pOff: Record<string, Offs>;
	/** Seat the loadout screen is editing, or "all". */
	who: number | "all";
	/** Fusions discovered in play. */
	codex: Record<string, number>;
	matchCoins: number;
}

/**
 * Every element the game reaches for by id. The page owns all of them, so `$` hands back one of
 * these rather than a nullable `HTMLElement`, and the form properties are widened to the union of
 * what the tags behind those ids actually carry.
 */
export interface GameEl extends HTMLElement {
	value: string;
	checked: boolean;
	max: string;
	min: string;
	disabled: boolean;
	/** Everything the game digs out of the page is one of its own elements, so default `E` to one. */
	querySelector(selectors: string): GameEl | null;
	querySelectorAll<E extends Element = GameEl>(selectors: string): NodeListOf<E>;
	readonly children: HTMLCollectionOf<GameEl>;
}

/**
 * The `window.storage` the game was authored against, provided by public/storage-shim.js here.
 * The trailing flag is vestigial from the Claude artifact host, which used it to mark a cell secret.
 */
interface ArtifactStorage {
	get: (key: string, secret?: boolean) => Promise<{key: string; value: string} | null>;
	set: (key: string, value: string, secret?: boolean) => Promise<void>;
	delete: (key: string, secret?: boolean) => Promise<void>;
}

declare global {
	interface Window {
		storage: ArtifactStorage;
	}
}
