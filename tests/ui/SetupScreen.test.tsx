// @vitest-environment jsdom
import {describe, it, expect, afterEach, vi} from "vitest";
import {act, fireEvent, render, screen} from "@testing-library/react";
import {SetupScreen} from "../../src/ui/SetupScreen.js";
import {
	menuStore,
	type ArenaSetup,
	type ArsenalSetup,
	type LoadoutChip,
	type LoadoutSetup,
	type MenuView,
	type ShopRow,
	type ShopShelf,
} from "../../src/game/bridge.js";

function noop(): void {
	// stories and tests pose the screen without a save behind it
}

function arena(overrides: Partial<ArenaSetup> = {}): ArenaSetup {
	return {
		seats: [
			{seat: 0, name: "", placeholder: "Vermilion", swatch: 0},
			{seat: 1, name: "", placeholder: "Cyan", swatch: 1},
		],
		swatches: [
			{colour: "#ff4d8d", name: "Rose"},
			{colour: "#4dd8ff", name: "Sky"},
		],
		teams: [
			{name: "Vermilion", colour: "#ff4d8d", seats: 1},
			{name: "Cyan", colour: "#4dd8ff", seats: 1},
		],
		footworkUses: 3,
		smash: false,
		paintball: false,
		chaos: false,
		chaosRound: 1,
		hideHands: true,
		dim: 9,
		hp: 60,
		startNrg: 2,
		openHand: 3,
		setSeatCount: noop,
		rename: noop,
		recolour: noop,
		setFootworkUses: noop,
		setSmash: noop,
		setPaintball: noop,
		setChaos: noop,
		setChaosRound: noop,
		setHideHands: noop,
		setDim: noop,
		setHp: noop,
		setStartNrg: noop,
		setOpenHand: noop,
		...overrides,
	};
}

function chip(overrides: Partial<LoadoutChip> = {}): LoadoutChip {
	return {key: "fire", name: "Fire", colour: "#ff6b3d", owned: true, price: 0, on: true, ...overrides};
}

function loadout(overrides: Partial<LoadoutSetup> = {}): LoadoutSetup {
	return {
		who: "all",
		scopes: [
			{who: "all", label: "Everyone", colour: "var(--accent)", own: false},
			{who: 0, label: "Vermilion", colour: "#ff4d8d", own: false},
		],
		elements: [chip(), chip({key: "air", name: "Air", owned: false, price: 40})],
		weapons: [],
		footwork: [],
		allFootwork: false,
		noFootwork: true,
		anyFootwork: false,
		setWho: noop,
		toggleElement: noop,
		toggleWeapon: noop,
		toggleFootwork: noop,
		setAllFootwork: noop,
		share: null,
		...overrides,
	};
}

function row(overrides: Partial<ShopRow> = {}): ShopRow {
	return {
		key: "air",
		name: "Air",
		blurb: "Blows things about.",
		colour: "#8ad4ff",
		owned: false,
		price: 40,
		affordable: true,
		...overrides,
	};
}

function shelf(overrides: Partial<ShopShelf> = {}): ShopShelf {
	return {
		heading: "Elements",
		rows: [row()],
		due: 40,
		left: 1,
		affordable: true,
		buy: noop,
		buyAll: noop,
		...overrides,
	};
}

function arsenal(overrides: Partial<ArsenalSetup> = {}): ArsenalSetup {
	return {
		coins: 100,
		saveError: null,
		shelves: [shelf()],
		cheat: "open",
		tries: 0,
		triesAllowed: 5,
		submitCode: noop,
		resetProgress: noop,
		...overrides,
	};
}

function view(overrides: Partial<MenuView> = {}): MenuView {
	return {
		arena: arena(),
		loadout: loadout(),
		arsenal: arsenal(),
		themeLabel: "Day mode",
		toggleTheme: noop,
		openSimulator: noop,
		openDesigner: noop,
		openTable: noop,
		start: noop,
		...overrides,
	};
}

/** Puts the screen up the way the game does once the save has loaded. */
function open(overrides: Partial<MenuView> = {}): void {
	act(() => {
		menuStore.set(view(overrides));
	});
}

