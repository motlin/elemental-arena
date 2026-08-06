// @vitest-environment jsdom
import {describe, it, expect} from "vitest";
import {act, render, screen} from "@testing-library/react";
import {ActionBar} from "../../src/ui/ActionBar.js";
import type {ActionBarView, ActionButton} from "../../src/game/bridge.js";

function button(over: Partial<ActionButton> = {}): ActionButton {
	return {key: "a1", label: "Lay on a tile · 1", disabled: false, facedown: false, click: () => undefined, ...over};
}

function bar(over: Partial<ActionBarView> = {}): ActionBarView {
	return {hint: [], alarm: false, buttons: [], tail: null, ...over};
}

describe("ActionBar", () => {
	it("says what the game is waiting for", () => {
		const hint = [{text: "Pick a tile to strike. Esc to cancel.", strong: false}];
		const {container} = render(<ActionBar view={bar({hint})} />);

		expect(container.querySelector(".actbar > .hint")?.textContent).toBe("Pick a tile to strike. Esc to cancel.");
		expect(container.querySelectorAll("button").length).toBe(0);
	});

	it("shouts the chaos question and picks out the card it is about", () => {
		const hint = [
			{text: "Throw away ", strong: false},
			{text: "Ember Blade", strong: true},
			{text: "?", strong: false},
		];
		const {container} = render(<ActionBar view={bar({hint, alarm: true})} />);
		const span = container.querySelector(".hint");

		expect(span?.textContent).toBe("Throw away Ember Blade?");
		expect((span as HTMLElement).style.color).toBe("rgb(255, 143, 107)");
		expect(span?.querySelector("b")?.textContent).toBe("Ember Blade");
	});

	it("leaves a calm hint its own colour", () => {
		const hint = [{text: "Click a card, or step onto a highlighted tile.", strong: false}];
		const {container} = render(<ActionBar view={bar({hint})} />);

		expect(container.querySelector<HTMLElement>(".hint")?.style.color).toBe("");
		expect(container.querySelector(".hint")?.querySelector("b")).toBe(null);
	});

	it("says nothing at all when the game has nothing to say", () => {
		const {container} = render(<ActionBar view={bar({buttons: [button()]})} />);

		expect(container.querySelector(".hint")).toBe(null);
		expect(container.querySelector(".actbar")?.children.length).toBe(1);
	});

	it("offers a card the seat has never seen face down", () => {
		const buttons = [
			button({key: "u7", label: "Ember Blade"}),
			button({key: "u8", label: "Card 2", facedown: true}),
		];
		const {container} = render(<ActionBar view={bar({buttons})} />);
		const offered = [...container.querySelectorAll("button")];

		expect(offered.map((b) => b.className)).toEqual(["act", "act facedown"]);
		expect(offered.map((b) => b.textContent)).toEqual(["Ember Blade", "Card 2"]);
	});

	it("hands the click straight back to the game and greys out what cannot be done", () => {
		let taken = 0;
		const buttons = [button({key: "u7", click: () => taken++}), button({key: "u8", disabled: true})];
		render(<ActionBar view={bar({buttons})} />);
		const offered = screen.getAllByRole("button");

		act(() => {
			offered[0]?.click();
		});

		expect(taken).toBe(1);
		expect(offered.map((b) => (b as HTMLButtonElement).disabled)).toEqual([false, true]);
	});

	it("adds a second line after the buttons when there is more to say", () => {
		const hint = [{text: "Slide everyone:", strong: false}];
		const view = bar({hint, buttons: [button({key: "shL", label: "← Left"})], tail: "Esc to cancel."});
		const {container} = render(<ActionBar view={view} />);
		const said = [...container.querySelectorAll(".actbar > *")].map((el) => el.textContent);

		expect(said).toEqual(["Slide everyone:", "← Left", "Esc to cancel."]);
	});
});
