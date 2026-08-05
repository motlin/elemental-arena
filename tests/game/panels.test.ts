import {describe, it, expect, beforeAll, afterAll} from "vitest";
import {loadGame, readGameSource, type Card, type GameHarness, type Player} from "./harness.js";
import type {MenuView} from "../../src/game/bridge.js";

const EL_UID = 9001;
const WEAPON_UID = 9002;

/** Every panel container the game paints into during a match. */
const PANELS = ["actbar", "moves", "wep", "hand", "roster", "chatlog", "tileinfo", "board"] as const;

/** Every aiming mode from MODEHINT, plus the modes the action bar handles on its own. */
const MODES: (string | null)[] = [
	null,
	"place",
	"attack",
	"jump",
	"dash",
	"leap",
	"light",
	"mark",
	"swap",
	"theft",
	"warp",
	"spread",
	"shift",
	"mix",
];

function hand(): Card[] {
	return [
		{uid: EL_UID, k: "el", id: "fire"},
		{uid: WEAPON_UID, k: "w", ids: ["dagger"], els: ["steam"]},
		{uid: EL_UID + 2, k: "el", id: "water"},
	];
}

/**
 * Starts a match with everything unlocked and every seat given every piece of footwork, so the
 * panels render their fullest form rather than the stripped-down two-element default.
 */
async function startedMatch(): Promise<GameHarness> {
	const h = await loadGame();
	const {game} = h;
	game.S.unlocked = Object.keys(game.EL);
	game.S.wunlocked = Object.keys(game.W);
	game.S.munlocked = Object.keys(game.MV);
	game.S.np = 4;
	const everyMove = game.mvOwnedMask();
	game.S.mv = game.S.mv.map(() => everyMove);
	game.S.mvShared = everyMove;
	game.S.chaos = true;
	game.S.smash = true;
	game.startMatch();
	return h;
}

function armCurrentPlayer(h: GameHarness): Player {
	const p = h.game.cur();
	p.hand = hand();
	p.nrg = 9;
	h.game.S.toss = false;
	h.game.S.tossPick = null;
	h.game.S.steal = null;
	return p;
}

