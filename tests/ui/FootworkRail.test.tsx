// @vitest-environment jsdom
import {describe, it, expect} from "vitest";
import {act, render, screen} from "@testing-library/react";
import {FootworkRail} from "../../src/ui/FootworkRail.js";
import type {FootworkButton, FootworkView} from "../../src/game/bridge.js";

/** A live Jump, which is the shape every other button is a variation on. */
function move(over: Partial<FootworkButton> = {}): FootworkButton {
	return {
		key: "jump",
		label: "Jump",
		cost: 1,
		left: 2,
		tip: "Pick a square exactly two away to land on.",
		aiming: false,
		disabled: false,
		click: () => undefined,
		...over,
	};
}

function rail(over: Partial<FootworkView> = {}): FootworkView {
	return {any: true, floating: false, rooted: false, buttons: [move()], ...over};
}

describe("FootworkRail", () => {
	it("says a fighter was given no special movement, and offers nothing", () => {
		const {container} = render(<FootworkRail view={rail({any: false, buttons: []})} />);

		expect(container.querySelector(".wn")?.textContent).toBe("No footwork");
		expect(container.querySelector(".wsub")?.textContent).toBe("This fighter was given no special movement.");
		expect(container.querySelectorAll("button").length).toBe(0);
	});

	it("prices a live move and counts what is left of it", () => {
		render(<FootworkRail view={rail()} />);
		const button = screen.getByRole("button");

		expect(button.textContent).toBe("Jump · 1 x2");
		expect(button.className).toBe("act");
		expect(button.getAttribute("title")).toBe("Pick a square exactly two away to land on.");
		expect((button as HTMLButtonElement).disabled).toBe(false);
	});

	it("leaves a spent move as a dead label with nothing to explain", () => {
		const spent = move({label: "Jump · spent", cost: null, left: null, tip: "", disabled: true, click: null});
		render(<FootworkRail view={rail({buttons: [spent]})} />);
		const button = screen.getByRole("button");

		expect(button.textContent).toBe("Jump · spent");
		expect(button.hasAttribute("title")).toBe(false);
		expect((button as HTMLButtonElement).disabled).toBe(true);
		expect(button.querySelector("span")).toBe(null);
	});

	it("holds the move down while the board waits for its target", () => {
		render(<FootworkRail view={rail({buttons: [move({aiming: true}), move({key: "dash", label: "Dash"})]})} />);
		const pressed = screen.getAllByRole("button").map((button) => button.getAttribute("aria-pressed"));

		expect(pressed).toEqual(["true", "false"]);
	});

	it("hands the click straight back to the game", () => {
		let jumped = 0;
		render(<FootworkRail view={rail({buttons: [move({click: () => jumped++})]})} />);

		act(() => {
			screen.getByRole("button").click();
		});

		expect(jumped).toBe(1);
	});

	it("says when the fighter is in the air and when they cannot move at all", () => {
		const {container} = render(<FootworkRail view={rail({floating: true, rooted: true})} />);

		expect(container.querySelector(".wsub .fx")?.textContent).toBe("You are in the air.");
		expect(container.querySelector(".wrow .hint")?.textContent).toBe("Stuck in the mud this turn.");
	});

	it("keeps the rail quiet while the fighter is loose and on the ground", () => {
		const {container} = render(<FootworkRail view={rail()} />);

		expect(container.querySelector(".wsub")).toBe(null);
		expect(container.querySelector(".hint")).toBe(null);
		expect(container.querySelector(".wtop")?.textContent).toBe("Footworkfootwork");
	});
});
