// @vitest-environment jsdom
import {describe, it, expect, vi} from "vitest";
import {fireEvent, render, screen} from "@testing-library/react";
import {OnlinePanel} from "../../src/ui/OnlinePanel.js";
import {OnlineStripView} from "../../src/ui/OnlineStrip.js";
import {sampleBringing} from "../../src/ui/setupSamples.js";
import type {LobbyView} from "../../src/game/bridge.js";

function panel(over: Partial<LobbyView> = {}): LobbyView {
	return {
		code: null,
		opening: false,
		error: null,
		link: null,
		seats: 0,
		loadout: sampleBringing(),
		host: vi.fn<() => void>(),
		sit: vi.fn<() => void>(),
		join: vi.fn<(link: string) => void>(),
		...over,
	};
}

const OPENED: Partial<LobbyView> = {
	code: "quiet-forge",
	link: "https://arena.example/?code=quiet-forge",
	seats: 2,
};

describe("the online panel", () => {
	it("offers a match to open, and no links before one is", () => {
		const view = panel();
		render(<OnlinePanel {...view} />);

		fireEvent.click(screen.getByText("Host a match"));

		expect(view.host).toHaveBeenCalledOnce();
		expect(screen.queryByLabelText("Link to this match")).toBeNull();
	});

	it("says nothing can be opened twice while one is being opened", () => {
		render(<OnlinePanel {...panel({opening: true})} />);

		expect(screen.getByText("Opening a match...").hasAttribute("disabled")).toBe(true);
	});

	/* One link for the whole match, naming no seat: whoever follows it is dealt one by the room,
	   which is what stops the host holding everybody else's seat. */
	it("hands out one link for the match, and says how many it seats", () => {
		render(<OnlinePanel {...panel(OPENED)} />);

		expect(screen.getByLabelText<HTMLInputElement>("Link to this match").value).toBe(
			"https://arena.example/?code=quiet-forge",
		);
		expect(screen.getByText("2 seats")).toBeDefined();
	});

	it("lets whoever opened the match take a seat in it without pasting the link back", () => {
		const view = panel(OPENED);
		render(<OnlinePanel {...view} />);

		fireEvent.click(screen.getByText("Sit down"));

		expect(view.sit).toHaveBeenCalledOnce();
	});

	it("takes a pasted link, and offers nothing to do with an empty box", () => {
		const view = panel();
		render(<OnlinePanel {...view} />);
		const join = screen.getByText("Join");

		expect(join.hasAttribute("disabled")).toBe(true);

		fireEvent.change(screen.getByLabelText("Invite link to join"), {
			target: {value: "https://arena.example/?code=quiet-forge&seat=1&token=two"},
		});
		fireEvent.click(join);

		expect(view.join).toHaveBeenCalledExactlyOnceWith("https://arena.example/?code=quiet-forge&seat=1&token=two");
	});

	it("says why when the match server would not open one", () => {
		render(<OnlinePanel {...panel({error: "already open"})} />);

		expect(screen.getByText("already open")).toBeDefined();
	});

	/* Everybody at the table plays the host's cards, so the host has to be able to see which ones
	   they are before sending the link rather than after. */
	it("lists what everybody would be dealt, and says so when that is nothing", () => {
		render(<OnlinePanel {...panel()} />);

		expect(screen.getByText("Fire, Water, Earth")).toBeDefined();
		expect(screen.getByText("Dagger, Sword, Crossbow")).toBeDefined();
		expect(screen.getByText("none")).toBeDefined();
	});

	it("spends the host button while a row is over the cap, and says what the cap is", () => {
		const loadout = sampleBringing({
			rows: [
				{heading: "Elements", names: ["Fire", "Water", "Earth", "Frost"], over: true},
				{heading: "Weapons", names: ["Dagger"], over: false},
				{heading: "Footwork", names: [], over: false},
			],
			ready: false,
		});
		const view = panel({loadout});
		render(<OnlinePanel {...view} />);

		fireEvent.click(screen.getByText("Host a match"));

		expect(screen.getByText("Host a match").hasAttribute("disabled")).toBe(true);
		expect(screen.getByText("4, 3 allowed")).toBeDefined();
		expect(view.host).not.toHaveBeenCalled();
	});
});

describe("the strip over an online match", () => {
	it("names the match and the seat, counting seats the way a player would", () => {
		render(
			<OnlineStripView
				code="quiet-forge"
				seat={1}
				status="playing"
				notice={null}
				away={[]}
				dismiss={vi.fn<() => void>()}
			/>,
		);

		expect(screen.getByText("Match quiet-forge · seat 2")).toBeDefined();
		expect(screen.getByText("Connected")).toBeDefined();
	});

	it("carries what the room said about a move it would not take, and a way to put it away", () => {
		const dismiss = vi.fn<() => void>();
		render(
			<OnlineStripView
				code="quiet-forge"
				seat={0}
				status="playing"
				notice="you cannot afford that"
				away={[]}
				dismiss={dismiss}
			/>,
		);

		fireEvent.click(screen.getByText("Dismiss"));

		expect(screen.getByText(/you cannot afford that/)).toBeDefined();
		expect(dismiss).toHaveBeenCalledOnce();
	});

	/* A seat with nobody in it is the one thing the arena itself cannot show: it looks exactly like
	   a seat whose player is thinking. */
	it("says which other seat has gone quiet, counting it the way a player would", () => {
		render(
			<OnlineStripView
				code="quiet-forge"
				seat={0}
				status="playing"
				notice={null}
				away={[1, 2]}
				dismiss={vi.fn<() => void>()}
			/>,
		);

		expect(screen.getByText("Seats 2 and 3 have gone quiet")).toBeDefined();
	});

	it("says nothing about presence while everybody is in their seat", () => {
		render(
			<OnlineStripView
				code="quiet-forge"
				seat={0}
				status="playing"
				notice={null}
				away={[]}
				dismiss={vi.fn<() => void>()}
			/>,
		);

		expect(screen.queryByText(/gone quiet/)).toBeNull();
	});

	it("says so when the socket has gone, rather than looking like a live match", () => {
		render(
			<OnlineStripView
				code="quiet-forge"
				seat={0}
				status="gone"
				notice={null}
				away={[]}
				dismiss={vi.fn<() => void>()}
			/>,
		);

		expect(screen.getByText("Disconnected")).toBeDefined();
	});
});
