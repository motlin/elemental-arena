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
 * It also answers what this seat may *do*, and that half wants saying carefully. The match screen
 * decides what is clickable by asking the rules, and every one of those questions reads the whole
 * board -- so a censored view cannot answer them, and a client left to guess would give the arena
 * away by greying out the one square somebody is hiding on. So legality is worked out here, from
 * the whole match, and then told as this seat is entitled to hear it: the rules are asked their
 * questions against the arena this seat was shown, which means a move that is illegal only because
 * of something this seat cannot see comes back legal. The seat may click it, and src/game/intent.ts
 * refuses it in words that do not say why. That is the fiction hot-seat already tells, where you
 * walk into a concealed fighter and find out by bouncing off them.
 *
 * What is deliberately absent, and why:
 *   - Every other seat's hand. Only the count, plus whatever a mark has turned face up.
 *   - The match log. `logit` narrates every move by name and square, concealed ones included, so
 *     the log is a leak with a plot. Table talk goes over, the log does not.
 *   - The replay frames, which are the log with the whole board attached.
 *   - Anything from the save: coins, unlocks, the fusion codex. Those are the player's own device's
 *     business and the server never holds an opinion about them.
 */

import {cardLabel, lethalRaw, mixPartners, sealed} from "./cards.js";
import {attackTiles, liveTargets, smashMult} from "./combat.js";
import {COST, T} from "./data/index.js";
import {standing} from "./intent.js";
import {wepDmg, wepName} from "./lookups.js";
import {
	canEnter,
	dashTargets,
	jumpTargets,
	leapTargets,
	lightTargets,
	markTargets,
	moveBudget,
	reachable,
	seenBy,
	smashable,
	spinTiles,
	spreadTargets,
	swapTargets,
	theftTargets,
	warpTargets,
	wipeTiles,
} from "./movement.js";
import {S, blind, cheb, held, hidden, idx, isLit, occupant, seesTile} from "./state.js";
import type {ActionKey, Offset} from "./data/index.js";
import type {Card, Cell, ChatMsg, Player} from "./types.js";

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
	/** What that weapon hits for, told to exactly the seats the weapon is named to and no others. */
	readonly weaponDamage: number | null;
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

/** One card in a hand a theft has opened, as the seat reading the bar is entitled to read it. */
export interface SeatStealCard {
	readonly uid: number;
	/** What the card is, or the slot it is sitting in while this seat has not been shown it. */
	readonly label: string;
	readonly facedown: boolean;
}

/** The hand a theft has opened, in the order its owner is holding it. */
export interface SeatSteal {
	readonly seat: number;
	readonly name: string;
	readonly cards: readonly SeatStealCard[];
}

/** How far one fighter could walk, which is the overlay the inspect panel's reach chips draw. */
export interface SeatReach {
	readonly seat: number;
	readonly budget: number;
	/** Every square the walk could stop on, in board order, the one already stood on included. */
	readonly tiles: readonly number[];
}

/** One card in hand, and everything else in the same hand it would merge with. */
export interface SeatMix {
	readonly uid: number;
	readonly with: readonly number[];
}

/**
 * What this seat may do, square by square. Every list of squares is board indexes in board order,
 * and the two lists of cards are uids sorted the same way, so two blocks built from two matches
 * compare byte for byte, which is what the leak test reads.
 */