describe("match panels in every mode", () => {
	let h: GameHarness;

	beforeAll(async () => {
		h = await startedMatch();
	});

	afterAll(() => {
		h.close();
	});

	it("covers every mode the action bar has a hint for", () => {
		const uncovered = Object.keys(h.game.MODEHINT).filter((mode) => !MODES.includes(mode));

		expect(uncovered).toStrictEqual([]);
	});

	it("starts the match on the game screen", () => {
		expect(h.game.S.screen).toBe("game");
		expect(h.game.S.players.length).toBe(4);
		expect(h.document.getElementById("board")?.children.length).toBe(h.game.S.dim * h.game.S.dim);
	});

	for (const mode of MODES) {
		it(`renders every panel in ${mode ?? "no"} mode`, () => {
			const p = armCurrentPlayer(h);
			h.game.S.sel = mode === "mix" || mode === "place" ? EL_UID : null;
			h.game.S.mixFrom = mode === "mix" ? EL_UID : null;
			p.held = mode === "attack" ? WEAPON_UID : null;
			h.game.S.mode = mode;
			h.errors.length = 0;

			expect(() => {
				h.game.render();
			}).not.toThrow();
			expect(h.errors).toStrictEqual([]);
			for (const panel of PANELS) {
				expect(h.document.getElementById(panel)?.innerHTML ?? "").not.toBe("");
			}
		});
	}

	it("renders the action bar while a card is being stolen", () => {
		armCurrentPlayer(h);
		h.game.S.mode = null;
		const victim = h.game.S.players.find((q) => q !== h.game.cur());
		expect(victim).toBeDefined();
		h.game.S.steal = victim?.i ?? 1;
		h.errors.length = 0;

		expect(() => {
			h.game.render();
		}).not.toThrow();
		expect(h.errors).toStrictEqual([]);
		expect(h.document.getElementById("stlno")).not.toBeNull();
		h.game.S.steal = null;
	});

	it("renders the action bar for both halves of a chaos toss", () => {
		const p = armCurrentPlayer(h);
		h.game.S.mode = null;
		h.game.S.toss = true;
		h.game.S.tossPick = null;
		h.game.render();
		expect(h.document.getElementById("tossyes")).toBeNull();

		h.game.S.tossPick = p.hand[0]?.uid ?? null;
		h.errors.length = 0;
		expect(() => {
			h.game.render();
		}).not.toThrow();
		expect(h.errors).toStrictEqual([]);
		expect(h.document.getElementById("tossyes")).not.toBeNull();
		expect(h.document.getElementById("tossno")).not.toBeNull();

		h.game.S.toss = false;
		h.game.S.tossPick = null;
	});

	it("renders the tile reader with and without a square picked", () => {
		armCurrentPlayer(h);
		h.game.S.mode = null;
		h.game.S.imode = true;
		h.game.S.look = null;
		h.game.render();
		expect(h.document.getElementById("tileinfo")?.innerHTML ?? "").not.toBe("");

		h.game.S.look = h.game.S.players.map((q) => h.game.S.dim * q.y + q.x)[0] ?? 0;
		h.game.S.reach = h.game.S.players.map((q) => q.i);
		h.errors.length = 0;
		expect(() => {
			h.game.render();
		}).not.toThrow();
		expect(h.errors).toStrictEqual([]);
		expect(h.document.getElementById("tileinfo")?.textContent ?? "").not.toContain("undefined");

		h.game.S.imode = false;
		h.game.S.look = null;
		h.game.S.reach = [];
	});

	it("publishes the handoff curtain for React to paint", () => {
		const p = armCurrentPlayer(h);
		h.game.S.mode = null;
		h.game.S.handoff = true;
		h.errors.length = 0;

		h.game.render();

		expect(h.errors).toStrictEqual([]);
		const view = h.bridge.handoffStore.get();
		expect(view?.seat).toBe(p.i);
		expect(view?.name).toBe(p.name);
		expect(view?.colour).toBe(p.c);
		h.game.S.handoff = false;
	});

	it("takes the handoff curtain back down through the view it published", () => {
		armCurrentPlayer(h);
		h.game.S.mode = null;
		h.game.S.handoff = true;
		h.game.render();

		h.bridge.handoffStore.get()?.dismiss();

		expect(h.game.S.handoff).toBe(false);
		expect(h.bridge.handoffStore.get()).toBeNull();
	});

	it("renders every tile of every terrain the game can lay", () => {
		armCurrentPlayer(h);
		h.game.S.mode = null;
		const terrains = Object.keys(h.game.T);
		h.game.S.board.forEach((cell, i) => {
			const key = terrains[i % terrains.length] ?? null;
			cell.t = key;
			cell.el = null;
			cell.life = key === null ? 0 : (h.game.T[key]?.life ?? 1);
		});
		h.errors.length = 0;

		expect(() => {
			h.game.render();
		}).not.toThrow();
		expect(h.errors).toStrictEqual([]);
		expect(h.document.getElementById("board")?.innerHTML ?? "").not.toContain("undefined");
	});
});

