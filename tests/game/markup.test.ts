import {describe, it, expect, beforeAll, afterAll} from "vitest";
import {loadGame, type GameHarness} from "./harness.js";

/** Containers the game paints into without first checking that they exist. */
const REQUIRED = [
	"menu",
	"game",
	"endbtn",
	"tglyph",
	"tname",
	"tround",
	"board",
	"moves",
	"wep",
	"actbar",
	"roster",
	"hand",
	"chatlog",
	"chatin",
	"chatgo",
	"tileinfo",
	"inspectbtn",
	"names",
	"whochips",
	"whonote",
] as const;

describe("static markup", () => {
	let h: GameHarness;

	beforeAll(async () => {
		h = await loadGame();
	});

	afterAll(() => {
		h.close();
	});

	it("carries every container the game paints into unguarded", () => {
		const missing = REQUIRED.filter((id) => h.document.getElementById(id) === null);

		expect(missing).toStrictEqual([]);
	});

	it("uses each id exactly once", () => {
		const seen = new Map<string, number>();
		for (const el of h.document.querySelectorAll("[id]")) {
			seen.set(el.id, (seen.get(el.id) ?? 0) + 1);
		}
		const duplicated = [...seen.entries()].filter(([, count]) => count > 1).map(([id]) => id);

		expect(duplicated).toStrictEqual([]);
	});

	it("opens on the menu with the game screen hidden", () => {
		expect(h.game.S.screen).toBe("menu");
		expect(h.document.getElementById("game")?.classList.contains("on")).toBe(false);
	});
});
