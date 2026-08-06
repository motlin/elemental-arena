import {readFileSync} from "node:fs";
import path from "node:path";
import {describe, it, expect} from "vitest";
import {
	ARENA_BOARD_MAX,
	ARENA_CELL_MAX,
	ARENA_CELL_MIN,
	ARENA_GAP,
	ARENA_STACK_AT,
	GAME_PAD,
	SIDE_MAX,
	SIDE_MIN,
	SIDE_VW,
	arenaBoardRoom,
	boardCell,
	boardWidth,
} from "../../src/game/board.js";

/** The grid sizes the setup screen offers, plus the interesting sizes in between. */
const DIMS = [5, 7, 9, 13, 17, 21, 25] as const;

/** Phone, phablet, the 560px stacking breakpoint on both sides, tablet, laptop, desktop. */
const WIDTHS = [320, 390, 480, 560, 561, 640, 700, 800, 900, 1024, 1280, 1497, 1920] as const;

/** The stylesheet the board maths is derived from, read off disk so both sides can be pinned. */
const css = readFileSync(path.join(import.meta.dirname, "..", "..", "src", "styles", "arena.css"), "utf8");

describe("arena board geometry", () => {
	/**
	 * Measured in Chrome against the running dev server: a 9x9 board at 46px tiles is 448px wide,
	 * a 25x25 at 23px is 641px, and the same board at the 15px floor is 441px.
	 */
	it("reports the outer width Chrome actually lays out", () => {
		expect([boardWidth(9, 46), boardWidth(25, 23), boardWidth(25, 15)]).toStrictEqual([448, 641, 441]);
	});

	/**
	 * Measured in Chrome: at a 685px document the board column is 329px, and at 1497px it is 1017px.
	 */
	it("reports the room the three-column arena leaves the board", () => {
		expect([arenaBoardRoom(685), arenaBoardRoom(1497)]).toStrictEqual([329, 1017]);
	});

	it("keeps the board inside its column at every width and grid size", () => {
		const spills: string[] = [];
		for (const w of WIDTHS) {
			const room = Math.min(arenaBoardRoom(w), ARENA_BOARD_MAX);
			for (const dim of DIMS) {
				const cell = boardCell(dim, room, ARENA_CELL_MIN, ARENA_CELL_MAX);
				// The legibility floor is allowed to win; .boardscroll scrolls those boards instead.
				if (cell === ARENA_CELL_MIN) continue;
				const width = boardWidth(dim, cell);
				if (width > room) spills.push(`${w}px viewport, ${dim}x${dim}: board ${width}px in ${room}px`);
			}
		}

		expect(spills).toStrictEqual([]);
	});

	it("never picks a tile below the legibility floor", () => {
		const cells = WIDTHS.flatMap((w) =>
			DIMS.map((dim) =>
				boardCell(dim, Math.min(arenaBoardRoom(w), ARENA_BOARD_MAX), ARENA_CELL_MIN, ARENA_CELL_MAX),
			),
		);

		expect(cells.filter((c) => c < ARENA_CELL_MIN)).toStrictEqual([]);
	});
});

describe("arena layout constants", () => {
	/** The sizing maths only works while these mirror the stylesheet, so pin both sides together. */
	it("mirrors the stylesheet the board maths is derived from", () => {
		expect({
			gamePad: css.includes("#game {\n\tpadding: 14px;"),
			arenaGap: css.includes(".arena {\n\tdisplay: flex;\n\tgap: 14px;"),
			sideWidth: css.includes("width: clamp(150px, 17vw, 212px);"),
			stackAt: css.includes("@media (max-width: 560px) {"),
			boardScroll: css.includes(".boardscroll {"),
		}).toStrictEqual({
			gamePad: true,
			arenaGap: true,
			sideWidth: true,
			stackAt: true,
			boardScroll: true,
		});
	});

	/**
	 * Stacked, .boardcol is a cross-axis-centred flex item, so it sizes to the board unless it is
	 * told to fill the row -- and a .boardscroll capped at 100% of that never constrains anything.
	 */
	it("makes the board column fill the row once the arena stacks", () => {
		const stacked = /@media \(max-width: 560px\) \{([\s\S]*?)\n\}\n/.exec(css)?.[1] ?? "";
		const boardcol = /\.boardcol \{([^}]*)\}/.exec(stacked)?.[1] ?? "";

		expect(boardcol).toContain("width: 100%;");
	});

	it("derives its constants from those stylesheet values", () => {
		expect({
			gamePad: GAME_PAD,
			arenaGap: ARENA_GAP,
			sideMin: SIDE_MIN,
			sideMax: SIDE_MAX,
			sideVw: SIDE_VW,
			stackAt: ARENA_STACK_AT,
		}).toStrictEqual({
			gamePad: 14,
			arenaGap: 14,
			sideMin: 150,
			sideMax: 212,
			sideVw: 0.17,
			stackAt: 560,
		});
	});
});
