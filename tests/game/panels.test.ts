// @vitest-environment jsdom
import {describe, it, expect, beforeAll, beforeEach, vi} from "vitest";
import {
	designStore,
	handoffStore,
	matchStore,
	menuStore,
	overStore,
	replayStore,
	simStore,
	tableStore,
	type ActionBarView,
	type ChatView,
	type HandCard,
	type MatchView,
	type MenuView,
	type WeaponView,
} from "../../src/game/bridge.js";
import {BASE, EL, MV, T, W, WBASE} from "../../src/game/data/index.js";
import {mvOwnedMask} from "../../src/game/lookups.js";
import {forfeit, leaveMatch, startMatch} from "../../src/game/match.js";
import {drawCodex, drawMenu} from "../../src/game/menu.js";
import {MODEHINT, render} from "../../src/game/render.js";
import {S, cur, idx, show} from "../../src/game/state.js";
import type {Card, Player} from "../../src/game/types.js";

/** Stands in for the Claude-artifact `window.storage` that public/storage-shim.js provides. */
vi.stubGlobal("storage", {
	get: async () => Promise.resolve(null),
	set: async () => Promise.resolve(),
	delete: async () => Promise.resolve(),
});

/* The entry module is what hands the rules the drawing they call for, so a screen only goes up and
   comes down for real once it has loaded. It reads the save on the way in, hence the stub above. */
await (
	await import("../../src/game/game.js")
).boot;

const EL_UID = 9001;
const WEAPON_UID = 9002;

/** Anything drawn from a missing lookup surfaces as one of these somewhere in the published view. */
const BROKEN = /undefined|NaN|\[object Object\]/;

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

/** Every string the view carries, however deep, so one sweep catches a gap anywhere in it. */
function strings(value: unknown): string[] {
	if (typeof value === "string") return [value];
	if (Array.isArray(value)) return value.flatMap((v) => strings(v));
	if (typeof value === "object" && value !== null) return Object.values(value).flatMap((v) => strings(v));
	return [];
}

/** Everything the action bar puts in front of the seat, so a bar that says nothing at all fails. */
function said(actions: ActionBarView): string {
	return [
		...actions.hint.map((part) => part.text),
		...actions.buttons.map((button) => button.label),
		actions.tail ?? "",
	].join("");
}

/** The match screen as the game last published it. */
function match(): MatchView {
	const view = matchStore.get();
	expect(view).not.toBeNull();
	return view!;
}

/**
 * Starts a match with everything unlocked and every seat given every piece of footwork, so the
 * panels describe their fullest form rather than the stripped-down two-element default.
 */
function startedMatch(): void {
	S.unlocked = Object.keys(EL);
	S.wunlocked = Object.keys(W);
	S.munlocked = Object.keys(MV);
	S.np = 4;
	const everyMove = mvOwnedMask();
	S.mv = S.mv.map(() => everyMove);
	S.mvShared = everyMove;
	S.chaos = true;
	S.smash = true;
	startMatch();
}

/** Puts a known hand and a full purse in front of whoever is up, and clears the pending prompts. */
function armCurrentPlayer(): Player {
	const p = cur();
	p.hand = hand();
	p.nrg = 9;
	S.toss = false;
	S.tossPick = null;
	S.steal = null;
	return p;
}

/** Puts the setup screen back up with a save that has bought nothing beyond the starting three. */
function freshSave(): void {
	S.unlocked = [...BASE];
	S.wunlocked = [...WBASE];
	S.codex = {};
	S.players = [];
	show("menu");
}

