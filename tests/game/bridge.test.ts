import {describe, it, expect, afterEach} from "vitest";
import {handoffStore, overStore, type HandoffView, type OverView} from "../../src/game/bridge.js";
import type {LogEntry} from "../../src/game/types.js";

function view(overrides: Partial<HandoffView> = {}): HandoffView {
	return {seat: 0, name: "Vermilion", colour: "#ff4d8d", dismiss: noop, ...overrides};
}

function noop(): void {
	// a stable reference, so republishing the same seat compares equal
}

afterEach(() => {
	handoffStore.set(null);
	overStore.set(null);
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
