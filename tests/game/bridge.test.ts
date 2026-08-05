import {describe, it, expect, afterEach} from "vitest";
import {
	designStore,
	handoffStore,
	menuStore,
	overStore,
	replayStore,
	simStore,
	tableStore,
	type ArenaSetup,
	type ArsenalSetup,
	type DesignView,
	type HandoffView,
	type LoadoutSetup,
	type MenuView,
	type OverView,
	type ReplayView,
	type SimView,
	type TableView,
} from "../../src/game/bridge.js";
import type {Frame, LogEntry} from "../../src/game/types.js";

function view(overrides: Partial<HandoffView> = {}): HandoffView {
	return {seat: 0, name: "Vermilion", colour: "#ff4d8d", dismiss: noop, ...overrides};
}

function noop(): void {
	// a stable reference, so republishing the same seat compares equal
}

afterEach(() => {
	handoffStore.set(null);
	overStore.set(null);
	simStore.set(null);
	tableStore.set(null);
	replayStore.set(null);
	designStore.set(null);
	menuStore.set(null);
});

describe("handoffStore", () => {
	it("starts with the curtain down", () => {
		expect(handoffStore.get()).toBeNull();
	});

	it("hands subscribers the view it was last given", () => {
		const seen: (HandoffView | null)[] = [];
		const unsubscribe = handoffStore.subscribe(() => seen.push(handoffStore.get()));

		handoffStore.set(view({name: "Cyan"}));
		handoffStore.set(null);
		unsubscribe();

		expect(seen).toStrictEqual([view({name: "Cyan"}), null]);
	});

	it("stays quiet when the same view is republished", () => {
		let calls = 0;
		const unsubscribe = handoffStore.subscribe(() => calls++);

		handoffStore.set(view());
		handoffStore.set(view());
		unsubscribe();

		expect(calls).toBe(1);
	});

	it("stays quiet while the curtain is down and the game keeps redrawing", () => {
		let calls = 0;
		const unsubscribe = handoffStore.subscribe(() => calls++);

		handoffStore.set(null);
		handoffStore.set(null);
		unsubscribe();

		expect(calls).toBe(0);
	});

	it("stops notifying once unsubscribed", () => {
		let calls = 0;
		const unsubscribe = handoffStore.subscribe(() => calls++);

		unsubscribe();
		handoffStore.set(view());

		expect(calls).toBe(0);
	});
});

function over(overrides: Partial<OverView> = {}): OverView {
	return {
		seat: 0,
		colour: "#ff4d8d",
		headline: "Vermilion holds the arena",
		earn: "+3 coin banked",
		log: EMPTY_LOG,
		openReplay: noop,
		back: noop,
		...overrides,
	};
}

/** One stable empty log, so republishing an unchanged screen compares equal. */
const EMPTY_LOG: readonly LogEntry[] = [];

describe("overStore", () => {
	it("starts with no match ended", () => {
		expect(overStore.get()).toBeNull();
	});

	it("hands subscribers the screen it was last given", () => {
		const seen: (OverView | null)[] = [];
		const unsubscribe = overStore.subscribe(() => seen.push(overStore.get()));

		overStore.set(over({headline: "Nobody walks out"}));
		overStore.set(null);
		unsubscribe();

		expect(seen).toStrictEqual([over({headline: "Nobody walks out"}), null]);
	});

	it("stays quiet when the same screen is republished", () => {
		let calls = 0;
		const unsubscribe = overStore.subscribe(() => calls++);

		overStore.set(over());
		overStore.set(over());
		unsubscribe();

		expect(calls).toBe(1);
	});

	it("speaks up when another line lands in the log", () => {
		let calls = 0;
		const unsubscribe = overStore.subscribe(() => calls++);

		overStore.set(over());
		overStore.set(over({log: [{r: 1, who: "Cyan", c: "#4dd8ff", t: "took the arena", say: false}]}));
		unsubscribe();

		expect(calls).toBe(2);
	});
});

function sim(overrides: Partial<SimView> = {}): SimView {
	return {weapons: ["dagger"], elements: ["fire"], fusions: [], hp: 60, close: noop, ...overrides};
}

describe("simStore", () => {
	it("starts with the simulator shut", () => {
		expect(simStore.get()).toBeNull();
	});

	it("hands subscribers the shelves it was last given", () => {
		const seen: (SimView | null)[] = [];
		const unsubscribe = simStore.subscribe(() => seen.push(simStore.get()));

		simStore.set(sim({fusions: ["steam"]}));
		simStore.set(null);
		unsubscribe();

		expect(seen).toStrictEqual([sim({fusions: ["steam"]}), null]);
	});

	it("counts the same unlocks as no news, even in a fresh array", () => {
		let calls = 0;
		const unsubscribe = simStore.subscribe(() => calls++);

		simStore.set(sim());
		simStore.set(sim());
		unsubscribe();

		expect(calls).toBe(1);
	});

	it("speaks up once something new has been unlocked", () => {
		let calls = 0;
		const unsubscribe = simStore.subscribe(() => calls++);

		simStore.set(sim());
		simStore.set(sim({elements: ["fire", "water"]}));
		unsubscribe();

		expect(calls).toBe(2);
	});
});

function table(overrides: Partial<TableView> = {}): TableView {
	return {owned: ["fire"], found: [], footwork: [], close: noop, ...overrides};
}