describe("match panels in every mode", () => {
	beforeAll(() => {
		startedMatch();
	});

	it("covers every mode the action bar has a hint for", () => {
		const uncovered = Object.keys(MODEHINT).filter((mode) => !MODES.includes(mode));

		expect(uncovered).toStrictEqual([]);
	});

	it("starts the match on the game screen", () => {
		expect(S.screen).toBe("game");
		expect(S.players.length).toBe(4);
		expect(match().board.tiles.length).toBe(S.dim * S.dim);
	});

	for (const mode of MODES) {
		it(`describes every panel in ${mode ?? "no"} mode`, () => {
			const p = armCurrentPlayer();
			S.sel = mode === "mix" || mode === "place" ? EL_UID : null;
			S.mixFrom = mode === "mix" ? EL_UID : null;
			p.held = mode === "attack" ? WEAPON_UID : null;
			S.mode = mode;

			render();

			const view = match();
			expect(view.board.tiles.length).toBe(S.dim * S.dim);
			expect(said(view.actions)).not.toBe("");
			expect(view.footwork.buttons.length).toBeGreaterThan(0);
			expect(view.roster.map((card) => card.seat)).toStrictEqual(S.players.map((q) => q.i));
			expect(strings(view).filter((text) => BROKEN.test(text))).toStrictEqual([]);
		});
	}

	it("offers the robbed hand on the action bar while a card is being stolen", () => {
		armCurrentPlayer();
		S.mode = null;
		const victim = S.players.find((q) => q !== cur())!;
		S.steal = victim.i;

		render();

		const actions = match().actions;
		expect(actions.hint.map((part) => part.text)).toStrictEqual([`Take a card from ${victim.name}:`]);
		expect(actions.buttons.map((button) => button.key)).toStrictEqual([
			...victim.hand.map((c) => String(c.uid)),
			"cancel",
		]);
		S.steal = null;
	});

	it("asks before it bins a card, but only once one has been picked", () => {
		const p = armCurrentPlayer();
		S.mode = null;
		S.toss = true;
		S.tossPick = null;
		render();
		expect(match().actions.buttons).toStrictEqual([]);
		expect(match().actions.alarm).toBe(true);

		S.tossPick = p.hand[0]!.uid;
		render();

		expect(match().actions.buttons.map((button) => button.key)).toStrictEqual(["toss", "another"]);
		S.toss = false;
		S.tossPick = null;
	});

	it("reads the square Inspect is pointed at, and says so when it is pointed at none", () => {
		const p = armCurrentPlayer();
		S.mode = null;
		S.imode = true;
		S.look = null;
		render();
		expect(match().inspect.tile).toBeNull();
		expect(match().inspect.hint).not.toBeNull();

		S.look = idx(p.x, p.y);
		S.reach = S.players.map((q) => q.i);
		render();

		const inspect = match().inspect;
		expect(inspect.hint).toBeNull();
		expect(inspect.tile?.facts.find((fact) => fact.label === "Standing on it")?.value).toBe(
			`${p.name}, ${p.hp} HP`,
		);
		expect(inspect.chooser?.chips.map((chip) => chip.seat)).toStrictEqual(S.players.map((q) => q.i));
		expect(strings(inspect).filter((text) => BROKEN.test(text))).toStrictEqual([]);

		S.imode = false;
		S.look = null;
		S.reach = [];
	});

	it("publishes the handoff curtain for React to paint", () => {
		const p = armCurrentPlayer();
		S.mode = null;
		S.handoff = true;

		render();

		const view = handoffStore.get();
		expect([view?.seat, view?.name, view?.colour]).toStrictEqual([p.i, p.name, p.c]);
		S.handoff = false;
	});

	it("takes the handoff curtain back down through the view it published", () => {
		armCurrentPlayer();
		S.mode = null;
		S.handoff = true;
		render();

		handoffStore.get()?.dismiss();

		expect(S.handoff).toBe(false);
		expect(handoffStore.get()).toBeNull();
	});

	it("describes every tile of every terrain the game can lay", () => {
		armCurrentPlayer();
		S.mode = null;
		const terrains = Object.keys(T);
		S.board.forEach((cell, i) => {
			const key = terrains[i % terrains.length]!;
			cell.t = key;
			cell.el = null;
			cell.life = T[key]!.life;
		});

		render();

		const tiles = match().board.tiles;
		expect(tiles.length).toBe(S.dim * S.dim);
		expect(strings(tiles).filter((text) => BROKEN.test(text))).toStrictEqual([]);
	});
});

