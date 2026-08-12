/**
 * The seam the rewrite put in: the drawing is a function of a seat's view of the arena, and every
 * button on it is either a move or this screen's own business.
 *
 * Nothing here starts a match. That is the point of the first half -- if the drawing still read the
 * live game these would all die on an empty board. The second half is the one that earns its keep:
 * a move filed as local UI works perfectly in hot-seat and quietly desyncs online, so every
 * callback is pulled out of the published view and asked what it actually sends.
 */

import {describe, it, expect} from "vitest";
import {COST} from "../../src/game/data/index.js";
import {matchView} from "../../src/game/render.js";
import type {ActionKey} from "../../src/game/data/index.js";
import type {Intent} from "../../src/game/intent.js";
import type {Local, MatchActions} from "../../src/game/render.js";
import type {SeatFighter, SeatLegal, SeatState} from "../../src/game/seat.js";

const KEYS = Object.keys(COST) as ActionKey[];
const every = <T>(value: T): Record<ActionKey, T> =>
	Object.fromEntries(KEYS.map((k) => [k, value])) as Record<ActionKey, T>;

const DIM = 3;

function legal(over: Partial<SeatLegal> = {}): SeatLegal {
	return {
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
		afford: every(true),
		...over,
	};
}

function fighter(seat: number, name: string, over: Partial<SeatFighter> = {}): SeatFighter {
	return {
		seat,
		name,
		colour: seat ? "#4dd8ff" : "#ff4d8d",
		team: seat,
		alive: true,
		hp: 40,
		max: 60,
		at: [seat, 1],
		lit: false,
		cards: 2,
		seen: [],
		weapon: null,
		weaponDamage: null,
		nrg: seat ? null : 5,
		cap: 5,
		...over,
	};
}

function view(over: Partial<SeatState> = {}): SeatState {
	return {
		seat: 0,
		dim: DIM,
		round: 2,
		turn: 0,
		phase: "act",
		blind: false,
		priv: true,
		smash: false,
		paint: false,
		chaos: false,
		chaosRound: 1,
		mvUses: 3,
		warn: null,
		toss: false,
		over: false,
		tiles: Array.from({length: DIM * DIM}, () => ({t: null, life: 0, wid: 0})),
		fighters: [fighter(0, "Vermilion"), fighter(1, "Cyan")],
		you: {
			seat: 0,
			x: 1,
			y: 1,
			hp: 40,
			max: 60,
			nrg: 5,
			cap: 5,
			bank: 0,
			drain: 0,
			rootTurns: 0,
			darkTurns: 0,
			litTurns: 0,
			float: false,
			trail: null,
			mv: 0,
			used: every(0),
			held: null,
			hand: [],
		},
		legal: legal(),
		steal: null,
		litsq: [],
		reachable: [],
		smashMult: 1,
		chat: [],
		...over,
	};
}

function screen(over: Partial<Local> = {}): Local {
	return {
		mode: null,
		sel: null,
		mixFrom: null,
		tossPick: null,
		imode: false,
		look: null,
		reach: [],
		replyTo: null,
		forfeitArmed: false,
		canUndo: false,
		themeLabel: "Day mode",
		codex: "3 of 45 fusions found",
		fx: [],
		handoff: false,
		...over,
	};
}

/** Everything a click on this screen could turn into, kept in the order it happened. */
interface Log {
	readonly act: MatchActions;
	readonly moves: Intent[];
	readonly patches: Partial<Local>[];
	readonly doors: string[];
}

function log(): Log {
	const moves: Intent[] = [],
		patches: Partial<Local>[] = [],
		doors: string[] = [];
	const door =
		(name: string): (() => void) =>
		() =>
			void doors.push(name);
	return {
		moves,
		patches,
		doors,
		act: {
			submit: (intent) => void moves.push(intent),
			patch: (next) => void patches.push(next),
			undo: door("undo"),
			leave: door("leave"),
			forfeit: door("forfeit"),
			toggleTheme: door("toggleTheme"),
			openTable: door("openTable"),
			cancelSteal: door("cancelSteal"),
		},
	};
}

/** The view with every callback taken out of it, which is the half two draws have to agree on. */
function plain(value: unknown): unknown {
	if (typeof value === "function") return "[callback]";
	if (Array.isArray(value)) return value.map(plain);
	if (typeof value === "object" && value !== null)
		return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]));
	return value;
}

