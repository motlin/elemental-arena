// @vitest-environment jsdom
import {describe, it, expect, afterEach, vi} from "vitest";
import {act, fireEvent, render, screen} from "@testing-library/react";
import {ReplayViewer} from "../../src/ui/ReplayViewer.js";
import {replayStore, type ReplayView} from "../../src/game/bridge.js";
import type {Frame} from "../../src/game/types.js";

const DIM = 3;

/** How long the replay rests on a frame before stepping to the next one. */
const STEP = 900;

/** One frame of a two-hander: nothing painted, both fighters up, one on each corner. */
function frame(overrides: Partial<Frame> = {}): Frame {
	return {
		r: 1,
		who: "Vermilion",
		c: "#ff4d8d",
		t: "played Fire",
		say: false,
		turn: 0,
		board: Array<string | null>(DIM * DIM).fill(null),
		players: [
			{
				name: "Vermilion",
				c: "#ff4d8d",
				team: 0,
				x: 0,
				y: 0,
				hp: 60,
				max: 60,
				alive: true,
				hand: ["Fire", "Dagger"],
				held: null,
			},
			{name: "Cyan", c: "#4dd8ff", team: 1, x: 2, y: 2, hp: 30, max: 60, alive: true, hand: [], held: null},
		],
		...overrides,
	};
}

/** Three frames apart enough to tell one from the next. */
const FRAMES: Frame[] = [
	frame(),
	frame({r: 2, who: "Cyan", c: "#4dd8ff", t: "hello", say: true}),
	frame({r: 3, t: "took the arena"}),
];

/** Puts the replay up the way the game does when a match is called. */
function open(overrides: Partial<ReplayView> = {}): void {
	act(() => {
		replayStore.set({frames: FRAMES, dim: DIM, close: () => undefined, ...overrides});
	});
}

/** Every square of the replayed board, reading rows top to bottom. */
function tiles(): HTMLElement[] {
	return [...document.querySelectorAll<HTMLElement>(".rvboard .tile")];
}

/** Which squares somebody is standing on. */
function occupied(): number[] {
	return tiles().flatMap((t, i) => (t.querySelector(".mage") === null ? [] : [i]));
}

function note(): string {
	return document.querySelector(".rvnote")?.textContent ?? "";
}

function count(): string {
	return document.querySelector(".rvcount")?.textContent ?? "";
}

/** Lets the replay run on, one frame's rest at a time. */
function tick(frames: number): void {
	for (let i = 0; i < frames; i++) {
		act(() => {
			vi.advanceTimersByTime(STEP);
		});
	}
}

function click(name: string): void {
	act(() => {
		screen.getByRole("button", {name}).click();
	});
}

afterEach(() => {
	act(() => {
		replayStore.set(null);
	});
	vi.useRealTimers();
});

describe("ReplayViewer", () => {
	it("paints nothing while the replay is shut", () => {
		const {container} = render(<ReplayViewer />);

		expect(container.innerHTML).toBe("");
	});

	it("lays out a square for every tile of the grid it was played on", () => {
		render(<ReplayViewer />);

		open();

		expect(tiles().length).toBe(DIM * DIM);
	});

	it("opens on the first frame", () => {
		render(<ReplayViewer />);

		open();

		expect(note()).toContain("played Fire");
		expect(count()).toBe("1 / 3");
	});

	it("stands each fighter on the square the frame remembers", () => {
		render(<ReplayViewer />);

		open();

		expect(occupied()).toStrictEqual([0, 8]);
	});

	it("leaves a square nobody painted bare, and dresses the ground that was laid", () => {
		const board = Array<string | null>(DIM * DIM).fill(null);
		board[4] = "lava";
		render(<ReplayViewer />);

		open({frames: [frame({board})]});

		expect(tiles()[0]?.className).toBe("tile");
		expect(tiles()[0]?.title).toBe("");
		expect(tiles()[4]?.className).toBe("tile terr");
		expect(tiles()[4]?.title).toBe("Fire");
	});

	it("reads the hands the frame snapshotted, and says so when one is empty", () => {
		render(<ReplayViewer />);

		open();

		expect([...document.querySelectorAll(".rvc")].map((c) => c.textContent)).toStrictEqual(["Fire", "Dagger"]);
		expect(document.querySelector(".rvnone")?.textContent).toBe("empty hand");
	});

	it("greys out a fighter who is already down", () => {
		render(<ReplayViewer />);

		open({
			frames: [frame({players: [{...frame().players[0]!, alive: false, hp: 0}]})],
		});

		expect(document.querySelectorAll(".rvp.out").length).toBe(1);
		expect(occupied()).toStrictEqual([]);
	});

	it("steps forward and back, and goes no further than either end", () => {
		render(<ReplayViewer />);
		open();

		click("Next frame");
		click("Next frame");
		click("Next frame");
		expect(count()).toBe("3 / 3");
		expect(note()).toContain("took the arena");

		click("Previous frame");
		click("Previous frame");
		click("Previous frame");
		expect(count()).toBe("1 / 3");
	});

	it("scrubs straight to a frame with the bar", () => {
		render(<ReplayViewer />);
		open();

		act(() => {
			fireEvent.change(screen.getByLabelText("Replay position"), {target: {value: "1"}});
		});

		expect(count()).toBe("2 / 3");
		expect(note()).toContain("says hello");
	});

	it("plays through the frames and stops itself at the last one", () => {
		vi.useFakeTimers();
		render(<ReplayViewer />);
		open();

		click("Play");
		expect(screen.getByRole("button", {name: "Pause"})).toBeDefined();
		tick(5);

		expect(count()).toBe("3 / 3");
		expect(screen.getByRole("button", {name: "Play"})).toBeDefined();
	});

	it("stops where it is when play is pressed again", () => {
		vi.useFakeTimers();
		render(<ReplayViewer />);
		open();

		click("Play");
		tick(1);
		click("Pause");
		tick(5);

		expect(count()).toBe("2 / 3");
	});

	it("rewinds to the top when play is pressed on the last frame", () => {
		vi.useFakeTimers();
		render(<ReplayViewer />);
		open();

		click("Next frame");
		click("Next frame");
		click("Play");

		expect(count()).toBe("1 / 3");
	});

	it("stops playing when a frame is stepped to by hand", () => {
		vi.useFakeTimers();
		render(<ReplayViewer />);
		open();

		click("Play");
		click("Next frame");
		tick(5);

		expect(count()).toBe("2 / 3");
	});

	it("says so when the match recorded nothing", () => {
		render(<ReplayViewer />);

		open({frames: []});

		expect(note()).toBe("Nothing was recorded.");
		expect(count()).toBe("0 / 0");
		expect(tiles()).toStrictEqual([]);
	});

	it("shuts through the view it published", () => {
		const close = vi.fn<() => void>();
		render(<ReplayViewer />);
		open({close});

		click("Close");

		expect(close).toHaveBeenCalledOnce();
	});
});