describe("the weapon panel", () => {
	beforeEach(() => {
		startedMatch();
	});

	/** Puts one weapon in this fighter's hands and republishes, which is all the panel is about. */
	function holding(els: string[]): WeaponView {
		const p = armCurrentPlayer();
		S.mode = null;
		p.hand = [{uid: WEAPON_UID, k: "w", ids: ["dagger"], els}];
		p.held = WEAPON_UID;
		render();
		const weapon = match().weapon;
		expect(weapon).not.toBeNull();
		return weapon!;
	}

	it("names the weapon, what it swings for, and what the swing costs", () => {
		const weapon = holding(["steam"]);

		expect([weapon.name, weapon.damage, weapon.cost]).toStrictEqual(["Steam Dagger", "17 x 2", 3]);
	});

	it("asks nothing about leavings while the weapon leaves nothing behind", () => {
		expect(holding([]).rows).toStrictEqual([]);
	});

	it("asks a row per side once there is a choice on it, with the first of each already taken", () => {
		const weapon = holding(["steam", "fire", "spring", "orchard"]);

		expect(
			weapon.rows.map((row) => ({
				label: row.label,
				options: row.options.map((option) => [option.key, option.name, option.colour, option.on]),
			})),
		).toStrictEqual([
			{
				label: "Leaves under them:",
				options: [
					["steam", "Steam", "#dbe9f2", true],
					["fire", "Fire", "#ff5a1e", false],
				],
			},
			{
				label: "Lays under you:",
				options: [
					["spring", "Spring", "#8fe8d8", true],
					["orchard", "Orchard", "#84c47a", false],
				],
			},
		]);
	});

	it("takes the other leaving through the option it published", () => {
		const weapon = holding(["steam", "fire", "spring", "orchard"]);

		weapon.rows[0]!.options[1]!.choose();

		expect(match().weapon?.rows[0]?.options.map((option) => option.on)).toStrictEqual([false, true]);
	});

	it("counts the squares a swing would find somebody visible on", () => {
		const p = armCurrentPlayer();
		const foe = S.players.find((q) => q !== p)!;
		foe.x = p.x + 1;
		foe.y = p.y;

		expect(holding(["steam"]).hint).toBe("1 square you can see someone on. You may swing anywhere in reach.");
	});

	it("offers the swing anyway when nobody in reach can be seen", () => {
		expect(holding(["steam"]).hint).toBe("Nobody visible in reach. Swing anyway to sweep for someone hidden.");
	});

	it("tells a blinded fighter to swing where they think somebody is", () => {
		armCurrentPlayer().darkTurns = 2;

		expect(holding(["steam"]).hint).toBe("Blinded. Swing where you think they are.");
	});

	it("spends the swing when the turn cannot pay for it", () => {
		holding(["steam"]);
		cur().nrg = 0;

		render();

		const weapon = match().weapon;
		expect([weapon?.disabled, weapon?.hint]).toStrictEqual([true, "Not enough energy this turn."]);
	});

	it("marks the panel while the board is waiting for a square to swing at", () => {
		expect(holding(["steam"]).aiming).toBe(false);

		S.mode = "attack";
		render();

		expect(match().weapon?.aiming).toBe(true);
	});
});

