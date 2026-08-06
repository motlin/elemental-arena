/**
 * The match as one seat is allowed to see it.
 *
 * Hot-seat gets away with a single view because only one person is ever looking: src/game/render.ts
 * builds the arena for `cur()` and the handoff curtain covers the gap. Online, every seat is looking
 * at once and each one is a separate client, so the same filtering has to run per seat instead --
 * and it has to run before the bytes leave the server, because anything sent is told.
 *
 * So this is the wire boundary. It answers `hidden`, `seesTile` and `blind` from src/game/state.ts,
 * which is the one place the arena's secrets are defined, and it builds plain data: no callbacks, no
 * colours, no wording. What a seat is handed here is everything that seat may ever learn.
 *
 * What is deliberately absent, and why:
 *   - Every other seat's hand. Only the count, plus whatever a mark has turned face up.
 *   - The match log. `logit` narrates every move by name and square, concealed ones included, so
 *     the log is a leak with a plot. Table talk goes over, the log does not.
 *   - The replay frames, which are the log with the whole board attached.
 *   - Anything from the save: coins, unlocks, the fusion codex. Those are the player's own device's
 *     business and the server never holds an opinion about them.
 */

import {cardLabel} from "./cards.js";
import {wepName} from "./lookups.js";
import {seenBy} from "./movement.js";
import {S, blind, hidden, seesTile} from "./state.js";
import type {ActionKey} from "./data/index.js";
import type {Card, ChatMsg, Player} from "./types.js";

/** One square, as far as this seat can read it. Ground it cannot see arrives as bare ground. */
export interface SeatTile {
	/** Terrain key, or null on a square this seat reads as bare. */
	readonly t: string | null;
	/** Rounds of life left, or 0 on ground this seat cannot see. */
	readonly life: number;
	/** Whirlpool group id, so twinned whirls know each other, or 0. */
	readonly wid: number;
}

/** A fighter, as far as this seat can see them. */
export interface SeatFighter {
	readonly seat: number;
	readonly name: string;
	readonly colour: string;
	readonly team: number;
	readonly alive: boolean;
	readonly hp: number;
	readonly max: number;
	/** Where they stand, or null when this seat cannot see them at all. */
	readonly at: readonly [number, number] | null;
	/** True for a fighter under a glare, which is never reported to the fighter themselves. */
	readonly lit: boolean;
	/** How many cards they are holding, which everybody may count. */
	readonly cards: number;
	/** Their cards this seat has been shown, which is only ever one a mark turned over. */
	readonly seen: readonly string[];
	/** The weapon in their hands, named only for this seat's own fighter or when hands are open. */
	readonly weapon: string | null;
	/** Energy left this turn, or null for a seat that is not entitled to the figure. */
	readonly nrg: number | null;
	readonly cap: number;
}

/** This seat's own fighter, who has no secrets from the person playing them. */
export interface SeatSelf {
	readonly seat: number;
	readonly x: number;
	readonly y: number;
	readonly hp: number;
	readonly max: number;
	readonly nrg: number;
	readonly cap: number;
	readonly bank: number;
	readonly drain: number;
	readonly rootTurns: number;
	readonly darkTurns: number;
	readonly litTurns: number;
	readonly float: boolean;
	readonly trail: string | null;
	/** Footwork bits this seat owns. */
	readonly mv: number;
	readonly used: Record<ActionKey, number>;
	/** `uid` of the card in hand, or null. */
	readonly held: number | null;
	/** The hand in full, with the marks stripped: whose cards are face up is a rival's secret. */
	readonly hand: readonly Card[];
}

