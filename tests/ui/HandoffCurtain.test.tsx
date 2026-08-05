// @vitest-environment jsdom
import {describe, it, expect, afterEach} from "vitest";
import {act, render, screen} from "@testing-library/react";
import {HandoffCurtain} from "../../src/ui/HandoffCurtain.js";
import {handoffStore} from "../../src/game/bridge.js";

afterEach(() => {
	act(() => {
		handoffStore.set(null);
	});
});

describe("HandoffCurtain", () => {
	it("paints nothing while the curtain is down", () => {
		const {container} = render(<HandoffCurtain />);

		expect(container.innerHTML).toBe("");
	});

	it("names the seat that is up and offers the button in their name", () => {
		render(<HandoffCurtain />);

		act(() => {
			handoffStore.set({seat: 3, name: "Amethyst", colour: "#c98cff", dismiss: () => undefined});
		});

		expect(screen.getByText("Amethyst is up")).toBeDefined();
		expect(screen.getByRole("button").textContent).toBe("I'm Amethyst");
	});

	it("wears the seat's own glyph colour", () => {
		render(<HandoffCurtain />);

		act(() => {
			handoffStore.set({seat: 3, name: "Amethyst", colour: "#c98cff", dismiss: () => undefined});
		});
		const glyph = document.querySelector(".bigglyph");

		expect(glyph?.className).toBe("bigglyph mage p3");
		expect(glyph?.getAttribute("style")).toBe("--pc: #c98cff;");
	});

	it("hands the click straight back to the game", () => {
		let dismissed = 0;
		render(<HandoffCurtain />);
		act(() => {
			handoffStore.set({seat: 0, name: "Vermilion", colour: "#ff4d8d", dismiss: () => dismissed++});
		});

		act(() => {
			screen.getByRole("button").click();
		});

		expect(dismissed).toBe(1);
	});

	it("drops the curtain when the game publishes nothing", () => {
		const {container} = render(<HandoffCurtain />);
		act(() => {
			handoffStore.set({seat: 0, name: "Vermilion", colour: "#ff4d8d", dismiss: () => undefined});
		});

		act(() => {
			handoffStore.set(null);
		});

		expect(container.innerHTML).toBe("");
	});
});
