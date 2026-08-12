/**
 * The replay a client keeps of an online match.
 *
 * Hot-seat's replay is the log with the whole board attached, which is exactly the thing that
 * cannot be sent while a match is live. So an online seat keeps its own out of the arenas it was
 * handed, and what these pin is that it stays that: a record of what the player could see while
 * they were deciding, with nothing in it that the wire was careful to keep out.
 */

import {describe, it, expect, beforeEach} from "vitest";
import {startMatch} from "../../src/game/match.js";
import {forget, keep, kept} from "../../src/game/record.js";
import {seatState} from "../../src/game/seat.js";
import {S, idx} from "../../src/game/state.js";
import {T} from "../../src/game/data/index.js";
import type {Player} from "../../src/game/types.js";

/** A two-seat match, dealt the way an online one is. */
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

/** Lays hiding ground and stands a fighter on it, which is the whole of how concealment works. */
function conceal(q: Player, x: number, y: number): void {
	q.x = x;
	q.y = y;
	const cell = S.board[idx(x, y)]!;
	cell.t = "shadow";
	cell.el = null;
	cell.life = T["shadow"]!.life;
	cell.by = q.i;
}

beforeEach(forget);

describe("a seat's own replay", () => {
	it("is one frame per arena the room sent, in the order they arrived", () => {
		const {watcher} = twoSeats();
		keep(seatState(watcher.i));
		watcher.hp -= 5;

		keep(seatState(watcher.i));

		expect(kept().map((frame) => frame.players[watcher.i]?.hp)).toStrictEqual([watcher.hp + 5, watcher.hp]);
	});

	/* A seat sitting back down is sent the match over again. Watching the same board twice is not
	   something that happened, so it is not something the replay steps through. */
	it("is not lengthened by being sent the same arena twice", () => {
		const {watcher} = twoSeats();

		keep(seatState(watcher.i));
		keep(seatState(watcher.i));

		expect(kept()).toHaveLength(1);
	});

	/* The frames are built from the seat views and from nothing else, so what a seat could not see
	   while it was playing is not something its replay can show it afterwards. */
	it("stands a fighter this seat never saw nowhere at all", () => {
		const {watcher, hider} = twoSeats();
		conceal(hider, 7, 7);

		keep(seatState(watcher.i));

		const drawn = kept()[0]?.players[hider.i];
		expect([drawn?.x, drawn?.y]).toStrictEqual([-1, -1]);
		expect(kept()[0]?.players[watcher.i]?.x).toBe(watcher.x);
	});

	it("names this seat's own hand and leaves everybody else's face down", () => {
		const {watcher, hider} = twoSeats();

		keep(seatState(watcher.i));

		const frame = kept()[0];
		expect(frame?.players[watcher.i]?.hand).toHaveLength(watcher.hand.length);
		expect(frame?.players[watcher.i]?.hand.every((card) => card !== "?")).toBe(true);
		expect(frame?.players[hider.i]?.hand).toStrictEqual(hider.hand.map(() => "?"));
	});

	it("says who was to move, which is the one thing a frame narrates", () => {
		const {watcher, hider} = twoSeats();
		S.turn = hider.i;

		keep(seatState(watcher.i));

		expect(kept()[0]?.who).toBe(hider.name);
		expect(kept()[0]?.turn).toBe(hider.i);
	});

	it("is put down when the match is", () => {
		const {watcher} = twoSeats();
		keep(seatState(watcher.i));

		forget();

		expect(kept()).toStrictEqual([]);
	});
});
