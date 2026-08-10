// @vitest-environment jsdom
import {beforeEach, describe, expect, it} from "vitest";
import {clickCard, doPlace, logit, startMix} from "../../src/game/cards.js";
import {matchStore, type MatchView} from "../../src/game/bridge.js";
import {startMatch} from "../../src/game/match.js";
import {tryStep} from "../../src/game/movement.js";
import {render} from "../../src/game/render.js";
import {S, idx} from "../../src/game/state.js";
import {canUndo, clearUndo, pushUndo, undo} from "../../src/game/undo.js";

function activeMatch(): void {
	S.np = 2;
	S.dim = 9;
	S.preset = null;
	S.presetDim = 0;
	startMatch();
	S.handoff = false;
	S.toss = false;
	S.phase = "act";
	S.players[0]!.x = 4;
	S.players[0]!.y = 4;
	S.players[0]!.nrg = 100;
	S.players[1]!.x = 1;
	S.players[1]!.y = 1;
	clearUndo();
}

function published(): MatchView {
	render();
	const view = matchStore.get();
	expect(view).not.toBeNull();
	return view!;
}

beforeEach(activeMatch);

describe("undoing arena actions", () => {
	it("puts a stepped fighter back, refunds the energy, and truncates the log", () => {
		const player = S.players[0]!;

		tryStep(5, 4);
		expect([player.x, player.y, player.nrg, S.log.length]).toStrictEqual([5, 4, 99, 1]);

		undo();

		expect([S.players[0]!.x, S.players[0]!.y, S.players[0]!.nrg, S.log.length]).toStrictEqual([4, 4, 100, 0]);
		expect(published().board.tiles[idx(4, 4)]!.occupants.map((occupant) => occupant.seat)).toStrictEqual([0]);
	});

	it("unwinds several moves newest-first", () => {
		tryStep(5, 4);
		tryStep(6, 4);

		undo();
		expect([S.players[0]!.x, S.players[0]!.y, canUndo()]).toStrictEqual([5, 4, true]);

		undo();
		expect([S.players[0]!.x, S.players[0]!.y, canUndo()]).toStrictEqual([4, 4, false]);
	});

	it("refuses to grow past 20 entries", () => {
		const player = S.players[0]!;
		player.x = 0;
		for (let step = 0; step < 21; step++) {
			pushUndo();
			player.x = step + 1;
		}

		for (let step = 0; step < 20; step++) undo();

		expect([S.players[0]!.x, canUndo()]).toStrictEqual([1, false]);
	});

	it("restores both cards and the uid after merging an already-known fusion", () => {
		const player = S.players[0]!;
		player.hand = [
			{uid: 10, k: "el", id: "fire"},
			{uid: 20, k: "el", id: "water"},
		];
		player.nrg = 10;
		S.uid = 100;
		S.codex = {steam: 1};
		S.coins = 1000;

		startMix(10);
		clickCard(20);
		expect(player.hand).toStrictEqual([{uid: 100, k: "el", id: "steam"}]);

		undo();

		expect({hand: S.players[0]!.hand, uid: S.uid, codex: S.codex, coins: S.coins}).toStrictEqual({
			hand: [
				{uid: 10, k: "el", id: "fire"},
				{uid: 20, k: "el", id: "water"},
			],
			uid: 100,
			codex: {steam: 1},
			coins: 1000,
		});
	});

	it("restores a placed-on cell, its owner, and the replay length", () => {
		const player = S.players[0]!;
		player.hand = [
			{uid: 10, k: "el", id: "fire"},
			{uid: 20, k: "el", id: "water"},
		];
		S.sel = 10;
		const target = S.board[idx(5, 4)]!;
		target.by = 1;
		logit("before placement");
		const before = {...target};
		const framesLength = S.frames.length;

		doPlace(5, 4);
		expect([target.t, target.by, S.frames.length]).toStrictEqual(["lava", 0, framesLength + 1]);

		undo();

		expect({cell: S.board[idx(5, 4)], framesLength: S.frames.length}).toStrictEqual({
			cell: before,
			framesLength,
		});
		expect(published().board.tiles[idx(5, 4)]!.terrain).toBe(false);
	});
});
