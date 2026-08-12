import {describe, it, expect} from "vitest";
import {PROTOCOL_VERSION, encode, parseClientMessage, parseServerMessage, parseSetup} from "../../src/net/protocol.js";
import type {ClientMessage, Intent} from "../../src/net/protocol.js";

/**
 * Everything a client can say to the match server. The server trusts none of it, so the parser is
 * the whole of the trust boundary: anything that comes back from it is a message the room may act
 * on, and anything else is a socket saying something it was never taught to say.
 */

function said(message: ClientMessage): ClientMessage | null {
	return parseClientMessage(encode(message));
}

describe("what a client may say", () => {
	it("round-trips a seat claim", () => {
		const hello: ClientMessage = {k: "hello", v: PROTOCOL_VERSION, seat: 3, token: "abc123"};

		expect(said(hello)).toStrictEqual(hello);
	});

	/* Keyed by kind, so the list cannot quietly fall behind what the arena can be asked for: a move
	   added to the protocol and not to this record is a compile error rather than a hole nobody
	   notices until a client sends one and is turned away. */
	const EVERY_MOVE: {readonly [K in Intent["k"]]: Intent & {readonly k: K}} = {
		step: {k: "step", x: 4, y: 5},
		card: {k: "card", uid: 12},
		place: {k: "place", uid: 12, x: 0, y: 8},
		swing: {k: "swing", x: 2, y: 2},
		merge: {k: "merge", uid: 1, into: 2},
		jump: {k: "jump", x: 1, y: 1},
		dash: {k: "dash", x: 1, y: 1},
		leap: {k: "leap", x: 1, y: 1},
		warp: {k: "warp", x: 1, y: 1},
		spread: {k: "spread", x: 1, y: 1},
		swap: {k: "swap", x: 1, y: 1},
		mark: {k: "mark", x: 1, y: 1},
		light: {k: "light", x: 1, y: 1},
		theft: {k: "theft", x: 1, y: 1},
		float: {k: "float"},
		spin: {k: "spin"},
		wipe: {k: "wipe"},
		ultra: {k: "ultra"},
		trail: {k: "trail"},
		smash: {k: "smash"},
		shift: {k: "shift", dx: -1, dy: 0},
		take: {k: "take", uid: 7},
		toss: {k: "toss", uid: 7},
		chat: {k: "chat", text: "good luck", to: 3},
		leaving: {k: "leaving", row: "self", el: "spring"},
		reorder: {k: "reorder", uid: 12, to: 3},
		end: {k: "end"},
		forfeit: {k: "forfeit"},
	};

	it("round-trips every move the arena takes", () => {
		const moves: ClientMessage[] = Object.values(EVERY_MOVE).map((intent) => ({k: "move", intent}));

		expect(moves.map(said)).toStrictEqual(moves);
	});

	it("refuses anything that is not a message", () => {
		const rubbish = ["", "{", "null", "[]", '"hello"', "42", JSON.stringify({}), JSON.stringify({k: "sudo"})];

		expect(rubbish.map(parseClientMessage)).toStrictEqual(rubbish.map(() => null));
	});

	it("refuses a seat claim that is not one", () => {
		const bad = [
			{k: "hello", v: PROTOCOL_VERSION, seat: 3},
			{k: "hello", v: PROTOCOL_VERSION, seat: "3", token: "abc"},
			{k: "hello", v: PROTOCOL_VERSION, seat: 1.5, token: "abc"},
			{k: "hello", v: PROTOCOL_VERSION, seat: -1, token: "abc"},
			{k: "hello", v: PROTOCOL_VERSION + 1, seat: 0, token: "abc"},
		];

		expect(bad.map((m) => parseClientMessage(JSON.stringify(m)))).toStrictEqual(bad.map(() => null));
	});

	it("refuses a move whose numbers are not numbers", () => {
		const bad = [
			{k: "move", intent: {k: "step", x: "4", y: 5}},
			{k: "move", intent: {k: "step", x: 4}},
			{k: "move", intent: {k: "place", uid: 1, x: 1.5, y: 2}},
			{k: "move", intent: {k: "merge", uid: 1}},
			{k: "move", intent: {k: "teleport"}},
			{k: "move"},
		];

		expect(bad.map((m) => parseClientMessage(JSON.stringify(m)))).toStrictEqual(bad.map(() => null));
	});

	/* A slide is one of the four the shift bar offers. Standing still is not a direction, a diagonal
	   is not one the arena has ever drawn a button for, and two squares at once is not a slide. */
	it("refuses a slide that is not one of the four directions", () => {
		const bad = [
			{k: "move", intent: {k: "shift", dx: 0, dy: 0}},
			{k: "move", intent: {k: "shift", dx: 1, dy: 1}},
			{k: "move", intent: {k: "shift", dx: 2, dy: 0}},
			{k: "move", intent: {k: "shift", dx: -1}},
		];

		expect(bad.map((m) => parseClientMessage(JSON.stringify(m)))).toStrictEqual(bad.map(() => null));
	});

	it("refuses table talk that is empty or longer than the box it is typed in", () => {
		const bad = [
			{k: "move", intent: {k: "chat", text: "", to: 0}},
			{k: "move", intent: {k: "chat", text: "a".repeat(121), to: 0}},
			{k: "move", intent: {k: "chat", text: 4, to: 0}},
			{k: "move", intent: {k: "chat", text: "hi", to: -1}},
			{k: "move", intent: {k: "chat", text: "hi"}},
		];

		expect(bad.map((m) => parseClientMessage(JSON.stringify(m)))).toStrictEqual(bad.map(() => null));
	});

	/* The row is one of two words and the ground is a key, not a sentence. Whether the weapon in
	   hand actually offers that ground is the rules' business; all the parser owes them is a word. */
	it("refuses a leaving that names neither a row nor a piece of ground", () => {
		const bad = [
			{k: "move", intent: {k: "leaving", row: "them", el: "spring"}},
			{k: "move", intent: {k: "leaving", row: "Self", el: "spring"}},
			{k: "move", intent: {k: "leaving", row: 0, el: "spring"}},
			{k: "move", intent: {k: "leaving", row: "self", el: ""}},
			{k: "move", intent: {k: "leaving", row: "self", el: "a".repeat(25)}},
			{k: "move", intent: {k: "leaving", row: "self", el: 4}},
			{k: "move", intent: {k: "leaving", row: "self"}},
			{k: "move", intent: {k: "leaving", el: "spring"}},
			{k: "move", intent: {k: "leaving", row: "self", el: "spring", uid: 1}},
		];

		expect(bad.map((m) => parseClientMessage(JSON.stringify(m)))).toStrictEqual(bad.map(() => null));
	});

	/* Both halves of a reorder are places in a hand: a card that is in it, and a slot it may land
	   in. Neither is ever a fraction, a negative, or a number too big to be a place at all. */
	it("refuses a reorder that is not two whole numbers", () => {
		const bad = [
			{k: "move", intent: {k: "reorder", uid: 1, to: -1}},
			{k: "move", intent: {k: "reorder", uid: 1, to: 1.5}},
			{k: "move", intent: {k: "reorder", uid: -1, to: 1}},
			{k: "move", intent: {k: "reorder", uid: "1", to: 1}},
			{k: "move", intent: {k: "reorder", uid: 1, to: null}},
			{k: "move", intent: {k: "reorder", uid: 1}},
			{k: "move", intent: {k: "reorder", to: 1}},
			{k: "move", intent: {k: "reorder", uid: 1, to: 1, x: 0}},
		];

		expect(bad.map((m) => parseClientMessage(JSON.stringify(m)))).toStrictEqual(bad.map(() => null));
	});

	/* A move carrying more than it should is a client the server does not understand, and the
	   safe reading of that is to stop listening rather than to guess which half was meant. */
	it("refuses a move dressed up with fields it was never given", () => {
		expect(parseClientMessage(JSON.stringify({k: "move", intent: {k: "end"}, seat: 4}))).toBeNull();
		expect(parseClientMessage(JSON.stringify({k: "move", intent: {k: "step", x: 1, y: 1, z: 1}}))).toBeNull();
	});
});

