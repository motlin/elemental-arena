/**
 * An online match, drawn exactly the way hot-seat is drawn.
 *
 * src/game/render.ts builds a `MatchView` out of a `SeatState` and knows nothing else, which is the
 * shape a client has anyway: a censored arena is all a server will ever send it. So this module is
 * the twin of src/game/hotseat.ts. Where that one builds the seat view locally for whoever is to
 * move and applies a move on the spot, this one is handed the seat view by src/net/client.ts and
 * sends a move off to be worked somewhere else.
 *
 * The screen's own state -- the move being aimed, the card picked up, the square Inspect is reading
 * -- lives here rather than in `S`. Hot-seat can keep it in `S` because the rules write to the same
 * fields as they go; online the rules are running on a server whose `S` this device will never see,
 * so this module keeps its own and mirrors the one thing the rules do to it: a move that is taken
 * spends whatever was aiming it. `settle` below is that mirror, and it is the only place where this
 * side infers anything at all about a match it does not hold.
 *
 * A refusal does nothing on purpose. The rules refuse a move by changing nothing, so there is
 * nothing here to put back, and the aim stays up exactly as it does in hot-seat when you click a
 * square a move will not reach.
 *
 * Three things are hot-seat's alone for now, each because it reaches for something a client does not
 * hold: the keyboard in src/game/input.ts, which bails on any screen but `game` and so is inert
 * here; the animations a move leaves behind, which are worked out where the move is worked; and
 * undo, which rewinds a match this device does not own. The game-over screen and the replay are
 * absent for a reason of a different kind -- both are written from the match log, which narrates
 * concealed moves by name, so neither can be sent while the match is still being played.
 */

import {matchStore, seatStore} from "./bridge.js";
import {codexLine, openTable} from "./menu.js";
import {matchView} from "./render.js";
import {flipTheme, themeLabel} from "./settings.js";
import {show} from "./state.js";
import {leave, sendIntent, sit} from "../net/client.js";
import type {Invite} from "../net/client.js";
import type {Intent} from "./intent.js";
import type {Local, MatchActions} from "./render.js";

/** The half of `Local` this device owns, which is every part of it no rule has an opinion about. */
type Aim = Pick<Local, "mode" | "sel" | "mixFrom" | "tossPick" | "imode" | "look" | "reach" | "replyTo">;

const FRESH: Aim = {
	mode: null,
	sel: null,
	mixFrom: null,
	tossPick: null,
	imode: false,
	look: null,
	reach: [],
	replyTo: null,
};

let aim: Aim = FRESH;
/** True while a second tap on Forfeit would drop this fighter, which is this device's own count. */
let armed = false;
/** Stops listening to the seat views when this device gets up from the match. */
let stop: (() => void) | null = null;

function local(): Local {
	return {
		...aim,
		forfeitArmed: armed,
		// undo rewinds `S`, and `S` here belongs to the room: a move the room took is taken
		canUndo: false,
		themeLabel: themeLabel(),
		// the codex is the save's, which is this device's own business and never went to the server
		codex: codexLine(),
		// animations are worked out where the move is worked, and that is not here
		fx: [],
		// nobody is handing a device over
		handoff: false,
	};
}

/** The match as the room last said it stands, or nothing at all once this device has got up. */
function draw(): void {
	const v = seatStore.get();
	matchStore.set(v === null ? null : matchView(v, local(), ACTIONS));
}

/**
 * What a move of ours that was taken does to what was aiming it. Every rule that takes a move puts
 * the board back out of aim -- `doJump` clears the mode it was aimed in, `doPlace` clears the card
 * it laid -- so a move that went through spends the aim, and one that did not leaves it up.
 *
 * Clicking a card is the exception, because it is a move whose whole effect is a selection: the
 * arena picks a weapon up for itself and says so in `you.held`, and an element card is a toggle
 * this side has to follow. It is safe to read the hand for it, because a card click never takes a
 * card out of one.
 */
function settle(intent: Intent): void {
	armed = false;
	if (intent.k === "card") {
		const card = seatStore.get()?.you.hand.find((c) => c.uid === intent.uid);
		const picked = card?.k === "el" && aim.sel !== intent.uid;
		aim = {...aim, mode: null, mixFrom: null, sel: picked ? intent.uid : null};
		return;
	}
	aim = {...aim, mode: null, sel: null, mixFrom: null, tossPick: null};
}

const ACTIONS: MatchActions = {
	submit: sendIntent,
	patch: (next) => {
		aim = {
			mode: "mode" in next ? (next.mode ?? null) : aim.mode,
			sel: "sel" in next ? (next.sel ?? null) : aim.sel,
			mixFrom: "mixFrom" in next ? (next.mixFrom ?? null) : aim.mixFrom,
			tossPick: "tossPick" in next ? (next.tossPick ?? null) : aim.tossPick,
			imode: "imode" in next ? (next.imode ?? false) : aim.imode,
			look: "look" in next ? (next.look ?? null) : aim.look,
			reach: "reach" in next ? [...(next.reach ?? [])] : aim.reach,
			replyTo: "replyTo" in next ? (next.replyTo ?? null) : aim.replyTo,
		};
		draw();
	},
	undo: () => {
		/* there is no undo online, and `canUndo` above is what greys the button out */
	},
	leave: () => {
		goOffline();
	},
	// the first tap only arms the button; the second is the move, and the room checks nothing else
	forfeit: () => {
		if (armed) sendIntent({k: "forfeit"});
		else {
			armed = true;
			draw();
		}
	},
	// the theme is the device's, so it turns over here rather than being asked for
	toggleTheme: () => {
		flipTheme();
		draw();
	},
	openTable,
	cancelSteal: () => {
		/* the hand a theft opened belongs to the arena, and only taking a card out of it shuts it */
	},
};

/** Sits this device down in a match somebody opened, and gives the arena the screen. */
export function playOnline(invite: Invite): void {
	stop?.();
	aim = FRESH;
	armed = false;
	stop = seatStore.subscribe(draw);
	sit(invite, settle);
	// hot-seat's own match, if this device was in one, goes down with the setup screen
	show("online");
	draw();
}

/** Gets up from an online match and goes back to the setup screen. */
export function goOffline(): void {
	stop?.();
	stop = null;
	leave();
	aim = FRESH;
	armed = false;
	matchStore.set(null);
	show("menu");
}
