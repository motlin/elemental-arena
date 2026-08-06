import {describe, it, expect} from "vitest";
import {PROTOCOL_VERSION, encode, parseClientMessage, parseSetup} from "../../src/net/protocol.js";
import type {ClientMessage} from "../../src/net/protocol.js";

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

	it("round-trips every move the arena takes", () => {
		const moves: ClientMessage[] = [
			{k: "move", intent: {k: "step", x: 4, y: 5}},
			{k: "move", intent: {k: "card", uid: 12}},
			{k: "move", intent: {k: "place", uid: 12, x: 0, y: 8}},
			{k: "move", intent: {k: "swing", x: 2, y: 2}},
			{k: "move", intent: {k: "merge", uid: 1, into: 2}},
			{k: "move", intent: {k: "end"}},
			{k: "move", intent: {k: "forfeit"}},
		];

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

	/* A move carrying more than it should is a client the server does not understand, and the
	   safe reading of that is to stop listening rather than to guess which half was meant. */
	it("refuses a move dressed up with fields it was never given", () => {
		expect(parseClientMessage(JSON.stringify({k: "move", intent: {k: "end"}, seat: 4}))).toBeNull();
		expect(parseClientMessage(JSON.stringify({k: "move", intent: {k: "step", x: 1, y: 1, z: 1}}))).toBeNull();
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
