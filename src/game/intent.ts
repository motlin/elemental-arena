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

import {clickCard, doPlace, startMix} from "./cards.js";
import {doAttack} from "./combat.js";
import {BASE, WBASE} from "./data/index.js";
import {checkRefill, dropOut, endTurn, startMatch} from "./match.js";
import {tryStep} from "./movement.js";
import {exportMatch} from "./snapshot.js";
import type {MatchSnapshot} from "./snapshot.js";
import {S, teamsAlive} from "./state.js";

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

/** A move, as a client asks for it. Every one is refused unless it is that seat's turn. */
export type Intent =
	| {readonly k: "step"; readonly x: number; readonly y: number}
	/** Picks a card up or puts it down, which is what selects an element or holds a weapon. */
	| {readonly k: "card"; readonly uid: number}
	| {readonly k: "place"; readonly uid: number; readonly x: number; readonly y: number}
	| {readonly k: "swing"; readonly x: number; readonly y: number}
	| {readonly k: "merge"; readonly uid: number; readonly into: number}
	| {readonly k: "end"}
	| {readonly k: "forfeit"};

/** Whether the move was allowed to reach the rules at all, and if not, what to tell the client. */
export type Verdict = {readonly ok: true} | {readonly ok: false; readonly why: string};

const TAKEN: Verdict = {ok: true};

function refuse(why: string): Verdict {
	return {ok: false, why};
}

/** Who is allowed to ask for a move right now, and why this seat is or is not them. */
function standing(seat: number): string | null {
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

function dispatch(intent: Intent): void {
	switch (intent.k) {
		case "step":
			tryStep(intent.x, intent.y);
			return;
		case "card":
			clickCard(intent.uid);
			return;
		case "place":
			place(intent.uid, intent.x, intent.y);
			return;
		case "swing":
			doAttack(intent.x, intent.y);
			return;
		case "merge":
			merge(intent.uid, intent.into);
			return;
		case "end":
			endTurn();
			return;
		case "forfeit":
			dropOut();
			return;
	}
}

/**
 * Works one seat's move against the match currently loaded into `S`. A verdict of `ok` says the
 * move was that seat's to ask for, not that the rules took it: a move the rules will not take
 * leaves the match exactly as it was, and saying so is the client's job.
 */
export function applyIntent(seat: number, intent: Intent): Verdict {
	const wrong = standing(seat);
	if (wrong !== null) return refuse(wrong);
	dispatch(intent);
	// hot-seat refills an empty hand on the way into a redraw, and nothing redraws on a server
	checkRefill();
	return TAKEN;
}
