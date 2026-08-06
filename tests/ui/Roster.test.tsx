// @vitest-environment jsdom
import {describe, it, expect} from "vitest";
import {render} from "@testing-library/react";
import {Roster} from "../../src/ui/Roster.js";
import type {RosterCard} from "../../src/game/bridge.js";
import {sampleRoster} from "../../src/ui/matchSample.js";

/** A fighter on full health holding nothing, which every card below is an edit or two from. */
function card(patch: Partial<RosterCard> = {}): RosterCard {
	return {
		seat: 0,
		name: "Vermilion",
		colour: "#ff4d8d",
		alive: true,
		allies: 0,
		hp: 60,
		health: 1,
		energy: null,
		pips: {total: 4, filled: 2},
		seen: null,
		line: "unarmed · 0 in hand",
		...patch,
	};
}

const cards = (container: HTMLElement): HTMLElement[] => [...container.querySelectorAll<HTMLElement>(".pcard")];

describe("Roster", () => {
	it("gives every fighter a card in their own colour", () => {
		const {container} = render(<Roster cards={sampleRoster()} />);

		expect(cards(container).map((pcard) => pcard.getAttribute("style"))).toStrictEqual([
			"--pc: #ff4d8d;",
			"--pc: #4dd8ff;",
			"--pc: #c98cff;",
		]);
	});

	it("greys out whoever has gone down", () => {
		const {container} = render(<Roster cards={[card(), card({seat: 1, alive: false})]} />);

		expect(cards(container).map((pcard) => pcard.className)).toStrictEqual(["pcard", "pcard dead"]);
	});

	it("reads out the name, the side standing with them, and the health left", () => {
		const {container} = render(<Roster cards={[card({name: "Cyan", allies: 2, hp: 31})]} />);

		expect(container.querySelector(".nm")?.textContent).toBe("Cyan +2 ally");
		expect(container.querySelector(".hpn")?.textContent).toBe("31");
	});

	it("says nothing about a side when a fighter is on their own", () => {
		const {container} = render(<Roster cards={[card()]} />);

		expect(container.querySelector(".nm")?.textContent).toBe("Vermilion");
	});

	it("fills the health bar to the share left, in the fighter's own colour", () => {
		const {container} = render(<Roster cards={[card({colour: "#4dd8ff", health: 0.5})]} />);

		expect(container.querySelector(".bar i")?.getAttribute("style")).toBe(
			"width: 50%; background: rgb(77, 216, 255); box-shadow: 0 0 8px #4dd8ff;",
		);
	});

	it("draws energy as pips while there are few enough to count", () => {
		const {container} = render(<Roster cards={[card({pips: {total: 4, filled: 2}})]} />);

		expect([...container.querySelectorAll(".nrg s")].map((pip) => pip.className)).toStrictEqual(["f", "f", "", ""]);
		expect(container.querySelectorAll(".wp").length).toBe(1);
	});

	it("reads energy out as a line once the cap is too big to draw", () => {
		const {container} = render(<Roster cards={[card({energy: "18 / 24 energy", pips: null})]} />);
		const lines = [...container.querySelectorAll<HTMLElement>(".wp")];

		expect(container.querySelector(".nrg")).toBe(null);
		expect([lines[0]?.textContent, lines[0]?.getAttribute("style")]).toStrictEqual([
			"18 / 24 energy",
			"color: rgb(255, 210, 74);",
		]);
	});

	it("calls out cards this seat has peeked at, and stays quiet when it has seen none", () => {
		const {container} = render(<Roster cards={[card({seen: "Fire, Water"})]} />);
		const lines = [...container.querySelectorAll<HTMLElement>(".wp")];

		expect(lines.map((line) => line.textContent)).toStrictEqual(["seen: Fire, Water", "unarmed · 0 in hand"]);
		expect(lines[0]?.getAttribute("style")).toBe("color: var(--accent);");
	});

	it("closes on what the fighter is holding", () => {
		const {container} = render(<Roster cards={[card({line: "Steam Sword · 14 dmg · 5 in hand"})]} />);
		const lines = [...container.querySelectorAll<HTMLElement>(".wp")];

		expect(lines.map((line) => line.textContent)).toStrictEqual(["Steam Sword · 14 dmg · 5 in hand"]);
	});
});
