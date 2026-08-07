// @vitest-environment jsdom
import {describe, it, expect, afterEach, vi} from "vitest";
import {act, render, screen} from "@testing-library/react";
import {MixingTable} from "../../src/ui/MixingTable.js";
import {tableStore, type TableView} from "../../src/game/bridge.js";
import {EL, FUSE, MV} from "../../src/game/data/index.js";

const ELS = Object.keys(EL);

/** Every fusion there is, which is what a save that has mixed everything has turned up. */
const EVERY_FUSION = [...new Set(Object.values(FUSE))];

/** Puts the table up the way the menu does, with whatever the save has turned up so far. */
function open(overrides: Partial<TableView> = {}): void {
	act(() => {
		tableStore.set({
			owned: ["fire", "water", "earth"],
			found: [],
			footwork: [],
			close: () => undefined,
			...overrides,
		});
	});
}

/** Every mixed cell in the grid, reading rows top to bottom, without the name headers. */
function cells(): HTMLElement[] {
	return [...document.querySelectorAll<HTMLElement>(".matrix .mc:not(.hdr)")];
}

/** The cell where the row element meets the column element. */
function cell(row: string, col: string): HTMLElement {
	return cells()[ELS.indexOf(row) * ELS.length + ELS.indexOf(col)]!;
}

/** A name header along an edge; there are two of each, and either one selects the element. */
function header(name: string): HTMLElement {
	return screen.getAllByRole("button", {name})[0]!;
}

/** A piece of footwork in the palette below the grid. */
function footwork(name: string): HTMLElement {
	return [...document.querySelectorAll<HTMLElement>(".bpal .bp")].find((b) => b.textContent === name)!;
}

function detail(): string {
	return document.querySelector(".tdetail")?.textContent ?? "";
}

function click(el: HTMLElement): void {
	act(() => {
		el.click();
	});
}

afterEach(() => {
	act(() => {
		tableStore.set(null);
	});
});

describe("MixingTable", () => {
	it("paints nothing while the table is shut", () => {
		const {container} = render(<MixingTable />);

		expect(container.innerHTML).toBe("");
	});

	it("lays out a cell for every pair of elements, the diagonal included", () => {
		render(<MixingTable />);

		open();

		expect(cells().length).toBe(ELS.length * ELS.length);
	});

	it("names only the fusions turned up in play, and keeps the rest to itself", () => {
		render(<MixingTable />);

		open({owned: ELS, found: ["steam"]});

		expect([...document.querySelectorAll(".mc.found")].map((c) => c.textContent)).toStrictEqual(["Steam", "Steam"]);
		expect(cell("earth", "fire").textContent).toBe("? ? ?");
	});

	it("opens reading out fire, the element every save starts on", () => {
		render(<MixingTable />);

		open();

		expect(document.querySelector(".dh b")?.textContent).toBe("Fire");
		expect(detail()).toContain("base element");
	});

	it("reads out a fusion once its cell is picked", () => {
		render(<MixingTable />);
		open({owned: ELS, found: ["steam"]});

		click(cell("fire", "water"));

		expect(document.querySelector(".dh b")?.textContent).toBe("Steam");
		expect(detail()).toContain("Fire + Water");
	});

	it("lights up the elements the picked fusion is made from", () => {
		render(<MixingTable />);
		open({owned: ELS, found: ["steam"]});

		click(cell("fire", "water"));

		expect([...document.querySelectorAll(".mc.hdr.parent")].map((c) => c.textContent)).toStrictEqual([
			"Fire",
			"Water",
			"Fire",
			"Water",
		]);
	});

	it("names the price of an element the save has not bought", () => {
		render(<MixingTable />);
		open();

		click(header("Air"));

		expect(detail()).toContain("Buy Air for 100 coin to read this.");
	});

	it("says what to mix for a fusion nobody has turned up yet", () => {
		render(<MixingTable />);
		open({owned: ELS});

		click(cell("fire", "water"));

		expect(detail()).toContain("Mix Fire + Water in a match to find out what it makes.");
	});

	it("reads out a piece of footwork in the arsenal", () => {
		render(<MixingTable />);
		open({footwork: ["jump"]});

		click(footwork("Jump"));

		expect(detail()).toContain("in your arsenal");
		expect(detail()).toContain("1 energy a use");
	});

	it("keeps an unbought piece of footwork to itself", () => {
		render(<MixingTable />);
		open();

		click(footwork("Jump"));

		expect(detail()).toContain("not bought yet");
		expect(detail()).toContain("Buy it for 150 coin to find out.");
	});

	it("shuts through the view it published", () => {
		const close = vi.fn<() => void>();
		render(<MixingTable />);
		open({close});

		click(screen.getByRole("button", {name: "Close"}));

		expect(close).toHaveBeenCalledOnce();
	});

	/** Walks every entry the table can be asked about and reports whatever renders badly. */
	function everyDetail(): string[] {
		const broken: string[] = [];
		const read = (what: string, el: HTMLElement): void => {
			click(el);
			const text = detail();
			if (text === "") broken.push(`${what}: nothing rendered`);
			else if (/undefined|NaN/.test(text)) broken.push(`${what}: ${text.slice(0, 120)}`);
		};

		for (const el of ELS) read(el, header(EL[el]!.n));
		for (const a of ELS) for (const b of ELS) read(`${a} + ${b}`, cell(a, b));
		for (const [k, v] of Object.entries(MV)) read(k, footwork(v.n));
		return broken;
	}

	/* These two click through every element against every other one, so they carry a few hundred
	   renders each. They land around 2-4s on a quiet machine but have been measured at 12s on a busy
	   one, which put them over the 5s default often enough to fail a run for no real reason. The
	   allowance is for the spikes; nothing here should ever take anywhere near it. */
	const EVERY_ENTRY_TIMEOUT = 30_000;

	it(
		"reads out every element, every fusion, and every piece of footwork",
		() => {
			render(<MixingTable />);
			open({owned: ELS, found: EVERY_FUSION, footwork: Object.keys(MV)});

			expect(everyDetail()).toStrictEqual([]);
		},
		EVERY_ENTRY_TIMEOUT,
	);

	it(
		"reads out every undiscovered entry too",
		() => {
			render(<MixingTable />);
			open();

			expect(everyDetail()).toStrictEqual([]);
		},
		EVERY_ENTRY_TIMEOUT,
	);
});
