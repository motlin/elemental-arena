import {describe, it, expect} from "vitest";
import {applyIntent} from "../../src/game/intent.js";
import {startMatch} from "../../src/game/match.js";
import {seatState} from "../../src/game/seat.js";
import {S, hidden, idx} from "../../src/game/state.js";
import {T} from "../../src/game/data/index.js";
import type {Player} from "../../src/game/types.js";

/**
 * The per-seat truth an online match is allowed to send one player. Hot-seat gets away with a
 * single view because only one person is ever looking; online, every connected seat is looking at
 * once, so the filtering the match screen does for `cur()` has to be done per seat instead. These
 * pin the rule where the wire is: what one seat is handed can never answer a question about
 * another seat that the arena is keeping from them.
 */

/** A two-seat match with every overlay out of the way, so only concealment is under test. */
function twoSeats(): {watcher: Player; hider: Player} {
	S.np = 2;
	S.dim = 9;
	S.preset = null;
	S.presetDim = 0;
	S.priv = true;
	startMatch();
	S.handoff = false;
	const [watcher, hider] = S.players;
	return {watcher: watcher!, hider: hider!};
}

/** Writes one square of ground, laid by nobody in particular. */
function lay(x: number, y: number, key: string): void {
	const cell = S.board[idx(x, y)]!;
	cell.t = key;
	cell.el = null;
	cell.life = T[key]!.life;
}

/** Lays hiding ground and stands a fighter on it, which is the whole of how concealment works. */
function conceal(q: Player, x: number, y: number): void {
	q.x = x;
	q.y = y;
	lay(x, y, "shadow");
	S.board[idx(x, y)]!.by = q.i;
}

/** Everything one seat would be sent, as the wire would carry it. */
function wire(seat: number): string {
	return JSON.stringify(seatState(seat));
}

/** Every piece of footwork there is, which is every bit `MV` hands out. */
const ALL_FOOTWORK = 0xffff;

/**
 * Pins everything about a fighter that a fresh deal would otherwise roll, so two matches built the
 * same way differ in nothing but what the test moved.
 */
function steady(p: Player): void {
	p.x = 4;
	p.y = 4;
	p.nrg = 5;
	p.mv = ALL_FOOTWORK;
	p.hand = [{uid: 80, k: "w", ids: ["dagger"], els: []}];
	p.held = 80;
}

describe("what one seat is handed", () => {
	it("gives a seat its own hand in full and never anybody else's", () => {
		const {watcher, hider} = twoSeats();

		const mine = seatState(watcher.i);

		expect(mine.you.hand.map((c) => c.uid)).toStrictEqual(watcher.hand.map((c) => c.uid));
		expect(mine.fighters[hider.i]?.cards).toBe(hider.hand.length);
		expect(mine.fighters[hider.i]?.seen).toStrictEqual([]);
		for (const card of hider.hand) expect(wire(watcher.i)).not.toContain(`"uid":${card.uid}`);
	});

	it("names a rival's weapon to nobody while hands are private, and to everybody once they are open", () => {
		const {watcher, hider} = twoSeats();
		hider.hand = [{uid: 90, k: "w", ids: ["dagger"], els: []}];
		hider.held = 90;

		expect(seatState(watcher.i).fighters[hider.i]?.weapon).toBeNull();
		expect(seatState(hider.i).fighters[hider.i]?.weapon).toBe("Dagger");

		S.priv = false;

		expect(seatState(watcher.i).fighters[hider.i]?.weapon).toBe("Dagger");
	});

	/* A marked card is face up to every rival and never to its owner, so the mark itself is a
	   secret: the owner is handed the card without it. */
	it("shows a marked card to the rival who marked it and hides the mark from its owner", () => {
		const {watcher, hider} = twoSeats();
		hider.hand = [{uid: 91, k: "el", id: "fire", mark: true}];

		expect(seatState(watcher.i).fighters[hider.i]?.seen).toStrictEqual(["Fire"]);
		expect(seatState(hider.i).you.hand).toStrictEqual([{uid: 91, k: "el", id: "fire"}]);
	});

	it("leaves a concealed fighter off the board of the seat that cannot see them", () => {
		const {watcher, hider} = twoSeats();
		conceal(hider, 4, 4);
		expect(hidden(hider)).toBe(true);

		expect(seatState(watcher.i).fighters[hider.i]?.at).toBeNull();
		expect(seatState(hider.i).fighters[hider.i]?.at).toStrictEqual([4, 4]);
		expect(wire(watcher.i)).not.toContain("shadow");
	});

	it("hides the hiding ground along with whoever is standing on it", () => {
		const {watcher, hider} = twoSeats();
		conceal(hider, 4, 4);
		lay(5, 4, "lava");

		const theirs = seatState(watcher.i);

		expect(theirs.tiles[idx(4, 4)]).toStrictEqual({t: null, life: 0, wid: 0});
		expect(theirs.tiles[idx(5, 4)]?.t).toBe("lava");
	});

	it("tells a blinded seat where nobody is", () => {
		const {watcher, hider} = twoSeats();
		hider.x = watcher.x + 1;
		hider.y = watcher.y;
		watcher.darkTurns = 1;

		const theirs = seatState(watcher.i);

		expect(theirs.blind).toBe(true);
		expect(theirs.fighters[hider.i]?.at).toBeNull();
		expect(theirs.fighters[watcher.i]?.at).toStrictEqual([watcher.x, watcher.y]);
	});

	/* A glare beats any cover, and it exposes the ground under them along with them. The fighter
	   wearing it is the one person never shown it. */
	it("publishes a lit fighter to everyone and never shows them their own glow", () => {
		const {watcher, hider} = twoSeats();
		conceal(hider, 4, 4);
		hider.lit = true;

		expect(seatState(watcher.i).fighters[hider.i]?.lit).toBe(true);
		expect(seatState(watcher.i).tiles[idx(4, 4)]?.t).toBe("shadow");
		expect(seatState(hider.i).fighters[hider.i]?.lit).toBe(false);
	});

	it("carries the match everybody shares without carrying anybody's progress", () => {
		const {watcher} = twoSeats();
		S.codex = {steam: 1};
		S.coins = 4200;

		const mine = seatState(watcher.i);

		expect([mine.seat, mine.dim, mine.round, mine.turn]).toStrictEqual([0, 9, 1, 0]);
		expect(wire(watcher.i)).not.toContain("4200");
		expect(wire(watcher.i)).not.toContain("steam");
	});

	it("refuses a seat that is not in the match", () => {
		twoSeats();

		expect(() => seatState(7)).toThrow("no seat 7 in this match");
	});
});