describe("the setup screen", () => {
	let h: GameHarness;

	/** The screen as it stands, which is republished whole after every change. */
	function menu(): MenuView {
		const view = h.bridge.menuStore.get();
		expect(view).not.toBeNull();
		return view!;
	}

	beforeAll(async () => {
		h = await loadGame();
		h.game.S.unlocked = Object.keys(h.game.EL);
		h.game.S.wunlocked = Object.keys(h.game.W);
		h.game.S.munlocked = Object.keys(h.game.MV);
		h.game.drawMenu();
	});

	afterAll(() => {
		h.close();
	});

	it("publishes the save whole the moment it has loaded", () => {
		expect(menu().arena.seats.length).toBe(h.game.S.np);
		expect([...menu().loadout.elements].map((c) => c.key).sort()).toStrictEqual(Object.keys(h.game.EL).sort());
		expect(menu().arsenal.shelves.map((shelf) => shelf.heading)).toStrictEqual(["Elements", "Weapons", "Footwork"]);
	});

	it("seats everybody at every table size", () => {
		for (let seats = 2; seats <= 8; seats++) {
			menu().arena.setSeatCount(seats);

			expect(menu().arena.seats.map((row) => row.seat)).toStrictEqual(Array.from({length: seats}, (_, i) => i));
		}
		menu().arena.setSeatCount(2);
	});

	it("names a colour rather than a seat, so everyone playing it answers to it", () => {
		menu().arena.recolour(1, 0);
		menu().arena.rename(0, "The Twins");

		expect(menu().arena.seats.map((row) => row.name)).toStrictEqual(["The Twins", "The Twins"]);
		expect(menu().arena.teams).toStrictEqual([{name: "The Twins", colour: "#ff4d8d", seats: 2}]);

		menu().arena.rename(0, "");
		menu().arena.recolour(1, 1);
	});

	it("holds a typed number inside its range, and an empty box at the default", () => {
		menu().arena.setOpenHand(400);
		expect(h.game.S.openHand).toBe(30);

		menu().arena.setOpenHand(Number.NaN);
		expect(h.game.S.openHand).toBe(3);
	});

	it("gives a seat a list of its own, then puts it back on the shared one", () => {
		menu().loadout.setWho(0);
		menu().loadout.toggleElement("water");

		expect(h.game.S.pOff[0]?.el).toStrictEqual(["water"]);
		expect(h.game.S.elOff).toStrictEqual([]);
		expect(menu().loadout.scopes[1]?.own).toBe(true);

		menu().loadout.share?.();

		expect(h.game.S.pOff[0]).toBeUndefined();
		expect(menu().loadout.share).toBeNull();
		menu().loadout.setWho("all");
	});

	it("buys out of the treasury and banks what it spent", () => {
		h.game.S.wunlocked = [...h.game.WBASE];
		h.game.S.coins = 1000;
		h.game.drawMenu();
		const shelf = menu().arsenal.shelves.find((s) => s.heading === "Weapons")!;
		const row = shelf.rows.find((r) => !r.owned)!;

		shelf.buy(row.key);

		expect(h.game.S.wunlocked).toContain(row.key);
		expect(h.game.S.coins).toBe(1000 - row.price);
	});

	it("sweeps up a whole shelf at once, and nothing at all when the treasury is short", () => {
		h.game.S.coins = 0;
		h.game.drawMenu();
		const broke = menu().arsenal.shelves.find((s) => s.heading === "Weapons")!;
		expect(broke.affordable).toBe(false);

		broke.buyAll();
		expect(h.game.S.coins).toBe(0);

		h.game.S.coins = 100000;
		h.game.drawMenu();
		menu()
			.arsenal.shelves.find((s) => s.heading === "Weapons")!
			.buyAll();

		expect(menu().arsenal.shelves.find((s) => s.heading === "Weapons")?.due).toBeNull();
	});

	it("counts down the guesses the cheat box has left", () => {
		expect(menu().arsenal.cheat).toBe("open");

		menu().arsenal.submitCode("not it");

		expect(menu().arsenal.tries).toBe(1);
		expect(menu().arsenal.cheat).toBe("open");
	});
});

describe("the setup screen and the arena", () => {
	it("comes down when a match starts and goes back up when it is called", async () => {
		const h = await loadGame();

		try {
			expect(h.bridge.menuStore.get()).not.toBeNull();

			h.game.startMatch();
			expect(h.bridge.menuStore.get()).toBeNull();

			forfeit(h);
			h.bridge.overStore.get()?.back();

			expect(h.bridge.menuStore.get()).not.toBeNull();
		} finally {
			h.close();
		}
	});
});

/** Falls on the current player's sword, which the button only does on the second press. */
function forfeit(h: GameHarness): void {
	const quit = h.document.getElementById("quit");
	quit?.click();
	quit?.click();
}

