// @vitest-environment jsdom
import {describe, it, expect, beforeEach, vi} from "vitest";
import {act, fireEvent, render as paint, screen} from "@testing-library/react";
import {mvOwnedMask} from "../../src/game/lookups.js";
import {startMatch} from "../../src/game/match.js";
import {render} from "../../src/game/render.js";
import {S} from "../../src/game/state.js";
import {MatchScreen} from "../../src/ui/MatchScreen.js";

/**
 * A real match, drawn by the real renderer, painted by the real React tree. Every other test does
 * one half of that: the panel tests drive the game and read the view it published, and the tests
 * under tests/ui paint a view made up by hand. Neither would notice a view the game still publishes
 * and the screen no longer paints, or a screen reaching for a field the game stopped filling in.
 */

/** Stands in for the Claude-artifact `window.storage` that public/storage-shim.js provides. */
vi.stubGlobal("storage", {
	get: async () => Promise.resolve(null),
	set: async () => Promise.resolve(),
	delete: async () => Promise.resolve(),
});

/* The entry module is what hands the rules the drawing they call for, so a screen only goes up and
   comes down for real once it has loaded. It reads the save on the way in, hence the stub above. */
await (
	await import("../../src/game/game.js")
).boot;

const FIRE = 9001;
const DAGGER = 9002;
const WATER = 9003;

/** The middle of a nine-wide board, where the seat whose turn it is stands in every test below. */
const MIDDLE = 40;

/**
 * A two-seat match on bare ground, with the hand written out rather than dealt. A real deal is
 * random and a real opening stands both fighters in a corner, and neither would let the assertions
 * below name what they are looking at.
 */
function knownPosition(): void {
	S.np = 2;
	S.dim = 9;
	S.priv = false; // hands open, which is also what keeps the handoff curtain out of the way
	S.chaos = false;
	S.smash = false;
	S.paint = false;
	S.preset = null;
	S.presetDim = 0;
	S.munlocked = ["jump", "dash"];
	S.mv = S.mv.map(() => mvOwnedMask());
	startMatch();
	const [mine, theirs] = S.players;
	mine!.x = 4;
	mine!.y = 4;
	mine!.nrg = 9;
	mine!.cap = 9;
	mine!.held = null;
	mine!.hand = [
		{uid: FIRE, k: "el", id: "fire"},
		{uid: DAGGER, k: "w", ids: ["dagger"], els: []},
		{uid: WATER, k: "el", id: "water"},
	];
	theirs!.x = 6;
	theirs!.y = 4;
	theirs!.hand = [{uid: 8001, k: "el", id: "water"}];
}

/** The whole match screen, painted from what the game has just published. */
function arena(): HTMLElement {
	const {container} = paint(<MatchScreen />);
	act(() => {
		render();
	});
	return container;
}

function tiles(container: HTMLElement): HTMLElement[] {
	return [...container.querySelectorAll<HTMLElement>("#board .tile")];
}

/** Which squares a mark has landed on, which is how the tests below name a part of the board. */
function marked(container: HTMLElement, mark: string): number[] {
	return tiles(container).flatMap((tile, i) => (tile.classList.contains(mark) ? [i] : []));
}

/** Every fighter drawn on the board, by the square they are standing on. */
function fighters(container: HTMLElement): [number, string][] {
	return tiles(container).flatMap((tile, i) =>
		[...tile.querySelectorAll("i")].map((who): [number, string] => [i, who.className]),
	);
}

function hand(container: HTMLElement): HTMLElement[] {
	return [...container.querySelectorAll<HTMLElement>(".hcard")];
}

