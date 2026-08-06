// @vitest-environment jsdom
import {describe, it, expect} from "vitest";
import {act, render, screen} from "@testing-library/react";
import {WeaponPanel} from "../../src/ui/WeaponPanel.js";
import type {LeaveChoice, LeaveRow, WeaponView} from "../../src/game/bridge.js";

function choice(over: Partial<LeaveChoice> = {}): LeaveChoice {
	return {key: "fire", name: "Fire", colour: "#ff7a3d", on: false, choose: () => undefined, ...over};
}

function weapon(over: Partial<WeaponView> = {}): WeaponView {
	return {
		name: "Ember Blade",
		colour: "#ff7a3d",
		damage: "8",
		desc: "Reaches two squares. Breaks the moment you swing it.",
		onHit: null,
		strip: "linear-gradient(90deg, #ff7a3d, #ffd24a)",
		rows: [],
		cost: 2,
		aiming: false,
		disabled: false,
		swing: () => undefined,
		hint: "Nobody visible in reach. Swing anyway to sweep for someone hidden.",
		...over,
	};
}

describe("WeaponPanel", () => {
	it("tells an empty-handed fighter what to do about it", () => {
		const {container} = render(<WeaponPanel view={null} />);

		expect(container.querySelector(".wn")?.textContent).toBe("Empty hands");
		expect(container.querySelector(".wsub")?.textContent).toBe(
			"Pick a weapon card from your hand. Holding one is free, and you can put it back.",
		);
		expect(container.querySelectorAll("button").length).toBe(0);
	});

	it("names the weapon in its own colour and prices the swing", () => {
		const {container} = render(<WeaponPanel view={weapon()} />);
		const name = container.querySelector(".wn");
		const swing = screen.getByRole("button");

		expect(name?.textContent).toBe("Ember Blade");
		expect((name as HTMLElement).style.color).toBe("rgb(255, 122, 61)");
		expect(container.querySelector(".wd")?.textContent).toBe("8 damage");
		expect(swing.className).toBe("atk");
		expect(swing.textContent).toBe("Swing · 2 energy F");
		expect(container.querySelector(".wrow .hint")?.textContent).toBe(
			"Nobody visible in reach. Swing anyway to sweep for someone hidden.",
		);
	});

	it("keeps quiet about the forging when the elements only add damage", () => {
		const {container} = render(<WeaponPanel view={weapon()} />);

		expect(container.querySelector(".wsub")?.textContent).toBe(
			"Reaches two squares. Breaks the moment you swing it.",
		);
		expect(container.querySelector(".fx")).toBe(null);
		expect(container.querySelectorAll(".lv").length).toBe(0);
	});

	it("spells out what the forging does on a hit", () => {
		const {container} = render(<WeaponPanel view={weapon({onHit: "burn, freeze"})} />);

		expect(container.querySelector(".fx")?.textContent).toBe("On hit: burn, freeze.");
		expect(container.querySelector(".wsub")?.textContent).toBe(
			"Reaches two squares. Breaks the moment you swing it. On hit: burn, freeze.",
		);
	});

	it("lights the chosen leaving and hands the pick back to the game", () => {
		let chosen = "";
		const row: LeaveRow = {
			label: "Leaves under them:",
			options: [
				choice({key: "fire", name: "Fire", on: true}),
				choice({key: "ice", name: "Ice", colour: "#4aa3ff", choose: () => (chosen = "ice")}),
			],
		};
		const {container} = render(<WeaponPanel view={weapon({rows: [row]})} />);
		const options = [...container.querySelectorAll(".lv")];

		expect(options.map((option) => option.className)).toEqual(["lv on", "lv"]);
		expect(options.map((option) => option.textContent)).toEqual(["Fire", "Ice"]);
		expect(options[1]?.getAttribute("style")).toBe("--lc: #4aa3ff;");
		act(() => {
			(options[1] as HTMLButtonElement).click();
		});

		expect(chosen).toBe("ice");
	});

	it("labels each row of leavings and keeps them in the order the game gave them", () => {
		const rows: LeaveRow[] = [
			{label: "Leaves under them:", options: [choice()]},
			{label: "Lays under you:", options: [choice({key: "mud", name: "Mud"})]},
		];
		const {container} = render(<WeaponPanel view={weapon({rows})} />);
		const labels = [...container.querySelectorAll(".wsub[style]")].map((el) => el.firstChild?.textContent);

		expect(labels).toEqual(["Leaves under them:", "Lays under you:"]);
	});

	it("holds the swing down while the board waits for a square, and drops it when it cannot be paid for", () => {
		let swings = 0;
		const {rerender} = render(<WeaponPanel view={weapon({aiming: true, swing: () => swings++})} />);

		expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("true");
		act(() => {
			screen.getByRole("button").click();
		});
		rerender(<WeaponPanel view={weapon({disabled: true})} />);

		expect(swings).toBe(1);
		expect(screen.getByRole<HTMLButtonElement>("button").disabled).toBe(true);
		expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("false");
	});
});