/** Everything one seat may be told about the match it is playing. */
export interface SeatState {
	readonly seat: number;
	readonly dim: number;
	readonly round: number;
	readonly turn: number;
	readonly phase: string;
	/** True while this seat cannot see anybody, which is what empties every other `at`. */
	readonly blind: boolean;
	/** False once the match is played with hands open, which is what un-hides the weapon names. */
	readonly priv: boolean;
	readonly smash: boolean;
	readonly paint: boolean;
	readonly chaos: boolean;
	readonly chaosRound: number;
	readonly mvUses: number;
	/** Board index the chaos round has marked to fall away, which everyone is warned about. */
	readonly warn: number | null;
	/** True while the seat to move still owes a card to chaos mode. */
	readonly toss: boolean;
	readonly over: boolean;
	readonly tiles: readonly SeatTile[];
	/** One per seat, in seat order, including this one. */
	readonly fighters: readonly SeatFighter[];
	readonly you: SeatSelf;
	readonly chat: readonly ChatMsg[];
}

/** A square nobody has laid anything on, which is also what concealed ground reads as. */
const BARE: SeatTile = {t: null, life: 0, wid: 0};

/** A card as its owner is handed it back: the same card, minus who has peeked at it. */
function ownCard(c: Card): Card {
	if (c.k === "el") return {uid: c.uid, k: "el", id: c.id};
	return {
		uid: c.uid,
		k: "w",
		ids: [...c.ids],
		els: [...c.els],
		...(c.leaveSelf === undefined ? {} : {leaveSelf: c.leaveSelf}),
		...(c.leaveFoe === undefined ? {} : {leaveFoe: c.leaveFoe}),
	};
}

function selfOf(p: Player): SeatSelf {
	return {
		seat: p.i,
		x: p.x,
		y: p.y,
		hp: p.hp,
		max: p.max,
		nrg: p.nrg,
		cap: p.cap,
		bank: p.bank,
		drain: p.drain,
		rootTurns: p.rootTurns,
		darkTurns: p.darkTurns,
		litTurns: p.litTurns,
		float: p.float,
		trail: p.trail,
		mv: p.mv,
		used: {...p.used},
		held: p.held,
		hand: p.hand.map(ownCard),
	};
}

/** The one rule the board and the roster both read by: can this seat see that fighter at all. */
function visible(o: Player, me: Player, dark: boolean): boolean {
	return o === me || !!o.lit || (!dark && !hidden(o));
}

function fighterOf(o: Player, me: Player, dark: boolean): SeatFighter {
	const mine = o === me,
		open = !S.priv;
	const c = o.hand.find((q) => q.uid === o.held);
	return {
		seat: o.i,
		name: o.name,
		colour: o.c,
		team: o.team,
		alive: o.alive,
		hp: o.hp,
		max: o.max,
		at: o.alive && visible(o, me, dark) ? [o.x, o.y] : null,
		lit: !!o.lit && !mine, // the lit fighter is never shown their own glow
		cards: o.hand.length,
		seen: mine ? [] : o.hand.filter(seenBy).map(cardLabel),
		weapon: (mine || open) && c?.k === "w" ? wepName(c) : null,
		nrg: mine ? o.nrg : null,
		cap: o.cap,
	};
}

function tileFor(me: Player, i: number): SeatTile {
	const c = S.board[i]!;
	if (!c.t || !seesTile(me, i % S.dim, (i / S.dim) | 0)) return BARE;
	return {t: c.t, life: c.life, wid: c.wid};
}

/**
 * Everything seat `seat` may be told, right now. Throws rather than guessing for a seat that is not
 * in the match: a silent empty view would be a match one player could not see at all.
 */
export function seatState(seat: number): SeatState {
	const me = S.players[seat];
	if (!me) throw new Error(`no seat ${seat} in this match`);
	const dark = blind(me);
	return {
		seat,
		dim: S.dim,
		round: S.round,
		turn: S.turn,
		phase: S.phase,
		blind: dark,
		priv: S.priv,
		smash: S.smash,
		paint: S.paint,
		chaos: S.chaos,
		chaosRound: S.chaosRound,
		mvUses: S.mvUses,
		warn: S.warn,
		toss: S.toss,
		over: S.screen !== "game",
		tiles: S.board.map((_, i) => tileFor(me, i)),
		fighters: S.players.map((o) => fighterOf(o, me, dark)),
		you: selfOf(me),
		chat: S.chat.map((m) => ({...m})),
	};
}