describe("drawing from a seat view alone", () => {
	it("draws a whole screen with no match loaded at all", () => {
		const drawn = matchView(view(), screen(), log().act);

		expect(drawn.topbar.round).toBe("ROUND 2  ·  5/5 ENERGY");
		expect(drawn.board.tiles).toHaveLength(DIM * DIM);
		expect(drawn.roster.map((card) => card.name)).toStrictEqual(["Vermilion", "Cyan"]);
		expect(drawn.codex).toBe("3 of 45 fusions found");
	});

	it("draws the same screen twice from the same three arguments", () => {
		const v = view(),
			l = screen(),
			a = log().act;

		expect(plain(matchView(v, l, a))).toStrictEqual(plain(matchView(v, l, a)));
	});

	it("puts each fighter on the square the seat was told they stand on", () => {
		const drawn = matchView(view(), screen(), log().act);

		expect(drawn.board.tiles.map((tile) => tile.occupants.map((who) => who.seat))).toStrictEqual([
			[],
			[],
			[],
			[0],
			[1],
			[],
			[],
			[],
			[],
		]);
	});

	it("leaves a fighter the seat cannot see off the board entirely", () => {
		const unseen = [fighter(0, "Vermilion"), fighter(1, "Cyan", {at: null})];

		const drawn = matchView(view({fighters: unseen}), screen(), log().act);

		expect(drawn.board.tiles.flatMap((tile) => tile.occupants.map((who) => who.seat))).toStrictEqual([0]);
	});
});

/* Every button that changes the match, and the move it asks for. This is the list the rewrite was
   most able to get quietly wrong: a move filed as local UI still works when the rules are sitting
   in the same process, and only stops working once there is a server entitled to say no. */
describe("what a click asks the arena for", () => {
	const held = {uid: 7, k: "w" as const, ids: ["dagger"], els: []};

	it("ends the turn", () => {
		const l = log();

		matchView(view(), screen(), l.act).topbar.endTurn();

		expect(l.moves).toStrictEqual([{k: "end"}]);
	});

	it("steps onto the square next door while nothing is being aimed", () => {
		const l = log();

		matchView(view({legal: legal({step: [1]})}), screen(), l.act).board.click(1, 0);

		expect(l.moves).toStrictEqual([{k: "step", x: 1, y: 0}]);
	});

	it("aims the footwork the board is waiting for at the square that was clicked", () => {
		const l = log();

		matchView(view(), screen({mode: "jump"}), l.act).board.click(2, 0);

		expect(l.moves).toStrictEqual([{k: "jump", x: 2, y: 0}]);
	});

	it("lays the card that is picked up, on the square that was clicked", () => {
		const l = log();

		matchView(view(), screen({mode: "place", sel: 4}), l.act).board.click(0, 2);

		expect(l.moves).toStrictEqual([{k: "place", uid: 4, x: 0, y: 2}]);
	});

	it("swings only at a square the seat was told the weapon reaches", () => {
		const v = view({you: {...view().you, held: 7, hand: [held]}, legal: legal({swing: [2]})});
		const l = log();
		const board = matchView(v, screen({mode: "attack"}), l.act).board;

		board.click(0, 1); // out of reach
		board.click(2, 0); // in it

		expect(l.moves).toStrictEqual([{k: "swing", x: 2, y: 0}]);
	});

	it("picks a card up", () => {
		const v = view({you: {...view().you, hand: [held]}});
		const l = log();

		matchView(v, screen(), l.act).hand.click(7);

		expect(l.moves).toStrictEqual([{k: "card", uid: 7}]);
	});

	it("drops a dragged card where it was let go of, because the hand's order is the match's", () => {
		const l = log();

		matchView(view(), screen(), l.act).hand.reorder(7, 2);

		expect(l.moves).toStrictEqual([{k: "reorder", uid: 7, to: 2}]);
	});

	it("merges the card a merge started from into the one clicked", () => {
		const other = {uid: 8, k: "el" as const, id: "fire"};
		const v = view({you: {...view().you, hand: [held, other]}, legal: legal({mix: [{uid: 7, with: [8]}]})});
		const l = log();

		matchView(v, screen({mode: "mix", mixFrom: 7}), l.act).hand.click(8);

		expect(l.moves).toStrictEqual([{k: "merge", uid: 7, into: 8}]);
	});

	it("works the footwork that needs no square as soon as it is pressed", () => {
		const v = view({you: {...view().you, mv: 16}, legal: legal({spin: [0]})});
		const l = log();

		matchView(v, screen(), l.act)
			.footwork.buttons.find((b) => b.key === "spin")
			?.click?.();

		expect(l.moves).toStrictEqual([{k: "spin"}]);
	});

	it("slides everyone one square along one axis", () => {
		const l = log();
		const bar = matchView(view(), screen({mode: "shift"}), l.act).actions;

		bar.buttons.find((b) => b.key === "left")?.click();

		expect(l.moves).toStrictEqual([{k: "shift", dx: -1, dy: 0}]);
	});

	it("takes a card out of the hand a theft opened", () => {
		const steal = {seat: 1, name: "Cyan", cards: [{uid: 3, label: "Card 1", facedown: true}]};
		const l = log();
		const bar = matchView(view({steal}), screen(), l.act).actions;

		bar.buttons.find((b) => b.key === "3")?.click();

		expect(l.moves).toStrictEqual([{k: "take", uid: 3}]);
	});

	it("throws a card away only once the same card has been picked twice", () => {
		const card = {uid: 5, k: "el" as const, id: "fire"};
		const v = view({toss: true, you: {...view().you, hand: [card]}});
		const l = log();

		matchView(v, screen(), l.act).hand.click(5);
		matchView(v, screen({tossPick: 5}), l.act).hand.click(5);

		expect(l.patches).toStrictEqual([{tossPick: 5}]);
		expect(l.moves).toStrictEqual([{k: "toss", uid: 5}]);
	});

	it("says something at the table, answering whatever the reply bar is pointing at", () => {
		const l = log();

		matchView(view(), screen({replyTo: 4}), l.act).chat.say("well played");

		expect(l.moves).toStrictEqual([{k: "chat", text: "well played", to: 4}]);
	});
});