function button(name: string): HTMLElement {
	return screen.getByRole("button", {name});
}

function click(name: string): void {
	act(() => {
		button(name).click();
	});
}

function type(field: HTMLElement, value: string): void {
	act(() => {
		fireEvent.change(field, {target: {value}});
	});
}

afterEach(() => {
	act(() => {
		menuStore.set(null);
	});
});

describe("SetupScreen", () => {
	it("paints nothing while a match has the screen", () => {
		const {container} = render(<SetupScreen />);

		expect(container.innerHTML).toBe("");
	});

	it("comes down again the moment a match takes the screen", () => {
		const {container} = render(<SetupScreen />);
		open();

		act(() => {
			menuStore.set(null);
		});

		expect(container.innerHTML).toBe("");
	});

	it("offers the theme that is not on, and flips it through the game", () => {
		const toggleTheme = vi.fn<() => void>();
		render(<SetupScreen />);
		open({toggleTheme});

		click("Day mode");

		expect(toggleTheme.mock.calls.length).toBe(1);
	});

	it("opens the arena through the game rather than starting a match itself", () => {
		const start = vi.fn<() => void>();
		render(<SetupScreen />);
		open({start});

		click("Enter the arena");

		expect(start.mock.calls.length).toBe(1);
	});
});

describe("the arena panel", () => {
	it("gives every seat a field of its own, named for the colour it plays", () => {
		render(<SetupScreen />);

		open();

		expect(screen.getByLabelText("Name for the Rose side")).toBeDefined();
		expect(screen.getByLabelText("Name for the Sky side")).toBeDefined();
	});

	it("renames a seat through the game, which renames the colour it plays", () => {
		const rename = vi.fn<(seat: number, name: string) => void>();
		render(<SetupScreen />);
		open({arena: arena({rename})});

		type(screen.getByLabelText("Name for the Sky side"), "Blue Team");

		expect(rename.mock.calls).toStrictEqual([[1, "Blue Team"]]);
	});

	it("switches a seat to another colour through the game", () => {
		const recolour = vi.fn<(seat: number, swatch: number) => void>();
		render(<SetupScreen />);
		open({arena: arena({recolour})});

		act(() => {
			screen.getAllByRole("button", {name: "Sky"})[0]!.click();
		});

		expect(recolour.mock.calls).toStrictEqual([[0, 1]]);
	});

	it("says whether everyone is on their own or on sides", () => {
		render(<SetupScreen />);

		open({
			arena: arena({
				seats: [
					{seat: 0, name: "The Twins", placeholder: "Vermilion", swatch: 0},
					{seat: 1, name: "The Twins", placeholder: "Vermilion", swatch: 0},
				],
				teams: [{name: "The Twins", colour: "#ff4d8d", seats: 2}],
			}),
		});

		expect(document.querySelector(".tm")?.textContent).toBe("The Twins x2");
		expect(document.querySelector(".teamline")?.textContent).toContain("A colour is a side");
	});

	/* The game clamps what it is given, so a box that drove itself off the game's value would
	   snap back under your fingers the moment you cleared it to type something else. */
	it("keeps an emptied number box empty while the game falls back to its default", () => {
		const setOpenHand = vi.fn<(cards: number) => void>();
		render(<SetupScreen />);
		open({arena: arena({setOpenHand})});
		const box = screen.getByLabelText(/Opening hand/);

		type(box, "");

		expect((box as HTMLInputElement).value).toBe("");
		expect(setOpenHand.mock.calls).toStrictEqual([[Number.NaN]]);
	});

	it("puts back whatever the game settled on once the box is left", () => {
		render(<SetupScreen />);
		open();
		const box = screen.getByLabelText(/Opening hand/);
		type(box, "");

		act(() => {
			fireEvent.blur(box);
		});

		expect((box as HTMLInputElement).value).toBe("3");
	});
});