describe("the hand", () => {
	beforeEach(() => {
		startedMatch();
		armCurrentPlayer();
		S.mode = null;
		S.handoff = false;
	});

	/** This seat's hand as the screen last published it. */
	function cards(): readonly HandCard[] {
		render();
		return match().hand.cards;
	}

	it("dresses every card in its kind, its place in the hand, its name and its colour", () => {
		expect(cards().map((card) => [card.kind, card.number, card.name, card.colour])).toStrictEqual([
			["ELEMENT", 1, "Fire", "#ff5a1e"],
			["WEAPON", 2, "Steam Dagger", "#9fb4cc"],
			["ELEMENT", 3, "Water", "#2f9dff"],
		]);
	});

	it("marks the element that is selected and the weapon that is held", () => {
		S.sel = EL_UID;
		cur().held = WEAPON_UID;

		expect(cards().map((card) => card.on)).toStrictEqual([true, true, false]);
	});

	it("marks every card the merge under way could take", () => {
		S.sel = EL_UID;
		S.mixFrom = EL_UID;
		S.mode = "mix";

		expect(cards().map((card) => card.mixable)).toStrictEqual([false, true, true]);
	});

	it("marks every card while a chaos throw is still asking which one", () => {
		S.toss = true;
		S.tossPick = null;

		expect(cards().map((card) => card.mixable)).toStrictEqual([true, true, true]);
	});

	it("dooms the card the chaos throw has been pointed at, and lets the rest alone", () => {
		S.toss = true;
		S.tossPick = WEAPON_UID;

		expect(cards().map((card) => [card.mixable, card.doomed])).toStrictEqual([
			[false, false],
			[false, true],
			[false, false],
		]);
	});

	it("cannot be dragged at all from behind the handoff curtain", () => {
		S.handoff = true;
		render();
		expect(match().hand.draggable).toBe(false);

		S.handoff = false;
		render();

		expect(match().hand.draggable).toBe(true);
	});
});

describe("table talk", () => {
	beforeEach(() => {
		startedMatch();
		armCurrentPlayer();
		S.mode = null;
	});

	/** What has been said, as the screen last published it. */
	function talk(): ChatView {
		render();
		return match().chat;
	}

	it("prints what was said under whoever said it, in the round it was said in", () => {
		const p = cur();

		talk().say("the middle is mine");

		expect(
			talk().lines.map((line) => [line.id, line.who, line.colour, line.round, line.text, line.quote]),
		).toStrictEqual([[1, p.name, p.c, S.round, "the middle is mine", null]]);
	});

	it("hangs an answer off the line it answers, cut to the room the quote has", () => {
		talk().say("the middle is mine and I intend to keep every square of it");
		talk().lines[0]!.reply();

		talk().say("not for long");

		expect(talk().lines.map((line) => line.quote?.text ?? null)).toStrictEqual([
			null,
			"the middle is mine and I intend to keep ever…",
		]);
	});

	it("names the line the next message answers, cut shorter still", () => {
		talk().say("the middle is mine and I intend to keep every square of it");

		talk().lines[0]!.reply();

		expect(talk().replyingTo?.text).toBe("the middle is mine and I inten…");
	});

	it("answers nobody until a line has been picked to answer", () => {
		talk().say("the middle is mine");

		expect(talk().replyingTo).toBeNull();
	});

	it("drops the line it was answering when the reply is called off", () => {
		talk().say("the middle is mine");
		talk().lines[0]!.reply();

		talk().cancelReply();

		expect(talk().replyingTo).toBeNull();
	});

	it("adds a line to the log by saying something through the view it published", () => {
		talk().say("the middle is mine");

		talk().say("not for long");

		expect(talk().lines.map((line) => line.text)).toStrictEqual(["the middle is mine", "not for long"]);
	});
});

