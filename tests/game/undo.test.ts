// @vitest-environment jsdom
import {beforeEach, describe, expect, it} from "vitest";
import {clickCard, doPlace, doToss, logit, startMix} from "../../src/game/cards.js";
import {matchStore, type MatchView} from "../../src/game/bridge.js";
import {doAttack} from "../../src/game/combat.js";
import {T} from "../../src/game/data/index.js";
import {endTurn, startMatch} from "../../src/game/match.js";
import {doMark, takeCard, tryStep} from "../../src/game/movement.js";
import {render} from "../../src/game/render.js";
import {S, idx} from "../../src/game/state.js";
import type {Player} from "../../src/game/types.js";
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

function lay(x: number, y: number, key: string, by: number | null = null): void {
	const cell = S.board[idx(x, y)]!;
	cell.t = key;
	cell.el = null;
	cell.life = T[key]!.life;
	cell.by = by;
}

function conceal(player: Player, x: number, y: number): void {
	player.x = x;
	player.y = y;
	lay(x, y, "shadow", player.i);
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

	it("commits a merge that discovers a new fusion", () => {
		const player = S.players[0]!;
		player.hand = [
			{uid: 10, k: "el", id: "fire"},
			{uid: 20, k: "el", id: "water"},
		];
		player.nrg = 10;
		S.uid = 100;
		S.codex = {};

		startMix(10);
		clickCard(20);
		undo();

		expect({hand: S.players[0]!.hand, codex: S.codex, canUndo: canUndo()}).toStrictEqual({
			hand: [{uid: 100, k: "el", id: "steam"}],
			codex: {steam: 1},
			canUndo: false,
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

	it("rewinds damage and coins when an attack does not kill", () => {
		const attacker = S.players[0]!,
			victim = S.players[1]!;
		attacker.hand = [{uid: 10, k: "w", ids: ["sword"], els: []}];
		attacker.held = 10;
		victim.x = 5;
		victim.y = 4;
		victim.hp = 30;
		S.coins = 100;
		S.matchCoins = 0;

		doAttack(5, 4);
		expect({hp: victim.hp, coins: S.coins, matchCoins: S.matchCoins, canUndo: canUndo()}).toStrictEqual({
			hp: 20,
			coins: 110,
			matchCoins: 10,
			canUndo: true,
		});

		undo();

		expect({hp: S.players[1]!.hp, coins: S.coins, matchCoins: S.matchCoins}).toStrictEqual({
			hp: 30,
			coins: 100,
			matchCoins: 0,
		});
	});

	it("commits an attack that kills", () => {
		const attacker = S.players[0]!,
			victim = S.players[1]!;
		attacker.hand = [{uid: 10, k: "w", ids: ["sword"], els: []}];
		attacker.held = 10;
		victim.x = 5;
		victim.y = 4;
		victim.hp = 10;

		doAttack(5, 4);

		expect({alive: victim.alive, hp: victim.hp, canUndo: canUndo()}).toStrictEqual({
			alive: false,
			hp: 0,
			canUndo: false,
		});
	});

	it("commits an attack that strikes a hidden fighter", () => {
		const attacker = S.players[0]!,
			victim = S.players[1]!;
		attacker.hand = [{uid: 10, k: "w", ids: ["sword"], els: []}];
		attacker.held = 10;
		conceal(victim, 5, 4);

		doAttack(5, 4);

		expect({hp: victim.hp, canUndo: canUndo()}).toStrictEqual({hp: 50, canUndo: false});
	});

	it("commits marking a rival card", () => {
		const player = S.players[0]!,
			rival = S.players[1]!;
		player.mv = 16384;
		rival.x = 5;
		rival.y = 4;
		rival.hand = [{uid: 10, k: "el", id: "fire"}];

		doMark(5, 4);

		expect({card: rival.hand[0], canUndo: canUndo()}).toStrictEqual({
			card: {uid: 10, k: "el", id: "fire", mark: true},
			canUndo: false,
		});
	});

	it("commits taking a rival card", () => {
		const player = S.players[0]!,
			rival = S.players[1]!;
		player.hand = [];
		rival.hand = [{uid: 10, k: "el", id: "fire"}];

		takeCard(rival, 10);

		expect({hand: player.hand, rivalHand: rival.hand, canUndo: canUndo()}).toStrictEqual({
			hand: [{uid: 10, k: "el", id: "fire", mark: false}],
			rivalHand: [],
			canUndo: false,
		});
	});

	it("clears the stack when the turn ends", () => {
		tryStep(5, 4);
		expect(canUndo()).toBe(true);

		endTurn();

		expect(canUndo()).toBe(false);
	});

	it("commits falling into a hole", () => {
		lay(5, 4, "space");

		tryStep(5, 4);

		expect({alive: S.players[0]!.alive, canUndo: canUndo()}).toStrictEqual({alive: false, canUndo: false});
	});

	it("commits scattering onto random ground", () => {
		lay(5, 4, "rift");

		tryStep(5, 4);

		expect(canUndo()).toBe(false);
	});

	it("commits tossing the last card when rendering refills the hand", () => {
		const player = S.players[0]!;
		player.hand = [{uid: 10, k: "el", id: "fire"}];

		doToss(10);
		expect(canUndo()).toBe(true);
		render();

		expect({handSize: player.hand.length, canUndo: canUndo()}).toStrictEqual({handSize: 5, canUndo: false});
	});

	it("commits stepping onto a rival hiding tile", () => {
		lay(5, 4, "shadow", 1);

		tryStep(5, 4);

		expect({position: [S.players[0]!.x, S.players[0]!.y], canUndo: canUndo()}).toStrictEqual({
			position: [5, 4],
			canUndo: false,
		});
	});

	it("commits the stack when rendering after cover is wiped from a hidden fighter", () => {
		const victim = S.players[1]!;
		conceal(victim, 5, 4);
		pushUndo();

		lay(5, 4, "lava");
		render();

		expect(canUndo()).toBe(false);
	});
});
