import {describe, expect, it} from "vitest";
import {clickCard, mixPartners, spoiled} from "../../src/game/cards.js";
import {FOOD, FOOD_EVERY} from "../../src/game/data/index.js";
import {endTurn, startMatch} from "../../src/game/match.js";
import {S} from "../../src/game/state.js";
import type {FoodCard, Player} from "../../src/game/types.js";

/**
 * Food: eaten once, gone for good. Fresh, it is a shot of energy for this turn only; left too long
 * it spoils, and eating it then costs life and gives back less.
 */

function twoSeats(): Player {
	S.np = 2;
	S.dim = 9;
	S.preset = null;
	S.presetDim = 0;
	S.chaos = false;
	startMatch();
	S.handoff = false;
	S.toss = false;
	S.phase = "act";
	return S.players[0]!;
}

function bread(born: number, uid = 500): FoodCard {
	return {uid, k: "f", id: "bread", born};
}

describe("eating food", () => {
	it("gives its energy at once and leaves the hand", () => {
		const p = twoSeats();
		p.hand = [bread(S.round)];
		const nrg = p.nrg,
			hp = p.hp;

		clickCard(500);

		expect(p.hand).toStrictEqual([]);
		expect(p.nrg).toBe(nrg + FOOD["bread"]!.nrg);
		expect(p.hp).toBe(hp);
		expect(S.log.at(-1)?.t).toBe("ate Bread for 3 energy");
	});

	it("raises the cap so the extra energy is drawn, never clipped", () => {
		const p = twoSeats();
		p.hand = [bread(S.round)];

		clickCard(500);

		expect(p.cap).toBeGreaterThanOrEqual(p.nrg);
	});

	it("spoils once it has been held past its keep", () => {
		expect(spoiled(bread(1), 1 + FOOD["bread"]!.keep - 1)).toBe(false);
		expect(spoiled(bread(1), 1 + FOOD["bread"]!.keep)).toBe(true);
	});

	it("costs life and gives less once spoiled", () => {
		const p = twoSeats();
		S.round = 1 + FOOD["bread"]!.keep;
		p.hand = [bread(1)];
		const nrg = p.nrg,
			hp = p.hp;

		clickCard(500);

		expect(p.hand).toStrictEqual([]);
		expect(p.hp).toBe(hp - FOOD["bread"]!.rot);
		expect(p.nrg).toBe(nrg + Math.ceil(FOOD["bread"]!.nrg / 2));
		expect(S.log.at(-1)?.t).toBe("ate spoiled Bread, losing 3 life for 2 energy");
	});

	it("does not carry its energy into the next turn", () => {
		const p = twoSeats();
		p.hand = [bread(S.round)];
		p.nrg = 1;

		clickCard(500);
		endTurn();

		expect(p.bank).toBe(1);
	});

	it("banks nothing when the turn spent past what the food gave", () => {
		const p = twoSeats();
		p.hand = [bread(S.round)];
		p.nrg = 4;

		clickCard(500);
		p.nrg = 2;
		endTurn();

		expect(p.bank).toBe(0);
	});

	it("never merges with anything", () => {
		const p = twoSeats();
		p.hand = [bread(S.round), {uid: 501, k: "el", id: "fire"}, {uid: 502, k: "w", ids: ["dagger"], els: []}];

		expect(mixPartners(p, p.hand[0])).toStrictEqual([]);
		expect(mixPartners(p, p.hand[1]).map((c) => c.uid)).toStrictEqual([502]);
		expect(mixPartners(p, p.hand[2]).map((c) => c.uid)).toStrictEqual([501]);
	});
});

describe("dealing food", () => {
	it("hands out one plate on every third round, stamped with the round it arrived", () => {
		twoSeats();
		for (let round = 1; round < FOOD_EVERY; round++) {
			endTurn();
			endTurn();
		}
		expect(S.round).toBe(FOOD_EVERY);
		const food = S.players[0]!.hand.filter((c) => c.k === "f");

		expect(food).toHaveLength(1);
		expect(food[0]!.born).toBe(FOOD_EVERY);
		expect(FOOD[food[0]!.id]).toBeDefined();
	});

	it("deals none on the opening round", () => {
		const p = twoSeats();

		expect(p.hand.some((c) => c.k === "f")).toBe(false);
	});
});