describe("the setup screen", () => {
	/** The screen as it stands, which is republished whole after every change. */
	function menu(): MenuView {
		const view = menuStore.get();
		expect(view).not.toBeNull();
		return view!;
	}

	beforeAll(() => {
		S.unlocked = Object.keys(EL);
		S.wunlocked = Object.keys(W);
		S.munlocked = Object.keys(MV);
		S.players = [];
		show("menu");
	});

	it("publishes the seats, the loadout and the shop together, as one whole screen", () => {
		expect(menu().arena.seats.length).toBe(S.np);
		expect([...menu().loadout.elements].map((c) => c.key).sort()).toStrictEqual(Object.keys(EL).sort());
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
		expect(S.openHand).toBe(30);

		menu().arena.setOpenHand(Number.NaN);
		expect(S.openHand).toBe(3);
	});

	it("gives a seat a list of its own, then puts it back on the shared one", () => {
		menu().loadout.setWho(0);
		menu().loadout.toggleElement("water");

		expect(S.pOff[0]?.el).toStrictEqual(["water"]);
		expect(S.elOff).toStrictEqual([]);
		expect(menu().loadout.scopes[1]?.own).toBe(true);

		menu().loadout.share?.();

		expect(S.pOff[0]).toBeUndefined();
		expect(menu().loadout.share).toBeNull();
		menu().loadout.setWho("all");
	});

	it("buys out of the treasury and banks what it spent", () => {
		S.wunlocked = [...WBASE];
		S.coins = 1000;
		drawMenu();
		const shelf = menu().arsenal.shelves.find((s) => s.heading === "Weapons")!;
		const row = shelf.rows.find((r) => !r.owned)!;

		shelf.buy(row.key);

		expect(S.wunlocked).toContain(row.key);
		expect(S.coins).toBe(1000 - row.price);
	});

	it("sweeps up a whole shelf at once, and nothing at all when the treasury is short", () => {
		S.coins = 0;
		drawMenu();
		const broke = menu().arsenal.shelves.find((s) => s.heading === "Weapons")!;
		expect(broke.affordable).toBe(false);

		broke.buyAll();
		expect(S.coins).toBe(0);

		S.coins = 100000;
		drawMenu();
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
	it("comes down when a match starts and goes back up when it is called", () => {
		S.np = 2;
		S.players = [];
		show("menu");
		expect(menuStore.get()).not.toBeNull();

		startMatch();
		expect(menuStore.get()).toBeNull();

		forfeit();
		forfeit();
		overStore.get()?.back();

		expect(menuStore.get()).not.toBeNull();
	});
});

describe("the end of a match", () => {
	let winner: Player;

	beforeAll(() => {
		S.np = 2;
		overStore.set(null);
		startMatch();
		winner = S.players.find((p) => p !== cur())!;
	});

	it("publishes nothing while the match is still on", () => {
		expect(overStore.get()).toBeNull();
	});

	it("publishes who holds the arena, in their own colour, once one team is left", () => {
		forfeit();
		forfeit();

		const view = overStore.get();
		expect(view?.seat).toBe(winner.i);
		expect(view?.colour).toBe(winner.c);
		expect(view?.headline).toBe(`${winner.name} holds the arena`);
		expect(view?.earn).toBe(`+${S.matchCoins} coin banked`);
	});

	it("publishes the whole log, with the closing line already in it", () => {
		const log = overStore.get()?.log ?? [];

		expect(log.map((e) => e.t)).toStrictEqual(S.log.map((e) => e.t));
		expect(log.at(-1)?.t).toContain("took the arena");
	});

	it("opens the replay through the view it published", () => {
		overStore.get()?.openReplay();

		const view = replayStore.get();
		expect(view?.dim).toBe(S.dim);
		expect(view?.frames.map((f) => f.t)).toStrictEqual(S.log.map((e) => e.t));
	});

	it("shuts the replay on Escape, the way every other overlay does", () => {
		window.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape"}));

		expect(replayStore.get()).toBeNull();
	});

	it("goes back to the menu through the view it published", () => {
		overStore.get()?.back();

		expect(overStore.get()).toBeNull();
		expect(S.screen).toBe("menu");
	});
});

describe("the power simulator", () => {
	beforeAll(() => {
		freshSave();
	});

	it("publishes nothing until the menu asks for it", () => {
		expect(simStore.get()).toBeNull();
	});

	it("shelves what the save has unlocked and the health the arena is set to", () => {
		menuStore.get()?.openSimulator();

		const view = simStore.get();
		expect(view?.weapons).toStrictEqual(S.wunlocked);
		expect(view?.elements).toStrictEqual(S.unlocked);
		expect(view?.fusions).toStrictEqual([]);
		expect(view?.hp).toBe(S.hp);
	});

	it("shelves a fusion only once it has been mixed in play", () => {
		S.codex["steam"] = 1;
		menuStore.get()?.openSimulator();

		expect(simStore.get()?.fusions).toStrictEqual(["steam"]);
	});

	it("shuts through the view it published", () => {
		simStore.get()?.close();

		expect(simStore.get()).toBeNull();
	});

	it("shuts on Escape, the way every other overlay does", () => {
		menuStore.get()?.openSimulator();
		expect(simStore.get()).not.toBeNull();

		window.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape"}));

		expect(simStore.get()).toBeNull();
	});
});

describe("the mixing table", () => {
	beforeAll(() => {
		freshSave();
		S.munlocked = [];
	});

	it("publishes nothing until something asks for it", () => {
		expect(tableStore.get()).toBeNull();
	});

	it("hands over what the save has bought and what it has mixed", () => {
		menuStore.get()?.openTable();

		const view = tableStore.get();
		expect(view?.owned).toStrictEqual(S.unlocked);
		expect(view?.found).toStrictEqual([]);
		expect(view?.footwork).toStrictEqual(S.munlocked);
	});

	it("opens from inside the arena too", () => {
		tableStore.get()?.close();
		S.np = 2;
		startMatch();

		matchStore.get()?.topbar.openTable();

		expect(tableStore.get()).not.toBeNull();
		leaveMatch();
	});

	it("names a fusion only once it has been mixed in play", () => {
		S.codex["steam"] = 1;
		drawCodex();

		expect(tableStore.get()?.found).toStrictEqual(["steam"]);
	});

	it("shuts through the view it published", () => {
		tableStore.get()?.close();

		expect(tableStore.get()).toBeNull();
	});

	it("shuts on Escape, the way every other overlay does", () => {
		menuStore.get()?.openTable();
		expect(tableStore.get()).not.toBeNull();

		window.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape"}));

		expect(tableStore.get()).toBeNull();
	});
});

describe("the arena designer", () => {
	beforeAll(() => {
		freshSave();
		S.np = 2;
		S.preset = null;
		S.presetDim = 0;
	});

	it("publishes nothing until the menu asks for it", () => {
		expect(designStore.get()).toBeNull();
	});

	it("hands over a blank board, what the save can paint with, and where everyone starts", () => {
		menuStore.get()?.openDesigner();

		const view = designStore.get();
		expect(view?.dim).toBe(S.dim);
		expect(view?.preset.length).toBe(S.dim * S.dim);
		expect(view?.preset.every((k) => k === null)).toBe(true);
		expect(view?.elements).toStrictEqual(S.unlocked);
		expect(view?.fusions).toStrictEqual([]);
		expect(view?.spawns.length).toBe(S.np);
	});

	it("names a fusion only once it has been mixed in play", () => {
		S.codex["steam"] = 1;
		menuStore.get()?.openDesigner();

		expect(designStore.get()?.fusions).toStrictEqual(["steam"]);
	});

	it("paints the board the next match is played on", () => {
		designStore.get()?.paint(3, "fire");

		expect(S.preset?.[3]).toBe("fire");
		expect(designStore.get()?.preset[3]).toBe("fire");
	});

	it("draws the ring for another table, and the setup screen follows", () => {
		designStore.get()?.setSeats(4);

		expect(S.np).toBe(4);
		expect(menuStore.get()?.arena.seats.length).toBe(4);
		expect(designStore.get()?.spawns.length).toBe(4);
	});

	it("wipes the board through the view it published", () => {
		designStore.get()?.clear();

		expect(S.preset?.every((k) => k === null)).toBe(true);
	});

	it("keeps the painted board once the designer is shut", () => {
		designStore.get()?.paint(5, "water");

		designStore.get()?.close();

		expect(designStore.get()).toBeNull();
		expect(S.preset?.[5]).toBe("water");
	});
});
