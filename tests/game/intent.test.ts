import {describe, it, expect} from "vitest";
import {MV, T} from "../../src/game/data/index.js";
import {applyIntent} from "../../src/game/intent.js";
import {startMatch} from "../../src/game/match.js";
import {exportMatch} from "../../src/game/snapshot.js";
import {S, idx} from "../../src/game/state.js";
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

/** Every footwork bit at once, which is what a seat has to own before it may ask for a move. */
const ALL_FOOTWORK = Object.values(MV).reduce((bits, move) => bits | move.bit, 0);

/** Writes one square of ground, laid by nobody in particular. */
function lay(x: number, y: number, key: string): void {
	const cell = S.board[idx(x, y)]!;
	cell.t = key;
	cell.el = null;
	cell.life = T[key]!.life;
}

/**
 * A match where seat 0 owns every piece of footwork, has the energy for any of it, and stands in
 * the middle of the board with its rival two squares below.
 */
function armed(): {p: Player; foe: Player} {
	const {first, second} = twoSeats();
	first.mv = ALL_FOOTWORK;
	first.nrg = 99;
	first.x = 4;
	first.y = 4;
	second.x = 4;
	second.y = 6;
	return {p: first, foe: second};
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

	it("swings a held weapon at the square it was aimed at", () => {
		const {p, foe} = armed();
		holding(p, [{uid: 84, k: "w", ids: ["dagger"], els: []}]);
		p.held = 84;
		foe.x = 4;
		foe.y = 5;

		expect(applyIntent(p.i, {k: "swing", x: 4, y: 5})).toStrictEqual({ok: true});
		expect(foe.hp).toBeLessThan(foe.max);
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
});

describe("footwork off a socket", () => {
	it("jumps two squares clear", () => {
		const {p} = armed();

		expect(applyIntent(p.i, {k: "jump", x: 6, y: 4})).toStrictEqual({ok: true});
		expect([p.x, p.y, p.used.jump]).toStrictEqual([6, 4, 1]);
	});

	it("dashes along a clear line", () => {
		const {p} = armed();

		expect(applyIntent(p.i, {k: "dash", x: 4, y: 2})).toStrictEqual({ok: true});
		expect([p.x, p.y]).toStrictEqual([4, 2]);
	});

	it("leaps four squares clear", () => {
		const {p} = armed();

		expect(applyIntent(p.i, {k: "leap", x: 8, y: 4})).toStrictEqual({ok: true});
		expect([p.x, p.y]).toStrictEqual([8, 4]);
	});

	it("lifts a fighter off the ground", () => {
		const {p} = armed();

		expect(applyIntent(p.i, {k: "float"})).toStrictEqual({ok: true});
		expect(p.float).toBe(true);
	});

	it("spins the ground beside them clean", () => {
		const {p} = armed();
		lay(5, 4, "lava");

		expect(applyIntent(p.i, {k: "spin"})).toStrictEqual({ok: true});
		expect(S.board[idx(5, 4)]!.t).toBeNull();
	});

	it("wipes the ground out to three squares", () => {
		const {p} = armed();
		lay(7, 4, "lava");

		expect(applyIntent(p.i, {k: "wipe"})).toStrictEqual({ok: true});
		expect(S.board[idx(7, 4)]!.t).toBeNull();
	});

	it("warps onto bare ground anywhere on the board", () => {
		const {p} = armed();

		expect(applyIntent(p.i, {k: "warp", x: 0, y: 0})).toStrictEqual({ok: true});
		expect([p.x, p.y]).toStrictEqual([0, 0]);
	});

	it("strips the whole arena back to bare ground", () => {
		const {p} = armed();
		lay(0, 8, "lava");

		expect(applyIntent(p.i, {k: "ultra"})).toStrictEqual({ok: true});
		expect(S.board.every((c) => c.t === null)).toBe(true);
	});

	it("grows one square of ground into a block of it", () => {
		const {p} = armed();
		lay(0, 0, "lava");

		expect(applyIntent(p.i, {k: "spread", x: 0, y: 0})).toStrictEqual({ok: true});
		expect(S.board[idx(2, 2)]!.t).toBe("lava");
	});

	it("starts trailing whatever is underfoot", () => {
		const {p} = armed();
		lay(4, 4, "lava");

		expect(applyIntent(p.i, {k: "trail"})).toStrictEqual({ok: true});
		expect(p.trail).toBe("lava");
	});

	it("slides everybody one way until something stops them", () => {
		const {p, foe} = armed();

		expect(applyIntent(p.i, {k: "shift", dx: -1, dy: 0})).toStrictEqual({ok: true});
		expect([p.x, foe.x]).toStrictEqual([0, 0]);
	});

	it("crushes a hand into a single weapon", () => {
		const {p} = armed();
		holding(p, [
			{uid: 91, k: "w", ids: ["dagger"], els: []},
			{uid: 92, k: "el", id: "fire"},
		]);

		expect(applyIntent(p.i, {k: "smash"})).toStrictEqual({ok: true});
		expect(p.hand.map((c) => (c.k === "w" ? c.els : c.id))).toStrictEqual([["fire"]]);
	});

	it("trades places with a rival", () => {
		const {p, foe} = armed();

		expect(applyIntent(p.i, {k: "swap", x: 4, y: 6})).toStrictEqual({ok: true});
		expect([p.y, foe.y]).toStrictEqual([6, 4]);
	});

	it("marks a card in a rival's hand", () => {
		const {p, foe} = armed();

		expect(applyIntent(p.i, {k: "mark", x: 4, y: 6})).toStrictEqual({ok: true});
		expect(foe.hand.filter((c) => c.mark === true).length).toBe(1);
	});

	it("fixes a glare on a rival for good", () => {
		const {p, foe} = armed();

		expect(applyIntent(p.i, {k: "light", x: 4, y: 6})).toStrictEqual({ok: true});
		expect(foe.lit).toBe(true);
	});

	/* Theft is asked for in two goes: one to pick the hand, one to pick the card out of it, which
	   is the only move the match screen offers that needs a second word from the same seat. */
	it("opens a rival's hand and takes a card out of it", () => {
		const {p, foe} = armed();
		holding(foe, [{uid: 95, k: "el", id: "fire"}]);

		expect(applyIntent(p.i, {k: "theft", x: 4, y: 6})).toStrictEqual({ok: true});
		expect(S.steal).toBe(foe.i);

		expect(applyIntent(p.i, {k: "take", uid: 95})).toStrictEqual({ok: true});
		expect(p.hand.map((c) => c.uid)).toContain(95);
		// the hand it came out of was left empty, so the rules dealt it a fresh one on the way out
		expect(foe.hand.map((c) => c.uid)).not.toContain(95);
	});

	it("throws away the card chaos mode asks for", () => {
		const {p} = armed();
		holding(p, [
			{uid: 96, k: "el", id: "fire"},
			{uid: 97, k: "el", id: "water"},
		]);
		S.toss = true;

		expect(applyIntent(p.i, {k: "toss", uid: 96})).toStrictEqual({ok: true});
		expect(p.hand.map((c) => c.uid)).toStrictEqual([97]);
		expect(S.toss).toBe(false);
	});
});

describe("table talk off a socket", () => {
	it("says something at the table", () => {
		const {p} = armed();

		expect(applyIntent(p.i, {k: "chat", text: "good luck", to: 0})).toStrictEqual({ok: true});
		expect(S.chat.map((m) => [m.who, m.t, m.to])).toStrictEqual([[p.name, "good luck", null]]);
	});

	it("hangs an answer off the line it answers", () => {
		const {p} = armed();
		applyIntent(p.i, {k: "chat", text: "good luck", to: 0});

		expect(applyIntent(p.i, {k: "chat", text: "and you", to: S.chat[0]!.id})).toStrictEqual({ok: true});
		expect(S.chat[1]!.to).toBe(S.chat[0]!.id);
	});

	it("refuses a message with nothing in it, and leaves the reply bar alone", () => {
		const {p} = armed();
		applyIntent(p.i, {k: "chat", text: "good luck", to: 0});

		expect(applyIntent(p.i, {k: "chat", text: "   ", to: S.chat[0]!.id})).toStrictEqual({
			ok: false,
			why: "the arena will not take that move",
		});
		expect([S.chat.length, S.replyTo]).toStrictEqual([1, null]);
	});
});

describe("what a refusal is allowed to say", () => {
	/* The rules refuse an impossible move by doing nothing, so nothing happening is how the server
	   knows the move was turned down, and the client is told rather than left to work it out. */
	it("leaves the match alone and says so when the rules will not take the move", () => {
		const {first} = twoSeats();
		first.nrg = 0;
		const before = exportMatch();

		expect(applyIntent(first.i, {k: "step", x: first.x + 1, y: first.y})).toStrictEqual({
			ok: false,
			why: "the arena will not take that move",
		});
		expect(exportMatch()).toStrictEqual(before);
	});

	it("says when the seat was never given the footwork it asked for", () => {
		const {p} = armed();
		p.mv = 0;

		expect(applyIntent(p.i, {k: "jump", x: 6, y: 4})).toStrictEqual({
			ok: false,
			why: "you were not given that move",
		});
	});

	it("says when the seat has used that move up", () => {
		const {p} = armed();
		p.used.jump = S.mvUses;

		expect(applyIntent(p.i, {k: "jump", x: 6, y: 4})).toStrictEqual({
			ok: false,
			why: "you have used that move up",
		});
	});

	it("says when the seat cannot pay for the move", () => {
		const {p} = armed();
		p.nrg = 0;

		expect(applyIntent(p.i, {k: "jump", x: 6, y: 4})).toStrictEqual({ok: false, why: "you cannot afford that"});
	});

	/* A client cannot know a square is taken when the fighter standing on it is concealed, so it is
	   allowed to ask. Naming what stopped it would answer the one question the concealment exists
	   to leave unanswered, so every refusal a secret is behind reads the same as any other. */
	it("will not say who was hiding on the square that was asked for", () => {
		const {p, foe} = armed();
		lay(0, 0, "shadow");
		S.board[idx(0, 0)]!.by = foe.i;
		foe.x = 0;
		foe.y = 0;

		const verdict = applyIntent(p.i, {k: "warp", x: 0, y: 0});

		expect(verdict).toStrictEqual({ok: false, why: "the arena will not take that move"});
		expect([p.x, p.y]).toStrictEqual([4, 4]);
	});
});
