import {describe, it, expect, beforeAll, afterAll} from "vitest";
import {loadGame, type GameHarness, type Player, type WeaponCard} from "./harness.js";

/** Anything the game renders from a missing lookup surfaces as one of these in the output string. */
const BROKEN = /undefined|NaN|\[object Object\]/;

/** attackTiles only reads the position, so a fighter parked mid-board is enough to walk every pattern. */
const MIDBOARD: Player = {
	i: 0,
	c: "#ff4d8d",
	name: "Tester",
	team: 0,
	x: 4,
	y: 4,
	hp: 60,
	nrg: 9,
	cap: 5,
	alive: true,
	hand: [],
	held: null,
};

describe("elements crossed with weapons", () => {
	let h: GameHarness;
	let elementKeys: string[];
	let weaponKeys: string[];

	beforeAll(async () => {
		h = await loadGame();
		elementKeys = [...Object.keys(h.game.EL), ...Object.keys(h.game.CFORGE)];
		weaponKeys = Object.keys(h.game.W);
	});

	afterAll(() => {
		h.close();
	});

	it("covers every base element, every fusion, and every weapon", () => {
		expect(elementKeys.length).toBe(Object.keys(h.game.EL).length + Object.keys(h.game.FUSE).length);
		expect(weaponKeys.length).toBeGreaterThan(3);
	});

	it("forges every element onto every weapon without a missing lookup", () => {
		const {wCost, wHits, wColor, wStrip, wDesc, wepName, wepDmg, attackTiles} = h.game;
		const broken: string[] = [];

		for (const el of elementKeys) {
			for (const w of weaponKeys) {
				const card: WeaponCard = {ids: [w], els: [el]};
				const where = `${el} + ${w}`;
				const dmg = wepDmg(card);
				const cost = wCost(card);
				const hits = wHits(card);
				if (!Number.isFinite(dmg) || dmg < 0) broken.push(`${where}: damage ${dmg}`);
				if (!Number.isFinite(cost) || cost < 1) broken.push(`${where}: cost ${cost}`);
				if (!Number.isInteger(hits) || hits < 1) broken.push(`${where}: hits ${hits}`);
				for (const [label, text] of [
					["name", wepName(card)],
					["description", wDesc(card)],
					["colour", wColor(card)],
					["strip", wStrip(card)],
				] as const) {
					if (text === "" || BROKEN.test(text)) broken.push(`${where}: ${label} ${text}`);
				}
				if (attackTiles(MIDBOARD, card).length === 0) broken.push(`${where}: reaches no tiles`);
			}
		}

		expect(broken).toStrictEqual([]);
	});

	it("picks ground to leave under both fighters without a missing lookup", () => {
		const {leaveSelf, leaveFoe, T, EL} = h.game;
		const broken: string[] = [];

		for (const el of elementKeys) {
			const card: WeaponCard = {ids: ["dagger"], els: [el]};
			for (const [label, pick] of [
				["leaveSelf", leaveSelf(card)],
				["leaveFoe", leaveFoe(card)],
			] as const) {
				if (pick === undefined) continue;
				if (EL[pick] === undefined && T[pick] === undefined) {
					broken.push(`${el}: ${label} picked unknown ground ${pick}`);
				}
			}
		}

		expect(broken).toStrictEqual([]);
	});

	it("gives every element a forge entry and a terrain", () => {
		const {forgeOf, terrOf, elName, elColor, T} = h.game;
		const broken: string[] = [];

		for (const el of elementKeys) {
			const forge = forgeOf(el);
			if (forge === undefined) broken.push(`${el}: no forge entry`);
			else if (forge.fx === "" || BROKEN.test(forge.fx)) broken.push(`${el}: forge effect ${forge.fx}`);
			const terrain = terrOf(el);
			if (terrain === undefined) broken.push(`${el}: no terrain`);
			else if (!Number.isFinite(terrain.life)) broken.push(`${el}: terrain life ${terrain.life}`);
			if (BROKEN.test(elName(el))) broken.push(`${el}: name ${elName(el)}`);
			if (!elColor(el).startsWith("#")) broken.push(`${el}: colour ${elColor(el)}`);
		}
		for (const key of Object.keys(T)) {
			if (T[key]?.n === undefined) broken.push(`${key}: terrain has no name`);
		}

		expect(broken).toStrictEqual([]);
	});

	it("fuses every element pair into a terrain the game knows", () => {
		const {FUSE, T, EL} = h.game;
		const keys = Object.keys(EL);
		const broken: string[] = [];

		for (const a of keys) {
			for (const b of keys) {
				const fused = FUSE[[a, b].sort().join("|")];
				if (fused === undefined) broken.push(`${a} + ${b}: no fusion`);
				else if (T[fused] === undefined) broken.push(`${a} + ${b}: fuses to unknown terrain ${fused}`);
			}
		}

		expect(broken).toStrictEqual([]);
	});

	it("resolves every weapon attack pattern", () => {
		const {W, PAT} = h.game;
		const broken: string[] = [];

		for (const key of Object.keys(W)) {
			const pattern = W[key]?.pat;
			if (pattern === undefined) {
				broken.push(`${key}: no pattern`);
				continue;
			}
			if (pattern === "any") continue;
			const tiles = PAT[pattern];
			if (tiles === undefined) broken.push(`${key}: unknown pattern ${pattern}`);
			else if (tiles().length === 0) broken.push(`${key}: pattern ${pattern} covers no tiles`);
		}

		expect(broken).toStrictEqual([]);
	});
});
