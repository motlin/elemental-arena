// @vitest-environment jsdom
import {describe, it, expect, afterEach} from "vitest";
import {act, render, screen} from "@testing-library/react";
import {PowerSimulator} from "../../src/ui/PowerSimulator.js";
import {simStore, type SimView} from "../../src/game/bridge.js";

/** Puts the simulator up the way the menu does, with whatever the save has unlocked. */
function open(overrides: Partial<SimView> = {}): void {
	act(() => {
		simStore.set({
			weapons: ["dagger", "sword"],
			elements: ["fire", "water"],
			fusions: ["steam"],
			hp: 60,
			close: () => undefined,
			...overrides,
		});
	});
}

function click(name: string): void {
	act(() => {
		screen.getByRole("button", {name}).click();
	});
}

/** Every figure on the card, as `[number, what it counts]`. */
function figures(): [string, string][] {
	return [...document.querySelectorAll(".sn")].map((sn) => [
		sn.querySelector("b")?.textContent ?? "",
		sn.querySelector("span")?.textContent ?? "",
	]);
}

/** The tags under the card, as `[what is stacked, how many]`. */
function parts(): [string, string][] {
	return [...document.querySelectorAll(".pt")].map((pt) => [
		pt.childNodes[1]?.textContent ?? "",
		pt.querySelector(".ptn")?.textContent ?? "",
	]);
}

afterEach(() => {
	act(() => {
		simStore.set(null);
	});
});

describe("PowerSimulator", () => {
	it("paints nothing while the simulator is shut", () => {
		const {container} = render(<PowerSimulator />);

		expect(container.innerHTML).toBe("");
	});

	it("shelves everything the save has unlocked", () => {
		render(<PowerSimulator />);

		open();

		expect([...document.querySelectorAll(".bp")].map((b) => b.textContent)).toStrictEqual([
			"Dagger · 5",
			"Sword · 10",
			"Fire",
			"Water",
			"Steam",
		]);
	});

	it("says which shelves are bare", () => {
		render(<PowerSimulator />);

		open({weapons: [], elements: [], fusions: []});

		expect([...document.querySelectorAll(".hint")].map((h) => h.textContent)).toStrictEqual([
			"No weapons yet.",
			"No elements yet.",
			"None discovered yet. Mix some in a match.",
		]);
	});

	it("asks for a weapon before it counts anything", () => {
		render(<PowerSimulator />);

		open();

		expect(screen.getByText("Add a weapon to begin. Elements on their own cannot be swung.")).toBeDefined();
		expect(figures()).toStrictEqual([]);
	});

	it("counts a bare dagger out", () => {
		render(<PowerSimulator />);
		open();

		click("Dagger · 5");

		expect(document.querySelector(".simname")?.textContent).toBe("Dagger");
		expect(figures()).toStrictEqual([
			["5", "per strike"],
			["2", "strikes"],
			["10", "total damage"],
			["2", "energy"],
			["5.0", "per energy"],
			["8", "squares hit"],
			["6", "swings to drop 60 hp"],
			["1", "earliest turn"],
		]);
	});

	it("forges an element onto the weapon and renames the card", () => {
		render(<PowerSimulator />);
		open();

		click("Dagger · 5");
		click("Fire");

		expect(document.querySelector(".simname")?.textContent).toBe("Fire Dagger");
		expect(figures()).toStrictEqual([
			["10", "per strike"],
			["2", "strikes"],
			["20", "total damage"],
			["3", "energy"],
			["6.7", "per energy"],
			["8", "squares hit"],
			["3", "swings to drop 60 hp"],
			["2", "earliest turn"],
		]);
		expect(document.querySelector(".simfx")?.textContent).toBe("On hit: leaves fire under the target.");
	});

	it("counts the health the game was set to, not the game's default", () => {
		render(<PowerSimulator />);
		open({hp: 1000});

		click("Dagger · 5");

		expect(figures().at(-2)).toStrictEqual(["100", "swings to drop 1000 hp"]);
	});

	it("collapses a doubled-up part into one tag with a count", () => {
		render(<PowerSimulator />);
		open();

		click("Dagger · 5");
		click("Dagger · 5");

		expect(parts()).toStrictEqual([["Dagger", "x2"]]);
		expect(document.querySelector(".simname")?.textContent).toBe("Dagger x2");
	});

	it("takes one copy off at a time", () => {
		render(<PowerSimulator />);
		open();
		click("Dagger · 5");
		click("Dagger · 5");
		click("Sword · 10");

		act(() => {
			screen.getAllByTitle("Remove one")[0]?.click();
		});

		expect(parts()).toStrictEqual([
			["Dagger", ""],
			["Sword", ""],
		]);
	});

	it("clears the whole card", () => {
		render(<PowerSimulator />);
		open();
		click("Dagger · 5");
		click("Fire");

		click("Clear");

		expect(parts()).toStrictEqual([]);
		expect(screen.getByText("Add a weapon to begin. Elements on their own cannot be swung.")).toBeDefined();
	});

	it("shuts through the game's own handler", () => {
		let closed = 0;
		render(<PowerSimulator />);
		open({close: () => closed++});

		click("Close");

		expect(closed).toBe(1);
	});

	it("starts the next visit with an empty card", () => {
		render(<PowerSimulator />);
		open();
		click("Dagger · 5");

		act(() => {
			simStore.set(null);
		});
		open();

		expect(parts()).toStrictEqual([]);
	});
});
