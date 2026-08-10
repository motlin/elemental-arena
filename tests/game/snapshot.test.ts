import {describe, it, expect} from "vitest";
import {logit} from "../../src/game/cards.js";
import {startMatch} from "../../src/game/match.js";
import {exportMatch, importMatch} from "../../src/game/snapshot.js";
import {S, idx} from "../../src/game/state.js";

/**
 * `S` is one module-level object, and a Durable Object isolate may hold more than one match at a
 * time, so the server never leaves a match lying in `S` between messages: it loads one, works it,
 * and lifts it back out. These pin both halves of that -- what a snapshot carries, and that loading
 * one leaves nothing of the last behind.
 */

function aMatch(seats = 2, dim = 9): void {
	S.np = seats;
	S.dim = dim;
	S.preset = null;
	S.presetDim = 0;
	startMatch();
}

describe("lifting a match out of the game and back in", () => {
	it("carries the board, the fighters and their hands", () => {
		aMatch();
		S.board[idx(3, 3)]!.t = "lava";
		S.players[1]!.hp = 17;
		const snap = exportMatch();

		S.players = [];
		S.board = [];
		importMatch(snap);

		expect(S.board[idx(3, 3)]?.t).toBe("lava");
		expect(S.players[1]?.hp).toBe(17);
		expect(S.players.map((p) => p.hand.length)).toStrictEqual(snap.players.map((p) => p.hand.length));
	});

	it("is plain data, so it survives the wire and the disk unchanged", () => {
		aMatch();

		const snap = exportMatch();

		expect(JSON.parse(JSON.stringify(snap))).toStrictEqual(snap);
	});

	it("leaves the device's own business out of it", () => {
		aMatch();
		S.coins = 4200;
		S.codex = {steam: 1};
		S.theme = "day";

		const wire = JSON.stringify(exportMatch());

		expect(wire).not.toContain("4200");
		expect(wire).not.toContain("steam");
		expect(wire).not.toContain("day");
	});

	/* The replay is the match log with the whole board stapled to every line. Neither belongs on a
	   server that is meant not to know which client it is talking to. */
	it("leaves the replay frames behind", () => {
		aMatch();
		logit("swung at nothing in particular");
		expect(S.frames.length).toBe(1);

		const snap = exportMatch();

		// the log stays, because the game-over screen is written from it; the frames are the log
		// with the whole board stapled to every line, and the server has no use for that
		expect(Object.keys(snap)).not.toContain("frames");
		expect(snap.log.map((line) => line.t)).toStrictEqual(["swung at nothing in particular"]);
	});

	it("clears what the last match left in the game before loading the next", () => {
		aMatch();
		const snap = exportMatch();
		S.frames.push({r: 9, who: "ghost", c: "#fff", t: "haunting", say: false, turn: 0, board: [], players: []});
		S.look = 12;
		S.imode = true;
		S.fx.push([3, "bloom"]);

		importMatch(snap);

		expect([S.frames, S.look, S.imode, S.fx]).toStrictEqual([[], null, false, []]);
	});

	it("keeps two matches out of each other's way in one isolate", () => {
		aMatch(2, 9);
		S.players[0]!.name = "First";
		const first = exportMatch();
		aMatch(3, 7);
		S.players[0]!.name = "Second";
		const second = exportMatch();

		importMatch(first);
		expect([S.players[0]?.name, S.dim, S.players.length]).toStrictEqual(["First", 9, 2]);

		importMatch(second);
		expect([S.players[0]?.name, S.dim, S.players.length]).toStrictEqual(["Second", 7, 3]);
	});
});