describe("what the room may say back", () => {
	it("round-trips who is still in the room", () => {
		expect(parseServerMessage(encode({k: "presence", here: [true, false]}))).toStrictEqual({
			k: "presence",
			here: [true, false],
		});
	});

	it("hears nothing at all in a roll call that is not one", () => {
		const bad = [{k: "presence"}, {k: "presence", here: "both"}, {k: "presence", here: [1, 0]}];

		expect(bad.map((m) => parseServerMessage(JSON.stringify(m)))).toStrictEqual(bad.map(() => null));
	});
});

describe("the setup a host opens a match on", () => {
	it("fills in whatever the host left out", () => {
		expect(parseSetup({})).toStrictEqual({seats: 2, dim: 9, hp: 60, priv: true});
		expect(parseSetup({seats: 4, dim: 15})).toStrictEqual({seats: 4, dim: 15, hp: 60, priv: true});
	});

	/* Out of range is refused rather than pulled into range: a host who asked for a 40x40 board
	   should be told no, not handed a 25x25 one and left to wonder which they got. */
	it("refuses a number the arena will not deal", () => {
		const bad = [{seats: 1}, {seats: 9}, {dim: 4}, {dim: 26}, {hp: 0}, {hp: 401}, {priv: "yes"}, {cheat: true}];

		expect(bad.map(parseSetup)).toStrictEqual(bad.map(() => null));
	});

	it("refuses anything that is not a setup at all", () => {
		expect([null, [], "seats", 4].map(parseSetup)).toStrictEqual([null, null, null, null]);
	});
});