describe("a match played on the screen it is published to", () => {
	beforeEach(() => {
		knownPosition();
	});

	it("says whose turn it is, which round it is, and what there is to spend on it", () => {
		const container = arena();

		expect(container.querySelector(".turnchip b")?.textContent).toBe("Vermilion");
		expect(container.querySelector(".roundchip")?.textContent).toBe("ROUND 1  ·  9/9 ENERGY");
	});

	it("draws a square for every cell, with each fighter standing on their own", () => {
		const container = arena();

		expect(tiles(container).length).toBe(S.dim * S.dim);
		expect(fighters(container)).toStrictEqual([
			[MIDDLE, "mage p0 active"],
			[MIDDLE + 2, "mage p1"],
		]);
	});

	it("lights every square this turn's energy could step onto", () => {
		const container = arena();

		expect(marked(container, "step")).toStrictEqual([30, 31, 32, 39, 41, 48, 49, 50]);
	});

	it("reads everybody in the match out down the left", () => {
		const container = arena();

		expect(
			[...container.querySelectorAll(".pcard")].map((row) => [
				row.querySelector(".nm")?.textContent,
				row.querySelector(".hpn")?.textContent,
				row.querySelector(".wp")?.textContent,
			]),
		).toStrictEqual([
			["Vermilion", "60", "unarmed · 3 in hand"],
			["Cyan", "60", "unarmed · 1 in hand"],
		]);
	});

	it("lays this seat's hand out in the order it is held in", () => {
		const container = arena();

		expect(
			hand(container).map((card) => [
				card.querySelector(".ck")?.textContent,
				card.querySelector(".cn")?.textContent,
			]),
		).toStrictEqual([
			["ELEMENT · 1", "Fire"],
			["WEAPON · 2", "Dagger"],
			["ELEMENT · 3", "Water"],
		]);
	});

	it("rails the footwork this fighter was given, priced and counted", () => {
		const container = arena();

		expect([...container.querySelectorAll(".side.right .act")].map((move) => move.textContent)).toStrictEqual([
			"Jump · 1 x3",
			"Dash · 1 x3",
		]);
	});

	it("says what the bar is waiting for while nothing has been picked up", () => {
		const container = arena();

		expect(container.querySelector(".actbar")?.textContent).toBe("Click a card, or step onto a highlighted tile.");
	});

	it("picks a card up out of the hand and offers what can be done with it", () => {
		const container = arena();

		fireEvent.click(hand(container)[0]!);

		expect(hand(container)[0]?.getAttribute("aria-pressed")).toBe("true");
		expect([...container.querySelectorAll(".actbar .act")].map((button) => button.textContent)).toStrictEqual([
			"Lay on a tile · 2",
			"Merge · 2",
		]);
	});

	it("puts the weapon panel up once the weapon is taken in hand", () => {
		const container = arena();
		expect(container.querySelector(".boardcol .wep .wn")?.textContent).toBe("Empty hands");

		fireEvent.click(hand(container)[1]!);

		expect(container.querySelector(".boardcol .wep .wn")?.textContent).toBe("Dagger");
		expect(container.querySelector(".boardcol .wep .wd")?.textContent).toBe("5 x 2 damage");
	});

	it("aims a picked card at the board, and lights every square it could be laid on", () => {
		const container = arena();
		fireEvent.click(hand(container)[0]!);

		fireEvent.click(screen.getByRole("button", {name: "Lay on a tile · 2"}));

		expect(container.querySelector(".actbar .hint")?.textContent).toBe("Pick a tile within 4. Esc to cancel.");
		expect(marked(container, "aim").length).toBe(S.dim * S.dim - 1); // everywhere but the square underfoot
	});

	it("lays the card on the square that is clicked, and takes it out of the hand", () => {
		const container = arena();
		fireEvent.click(hand(container)[0]!);
		fireEvent.click(screen.getByRole("button", {name: "Lay on a tile · 2"}));

		fireEvent.click(tiles(container)[MIDDLE - S.dim]!);

		// the ground blooms where it was laid, which is the animation the move handed over with the view
		const laid = tiles(container)[MIDDLE - S.dim];
		expect(laid?.className).toBe("tile terr step bloom");
		expect(laid?.getAttribute("title")).toBe("Fire: End your turn here and take 10");
		expect(hand(container).map((card) => card.querySelector(".cn")?.textContent)).toStrictEqual([
			"Dagger",
			"Water",
		]);
		expect(container.querySelector(".roundchip")?.textContent).toBe("ROUND 1  ·  7/9 ENERGY");
	});

	it("steps onto a neighbouring square and pays for it out of this turn's energy", () => {
		const container = arena();

		fireEvent.click(tiles(container)[MIDDLE + 1]!);

		expect(fighters(container)).toStrictEqual([
			[MIDDLE + 1, "mage p0 active"],
			[MIDDLE + 2, "mage p1"],
		]);
		expect(container.querySelector(".roundchip")?.textContent).toBe("ROUND 1  ·  8/9 ENERGY");
	});

	it("hands the arena to the next seat when the turn is ended", () => {
		const container = arena();

		fireEvent.click(screen.getByRole("button", {name: /End turn/}));

		expect(container.querySelector(".turnchip b")?.textContent).toBe("Cyan");
		expect(container.querySelector(".roundchip")?.textContent).toBe("ROUND 1  ·  2/2 ENERGY");
	});
});
