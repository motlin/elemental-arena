// @vitest-environment jsdom
import {describe, it, expect} from "vitest";
import {act, render, screen} from "@testing-library/react";
import {TileInspector} from "../../src/ui/TileInspector.js";
import type {InspectView, ReachChooser} from "../../src/game/bridge.js";
import {sampleInspect} from "../../src/ui/matchSample.js";

function readout(patch: Partial<InspectView> = {}): InspectView {
	return {inspecting: true, hint: null, tile: null, chooser: null, ...patch};
}

function chooser(patch: Partial<ReachChooser> = {}): ReachChooser {
	return {
		chips: [{seat: 0, name: "Vermilion", colour: "#ff4d8d", budget: 4, on: false, toggle: () => undefined}],
		blinded: false,
		...patch,
	};
}

const facts = (container: HTMLElement): string[][] =>
	[...container.querySelectorAll(".k")].map((row) =>
		[...row.querySelectorAll("span")].map((cell) => cell.textContent),
	);

describe("TileInspector", () => {
	it("says what to do next while no square is being read", () => {
		const view = readout({inspecting: false, hint: "Turn on Inspect to read any square without moving."});
		const {container} = render(<TileInspector view={view} />);

		expect(container.querySelector("#tileinfo")?.innerHTML).toBe(
			"<span>Turn on Inspect to read any square without moving.</span>",
		);
	});

	it("reads a square out: what is on it, what it does, and every number it carries", () => {
		const {container} = render(<TileInspector view={sampleInspect()} />);

		expect(container.querySelector("b")?.textContent).toBe("Lava");
		expect(container.querySelector("b")?.getAttribute("style")).toBe("color: rgb(255, 90, 43);");
		expect(container.querySelector("b + div")?.textContent).toBe("Burns anyone who ends their turn on it.");
		expect(facts(container)).toStrictEqual([
			["Entering", "1 energy"],
			["Ending here", "9 damage"],
			["Lasts", "4 more rounds"],
		]);
	});

	it("reads bare ground in the muted grey", () => {
		const view = readout({
			tile: {name: "Bare ground", colour: null, blurb: "Nothing has been laid here.", facts: []},
		});
		const {container} = render(<TileInspector view={view} />);

		expect(container.querySelector("b")?.getAttribute("style")).toBe("color: var(--muted);");
		expect(facts(container)).toStrictEqual([]);
	});

	it("offers the reach overlay for everyone it can be drawn for", () => {
		const view = readout({
			chooser: chooser({
				chips: [
					{seat: 0, name: "Vermilion", colour: "#ff4d8d", budget: 4, on: true, toggle: () => undefined},
					{seat: 1, name: "Cyan", colour: "#4dd8ff", budget: 6, on: false, toggle: () => undefined},
				],
			}),
		});
		const {container} = render(<TileInspector view={view} />);
		const chips = [...container.querySelectorAll<HTMLElement>(".bp.rch")];

		expect(container.querySelector(".bhead")?.textContent).toBe("Show who can reach where");
		expect(chips.map((chip) => chip.textContent)).toStrictEqual(["Vermilion · 4", "Cyan · 6"]);
		expect(chips.map((chip) => chip.getAttribute("aria-pressed"))).toStrictEqual(["true", "false"]);
		expect(chips[0]?.querySelector(".d")?.getAttribute("style")).toBe("background: rgb(255, 77, 141);");
	});

	it("hands a chip straight back to the game", () => {
		let toggled = 0;
		const view = readout({
			chooser: chooser({
				chips: [{seat: 0, name: "Vermilion", colour: "#ff4d8d", budget: 4, on: false, toggle: () => toggled++}],
			}),
		});
		render(<TileInspector view={view} />);

		act(() => {
			screen.getByRole("button", {name: "Vermilion · 4"}).click();
		});

		expect(toggled).toBe(1);
	});

	it("says why a blinded seat is only offered their own reach", () => {
		const {container} = render(<TileInspector view={readout({chooser: chooser({blinded: true})})} />);

		expect(container.querySelector(".hint")?.textContent).toBe(
			"You are blinded, so only your own reach is available.",
		);
	});

	it("offers nobody's reach while Inspect is off", () => {
		const {container} = render(<TileInspector view={readout({inspecting: false, hint: "Turn on Inspect."})} />);

		expect(container.querySelector(".bpal")).toBe(null);
	});
});
