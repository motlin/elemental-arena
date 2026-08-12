/**
 * The server's half of a match: opening one, and taking a move in it.
 *
 * Hot-seat can take a great deal for granted: whoever is clicking is whoever's turn it is, because
 * there is only one of them, and the screen only ever offers moves that are legal. Online, the
 * asking comes off a socket, so every one of those assumptions has to be checked before the rules
 * are allowed anywhere near it.
 *
 * The rules themselves are left exactly as they are. Each one already refuses an impossible move by
 * doing nothing -- `tryStep` returns on ground it cannot enter, `doPlace` returns on a square out of
 * reach -- so this module never re-implements a rule. It decides who is allowed to ask, translates
 * the ask into the call the rules already have, and puts back anything it borrowed if the rules
 * turned the move down.
 *
 * Nothing here imports a screen. `redraw()` is a no-op on the server, because src/game/view.ts is
 * never filled in there, which is exactly the seam that makes running the game headless free.
 */

import {clickCard, doPlace, doToss, moveCard, startMix} from "./cards.js";
import {say} from "./chat.js";
import {doAttack, setLeaving} from "./combat.js";
import {BASE, COST, MV, WBASE} from "./data/index.js";
import type {ActionKey} from "./data/index.js";
import {checkRefill, dropOut, endTurn, startMatch} from "./match.js";
import {
	doDash,
	doFloat,
	doJump,
	doLeap,
	doLight,
	doMark,
	doShift,
	doSmash,
	doSpin,
	doSpread,
	doSwap,
	doTheft,
	doTrail,
	doUltra,
	doWarp,
	doWipe,
	takeCard,
	tryStep,
} from "./movement.js";
import {exportMatch} from "./snapshot.js";
import type {MatchSnapshot} from "./snapshot.js";
import {S, teamsAlive} from "./state.js";
import type {Player} from "./types.js";

/** The few numbers a match is opened on. Everything else is the arena's own defaults. */
export interface MatchSetup {
	readonly seats: number;
	readonly dim: number;
	readonly hp: number;
	/** False plays the match with every hand face up, which is the one way to watch a whole game. */
	readonly priv: boolean;
}

/** What each of those numbers may be, which the wire checks a client's setup against. */
export const SETUP_LIMITS = {seats: [2, 8], dim: [5, 25], hp: [10, 400]} as const;

export const DEFAULT_SETUP: MatchSetup = {seats: 2, dim: 9, hp: 60, priv: true};

/**
 * Deals a fresh match and lifts it straight back out, which is the only way a match is made on a
 * server. The arsenal is the base one every save starts with: a match played across two devices has
 * two sets of unlocks behind it and no rule yet for whose to deal from, so it deals from neither.
 * See the design note for what negotiating that would look like.
 */
export function openMatch(setup: MatchSetup): MatchSnapshot {
	S.np = setup.seats;
	S.dim = setup.dim;
	S.hp = setup.hp;
	S.priv = setup.priv;
	S.names = ["", "", "", "", "", "", "", ""];
	S.cols = [0, 1, 2, 3, 4, 5, 6, 7];
	S.mv = [0, 0, 0, 0, 0, 0, 0, 0];
	S.munlocked = [];
	S.unlocked = [...BASE];
	S.wunlocked = [...WBASE];
	S.elOff = [];
	S.wOff = [];
	S.pOff = {};
	S.preset = null;
	S.presetDim = 0;
	S.smash = false;
	S.paint = false;
	S.chaos = false;
	startMatch();
	return exportMatch();
}

/** The footwork aimed at a square, or at whoever is standing on one. */
type AimedMove = "jump" | "dash" | "leap" | "warp" | "spread" | "swap" | "mark" | "light" | "theft";

/** The footwork that needs nothing from the client but the asking. */
type PlainMove = "float" | "spin" | "wipe" | "ultra" | "trail" | "smash";

/**
 * A move, as a client asks for it. Every one is refused unless it is that seat's turn, table talk
 * included: the rules write a message down as whoever is playing, so a message from anybody else
 * would go up under the wrong name.
 */
