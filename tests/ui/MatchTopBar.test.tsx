// @vitest-environment jsdom
import {describe, it, expect} from "vitest";
import {act, render, screen} from "@testing-library/react";
import {MatchTopBar} from "../../src/ui/MatchTopBar.js";
import type {TopbarView} from "../../src/game/bridge.js";
import {sampleTopbar} from "../../src/ui/matchSample.js";

function topbar(patch: Partial<TopbarView> = {}): TopbarView {
	return {...sampleTopbar(), ...patch};
}

const buttons = (container: HTMLElement): HTMLButtonElement[] => [
	...container.querySelectorAll<HTMLButtonElement>("button"),
];

describe("MatchTopBar", () => {
	it("names the seat whose turn it is, in their own colour", () => {
		const {container} = render(<MatchTopBar view={topbar({seat: 3, name: "Amethyst", colour: "#c98cff"})} />);
		const glyph = container.querySelector(".turnchip .glyph");

		expect(glyph?.className).toBe("glyph mage p3");
		expect(glyph?.getAttribute("style")).toBe("--pc: #c98cff;");
		expect(container.querySelector(".turnchip b")?.textContent).toBe("Amethyst");
	});

	it("reads out the round and everything running with it", () => {
		const {container} = render(<MatchTopBar view={topbar({round: "ROUND 6  ·  4/9 ENERGY  ·  CHAOS MODE"})} />);

		expect(container.querySelector(".roundchip")?.textContent).toBe("ROUND 6  ·  4/9 ENERGY  ·  CHAOS MODE");
	});

	it("offers everything a turn can be left by", () => {
		const {container} = render(<MatchTopBar view={topbar()} />);

		expect(buttons(container).map((button) => button.textContent)).toStrictEqual([
			"Inspect I",
			"Mixing table",
			"Undo U",
			"End turn E",
			"Forfeit",
			"Menu",
			"Day",
		]);
	});

	it("leaves the Inspect button plain while Inspect is off", () => {
		const {container} = render(<MatchTopBar view={topbar({inspecting: false})} />);
		const [inspect] = buttons(container);

		expect(inspect?.getAttribute("style")).toBe(null);
		expect(inspect?.querySelector("span")?.getAttribute("style")).toBe("color: var(--muted);");
	});

	it("lights the Inspect button up in the accent while Inspect is on", () => {
		const {container} = render(<MatchTopBar view={topbar({inspecting: true})} />);
		const [inspect] = buttons(container);

		expect(inspect?.textContent).toBe("Stop inspecting I");
		expect(inspect?.getAttribute("style")).toBe(
			"border-color: var(--accent); background: var(--accent); color: var(--onaccent);",
		);
		expect(inspect?.querySelector("span")?.getAttribute("style")).toBe("color: var(--onaccent);");
	});

	it("shuts the turn in while chaos mode is still owed a card", () => {
		const {container} = render(<MatchTopBar view={topbar({canEndTurn: false})} />);

		expect(buttons(container).map((button) => button.disabled)).toStrictEqual([
			false,
			false,
			true,
			true,
			false,
			false,
			false,
		]);
	});

	it("warns in orange once a second tap would drop the fighter", () => {
		const view = topbar({forfeitLabel: "Tap again to fall", forfeitArmed: true});
		const {container} = render(<MatchTopBar view={view} />);
		const forfeit = buttons(container)[4];

		expect(forfeit?.textContent).toBe("Tap again to fall");
		expect(forfeit?.getAttribute("style")).toBe("border-color: rgb(255, 143, 107); color: rgb(255, 143, 107);");
	});

	it("hands every button straight back to the game", () => {
		const pressed: string[] = [];
		const view = topbar({
			toggleInspect: () => pressed.push("inspect"),
			openTable: () => pressed.push("table"),
			canUndo: true,
			undo: () => pressed.push("undo"),
			endTurn: () => pressed.push("end"),
			forfeit: () => pressed.push("forfeit"),
			leave: () => pressed.push("leave"),
			toggleTheme: () => pressed.push("theme"),
		});
		const {container} = render(<MatchTopBar view={view} />);

		act(() => {
			for (const button of buttons(container)) button.click();
		});

		expect(pressed).toStrictEqual(["inspect", "table", "undo", "end", "forfeit", "leave", "theme"]);
	});

	it("offers whichever theme is not already on", () => {
		render(<MatchTopBar view={topbar({themeLabel: "Night"})} />);

		expect(screen.getByRole("button", {name: "Night"})).toBeDefined();
	});
});
