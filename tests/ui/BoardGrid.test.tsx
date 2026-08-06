// @vitest-environment jsdom
import {describe, it, expect} from "vitest";
import {act, render} from "@testing-library/react";
import {BoardGrid} from "../../src/ui/BoardGrid.js";
import type {BoardView} from "../../src/game/bridge.js";
import {
	ARENA_BOARD_MAX,
	ARENA_CELL_MAX,
	ARENA_CELL_MIN,
	arenaBoardRoom,
	boardCell,
	viewportWidth,
} from "../../src/game/board.js";
import {SAMPLE_DIM, sampleBoard, sampleFighter, sampleTile} from "../../src/ui/matchSample.js";

/** A board of nothing but the squares handed in, laid out from index 0. */
function boardOf(tiles: BoardView["tiles"], patch: Partial<BoardView> = {}): BoardView {
	return {dim: 2, tiles, click: () => undefined, fx: [], ...patch};
}

const squares = (container: HTMLElement): HTMLElement[] => [...container.querySelectorAll<HTMLElement>(".tile")];

describe("BoardGrid", () => {
	it("scrolls the board rather than letting it onto the side panels", () => {
		const {container} = render(<BoardGrid view={sampleBoard()} />);
		const board = container.querySelector("#board");

		expect(board?.parentElement?.className).toBe("boardscroll");
	});

	it("lays one square per tile in the order the game published them", () => {
		const {container} = render(<BoardGrid view={sampleBoard()} />);

		expect(squares(container).length).toBe(SAMPLE_DIM * SAMPLE_DIM);
	});

	// jsdom's CSSOM drops grid-template-columns, so only the tile size it is measured in survives here.
	it("sizes the tiles with the helpers the layout test pins to the stylesheet", () => {
		const {container} = render(<BoardGrid view={sampleBoard()} />);
		const cell = container.querySelector<HTMLElement>("#board")?.style.getPropertyValue("--cell");

		expect(cell).toBe(
			`${boardCell(SAMPLE_DIM, Math.min(arenaBoardRoom(viewportWidth()), ARENA_BOARD_MAX), ARENA_CELL_MIN, ARENA_CELL_MAX)}px`,
		);
	});

	it("leaves a bare square bare and dresses one carrying ground", () => {
		const view = boardOf([
			sampleTile(),
			sampleTile({colour: "#ff5a2b", shadow: "rgba(255,90,43,0.44)", terrain: true, title: "Lava: it burns"}),
		]);
		const {container} = render(<BoardGrid view={view} />);
		const [bare, ground] = squares(container);

		expect([bare?.className, bare?.getAttribute("style"), bare?.title]).toStrictEqual(["tile", null, ""]);
		expect([ground?.className, ground?.getAttribute("style"), ground?.title]).toStrictEqual([
			"tile terr",
			"--tc: #ff5a2b; --tcs: rgba(255,90,43,0.44);",
			"Lava: it burns",
		]);
	});

	it("tells a square that can be reached from one that is sure to land", () => {
		const view = boardOf([sampleTile({aim: "aim"}), sampleTile({aim: "aimsure"})]);
		const {container} = render(<BoardGrid view={view} />);

		expect(squares(container).map((tile) => tile.className)).toStrictEqual(["tile aim", "tile aimsure"]);
	});

	it("carries every flag the ground and the move being aimed can raise", () => {
		const view = boardOf([
			sampleTile({
				terrain: true,
				solid: true,
				dead: true,
				gone: true,
				step: true,
				warn: true,
				litsq: true,
				look: true,
				reach: "linear-gradient(#fff,#fff)",
			}),
		]);
		const {container} = render(<BoardGrid view={view} />);
		const [tile] = squares(container);

		expect(tile?.className).toBe("tile terr solid gonezone void step warn litsq look reach");
		expect(tile?.style.backgroundImage).toBe("linear-gradient(rgb(255, 255, 255), rgb(255, 255, 255))");
	});

	it("stands one fighter square on and shoulders two together", () => {
		const view = boardOf([
			sampleTile({occupants: [sampleFighter(0, "#ff4d8d", {active: true})]}),
			sampleTile({
				occupants: [
					sampleFighter(1, "#4dd8ff", {inset: "8% 34% 34% 8%", z: 1}),
					sampleFighter(3, "#c98cff", {lit: true, inset: "34% 8% 8% 34%", z: 2}),
				],
			}),
		]);
		const {container} = render(<BoardGrid view={view} />);
		const glyphs = [...container.querySelectorAll<HTMLElement>(".mage")];

		expect(glyphs.map((glyph) => glyph.className)).toStrictEqual(["mage p0 active", "mage p1", "mage p3 litp"]);
		expect(glyphs.map((glyph) => glyph.getAttribute("style"))).toStrictEqual([
			"--pc: #ff4d8d;",
			"--pc: #4dd8ff; inset: 8% 34% 34% 8%; z-index: 1;",
			"--pc: #c98cff; inset: 34% 8% 8% 34%; z-index: 2;",
		]);
	});

	it("letters a whirlpool and badges a square too crowded to read", () => {
		const view = boardOf([
			sampleTile({whirl: "B"}),
			sampleTile({
				stack: 3,
				occupants: [sampleFighter(0, "#ff4d8d"), sampleFighter(1, "#4dd8ff"), sampleFighter(2, "#9ef0dc")],
			}),
		]);
		const {container} = render(<BoardGrid view={view} />);

		expect(container.querySelector(".wnum")?.textContent).toBe("B");
		expect(container.querySelector(".stackn")?.textContent).toBe("3");
	});

	it("names the square a click landed on by where it sits on the board", () => {
		const clicks: number[][] = [];
		const view = boardOf(
			Array.from({length: 9}, () => sampleTile()),
			{
				dim: 3,
				click: (x, y) => {
					clicks.push([x, y]);
				},
			},
		);
		const {container} = render(<BoardGrid view={view} />);

		act(() => {
			squares(container)[5]?.click();
		});

		expect(clicks).toStrictEqual([[2, 1]]);
	});

	it("restarts an animation the game asked to replay", () => {
		const view = boardOf([sampleTile(), sampleTile()], {fx: [{index: 1, animation: "struck"}]});
		const {container} = render(<BoardGrid view={view} />);

		expect(squares(container).map((tile) => tile.className)).toStrictEqual(["tile", "tile struck"]);
	});
});
