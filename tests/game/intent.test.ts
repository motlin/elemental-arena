import {describe, it, expect} from "vitest";
import {applyIntent} from "../../src/game/intent.js";
import type {Intent} from "../../src/game/intent.js";
import {startMatch} from "../../src/game/match.js";
import {exportMatch} from "../../src/game/snapshot.js";
import {S} from "../../src/game/state.js";
import type {Player} from "../../src/game/types.js";

/**
 * The server's half of a move. A client asks; this decides. Everything a hot-seat game could take
 * for granted -- that whoever is clicking is whoever's turn it is, that the match is still running,
 * that the card being played is in the hand playing it -- has to be checked here instead, because
 * online the asking comes off a socket.
 */

function twoSeats(): {first: Player; second: Player} {
	S.np = 2;
	S.dim = 9;
	S.preset = null;
	S.presetDim = 0;
	S.chaos = false;
	startMatch();
	const [first, second] = S.players;
	return {first: first!, second: second!};
}

/** Puts one element in a seat's hand and nothing else, so a card intent has one obvious subject. */
function holding(p: Player, cards: Player["hand"]): void {
	p.hand = cards;
	p.held = null;
}

describe("taking a move off a socket", () => {
	it("refuses a seat that is not in the match", () => {
		twoSeats();

		expect(applyIntent(6, {k: "end"})).toStrictEqual({ok: false, why: "no seat 6 in this match"});
	});

	it("refuses a seat whose turn it is not, and leaves the match exactly as it was", () => {
		const {second} = twoSeats();
		const before = exportMatch();

		expect(applyIntent(second.i, {k: "step", x: second.x - 1, y: second.y})).toStrictEqual({
			ok: false,
			why: "not your turn",
		});
		expect(exportMatch()).toStrictEqual(before);
	});

	it("refuses everybody once the match has been called", () => {
		const {second} = twoSeats();
		second.alive = false;
		S.screen = "menu";

		expect(applyIntent(0, {k: "end"})).toStrictEqual({ok: false, why: "the match is over"});
	});

	it("refuses a fighter who is already out", () => {
		const {first} = twoSeats();
		first.alive = false;

		expect(applyIntent(first.i, {k: "end"})).toStrictEqual({ok: false, why: "you are out of the match"});
	});

	it("walks a fighter onto the square they asked for", () => {
		const {first} = twoSeats();
		const to = {x: first.x + 1, y: first.y};

		expect(applyIntent(first.i, {k: "step", ...to})).toStrictEqual({ok: true});
		expect([first.x, first.y]).toStrictEqual([to.x, to.y]);
		expect(first.nrg).toBe(first.cap - 1);
	});

	it("hands the turn on", () => {
		const {first} = twoSeats();

		expect(applyIntent(first.i, {k: "end"})).toStrictEqual({ok: true});
		expect(S.turn).toBe(1);
	});

	it("lays a card on the ground and takes it out of the hand", () => {
		const {first} = twoSeats();
		holding(first, [
			{uid: 77, k: "el", id: "fire"},
			{uid: 78, k: "el", id: "water"},
		]);
		first.nrg = 9;

		expect(applyIntent(first.i, {k: "place", uid: 77, x: first.x + 1, y: first.y + 1})).toStrictEqual({ok: true});
		expect(first.hand.map((c) => c.uid)).toStrictEqual([78]);
		expect(S.board[(first.y + 1) * S.dim + first.x + 1]?.el).toBe("fire");
	});

	it("merges two cards into the one they make", () => {
		const {first} = twoSeats();
		holding(first, [
			{uid: 81, k: "el", id: "fire"},
			{uid: 82, k: "el", id: "water"},
		]);
		first.nrg = 9;

		expect(applyIntent(first.i, {k: "merge", uid: 81, into: 82})).toStrictEqual({ok: true});
		expect(first.hand.map((c) => (c.k === "el" ? c.id : c.k))).toStrictEqual(["steam"]);
	});

	it("picks a weapon up and puts it back down", () => {
		const {first} = twoSeats();
		holding(first, [{uid: 83, k: "w", ids: ["dagger"], els: []}]);

		applyIntent(first.i, {k: "card", uid: 83});
		expect(first.held).toBe(83);

		applyIntent(first.i, {k: "card", uid: 83});
		expect(first.held).toBeNull();
	});

	it("takes a fighter out of the match in one go rather than two taps", () => {
		const {first} = twoSeats();

		expect(applyIntent(first.i, {k: "forfeit"})).toStrictEqual({ok: true});
		expect([first.alive, first.hp]).toStrictEqual([false, 0]);
	});

	/* An empty hand is refilled at once, whoever is playing. Hot-seat does that on the way into a
	   redraw; nothing redraws on a server, so the move itself has to do it. */
	it("refills a hand that has run out, even a hand that is not the one moving", () => {
		const {first, second} = twoSeats();
		second.hand = [];

		applyIntent(first.i, {k: "step", x: first.x + 1, y: first.y});

		expect(second.hand.length).toBe(5);
	});

	/* The rules refuse an impossible move by doing nothing, which reads as success from out here.
	   Saying so is the client's job; the server's job is that nothing happened. */
	it("leaves the match alone when the rules will not take the move", () => {
		const {first} = twoSeats();
		first.nrg = 0;
		const before = exportMatch();

		expect(applyIntent(first.i, {k: "step", x: first.x + 1, y: first.y})).toStrictEqual({ok: true});
		expect(exportMatch()).toStrictEqual(before);
	});

	it("takes every move the protocol carries", () => {
		const kinds: Intent["k"][] = ["step", "card", "place", "swing", "merge", "end", "forfeit"];
		const {first} = twoSeats();

		const refusals = kinds.map((k) => {
			twoSeats();
			const intent = {k, x: first.x, y: first.y, uid: 1, into: 2} as unknown as Intent;
			return applyIntent(0, intent);
		});

		expect(refusals.filter((r) => !r.ok)).toStrictEqual([]);
	});
});
