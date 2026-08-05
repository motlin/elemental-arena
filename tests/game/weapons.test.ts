import {describe, it, expect, beforeAll, afterAll} from "vitest";
import {loadGame, type GameHarness, type Player, type WeaponDef} from "./harness.js";

/** attackTiles only reads the position, so one stand-in fighter walks every pattern from anywhere. */
const FIGHTER: Omit<Player, "x" | "y"> = {
	i: 0,
	name: "Tester",
	team: 0,
	hp: 60,
	nrg: 9,
	cap: 5,
	alive: true,
	hand: [],
	held: null,
};

/**
 * A weapon's shop price is what separates a starting weapon from a bought one, and the three you
 * start with carry no price at all.
 */
const priceOf = (w: WeaponDef): number => w.price ?? 0;

/** What one swing puts on a single target, before anything is forged onto it. */
const swingDmg = (w: WeaponDef): number => w.dmg * w.hits;

describe("the weapon table", () => {
	let h: GameHarness;
	let keys: string[];
	let dim: number;

	/** Every square this weapon threatens from (x, y), as "x,y" keys. */
	function reach(key: string, x: number, y: number): Set<string> {
		return new Set(h.game.attackTiles({...FIGHTER, x, y}, {ids: [key], els: []}).map(([tx, ty]) => `${tx},${ty}`));
	}

	/**
	 * True when `outer` threatens everything `inner` does no matter where the pair is standing.
	 * Board edges matter: two patterns can look identical mid-board and come apart against a wall,
	 * which is the whole point of the whip reaching to the edge while the javelin stops at four.
	 */
	function coversEverywhere(outer: string, inner: string): boolean {
		for (let y = 0; y < dim; y++)
			for (let x = 0; x < dim; x++) {
				const wide = reach(outer, x, y);
				for (const tile of reach(inner, x, y)) if (!wide.has(tile)) return false;
			}
		return true;
	}

	function weapon(key: string): WeaponDef {
		const w = h.game.W[key];
		if (w === undefined) throw new Error(`no weapon named ${key}`);
		return w;
	}

	beforeAll(async () => {
		h = await loadGame();
		keys = Object.keys(h.game.W);
		dim = h.game.S.dim;
	});

	afterAll(() => {
		h.close();
	});

	/**
	 * Round one hands out `startNrg` energy, so a starting weapon that costs more than that is a
	 * card you cannot play on the turn you are given it.
	 */
	it("swings all three starting weapons on round one", () => {
		const base = [...h.game.WBASE];
		const costs = base.map((k) => weapon(k).cost);

		expect([base, costs]).toStrictEqual([
			["dagger", "sword", "crossbow"],
			[2, 2, 2],
		]);
		expect(Math.max(...costs)).toBeLessThanOrEqual(h.game.S.startNrg);
	});

	/**
	 * Dagger and sword cost the same and threaten the same eight squares, so the pick between them
	 * has to be about which eight: the dagger takes everything touching you, the sword trades the
	 * diagonals for a second square out. Equal damage keeps that a choice of shape.
	 */
	it("pays the dagger's two strikes off against the sword's one", () => {
		expect([swingDmg(weapon("dagger")), swingDmg(weapon("sword"))]).toStrictEqual([10, 10]);
		expect([reach("dagger", 4, 4).size, reach("sword", 4, 4).size]).toStrictEqual([8, 8]);
	});

	/** Neither one is the other's shape, so neither can be the other's shape plus extras. */
	it("keeps the gun and the wand off each other's lines", () => {
		expect([coversEverywhere("wand", "gun"), coversEverywhere("gun", "wand")]).toStrictEqual([false, false]);
	});

	/**
	 * Gun, wand and cannon are the endgame, and they all swing for the same energy so the money is
	 * the only thing choosing between them: the gun is the cheap all-rounder, the wand pays for the
	 * hardest hit, the cannon pays for the whole board.
	 */
	it("sells the top tier on coins rather than energy", () => {
		const top = ["gun", "wand", "cannon"] as const;

		expect(top.map((k) => weapon(k).cost)).toStrictEqual([5, 5, 5]);
		expect(top.map((k) => priceOf(weapon(k)))).toStrictEqual([500, 700, 900]);
		expect(top.map((k) => swingDmg(weapon(k)))).toStrictEqual([20, 25, 18]);
		expect(top.map((k) => reach(k, 4, 4).size)).toStrictEqual([32, 24, 80]);
	});

	/**
	 * The cannon is the one weapon that reaches everything every other weapon reaches, which is its
	 * whole job. It pays for that by hitting softer than anything else that swings for five energy.
	 */
	it("charges the cannon for reaching everywhere", () => {
		const missed = keys.filter((k) => k !== "cannon" && !coversEverywhere("cannon", k));
		const tier = keys.filter((k) => k !== "cannon" && weapon(k).cost >= weapon("cannon").cost);
		const softer = tier.filter((k) => swingDmg(weapon(k)) <= swingDmg(weapon("cannon")));

		expect(missed).toStrictEqual([]);
		expect(softer).toStrictEqual([]);
		expect(priceOf(weapon("cannon"))).toBe(Math.max(...keys.map((k) => priceOf(weapon(k)))));
	});

	/**
	 * Nothing in the table should be a card you would never pick: a weapon is outclassed when some
	 * other weapon threatens every square it does, sweeps at least as wide, hits at least as hard,
	 * and asks for no more energy and no more coins.
	 */
	it("leaves no weapon outclassed by another", () => {
		const outclassed: string[] = [];

		for (const loser of keys)
			for (const winner of keys) {
				if (winner === loser) continue;
				const a = weapon(loser),
					b = weapon(winner);
				if (b.cost > a.cost || priceOf(b) > priceOf(a)) continue;
				if (swingDmg(b) < swingDmg(a) || (b.sweep ?? 0) < (a.sweep ?? 0)) continue;
				if (coversEverywhere(winner, loser)) outclassed.push(`${loser} loses to ${winner}`);
			}

		expect(outclassed).toStrictEqual([]);
	});

	/** A weapon nobody can read is a weapon nobody buys, so the words have to match the numbers. */
	it("describes the shapes it actually swings", () => {
		expect([weapon("dagger").d, weapon("wand").d]).toStrictEqual([
			"Any tile touching you. Strikes twice.",
			"Every diagonal line to the wall, plus the eight squares a chess knight would reach.",
		]);
	});
});
