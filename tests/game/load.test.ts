// @vitest-environment jsdom
import {readFileSync, readdirSync} from "node:fs";
import path from "node:path";
import {describe, it, expect, vi} from "vitest";

const repoRoot = path.join(import.meta.dirname, "..", "..");
const gameDir = path.join(repoRoot, "src", "game");

/** One of the game's modules by file name, for the checks that read the code rather than run it. */
function readGameModule(name: string): string {
	return readFileSync(path.join(gameDir, name), "utf8");
}

/** The names of the modules src/game/game.ts pulls together, in no particular order. */
function gameModules(): string[] {
	return readdirSync(gameDir).filter((name) => name.endsWith(".ts"));
}

/** Stands in for the Claude-artifact `window.storage` that public/storage-shim.js provides. */
function installStorage(seed: Record<string, string>): void {
	const cells = new Map<string, string>(Object.entries(seed));
	vi.stubGlobal("storage", {
		get: async (key: string) => Promise.resolve(cells.has(key) ? {key, value: cells.get(key)!} : null),
		set: async (key: string, value: string) => Promise.resolve(cells.set(key, value)).then(() => undefined),
		delete: async (key: string) => Promise.resolve(cells.delete(key)).then(() => undefined),
	});
}

/**
 * A fresh copy of the game, booted against `seed`. The entry module reads the save while it loads,
 * so the storage has to be in place before it is imported, and `resetModules` is what makes the
 * next load read it again rather than hand back the copy the last one left behind.
 */
async function bootGame(seed: Record<string, string> = {}): Promise<typeof import("../../src/game/game.js")> {
	installStorage(seed);
	vi.resetModules();
	const game = await import("../../src/game/game.js");
	await game.boot;
	return game;
}

describe("game script boot", () => {
	it("builds the state object from the constants above it", async () => {
		const {S} = await bootGame();

		expect(S.dim).toBe(9);
		expect([...S.unlocked]).toStrictEqual(["fire", "water", "earth"]);
	});

	it("reports no load error", async () => {
		const {S} = await bootGame();

		expect(S.loadErr).toBeNull();
	});
});

describe("saved progress", () => {
	it("restores what a previous session unlocked", async () => {
		const {S} = await bootGame({
			"arena:v3": JSON.stringify({v: 2, coins: 725, unlocked: ["air"], munlocked: ["jump"], theme: "day"}),
		});

		expect(S.loadErr).toBeNull();
		expect(S.coins).toBe(725);
		expect([...S.unlocked]).toStrictEqual(["fire", "water", "earth", "air"]);
		expect([...S.munlocked]).toStrictEqual(["jump"]);
		expect(document.documentElement.dataset["theme"]).toBe("day");
	});

	it("reports a save it cannot parse instead of dying", async () => {
		const {S} = await bootGame({"arena:v3": "{not json"});

		expect(S.loadErr).not.toBeNull();
		expect([...S.unlocked]).toStrictEqual(["fire", "water", "earth"]);
	});
});

describe("the game module", () => {
	it("is what index.html loads, alongside React, with nothing left inline", () => {
		const html = readFileSync(path.join(repoRoot, "index.html"), "utf8");

		expect([...html.matchAll(/<script type="module" src="([^"]+)"><\/script>/g)].map((m) => m[1])).toStrictEqual([
			"/src/main.tsx",
			"/src/game/game.ts",
		]);
		expect(html).not.toContain('<script type="module">');
	});

	it("keeps the state, the match and the drawing in modules of their own", () => {
		const where = {
			state: readGameModule("state.ts").includes("export const S: GameState = {"),
			match: readGameModule("match.ts").includes("export function startMatch(): void {"),
			render: readGameModule("hotseat.ts").includes("export function render(): void {"),
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
		const screens = ["board", "hotseat", "input", "lobby", "menu", "online", "render"];
		const rules = gameModules().filter((name) => !screens.includes(name.replace(".ts", "")) && name !== "game.ts");

		const reaching = rules.filter((name) =>
			screens.some((screen) => readGameModule(name).includes(`from "./${screen}.js"`)),
		);

		expect(reaching).toStrictEqual([]);
	});
});