describe("tableStore", () => {
	it("starts with the table shut", () => {
		expect(tableStore.get()).toBeNull();
	});

	it("stays quiet when the same save is republished", () => {
		let calls = 0;
		const unsubscribe = tableStore.subscribe(() => calls++);

		tableStore.set(table());
		tableStore.set(table());
		unsubscribe();

		expect(calls).toBe(1);
	});

	it("counts a fusion turned up mid-match as news", () => {
		const seen: (readonly string[] | undefined)[] = [];
		const unsubscribe = tableStore.subscribe(() => seen.push(tableStore.get()?.found));

		tableStore.set(table());
		tableStore.set(table({found: ["steam"]}));
		unsubscribe();

		expect(seen).toStrictEqual([[], ["steam"]]);
	});
});

/** The frames a match hands over, which the replay only ever reads. */
const FRAMES: Frame[] = [];

function replay(overrides: Partial<ReplayView> = {}): ReplayView {
	return {frames: FRAMES, dim: 9, close: noop, ...overrides};
}

describe("replayStore", () => {
	it("starts with the replay shut", () => {
		expect(replayStore.get()).toBeNull();
	});

	it("stays quiet when the same match is republished", () => {
		let calls = 0;
		const unsubscribe = replayStore.subscribe(() => calls++);

		replayStore.set(replay());
		replayStore.set(replay());
		unsubscribe();

		expect(calls).toBe(1);
	});

	it("counts a match played on another grid as news", () => {
		const seen: (number | undefined)[] = [];
		const unsubscribe = replayStore.subscribe(() => seen.push(replayStore.get()?.dim));

		replayStore.set(replay());
		replayStore.set(replay({dim: 13}));
		unsubscribe();

		expect(seen).toStrictEqual([9, 13]);
	});
});

function design(overrides: Partial<DesignView> = {}): DesignView {
	return {
		dim: 3,
		preset: [null, null, null, null, null, null, null, null, null],
		elements: ["fire"],
		fusions: [],
		spawns: [{index: 0, name: "Vermilion", colour: "#ff4d8d"}],
		seats: 2,
		setSeats: noop,
		paint: noop,
		clear: noop,
		close: noop,
		...overrides,
	};
}

describe("designStore", () => {
	it("starts with the designer shut", () => {
		expect(designStore.get()).toBeNull();
	});

	it("stays quiet when the same board is republished", () => {
		let calls = 0;
		const unsubscribe = designStore.subscribe(() => calls++);

		designStore.set(design());
		designStore.set(design());
		unsubscribe();

		expect(calls).toBe(1);
	});

	it("counts one square painted as news", () => {
		const seen: (readonly (string | null)[] | undefined)[] = [];
		const unsubscribe = designStore.subscribe(() => seen.push(designStore.get()?.preset));

		designStore.set(design());
		designStore.set(design({preset: ["fire", null, null, null, null, null, null, null, null]}));
		unsubscribe();

		expect(seen.map((preset) => preset?.[0])).toStrictEqual([null, "fire"]);
	});

	it("counts the ring being drawn for another table as news", () => {
		const seen: (number | undefined)[] = [];
		const unsubscribe = designStore.subscribe(() => seen.push(designStore.get()?.spawns.length));

		designStore.set(design());
		designStore.set(
			design({
				seats: 3,
				spawns: [
					{index: 0, name: "Vermilion", colour: "#ff4d8d"},
					{index: 8, name: "Cyan", colour: "#4dd8ff"},
				],
			}),
		);
		unsubscribe();

		expect(seen).toStrictEqual([1, 2]);
	});
});

function menu(): MenuView {
	const arena = {
		seats: [{seat: 0, name: "", placeholder: "Vermilion", swatch: 0}],
		swatches: [{colour: "#ff4d8d", name: "Rose"}],
		teams: [{name: "Vermilion", colour: "#ff4d8d", seats: 1}],
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
	} satisfies ArenaSetup;
	const loadout = {
		who: "all",
		scopes: [{who: "all", label: "Everyone", colour: "var(--accent)", own: false}],
		elements: [],
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
	} satisfies LoadoutSetup;
	const arsenal = {
		coins: 0,
		saveError: null,
		shelves: [],
		cheat: "open",
		tries: 0,
		triesAllowed: 5,
		submitCode: noop,
		resetProgress: noop,
	} satisfies ArsenalSetup;

	return {
		arena,
		loadout,
		arsenal,
		themeLabel: "Day mode",
		toggleTheme: noop,
		openSimulator: noop,
		openDesigner: noop,
		openTable: noop,
		start: noop,
	};
}

describe("menuStore", () => {
	it("starts with nothing published", () => {
		expect(menuStore.get()).toBeNull();
	});

	it("hands subscribers the screen it was last given", () => {
		const seen: (number | undefined)[] = [];
		const unsubscribe = menuStore.subscribe(() => seen.push(menuStore.get()?.arsenal.coins));

		menuStore.set(menu());
		menuStore.set(null);
		unsubscribe();

		expect(seen).toStrictEqual([0, undefined]);
	});

	/* Unlike the screens the match redraws behind, the setup screen is only published once
	   something on it has changed, so a second publication is a second change. */
	it("counts every republished screen as news", () => {
		let calls = 0;
		const unsubscribe = menuStore.subscribe(() => calls++);

		menuStore.set(menu());
		menuStore.set(menu());
		unsubscribe();

		expect(calls).toBe(2);
	});

	it("stays quiet while a match has the screen and the game keeps redrawing", () => {
		let calls = 0;
		const unsubscribe = menuStore.subscribe(() => calls++);

		menuStore.set(null);
		menuStore.set(null);
		unsubscribe();

		expect(calls).toBe(0);
	});
});
