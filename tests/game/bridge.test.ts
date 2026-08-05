import {describe, it, expect, afterEach} from "vitest";
import {handoffStore, type HandoffView} from "../../src/game/bridge.js";

function view(overrides: Partial<HandoffView> = {}): HandoffView {
	return {seat: 0, name: "Vermilion", colour: "#ff4d8d", dismiss: noop, ...overrides};
}

function noop(): void {
	// a stable reference, so republishing the same seat compares equal
}

afterEach(() => {
	handoffStore.set(null);
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
