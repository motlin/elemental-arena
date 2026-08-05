import {describe, it, expect, beforeAll, afterAll} from "vitest";
import {loadGame, readGameSource, type Card, type GameHarness, type Player} from "./harness.js";

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

describe("menu panels", () => {
	let h: GameHarness;

	beforeAll(async () => {
		h = await loadGame();
		h.game.S.unlocked = Object.keys(h.game.EL);
		h.game.S.wunlocked = Object.keys(h.game.W);
		h.game.S.munlocked = Object.keys(h.game.MV);
	});

	afterAll(() => {
		h.close();
	});

	it("renders every menu panel", () => {
		h.errors.length = 0;
		for (const draw of [
			h.game.drawSeg,
			h.game.drawShop,
			h.game.drawLoadout,
			h.game.drawCodex,
			h.game.drawCheat,
			h.game.drawNames,
			h.game.drawTeams,
			h.game.drawWho,
			h.game.drawMvChips,
			h.game.drawPalette,
			h.game.drawSpawnPicker,
			h.game.drawSpawns,
			h.game.drawSim,
			h.game.drawReplay,
		]) {
			expect(() => {
				draw();
			}).not.toThrow();
		}
		expect(h.errors).toStrictEqual([]);
	});

	it("gives every seat a name field at every table size", () => {
		for (let seats = 2; seats <= 8; seats++) {
			h.game.S.np = seats;
			h.game.drawNames();
			for (let i = 0; i < seats; i++) {
				expect(h.document.getElementById(`nm${i}`)).not.toBeNull();
			}
		}
		h.game.S.np = 2;
		h.game.drawNames();
	});

	it("renders the codex detail for every element, fusion, and move", () => {
		h.game.buildTable();
		const keys = [
			...Object.keys(h.game.EL),
			...Object.keys(h.game.CFORGE),
			...Object.keys(h.game.MV).map((k) => `mv:${k}`),
		];
		const broken: string[] = [];

		for (const key of keys) {
			h.game.S.tsel = key;
			h.game.drawDetail();
			const text = h.document.getElementById("tdetail")?.textContent ?? "";
			if (text === "") broken.push(`${key}: nothing rendered`);
			if (/undefined|NaN/.test(text)) broken.push(`${key}: ${text.trim().slice(0, 120)}`);
		}

		expect(broken).toStrictEqual([]);
	});

	it("renders the codex detail for undiscovered entries too", () => {
		h.game.S.unlocked = [...h.game.BASE];
		h.game.S.codex = {};
		h.game.buildTable();
		const broken: string[] = [];

		for (const key of [...Object.keys(h.game.EL), ...Object.keys(h.game.CFORGE)]) {
			h.game.S.tsel = key;
			h.game.drawDetail();
			const text = h.document.getElementById("tdetail")?.textContent ?? "";
			if (/undefined|NaN/.test(text)) broken.push(`${key}: ${text.trim().slice(0, 120)}`);
		}

		expect(broken).toStrictEqual([]);
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

		expect(h.document.getElementById("replay")?.classList.contains("on")).toBe(true);
	});

	it("goes back to the menu through the view it published", () => {
		h.bridge.overStore.get()?.back();

		expect(h.bridge.overStore.get()).toBeNull();
		expect(h.game.S.screen).toBe("menu");
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
			for (const draw of [
				h.game.drawSeg,
				h.game.drawShop,
				h.game.drawLoadout,
				h.game.drawCodex,
				h.game.drawCheat,
				h.game.drawNames,
				h.game.drawWho,
				h.game.drawMvChips,
				h.game.drawPalette,
				h.game.drawSpawnPicker,
				h.game.drawSim,
				h.game.drawReplay,
				h.game.buildTable,
			]) {
				draw();
				collect();
			}

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

			h.game.S.who = 0;
			h.game.S.pOff = {0: {el: ["fire"], w: []}};
			h.game.drawWho();
			collect();

			h.game.simAdd("w", "dagger");
			collect();

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