/**
 * The legal moves, which are the newest thing on the wire and the most dangerous. They are worked
 * out from the whole match, which is what makes them truthful, and then sent to one client, which
 * is the exact shape of the bug this whole boundary exists to prevent -- a naive answer greys out
 * the one square somebody is hiding on, and the grey square is the fighter. So the rule is that
 * legality is answered against the arena the seat was shown, and a move that is illegal only
 * because of somebody it cannot see comes back legal for it to be refused on later.
 */
describe("what one seat is told it may do", () => {
	/** What the watching seat may do, with the hiding fighter and their cover on the square named. */
	function legalWith(x: number, y: number): string {
		const {watcher, hider} = twoSeats();
		steady(watcher);
		conceal(hider, x, y);
		expect(hidden(hider)).toBe(true);
		return JSON.stringify(seatState(watcher.i).legal);
	}

	/* Two matches alike in everything but where the fighter in hiding went, one of them next door
	   to the watching seat and one of them in the far corner. A byte between the two blocks is a
	   byte anybody could diff to find them. */
	it("says the same thing whether or not somebody is hiding within reach of it", () => {
		expect(legalWith(5, 4)).toStrictEqual(legalWith(8, 0));
	});

	/* Blindness hides people who are not hiding at all, and the rules know nothing about it: every
	   one of them would happily name a fighter standing in the open two feet away. */
	it("names nobody to a blinded seat, however plainly they are standing there", () => {
		const {watcher, hider} = twoSeats();
		steady(watcher);
		hider.x = 5;
		hider.y = 4;
		watcher.darkTurns = 1;

		const mine = seatState(watcher.i).legal;

		expect([mine.light, mine.mark, mine.swap, mine.theft, mine.foes]).toStrictEqual([[], [], [], [], []]);
		expect(mine.warp).toContain(idx(5, 4));
	});

	it("tells the seat to move where it may walk and what the weapon in its hand reaches", () => {
		const {watcher} = twoSeats();
		steady(watcher);

		const mine = seatState(watcher.i).legal;

		expect(mine.step).toContain(idx(5, 4));
		expect(mine.swing).toContain(idx(5, 4));
		expect(mine.jump).toContain(idx(6, 4));
		expect(mine.afford.jump).toBe(true);
	});

	/* The fiction, both halves of it in one test: the square is offered because the seat has no way
	   of knowing better, and the arena turns the move down without saying what is standing there. */
	it("offers the square somebody is hiding on and leaves the refusing to the arena", () => {
		const {watcher, hider} = twoSeats();
		steady(watcher);
		conceal(hider, 5, 4);

		expect(seatState(watcher.i).legal.warp).toContain(idx(5, 4));
		expect(applyIntent(watcher.i, {k: "warp", x: 5, y: 4})).toStrictEqual({
			ok: false,
			why: "the arena will not take that move",
		});
	});

	it("offers nothing at all to the seat whose turn it is not", () => {
		const {hider} = twoSeats();
		steady(hider);

		const theirs = seatState(hider.i).legal;

		expect([theirs.step, theirs.jump, theirs.place, theirs.swing, theirs.warp]).toStrictEqual([[], [], [], [], []]);
		expect(Object.values(theirs.afford).some((can) => can)).toBe(false);
	});
});