export interface SeatLegal {
	/** Squares one step away this seat can walk onto and pay the ground's price for. */
	readonly step: readonly number[];
	/** Squares a card may be laid on, whichever card is the one laid. */
	readonly place: readonly number[];
	/** Those of them somebody is standing on, where an element that kills on contact is refused. */
	readonly taken: readonly number[];
	/** Squares the weapon in hand reaches, or none while no weapon is held. */
	readonly swing: readonly number[];
	/** Those of them with somebody on them the swing would land on. */
	readonly foes: readonly number[];
	readonly jump: readonly number[];
	readonly dash: readonly number[];
	readonly leap: readonly number[];
	readonly warp: readonly number[];
	readonly spread: readonly number[];
	readonly swap: readonly number[];
	readonly mark: readonly number[];
	readonly light: readonly number[];
	readonly theft: readonly number[];
	/** The ground each sweep would strip, which is what says whether the sweep is worth offering. */
	readonly spin: readonly number[];
	readonly wipe: readonly number[];
	readonly ultra: readonly number[];
	/** True while the hand holds a weapon and something else to crush into it. */
	readonly smash: boolean;
	/** True while the ground underfoot is something this seat could start trailing behind it. */
	readonly trail: boolean;
	/**
	 * For each card in hand, in hand order, what else in the same hand it merges with. Both this and
	 * `lethal` read one hand and nothing else, and the hand is the one belonging to the seat being
	 * answered, so neither has anything in it to keep. They are here because the alternative is the
	 * screen asking the rules, and the rules are exactly what the screen is being cut off from.
	 */
	readonly mix: readonly SeatMix[];
	/** Cards that kill on contact, which the arena refuses to lay on anybody who is standing there. */
	readonly lethal: readonly number[];
	/** Whether the purse covers each action, before anything else is asked about it. */
	readonly afford: Readonly<Record<ActionKey, boolean>>;
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
	/** What this seat may click, worked out from the whole match and censored like everything else. */
	readonly legal: SeatLegal;
	/**
	 * The hand a theft has opened, or null while no theft is under way. Picking from a hand you can
	 * read is not a theft, so the bar has to be drawable without being readable: every card is a
	 * numbered slot, and only one a mark has already turned this seat's way says what it is -- the
	 * owner's own marks stay down here as they do everywhere else. The `uid` goes over on the face
	 * down cards too, because a pick has to name what it took, and a bare uid says nothing the card
	 * count did not already say.
	 *
	 * Only the seat doing the robbing is handed it. `S.steal` is one match-wide modal rather than
	 * one per seat, so sending it to everybody would hand a seat that is neither the thief nor the
	 * victim a name it has no other way to learn -- and no other seat has a bar to draw with it.
	 */
	readonly steal: SeatSteal | null;
	/**
	 * The squares glowing under a glare, in board order. A glare is what beats cover in the first
	 * place, so by the time a square is lit there is nothing left about it to keep: it goes to
	 * everybody, this seat's own square included. The fighter wearing the glare is still never shown
	 * it, which is `SeatFighter.lit` -- that is the glyph, and this is the square underneath it.
	 */
	readonly litsq: readonly number[];
	/**
	 * How far each fighter this seat can see could walk. Asked against the arena this seat was shown,
	 * so ground and fighters it cannot see do not shape the answer.
	 *
	 * `budget` is the energy behind the flood fill, and for the seat to move that is a figure the
	 * roster withholds from everybody else. It goes over anyway, because the tiles give it away: the
	 * far edge of a flood fill is the budget, so an honest map beside a censored number would keep
	 * nothing. The reach chips have always told the table how far anybody could go.
	 */
	readonly reachable: readonly SeatReach[];
	/** What smash mode is multiplying damage by this round, which the topbar prints for everybody. */
	readonly smashMult: number;
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
		weaponDamage: (mine || open) && c?.k === "w" ? wepDmg(c) : null,
		nrg: mine ? o.nrg : null,
		cap: o.cap,
	};
}

function tileFor(me: Player, i: number): SeatTile {
	const c = S.board[i]!;
	if (!c.t || !seesTile(me, i % S.dim, (i / S.dim) | 0)) return BARE;
	return {t: c.t, life: c.life, wid: c.wid};
}

const ACTIONS = Object.keys(COST) as ActionKey[];

/** Which of the priced actions a purse of `nrg` covers, which is the one part of legality a seat owns. */
function affords(nrg: number): Record<ActionKey, boolean> {
	const out = {} as Record<ActionKey, boolean>;
	for (const key of ACTIONS) out[key] = nrg >= COST[key];
	return out;
}

