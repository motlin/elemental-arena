// @vitest-environment jsdom
import {describe, it, expect, afterEach} from "vitest";
import {act, render, screen} from "@testing-library/react";
import {GameOverScreen} from "../../src/ui/GameOverScreen.js";
import {overStore, type OverView} from "../../src/game/bridge.js";
import type {LogEntry} from "../../src/game/types.js";

function line(overrides: Partial<LogEntry> = {}): LogEntry {
	return {r: 1, who: "Cyan", c: "#4dd8ff", t: "struck for 7", say: false, ...overrides};
}

function over(overrides: Partial<OverView> = {}): OverView {
	return {
		seat: 3,
		colour: "#c98cff",
		headline: "Amethyst holds the arena",
		earn: "+3 coin banked",
		log: [],
		openReplay: () => undefined,
		back: () => undefined,
		...overrides,
	};
}

function publish(view: OverView | null): void {
	act(() => {
		overStore.set(view);
	});
}

afterEach(() => {
	act(() => {
		overStore.set(null);
	});
});

describe("GameOverScreen", () => {
	it("paints nothing while a match is still on", () => {
		const {container} = render(<GameOverScreen />);

		expect(container.innerHTML).toBe("");
	});

	it("names the winner and the coin they banked", () => {
		render(<GameOverScreen />);

		publish(over());

		expect(screen.getByText("Amethyst holds the arena")).toBeDefined();
		expect(screen.getByText("+3 coin banked")).toBeDefined();
	});

	it("wears the winning seat's own glyph colour", () => {
		render(<GameOverScreen />);

		publish(over());
		const glyph = document.querySelector(".bigglyph");

		expect(glyph?.className).toBe("bigglyph mage p3");
		expect(glyph?.getAttribute("style")).toBe("--pc: #c98cff;");
	});

	it("keeps the match log rolled up until it is asked for", () => {
		render(<GameOverScreen />);
		publish(over({log: [line({t: "took the arena"})]}));

		expect(screen.queryByText("took the arena", {exact: false})).toBeNull();

		act(() => {
			screen.getByText("Show the match log").click();
		});

		expect(screen.getByText("took the arena", {exact: false})).toBeDefined();
		expect(screen.getByText("Hide the match log")).toBeDefined();
	});

	it("heads each round of the log once and colours who spoke", () => {
		render(<GameOverScreen />);
		publish(over({log: [line(), line({t: "stepped away"}), line({r: 2, who: "", t: "the ground fell away"})]}));

		act(() => {
			screen.getByText("Show the match log").click();
		});

		expect([...document.querySelectorAll(".lgnew")].map((el) => el.textContent)).toStrictEqual([
			"Round 1",
			"Round 2",
		]);
		expect([...document.querySelectorAll(".lg .who")].map((el) => el.textContent)).toStrictEqual([
			"Cyan",
			"Cyan",
			"The arena",
		]);
		// jsdom hands back what it parsed, so the seat's hex arrives as the rgb() it means.
		expect(document.querySelector(".lg .who")?.getAttribute("style")).toBe("color: rgb(77, 216, 255);");
	});

	it("marks table talk apart from what happened", () => {
		render(<GameOverScreen />);
		publish(over({log: [line({say: true, t: "good luck"})]}));

		act(() => {
			screen.getByText("Show the match log").click();
		});

		const said = document.querySelector(".lg.lgsay");

		expect(said?.textContent).toContain("says good luck");
	});

	it("says so when a match ended with nothing in the log", () => {
		render(<GameOverScreen />);
		publish(over());

		act(() => {
			screen.getByText("Show the match log").click();
		});

		expect(screen.getByText("Nothing happened.")).toBeDefined();
	});

	it("hands the replay and the way out straight back to the game", () => {
		let replays = 0;
		let backs = 0;
		render(<GameOverScreen />);
		publish(over({openReplay: () => replays++, back: () => backs++}));

		act(() => {
			screen.getByText("Watch the replay").click();
			screen.getByText("Back to the arena").click();
		});

		expect([replays, backs]).toStrictEqual([1, 1]);
	});

	it("rolls the log back up for the next match", () => {
		render(<GameOverScreen />);
		publish(over({log: [line({t: "took the arena"})]}));
		act(() => {
			screen.getByText("Show the match log").click();
		});

		publish(null);
		publish(over({log: [line({t: "took the arena"})]}));

		expect(screen.getByText("Show the match log")).toBeDefined();
	});

	it("clears the screen when the game publishes nothing", () => {
		const {container} = render(<GameOverScreen />);
		publish(over());

		publish(null);

		expect(container.innerHTML).toBe("");
	});
});