describe("the end of a match", () => {
	let h: GameHarness;
	let winner: Player;

	beforeAll(async () => {
		h = await loadGame();
		h.game.S.np = 2;
		h.game.startMatch();
		winner = h.game.S.players.find((p) => p !== h.game.cur())!;
	});

	afterAll(() => {
		h.close();
	});

	it("publishes nothing while the match is still on", () => {
		expect(h.bridge.overStore.get()).toBeNull();
	});

	it("publishes who holds the arena, in their own colour, once one team is left", () => {
		forfeit(h);

		const view = h.bridge.overStore.get();
		expect(view?.seat).toBe(winner.i);
		expect(view?.colour).toBe(winner.c);
		expect(view?.headline).toBe(`${winner.name} holds the arena`);
		expect(view?.earn).toBe(`+${h.game.S.matchCoins} coin banked`);
	});

	it("publishes the whole log, with the closing line already in it", () => {
		const log = h.bridge.overStore.get()?.log ?? [];

		expect(log.map((e) => e.t)).toStrictEqual(h.game.S.log.map((e) => e.t));
		expect(log.at(-1)?.t).toContain("took the arena");
	});

	it("opens the replay through the view it published", () => {
		h.bridge.overStore.get()?.openReplay();

		const view = h.bridge.replayStore.get();
		expect(view?.dim).toBe(h.game.S.dim);
		expect(view?.frames.map((f) => f.t)).toStrictEqual(h.game.S.log.map((e) => e.t));
	});

	it("shuts the replay on Escape, the way every other overlay does", () => {
		h.window.dispatchEvent(new h.window.KeyboardEvent("keydown", {key: "Escape"}));

		expect(h.bridge.replayStore.get()).toBeNull();
	});

	it("goes back to the menu through the view it published", () => {
		h.bridge.overStore.get()?.back();

		expect(h.bridge.overStore.get()).toBeNull();
		expect(h.game.S.screen).toBe("menu");
	});
});

describe("the power simulator", () => {
	let h: GameHarness;

	beforeAll(async () => {
		h = await loadGame();
	});

	afterAll(() => {
		h.close();
	});

	it("publishes nothing until the menu asks for it", () => {
		expect(h.bridge.simStore.get()).toBeNull();
	});

	it("shelves what the save has unlocked and the health the arena is set to", () => {
		h.bridge.menuStore.get()?.openSimulator();

		const view = h.bridge.simStore.get();
		expect(view?.weapons).toStrictEqual(h.game.S.wunlocked);
		expect(view?.elements).toStrictEqual(h.game.S.unlocked);
		expect(view?.fusions).toStrictEqual([]);
		expect(view?.hp).toBe(h.game.S.hp);
	});

	it("shelves a fusion only once it has been mixed in play", () => {
		h.game.S.codex["steam"] = 1;
		h.bridge.menuStore.get()?.openSimulator();

		expect(h.bridge.simStore.get()?.fusions).toStrictEqual(["steam"]);
	});

	it("shuts through the view it published", () => {
		h.bridge.simStore.get()?.close();

		expect(h.bridge.simStore.get()).toBeNull();
	});

	it("shuts on Escape, the way every other overlay does", () => {
		h.bridge.menuStore.get()?.openSimulator();
		expect(h.bridge.simStore.get()).not.toBeNull();

		h.window.dispatchEvent(new h.window.KeyboardEvent("keydown", {key: "Escape"}));

		expect(h.bridge.simStore.get()).toBeNull();
	});
});

describe("the mixing table", () => {
	let h: GameHarness;

	beforeAll(async () => {
		h = await loadGame();
	});

	afterAll(() => {
		h.close();
	});

	it("publishes nothing until something asks for it", () => {
		expect(h.bridge.tableStore.get()).toBeNull();
	});

	it("hands over what the save has bought and what it has mixed", () => {
		h.bridge.menuStore.get()?.openTable();

		const view = h.bridge.tableStore.get();
		expect(view?.owned).toStrictEqual(h.game.S.unlocked);
		expect(view?.found).toStrictEqual([]);
		expect(view?.footwork).toStrictEqual(h.game.S.munlocked);
	});

	it("opens from inside the arena too", () => {
		h.bridge.tableStore.get()?.close();

		h.document.getElementById("tableopen2")?.click();

		expect(h.bridge.tableStore.get()).not.toBeNull();
	});

	it("names a fusion only once it has been mixed in play", () => {
		h.game.S.codex["steam"] = 1;
		h.game.drawCodex();

		expect(h.bridge.tableStore.get()?.found).toStrictEqual(["steam"]);
	});

	it("shuts through the view it published", () => {
		h.bridge.tableStore.get()?.close();

		expect(h.bridge.tableStore.get()).toBeNull();
	});

	it("shuts on Escape, the way every other overlay does", () => {
		h.bridge.menuStore.get()?.openTable();
		expect(h.bridge.tableStore.get()).not.toBeNull();

		h.window.dispatchEvent(new h.window.KeyboardEvent("keydown", {key: "Escape"}));

		expect(h.bridge.tableStore.get()).toBeNull();
	});
});

