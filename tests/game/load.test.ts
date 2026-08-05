import {describe, it, expect, beforeAll, afterAll} from "vitest";
import {loadGame, readIndexHtml, extractGameScript, topLevelNames, type GameHarness} from "./harness.js";

describe("game script boot", () => {
	let h: GameHarness;

	beforeAll(async () => {
		h = await loadGame();
	});

	afterAll(() => {
		h.close();
	});

	it("runs top to bottom without throwing", () => {
		expect(h.errors).toStrictEqual([]);
	});

	it("builds the state object from the constants above it", () => {
		expect(h.game.S.dim).toBe(9);
		expect([...h.game.S.unlocked]).toStrictEqual(["fire", "water", "earth"]);
	});

	it("reports no load error", () => {
		expect(h.game.S.loadErr).toBeNull();
	});
});

describe("saved progress", () => {
	it("restores what a previous session unlocked", async () => {
		const h = await loadGame({
			storage: {
				"arena:v3": JSON.stringify({v: 2, coins: 725, unlocked: ["air"], munlocked: ["jump"], theme: "day"}),
			},
		});

		try {
			expect(h.game.S.loadErr).toBeNull();
			expect(h.game.S.coins).toBe(725);
			expect([...h.game.S.unlocked]).toStrictEqual(["fire", "water", "earth", "air"]);
			expect([...h.game.S.munlocked]).toStrictEqual(["jump"]);
			expect(h.document.documentElement.dataset["theme"]).toBe("day");
		} finally {
			h.close();
		}
	});

	it("reports a save it cannot parse instead of dying", async () => {
		const h = await loadGame({storage: {"arena:v3": "{not json"}});

		try {
			expect(h.game.S.loadErr).not.toBeNull();
			expect([...h.game.S.unlocked]).toStrictEqual(["fire", "water", "earth"]);
		} finally {
			h.close();
		}
	});
});

describe("script extraction", () => {
	let names: string[];

	beforeAll(() => {
		names = topLevelNames(extractGameScript(readIndexHtml()));
	});

	it("finds the rules the script still declares itself", () => {
		expect(names).toContain("S");
		expect(names).toContain("startMatch");
		expect(names).toContain("render");
	});

	it("leaves the data tables to the modules under src/game/data", () => {
		expect(names).not.toContain("EL");
		expect(names).not.toContain("W");
	});

	it("hands the imported tables to the tests all the same", async () => {
		const h = await loadGame();

		try {
			expect({el: h.game.EL["fire"]?.n, weapon: h.game.W["dagger"]?.n}).toStrictEqual({
				el: "Fire",
				weapon: "Dagger",
			});
		} finally {
			h.close();
		}
	});
});
