// @vitest-environment jsdom
/**
 * The online panel's half of the setup screen: what a match opened from this device would be dealt
 * from, and the cap that decides whether it may be opened at all.
 *
 * Hot-seat is welcome to a treasury that has bought the whole shop, because one save is playing
 * itself. Online there are two arsenals and only one of them can be the one dealt from, so the
 * host's is, held to three of each kind -- and that cap has to be visible on the panel rather than
 * discovered as a refusal from a server.
 */

import {describe, it, expect, beforeEach, afterEach, vi} from "vitest";
import {lobbyStore} from "../../src/game/bridge.js";
import {BASE, MV, WBASE} from "../../src/game/data/index.js";
import {drawLobby} from "../../src/game/lobby.js";
import {drawMenu} from "../../src/game/menu.js";
import {S} from "../../src/game/state.js";
import type {LobbyLoadout, LobbyView} from "../../src/game/bridge.js";

function lobby(): LobbyView {
	const view = lobbyStore.get();
	if (view === null) throw new Error("nothing has drawn the lobby");
	return view;
}

/** One row of the loadout by the heading the panel gives it. */
function row(loadout: LobbyLoadout, heading: string): {names: readonly string[]; over: boolean} {
	const found = loadout.rows.find((one) => one.heading === heading);
	if (found === undefined) throw new Error(`no ${heading} row`);
	return found;
}

/** What the host posted, dug back out of the request body. */
function posted(body: BodyInit | null | undefined): Record<string, unknown> {
	return JSON.parse(typeof body === "string" ? body : "{}") as Record<string, unknown>;
}

beforeEach(() => {
	S.screen = "menu";
	S.unlocked = [...BASE];
	S.wunlocked = [...WBASE];
	S.munlocked = [];
	S.mvShared = 0;
	S.elOff = [];
	S.wOff = [];
	S.pOff = {};
	drawLobby();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("what an online match would be dealt from", () => {
	it("is what the setup screen has switched on for everybody", () => {
		const {loadout} = lobby();

		expect(row(loadout, "Elements").names).toStrictEqual(["Fire", "Water", "Earth"]);
		expect(row(loadout, "Weapons").names).toStrictEqual(["Dagger", "Sword", "Crossbow"]);
		expect(row(loadout, "Footwork").names).toStrictEqual([]);
	});

	/* A save that has bought nothing is already inside the cap, which is the point of the number:
	   three of each is the game as it comes out of the box. */
	it("is ready to open with as a save that has bought nothing", () => {
		expect(lobby().loadout.ready).toBe(true);
	});

	it("counts a bought piece of footwork only once it is switched on", () => {
		S.munlocked = ["jump"];
		drawLobby();
		expect(row(lobby().loadout, "Footwork").names).toStrictEqual([]);

		S.mvShared = MV["jump"]!.bit;
		drawLobby();

		expect(row(lobby().loadout, "Footwork").names).toStrictEqual(["Jump"]);
	});

	/* The panel above this one is what the cards are switched off in, and it publishes through
	   src/game/menu.ts. The two would drift apart the moment a chip was toggled if this one did not
	   go back up with it. */
	it("goes back up whenever the setup screen does", () => {
		S.unlocked = [...BASE, "frost"];

		drawMenu();

		expect(row(lobby().loadout, "Elements").names).toContain("Frost");
	});
});

describe("hosting a match on more than the wire will take", () => {
	it("marks the row that is over the cap and will not open a match at all", () => {
		const fetched = vi.spyOn(globalThis, "fetch");
		S.unlocked = [...BASE, "frost"];
		drawLobby();

		expect(row(lobby().loadout, "Elements").over).toBe(true);
		expect(lobby().loadout.ready).toBe(false);

		lobby().host();

		expect(fetched).not.toHaveBeenCalled();
		expect(lobby().error).toContain("elements");
	});

	/* Trimming the list would be choosing, silently, which three of somebody's cards they brought.
	   The panel says which row to cut instead, and every row that is over is named. */
	it("names every row that is over rather than picking three of them", () => {
		vi.spyOn(globalThis, "fetch");
		S.unlocked = [...BASE, "frost"];
		S.wunlocked = [...WBASE, "spear"];
		drawLobby();

		lobby().host();

		expect(lobby().error).toContain("elements");
		expect(lobby().error).toContain("weapons");
	});
});

describe("hosting a match inside the cap", () => {
	it("posts the very cards the panel listed", async () => {
		const fetched = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({seats: 2}));
		S.unlocked = [...BASE, "frost"];
		S.elOff = ["fire", "water"];
		S.munlocked = ["jump"];
		S.mvShared = MV["jump"]!.bit;
		drawLobby();

		lobby().host();
		await vi.waitFor(() => {
			expect(lobby().opening).toBe(false);
		});

		expect(posted(fetched.mock.calls[0]?.[1]?.body)).toMatchObject({
			els: ["earth", "frost"],
			weps: [...WBASE],
			moves: ["jump"],
		});
	});
});
