// @vitest-environment jsdom
import {describe, it, expect, afterEach, vi} from "vitest";
import {act, fireEvent, render, screen} from "@testing-library/react";
import {ArenaDesigner} from "../../src/ui/ArenaDesigner.js";
import {designStore, type DesignView} from "../../src/game/bridge.js";

const DIM = 5;

/** Two seats on opposite corners of the spawn ring, which is what a two-hander gets. */
const SPAWNS = [
	{index: 6, name: "Vermilion", colour: "#ff4d8d"},
	{index: 18, name: "Cyan", colour: "#4dd8ff"},
];

const bare = (): (string | null)[] => Array<string | null>(DIM * DIM).fill(null);

/** Puts the designer up the way the setup screen does, over a save with the three starters. */
function open(overrides: Partial<DesignView> = {}): void {
	act(() => {
		designStore.set({
			dim: DIM,
			preset: bare(),
			elements: ["fire", "water", "earth"],
			fusions: [],
			spawns: SPAWNS,
			seats: 2,
			setSeats: () => undefined,
			paint: () => undefined,
			clear: () => undefined,
			close: () => undefined,
			...overrides,
		});
	});
}

/** Every square of the board being painted, reading rows top to bottom. */
function tiles(): HTMLElement[] {
	return [...document.querySelectorAll<HTMLElement>(".bboard .tile")];
}

/** One material, tool, or seat count from the palettes above the board. */
function palette(name: string): HTMLElement {
	return screen.getByRole("button", {name});
}

function click(name: string): void {
	act(() => {
		palette(name).click();
	});
}

/** Presses the pointer on a square, which is where a stroke starts. */
function press(at: number): void {
	act(() => {
		fireEvent.pointerDown(tiles()[at]!);
	});
}

/** Drags the pointer over a square, which paints it only while the button is down. */
function drag(at: number): void {
	act(() => {
		fireEvent.pointerOver(tiles()[at]!);
	});
}

function release(): void {
	act(() => {
		fireEvent.pointerUp(window);
	});
}

afterEach(() => {
	act(() => {
		designStore.set(null);
	});
});

describe("ArenaDesigner", () => {
	it("paints nothing while the designer is shut", () => {
		const {container} = render(<ArenaDesigner />);

		expect(container.innerHTML).toBe("");
	});

	it("lays out a square for every tile of the grid a match will be played on", () => {
		render(<ArenaDesigner />);

		open();

		expect(tiles().length).toBe(DIM * DIM);
	});

	it("shelves the elements the save has bought and the fusions it has turned up", () => {
		render(<ArenaDesigner />);

		open({fusions: ["steam"]});

		expect([...document.querySelectorAll(".bpal .mat")].map((b) => b.textContent)).toStrictEqual([
			"Fire",
			"Water",
			"Earth",
			"Steam",
			"Break",
			"Erase",
		]);
	});

	it("says so when nothing has been fused yet", () => {
		render(<ArenaDesigner />);

		open();

		expect(document.querySelector(".bpal .hint")?.textContent).toBe("Nothing here yet.");
	});

	it("opens on fire, the element every save starts with", () => {
		render(<ArenaDesigner />);

		open();

		expect(palette("Fire").getAttribute("aria-pressed")).toBe("true");
	});

	it("paints the square the pointer lands on with the material picked", () => {
		const paint = vi.fn<(index: number, key: string | null) => void>();
		render(<ArenaDesigner />);
		open({paint});

		click("Water");
		press(3);

		expect(paint.mock.calls).toStrictEqual([[3, "water"]]);
	});

	it("clears a square back to bare ground with the eraser", () => {
		const paint = vi.fn<(index: number, key: string | null) => void>();
		render(<ArenaDesigner />);
		open({paint});

		click("Erase");
		press(0);

		expect(paint.mock.calls).toStrictEqual([[0, null]]);
	});

	it("paints every square a stroke is dragged across", () => {
		const paint = vi.fn<(index: number, key: string | null) => void>();
		render(<ArenaDesigner />);
		open({paint});

		press(0);
		drag(1);
		drag(2);

		expect(paint.mock.calls).toStrictEqual([
			[0, "fire"],
			[1, "fire"],
			[2, "fire"],
		]);
	});

	it("leaves the board alone once the pointer comes up", () => {
		const paint = vi.fn<(index: number, key: string | null) => void>();
		render(<ArenaDesigner />);
		open({paint});

		press(0);
		release();
		drag(1);
		drag(2);

		expect(paint.mock.calls).toStrictEqual([[0, "fire"]]);
	});

	it("counts the squares that have been painted", () => {
		const preset = bare();
		preset[0] = "fire";
		preset[1] = "water";
		render(<ArenaDesigner />);

		open({preset});

		expect(document.querySelector(".wrow .hint")?.textContent).toBe("2 of 25 squares set");
	});

	it("paints the ground it was handed, and names it", () => {
		const preset = bare();
		preset[0] = "fire";
		render(<ArenaDesigner />);

		open({preset});

		expect(tiles()[0]?.className).toBe("tile terr");
		expect(tiles()[0]?.title).toBe("Fire: End your turn here and take 10");
	});

	it("marks where each seat starts", () => {
		render(<ArenaDesigner />);

		open();

		expect(tiles().flatMap((t, i) => (t.querySelector(".mage") === null ? [] : [i]))).toStrictEqual([6, 18]);
		expect(tiles()[6]?.title).toBe("Vermilion starts here");
	});

	it("warns about a spawn square that has been sealed off", () => {
		const preset = bare();
		preset[6] = "collapsed";
		render(<ArenaDesigner />);

		open({preset});

		expect(tiles()[6]?.className).toContain("willclear");
		expect(document.querySelector(".spawnnote")?.textContent).toContain("1 spawn square has a wall or a hole");
	});

	it("says nothing about the spawns while they are all clear", () => {
		render(<ArenaDesigner />);

		open();

		expect(document.querySelector(".spawnnote")?.textContent).toBe("");
	});

	it("draws the ring for another number of seats through the view it published", () => {
		const setSeats = vi.fn<(seats: number) => void>();
		render(<ArenaDesigner />);
		open({setSeats});

		click("4");

		expect(setSeats.mock.calls).toStrictEqual([[4]]);
		expect(palette("2").getAttribute("aria-pressed")).toBe("true");
	});

	it("wipes the board through the view it published", () => {
		const clear = vi.fn<() => void>();
		render(<ArenaDesigner />);
		open({clear});

		click("Clear the board");

		expect(clear).toHaveBeenCalledOnce();
	});

	it("shuts through the view it published", () => {
		const close = vi.fn<() => void>();
		render(<ArenaDesigner />);
		open({close});

		click("Done");

		expect(close).toHaveBeenCalledOnce();
	});
});