/** What a seat with no move to make is handed: every list empty, and a purse that buys nothing. */
const NO_MOVES: SeatLegal = {
	step: [],
	place: [],
	taken: [],
	swing: [],
	foes: [],
	jump: [],
	dash: [],
	leap: [],
	warp: [],
	spread: [],
	swap: [],
	mark: [],
	light: [],
	theft: [],
	spin: [],
	wipe: [],
	ultra: [],
	smash: false,
	trail: false,
	mix: [],
	lethal: [],
	afford: affords(-1),
};

/** A list of squares as the wire carries one: board indexes, in board order, each of them once. */
function squares(list: readonly Offset[]): number[] {
	return [...new Set(list.map(([x, y]) => idx(x, y)))].sort((a, b) => a - b);
}

/** Ground with nothing on it, which is what ground this seat cannot see has to read as. */
function strip(c: Cell): void {
	c.t = null;
	c.el = null;
	c.life = 0;
	c.wid = 0;
	c.by = null;
}

/**
 * Asks the rules a question against the match as this seat sees it: ground it cannot see reads as
 * bare, and a fighter it cannot see is off the board entirely.
 *
 * The rules are left exactly as they are and the arena is dressed down in front of them, which is
 * what makes the answer safe to send. Legality then depends on nothing but the view this seat was
 * already handed, so there is no square whose answer changes because somebody is hiding on it --
 * and a move that is illegal only because of that somebody comes back legal, which is the fiction.
 */
function asSeen<T>(me: Player, dark: boolean, ask: () => T): T {
	const ghosts = S.players.filter((o) => o.alive && !visible(o, me, dark));
	const covered = S.board.filter((_, i) => !seesTile(me, i % S.dim, (i / S.dim) | 0));
	const was = covered.map((c) => ({...c}));
	ghosts.forEach((o) => (o.alive = false));
	covered.forEach(strip);
	try {
		return ask();
	} finally {
		covered.forEach((c, k) => Object.assign(c, was[k]!));
		ghosts.forEach((o) => (o.alive = true));
	}
}

/**
 * How far every fighter this seat can see could walk, in seat order. Who is in the list is settled
 * before the arena is dressed down, because a fighter this seat cannot see is not in it at all --
 * and then the fills themselves run inside the same view, so cover this seat cannot read does not
 * bend a route around it and say so.
 */
function reachFor(me: Player, dark: boolean): SeatReach[] {
	const seen = S.players.filter((o) => o.alive && visible(o, me, dark));
	return asSeen(me, dark, () =>
		seen.map((o) => {
			const budget = moveBudget(o);
			return {seat: o.i, budget, tiles: [...reachable(o, budget).keys()].sort((a, b) => a - b)};
		}),
	);
}

/** Every square with a glare on it, which nobody has to be protected from: a glare is the opposite. */
function litSquares(): number[] {
	return S.board.flatMap((_, i) => (isLit(i % S.dim, (i / S.dim) | 0) ? [i] : []));
}

/** The hand a theft has opened, as this seat may read it, or null while no theft is under way. */
function stealFor(me: Player): SeatSteal | null {
	if (standing(me.i) !== null) return null;
	const v = S.steal === null ? null : S.players[S.steal];
	if (!v) return null;
	// a mark turns a card face up to every rival and never to its owner, and being robbed changes
	// neither half of that: the seat losing a card is not told which of them it had already lost
	const shown = (c: Card): boolean => v !== me && seenBy(c);
	return {
		seat: v.i,
		name: v.name,
		cards: v.hand.map((c, i) => ({
			uid: c.uid,
			label: shown(c) ? cardLabel(c) : `Card ${i + 1}`,
			facedown: !shown(c),
		})),
	};
}