export type Intent =
	| {readonly k: "step"; readonly x: number; readonly y: number}
	/** Picks a card up or puts it down, which is what selects an element or holds a weapon. */
	| {readonly k: "card"; readonly uid: number}
	/**
	 * Where a dragged card comes to rest in the hand, `to` counting the cards it left behind. Hand
	 * order belongs to the match rather than to the screen it is dragged on: it travels in the
	 * snapshot, and it is the numbering the keyboard picks cards by.
	 */
	| {readonly k: "reorder"; readonly uid: number; readonly to: number}
	| {readonly k: "place"; readonly uid: number; readonly x: number; readonly y: number}
	| {readonly k: "swing"; readonly x: number; readonly y: number}
	/** Which ground the held weapon leaves, `row` saying whether it is under you or under them. */
	| {readonly k: "leaving"; readonly row: "self" | "foe"; readonly el: string}
	| {readonly k: "merge"; readonly uid: number; readonly into: number}
	| {readonly k: AimedMove; readonly x: number; readonly y: number}
	| {readonly k: PlainMove}
	/** One square along one axis, which every fighter on the board then slides. */
	| {readonly k: "shift"; readonly dx: number; readonly dy: number}
	/** The card out of the hand a theft opened. Which one is a guess: most of them are face down. */
	| {readonly k: "take"; readonly uid: number}
	/** The card chaos mode makes a fighter throw away before they do anything else. */
	| {readonly k: "toss"; readonly uid: number}
	/** Something said at the table, answering the message `to` names, or nobody when it is 0. */
	| {readonly k: "chat"; readonly text: string; readonly to: number}
	| {readonly k: "end"}
	| {readonly k: "forfeit"};

/** Whether the move was taken, and if it was not, what the client may be told about why. */
export type Verdict = {readonly ok: true} | {readonly ok: false; readonly why: string};

const TAKEN: Verdict = {ok: true};

function refuse(why: string): Verdict {
	return {ok: false, why};
}

/**
 * Who is allowed to ask for a move right now, and why this seat is or is not them. src/game/seat.ts
 * reads it too: a seat that may not move is told it may do nothing, rather than being handed a list
 * of squares it would only be refused on.
 */
export function standing(seat: number): string | null {
	const p = S.players[seat];
	if (!p) return `no seat ${seat} in this match`;
	if (!p.alive) return "you are out of the match";
	if (S.screen !== "game" || teamsAlive().length <= 1) return "the match is over";
	if (S.turn !== seat) return "not your turn";
	if (S.phase !== "act") return "the arena is not taking moves";
	return null;
}

/**
 * Lays a card, having first told the game the card is the one selected. If the rules turn the move
 * down they leave the board in `place` mode, and the selection this borrowed goes back as it was.
 */
function place(uid: number, x: number, y: number): void {
	const sel = S.sel,
		mode = S.mode;
	S.sel = uid;
	S.mode = "place";
	doPlace(x, y);
	if (S.mode === "place") {
		S.sel = sel;
		S.mode = mode;
	}
}

/** Merges one card into another, putting the mix back down if the pair would not take. */
function merge(uid: number, into: number): void {
	const mode = S.mode,
		from = S.mixFrom;
	startMix(uid);
	clickCard(into);
	if (S.mode === "mix") {
		S.mode = mode;
		S.mixFrom = from;
	}
}

/** Takes a card out of the hand a theft opened, if a theft opened one. */
function take(uid: number): void {
	const robbed = S.steal === null ? null : S.players[S.steal];
	if (robbed) takeCard(robbed, uid);
}

/**
 * Says something, answering whichever message the client named. The reply bar goes back as it was
 * if there turned out to be nothing to say, so a message of pure whitespace changes nothing at all.
 */
function talk(text: string, to: number): void {
	const bar = S.replyTo,
		said = S.chat.length;
	S.replyTo = to || null;
	say(text);
	if (S.chat.length === said) S.replyTo = bar;
}

