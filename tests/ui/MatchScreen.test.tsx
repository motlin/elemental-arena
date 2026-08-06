// @vitest-environment jsdom
import {describe, it, expect, afterEach} from "vitest";
import {act, render} from "@testing-library/react";
import {MatchScreen, MatchScreenView} from "../../src/ui/MatchScreen.js";
import {matchStore} from "../../src/game/bridge.js";
import {sampleMatch} from "../../src/ui/matchSample.js";

afterEach(() => {
	act(() => {
		matchStore.set(null);
	});
});

describe("MatchScreen", () => {
	it("paints nothing while no match is running", () => {
		const {container} = render(<MatchScreen />);

		expect(container.innerHTML).toBe("");
	});

	it("puts the arena up when the game publishes a position", () => {
		const {container} = render(<MatchScreen />);

		act(() => {
			matchStore.set(sampleMatch());
		});

		expect(container.querySelector("#game")?.className).toBe("on");
	});

	it("takes the arena down again when the match ends", () => {
		const {container} = render(<MatchScreen />);
		act(() => {
			matchStore.set(sampleMatch());
		});

		act(() => {
			matchStore.set(null);
		});

		expect(container.innerHTML).toBe("");
	});

	it("orders the arena as table talk, board, tile info", () => {
		const {container} = render(<MatchScreenView view={sampleMatch()} />);
		const columns = [...(container.querySelector(".arena")?.children ?? [])].map((column) => column.className);

		expect(columns).toStrictEqual(["side left", "boardcol", "side right"]);
	});

	it("scrolls a board too wide for its column instead of overlapping the side panels", () => {
		const {container} = render(<MatchScreenView view={sampleMatch()} />);
		const board = container.querySelector("#board");

		expect([board?.parentElement?.className, board?.parentElement?.parentElement?.className]).toStrictEqual([
			"boardscroll",
			"boardcol",
		]);
	});

	it("heads each side panel with what it holds", () => {
		const {container} = render(<MatchScreenView view={sampleMatch()} />);

		expect([...container.querySelectorAll("h3")].map((head) => head.textContent)).toStrictEqual([
			"Table talk",
			"Combatants",
			"Tile",
			"Fusion codex",
		]);
	});

	it("says how far the codex has got, and opens the table from under it", () => {
		let opened = 0;
		const view = sampleMatch();
		const {container} = render(
			<MatchScreenView view={{...view, topbar: {...view.topbar, openTable: () => opened++}}} />,
		);
		const codexButton = container.querySelector<HTMLButtonElement>(".side.right .box:last-child button");

		expect(container.querySelector(".codexline")?.textContent).toBe("12 of 45 fusions found");
		act(() => {
			codexButton?.click();
		});

		expect(opened).toBe(1);
	});
});