describe("the arena designer", () => {
	let h: GameHarness;

	beforeAll(async () => {
		h = await loadGame();
	});

	afterAll(() => {
		h.close();
	});

	it("publishes nothing until the menu asks for it", () => {
		expect(h.bridge.designStore.get()).toBeNull();
	});

	it("hands over a blank board, what the save can paint with, and where everyone starts", () => {
		h.bridge.menuStore.get()?.openDesigner();

		const view = h.bridge.designStore.get();
		expect(view?.dim).toBe(h.game.S.dim);
		expect(view?.preset.length).toBe(h.game.S.dim * h.game.S.dim);
		expect(view?.preset.every((k) => k === null)).toBe(true);
		expect(view?.elements).toStrictEqual(h.game.S.unlocked);
		expect(view?.fusions).toStrictEqual([]);
		expect(view?.spawns.length).toBe(h.game.S.np);
	});

	it("names a fusion only once it has been mixed in play", () => {
		h.game.S.codex["steam"] = 1;
		h.bridge.menuStore.get()?.openDesigner();

		expect(h.bridge.designStore.get()?.fusions).toStrictEqual(["steam"]);
	});

	it("paints the board the next match is played on", () => {
		h.bridge.designStore.get()?.paint(3, "fire");

		expect(h.game.S.preset?.[3]).toBe("fire");
		expect(h.bridge.designStore.get()?.preset[3]).toBe("fire");
	});

	it("draws the ring for another table, and the setup screen follows", () => {
		h.bridge.designStore.get()?.setSeats(4);

		expect(h.game.S.np).toBe(4);
		expect(h.bridge.menuStore.get()?.arena.seats.length).toBe(4);
		expect(h.bridge.designStore.get()?.spawns.length).toBe(4);
	});

	it("wipes the board through the view it published", () => {
		h.bridge.designStore.get()?.clear();

		expect(h.game.S.preset?.every((k) => k === null)).toBe(true);
	});

	it("keeps the painted board once the designer is shut", () => {
		h.bridge.designStore.get()?.paint(5, "water");

		h.bridge.designStore.get()?.close();

		expect(h.bridge.designStore.get()).toBeNull();
		expect(h.game.S.preset?.[5]).toBe("water");
	});
});

describe("ids the script reaches for", () => {
	it("are all produced by the markup or by a panel", async () => {
		const referenced = [
			...new Set([...readGameSource().matchAll(/\$\(\s*"([^"]+)"\s*\)/g)].map((m) => m[1] ?? "")),
		];
		const h = await startedMatch();
		const seen = new Set<string>();
		const collect = (): void => {
			for (const el of h.document.querySelectorAll("[id]")) seen.add(el.id);
		};
		collect();

		try {
			h.game.drawCodex();
			collect();

			for (const mode of MODES) {
				const p = armCurrentPlayer(h);
				h.game.S.sel = EL_UID;
				h.game.S.mixFrom = mode === "mix" ? EL_UID : null;
				p.held = mode === "attack" ? WEAPON_UID : null;
				h.game.S.mode = mode;
				h.game.render();
				collect();
			}

			const p = armCurrentPlayer(h);
			h.game.S.mode = null;
			h.game.S.sel = null;
			p.held = WEAPON_UID;
			h.game.render();
			collect();

			h.game.S.steal = h.game.S.players.find((q) => q !== h.game.cur())?.i ?? 1;
			h.game.render();
			collect();
			h.game.S.steal = null;

			h.game.S.toss = true;
			h.game.S.tossPick = p.hand[0]?.uid ?? null;
			h.game.render();
			collect();
			h.game.S.toss = false;
			h.game.S.tossPick = null;

			h.game.S.replyTo = 1;
			h.game.S.chat = [{id: 1, who: "Tester", c: "#ff4d8d", r: 1, t: "hello", to: null}];
			h.game.drawChat();
			collect();

			expect(referenced.filter((id) => !seen.has(id))).toStrictEqual([]);
		} finally {
			h.close();
		}
	});
});