/* The other half of the same list. None of these is a move, so none of them may become one: two
   people watching the same match hold different versions of all of it. */
describe("what a click keeps to itself", () => {
	it("aims a piece of footwork without asking the arena for anything", () => {
		const v = view({you: {...view().you, mv: 1}, legal: legal({jump: [0]})});
		const l = log();

		matchView(v, screen(), l.act)
			.footwork.buttons.find((b) => b.key === "jump")
			?.click?.();

		expect(l.patches).toStrictEqual([{mode: "jump", sel: null}]);
		expect(l.moves).toStrictEqual([]);
	});

	it("turns Inspect off along with the square it was reading and the chips under it", () => {
		const l = log();

		matchView(view(), screen({imode: true, look: 3, reach: [0]}), l.act).topbar.toggleInspect();

		expect(l.patches).toStrictEqual([{imode: false, look: null, reach: []}]);
		expect(l.moves).toStrictEqual([]);
	});

	it("reads a square rather than playing it while Inspect is on", () => {
		const l = log();

		matchView(view({legal: legal({step: [1]})}), screen({imode: true}), l.act).board.click(1, 0);

		expect(l.patches).toStrictEqual([{look: 1}]);
		expect(l.moves).toStrictEqual([]);
	});

	it("draws the reach overlay for whoever is ticked", () => {
		const v = view({reachable: [{seat: 1, budget: 4, tiles: [0, 1]}]});
		const l = log();

		matchView(v, screen({imode: true}), l.act).inspect.chooser?.chips[0]?.toggle();

		expect(l.patches).toStrictEqual([{reach: [1]}]);
		expect(l.moves).toStrictEqual([]);
	});

	it("hangs the next message off the line being answered", () => {
		const chat = [{id: 9, who: "Cyan", c: "#4dd8ff", r: 1, t: "your turn", to: null}];
		const l = log();

		matchView(view({chat}), screen(), l.act).chat.lines[0]?.reply();

		expect(l.patches).toStrictEqual([{replyTo: 9}]);
		expect(l.moves).toStrictEqual([]);
	});

	it("leaves the doors out of the match to whoever opened the screen", () => {
		const l = log();
		const bar = matchView(view(), screen(), l.act).topbar;

		bar.undo();
		bar.leave();
		bar.forfeit();
		bar.openTable();
		bar.toggleTheme();

		expect(l.doors).toStrictEqual(["undo", "leave", "forfeit", "openTable", "toggleTheme"]);
		expect(l.moves).toStrictEqual([]);
	});
});