describe("the loadout panel", () => {
	it("prices up a chip nobody has bought instead of offering it", () => {
		render(<SetupScreen />);

		open();

		expect(button("Air · 40").hasAttribute("disabled")).toBe(true);
	});

	it("switches a card off for this match through the game", () => {
		const toggleElement = vi.fn<(key: string) => void>();
		render(<SetupScreen />);
		open({loadout: loadout({toggleElement})});

		click("Fire");

		expect(toggleElement.mock.calls).toStrictEqual([["fire"]]);
	});

	it("offers a seat with a list of its own the way back to the shared one", () => {
		const share = vi.fn<() => void>();
		render(<SetupScreen />);
		open({
			loadout: loadout({
				who: 0,
				scopes: [
					{who: "all", label: "Everyone", colour: "var(--accent)", own: false},
					{who: 0, label: "Vermilion", colour: "#ff4d8d", own: true},
				],
				share,
			}),
		});

		click("Put them back on the shared list");

		expect(share.mock.calls.length).toBe(1);
		expect(document.querySelector(".whonote")?.textContent).toContain("Vermilion only");
	});

	it("keeps the way back to itself while the seat is still on the shared list", () => {
		render(<SetupScreen />);

		open({loadout: loadout({who: 0})});

		expect(screen.queryByRole("button", {name: "Put them back on the shared list"})).toBeNull();
	});
});

describe("the arsenal panel", () => {
	it("teases what a row does until it has been bought", () => {
		render(<SetupScreen />);

		open();

		expect(document.querySelector(".shopname small")?.textContent).toBe("? ? ? Buy it to find out what it does.");
	});

	it("buys a row through the game", () => {
		const buy = vi.fn<(key: string) => void>();
		render(<SetupScreen />);
		open({arsenal: arsenal({shelves: [shelf({buy})]})});

		click("40 coin");

		expect(buy.mock.calls).toStrictEqual([["air"]]);
	});

	it("spends the buy button when the treasury is short", () => {
		render(<SetupScreen />);

		open({arsenal: arsenal({coins: 0, shelves: [shelf({rows: [row({affordable: false})], affordable: false})]})});

		expect(button("40 coin").hasAttribute("disabled")).toBe(true);
	});

	it("says a shelf is cleared rather than offering to sweep it up", () => {
		render(<SetupScreen />);

		open({arsenal: arsenal({shelves: [shelf({rows: [row({owned: true})], due: null, left: 0})]})});

		expect(document.querySelector(".bulkdone")?.textContent).toBe("all owned");
		expect(document.querySelector(".shopname small")?.textContent).toBe("Blows things about.");
	});

	it("says why progress is not saving", () => {
		render(<SetupScreen />);

		open({arsenal: arsenal({saveError: "quota exceeded"})});

		expect(document.querySelector(".savewarn")?.textContent).toBe("Progress is not saving: quota exceeded");
	});

	it("hands the code over and empties the box for the next guess", () => {
		const submitCode = vi.fn<(code: string) => void>();
		render(<SetupScreen />);
		open({arsenal: arsenal({submitCode})});
		const box = screen.getByLabelText("Cheat code");
		type(box, "guess");

		click("Enter");

		expect(submitCode.mock.calls).toStrictEqual([["guess"]]);
		expect((box as HTMLInputElement).value).toBe("");
	});

	it("counts down the guesses left", () => {
		render(<SetupScreen />);

		open({arsenal: arsenal({tries: 4})});

		expect(document.querySelector(".cheatmsg")?.textContent).toBe("Wrong. 1 guess left.");
	});

	it("takes the box away once the guesses are spent", () => {
		render(<SetupScreen />);

		open({arsenal: arsenal({cheat: "spent", tries: 5})});

		expect(screen.queryByLabelText("Cheat code")).toBeNull();
		expect(document.querySelector(".cheatmsg")?.textContent).toBe("Out of guesses. All 5 were wrong.");
	});

	it("wipes the treasury only on the second press", () => {
		const resetProgress = vi.fn<() => void>();
		render(<SetupScreen />);
		open({arsenal: arsenal({resetProgress})});

		click("Reset all progress");
		expect(resetProgress.mock.calls.length).toBe(0);

		click("Tap again to wipe the treasury");

		expect(resetProgress.mock.calls.length).toBe(1);
		expect(button("Reset all progress")).toBeDefined();
	});
});
