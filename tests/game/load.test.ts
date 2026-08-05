import {describe, it, expect, beforeAll, afterAll} from "vitest";
import {gameModules, loadGame, readGameModule, readIndexHtml, type GameHarness} from "./harness.js";

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

describe("the game module", () => {
	it("is what index.html loads, with nothing left inline", () => {
		const html = readIndexHtml();

		expect(html).toContain('<script type="module" src="/src/game/game.ts"></script>');
		expect(html).not.toContain('<script type="module">');
	});

	it("keeps the state, the match and the drawing in modules of their own", () => {
		const where = {
			state: readGameModule("state.ts").includes("export const S: GameState = {"),
			match: readGameModule("match.ts").includes("export function startMatch(): void {"),
			render: readGameModule("render.ts").includes("export function render(): void {"),
		};

		expect(where).toStrictEqual({state: true, match: true, render: true});
	});

	it("leaves the data tables to the modules under src/game/data", () => {
		expect(readGameModule("lookups.ts")).toContain('} from "./data/index.js";');
	});

	/* The rules run the game and the screens draw it. If a rules module imported a screen the two
	   would import each other, and the load order would decide which half of the game existed
	   first. src/game/view.ts is the seam: the rules call it, and game.ts wires the real drawing in. */
	it("keeps the rules from importing the screens that draw them", () => {
		const screens = ["board", "input", "menu", "render"];
		const rules = gameModules().filter((name) => !screens.includes(name.replace(".ts", "")) && name !== "game.ts");

		const reaching = rules.filter((name) =>
			screens.some((screen) => readGameModule(name).includes(`from "./${screen}.js"`)),
		);

		expect(reaching).toStrictEqual([]);
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
