/**
 * Hot-seat: the device that plays every seat, and the one place left that reads the live match.
 *
 * src/game/render.ts draws a `MatchView` out of a `SeatState` and knows nothing else. That is the
 * shape a client online has anyway, because a censored arena is all a server will send it. This
 * module is what makes hot-seat the same shape: it builds the seat view for whoever is to move,
 * hands it over, and publishes what comes back.
 *
 * It is worth being plain about why that is a gain rather than a detour. There is now one account
 * of what a screen may show, and both modes draw through it, so a leak shows up in the mode that is
 * sitting on Craig's desk instead of only in the one that goes over a socket. The handoff curtain
 * stays: two people sharing a device still have to look away while the other one sits down.
 *
 * The screen's own state -- the move being aimed, the square Inspect is reading -- lives in `S`
 * here rather than beside it, because the rules write to the same fields as they go and so does the
 * keyboard in src/game/input.ts. Reading them back out on every redraw is what keeps this playing
 * exactly as it did when the drawing owned them.
 */

import {handoffStore, matchStore} from "./bridge.js";
import {dropCurtain} from "./input.js";
import {applyIntent} from "./intent.js";
import {checkRefill, forfeit as tapForfeit, forfeitArmed, leaveMatch} from "./match.js";
import {codexLine, openTable} from "./menu.js";
import {matchView} from "./render.js";
import {seatState} from "./seat.js";
import {flipTheme, themeLabel} from "./settings.js";
import {S} from "./state.js";
import {auditReveal, canUndo, undo} from "./undo.js";
import type {Local, MatchActions} from "./render.js";

/**
 * What the screen knows that the arena does not, read out of `S`. The animations come out with it:
 * they are handed over once and then forgotten, so each one plays on exactly one screen.
 */
function local(): Local {
	const fx = S.fx.map(([index, animation]) => ({index, animation}));
	S.fx = [];
	return {
		mode: S.mode,
		sel: S.sel,
		mixFrom: S.mixFrom,
		tossPick: S.tossPick,
		imode: S.imode,
		look: S.look,
		reach: S.reach,
		replyTo: S.replyTo,
		forfeitArmed: forfeitArmed(),
		canUndo: canUndo(),
		themeLabel: themeLabel(),
		codex: codexLine(),
		fx,
		handoff: S.handoff,
	};
}

/**
 * Writes the screen's own state back where the rules and the keyboard will find it. Only the fields
 * the caller named are touched: a patch that says nothing about Inspect leaves Inspect alone.
 */
function patch(next: Partial<Local>): void {
	if ("mode" in next) S.mode = next.mode ?? null;
	if ("sel" in next) S.sel = next.sel ?? null;
	if ("mixFrom" in next) S.mixFrom = next.mixFrom ?? null;
	if ("tossPick" in next) S.tossPick = next.tossPick ?? null;
	if ("imode" in next) S.imode = next.imode ?? false;
	if ("look" in next) S.look = next.look ?? null;
	if ("reach" in next) S.reach = [...(next.reach ?? [])];
	if ("replyTo" in next) S.replyTo = next.replyTo ?? null;
	render();
}

/**
 * A move, applied on the spot. Hot-seat is entitled to that -- the whole match is right here -- and
 * it still goes through `applyIntent` rather than into the rules directly, so the one path a move
 * takes is the path a move off a socket will take. A refusal changes nothing, which is what a click
 * on something that was never going to work has always done.
 */
const ACTIONS: MatchActions = {
	submit: (intent) => {
		applyIntent(S.turn, intent);
	},
	patch,
	undo,
	leave: leaveMatch,
	// the first tap only arms the button; the second is the move
	forfeit: () => {
		if (forfeitArmed()) applyIntent(S.turn, {k: "forfeit"});
		else tapForfeit();
	},
	toggleTheme: flipTheme,
	openTable,
	cancelSteal: () => {
		S.steal = null;
		render();
	},
};

/**
 * The match as it stands, or nothing at all while the setup screen has the page. Every callback in
 * the view is built fresh, which costs nothing: a move always changes something, so React is told
 * to repaint whatever it was already showing.
 */
export function render(): void {
	// an online match draws itself, out of the seat views a server sends it: src/game/online.ts
	if (S.screen === "online") return;
	if (!S.players.length || S.screen !== "game") {
		matchStore.set(null);
		handoffStore.set(null);
		return;
	}
	checkRefill();
	auditReveal();
	const p = S.players[S.turn]!;
	handoffStore.set(S.handoff ? {seat: p.i, name: p.name, colour: p.c, dismiss: dropCurtain} : null);
	matchStore.set(matchView(seatState(S.turn), local(), ACTIONS));
}