function dispatch(intent: Intent): void {
	switch (intent.k) {
		case "step":
			tryStep(intent.x, intent.y);
			return;
		case "card":
			clickCard(intent.uid);
			return;
		case "reorder":
			moveCard(intent.uid, intent.to);
			return;
		case "place":
			place(intent.uid, intent.x, intent.y);
			return;
		case "swing":
			doAttack(intent.x, intent.y);
			return;
		case "leaving":
			setLeaving(intent.row, intent.el);
			return;
		case "merge":
			merge(intent.uid, intent.into);
			return;
		case "jump":
			doJump(intent.x, intent.y);
			return;
		case "dash":
			doDash(intent.x, intent.y);
			return;
		case "leap":
			doLeap(intent.x, intent.y);
			return;
		case "warp":
			doWarp(intent.x, intent.y);
			return;
		case "spread":
			doSpread(intent.x, intent.y);
			return;
		case "swap":
			doSwap(intent.x, intent.y);
			return;
		case "mark":
			doMark(intent.x, intent.y);
			return;
		case "light":
			doLight(intent.x, intent.y);
			return;
		case "theft":
			doTheft(intent.x, intent.y);
			return;
		case "float":
			doFloat();
			return;
		case "spin":
			doSpin();
			return;
		case "wipe":
			doWipe();
			return;
		case "ultra":
			doUltra();
			return;
		case "trail":
			doTrail();
			return;
		case "smash":
			doSmash();
			return;
		case "shift":
			doShift(intent.dx, intent.dy);
			return;
		case "take":
			take(intent.uid);
			return;
		case "toss":
			doToss(intent.uid);
			return;
		case "chat":
			talk(intent.text, intent.to);
			return;
		case "end":
			endTurn();
			return;
		case "forfeit":
			dropOut();
			return;
	}
	// every action the match screen offers is a move, so a move left off the switch is a compile error
	intent satisfies never;
}

/** What a refusal says when saying anything more would be saying something the seat cannot see. */
const NO_MOVE = "the arena will not take that move";

/** The moves the price list has a number for, which is every move that spends any energy. */
function priced(kind: Intent["k"]): kind is ActionKey & Intent["k"] {
	return Object.hasOwn(COST, kind);
}

/**
 * Why the rules would not take the move, in words that give away nothing the seat could not have
 * worked out for itself. A seat knows its own loadout, its own tally and its own purse, so those
 * three are safe to name. Everything else gets the same flat answer, because a refusal that named
 * its cause would be a way of asking the server what is hidden and being told: warping onto a
 * square a rival is concealed on is a move a client cannot know is illegal, and "somebody is
 * standing there" is precisely the secret the concealment is there to keep.
 */
function stumped(p: Player, intent: Intent): string {
	const kind = intent.k;
	if (!priced(kind)) return NO_MOVE;
	const move = MV[kind];
	if (move && !(p.mv & move.bit)) return "you were not given that move";
	if (move && p.used[kind] >= S.mvUses) return "you have used that move up";
	if (p.nrg < COST[kind]) return "you cannot afford that";
	return NO_MOVE;
}

/**
 * Works one seat's move against the match currently loaded into `S`, and says whether the move was
 * taken.
 *
 * Every rule refuses an impossible move by doing nothing, and none of them says so, so whether the
 * move was taken is read off the match rather than out of the rules: the match before and the match
 * after, and a move that changed neither is a move that did not happen. That costs two snapshots a
 * move, which for a game that takes one move at a time is nothing, and it buys the one thing that
 * matters here -- the rules stay the only place a rule is written down.
 */
export function applyIntent(seat: number, intent: Intent): Verdict {
	const wrong = standing(seat);
	if (wrong !== null) return refuse(wrong);
	const p = S.players[seat]!;
	const before = JSON.stringify(exportMatch());
	dispatch(intent);
	const took = JSON.stringify(exportMatch()) !== before;
	// hot-seat refills an empty hand on the way into a redraw, and nothing redraws on a server
	checkRefill();
	return took ? TAKEN : refuse(stumped(p, intent));
}
