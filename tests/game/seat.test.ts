import {describe, it, expect} from "vitest";
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