/*
 * Walking and laying a card are the two moves with no query of their own to ask: `tryStep` and
 * `doPlace` decide as they go, and there is nothing to call that answers without also moving. So
 * these two restate a rule the rules own, which is a debt rather than a design. src/game/render.ts
 * carries the same restatement today; it goes when the drawing is rewritten to read this block.
 */

/** The squares next door this seat could walk onto, at a price it can pay. */
function stepSquares(p: Player): number[] {
	if (p.rootTurns > 0) return [];
	const out: number[] = [];
	for (let y = p.y - 1; y <= p.y + 1; y++)
		for (let x = p.x - 1; x <= p.x + 1; x++) {
			if ((x === p.x && y === p.y) || !canEnter(x, y, p)) continue;
			const c = S.board[idx(x, y)]!;
			const cost = p.float ? 1 : c.t ? T[c.t]!.enter : 1;
			if (cost <= p.nrg && cost < 50) out.push(idx(x, y));
		}
	return out;
}

/** Where a card may be laid, and where one that kills on contact would be turned down. */
function placeSquares(p: Player): {place: number[]; taken: number[]} {
	const place: number[] = [],
		taken: number[] = [];
	for (let y = 0; y < S.dim; y++)
		for (let x = 0; x < S.dim; x++) {
			const d = cheb(p.x, p.y, x, y);
			if (d === 0 || d > 4 || sealed(x, y)) continue;
			place.push(idx(x, y));
			if (occupant(x, y)) taken.push(idx(x, y));
		}
	return {place, taken};
}

/** Which cards in a hand merge with which, asked card by card so no screen state picks the source. */
function mixFor(p: Player): SeatMix[] {
	return p.hand.map((c) => ({
		uid: c.uid,
		with: mixPartners(p, c)
			.map((q) => q.uid)
			.sort((a, b) => a - b),
	}));
}

/** The cards in hand that kill on contact, which is the half of `badPlace` `taken` does not answer. */
function lethalFor(p: Player): number[] {
	return p.hand
		.filter((c) => c.k === "el" && lethalRaw(c.id))
		.map((c) => c.uid)
		.sort((a, b) => a - b);
}

/** Every question the match screen asks about what is clickable, asked all at once. */
function movesFor(p: Player): SeatLegal {
	const weapon = held(p);
	const under = S.board[idx(p.x, p.y)]!.t;
	const {place, taken} = placeSquares(p);
	return {
		step: stepSquares(p),
		place,
		taken,
		swing: weapon ? squares(attackTiles(p, weapon)) : [],
		foes: weapon ? squares(liveTargets(p, weapon)) : [],
		jump: squares(jumpTargets(p)),
		dash: squares(dashTargets(p)),
		leap: squares(leapTargets(p)),
		warp: squares(warpTargets(p)),
		spread: squares(spreadTargets()),
		swap: squares(swapTargets()),
		mark: squares(markTargets()),
		light: squares(lightTargets()),
		theft: squares(theftTargets()),
		spin: squares(spinTiles(p)),
		wipe: squares(wipeTiles(p)),
		ultra: S.board.flatMap((c, i) => (c.t ? [i] : [])),
		smash: smashable(p),
		trail: !p.trail && !!under && !T[under]!.dead,
		mix: mixFor(p),
		lethal: lethalFor(p),
		afford: affords(p.nrg),
	};
}

/**
 * What this seat may do right now. A seat that is not the one to move is handed nothing at all:
 * half the questions below ask `cur()` who is playing rather than taking a fighter, so there is no
 * honest answer to "what may you do" for anybody whose turn it is not, and no use for one either.
 */
function legalFor(me: Player, dark: boolean): SeatLegal {
	if (standing(me.i) !== null) return NO_MOVES;
	return asSeen(me, dark, () => movesFor(me));
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
		legal: legalFor(me, dark),
		steal: stealFor(me),
		litsq: litSquares(),
		reachable: reachFor(me, dark),
		smashMult: smashMult(),
		chat: S.chat.map((m) => ({...m})),
	};
}
