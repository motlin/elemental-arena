import {describe, it, expect} from "vitest";
import {attackTiles} from "../../src/game/combat.js";
import {
	leaveFoe,
	leaveSelf,
	elColor,
	elName,
	forgeOf,
	terrOf,
	wColor,
	wCost,
	wDesc,
	wHits,
	wStrip,
	wepDmg,
	wepName,
} from "../../src/game/lookups.js";
import {CFORGE, EL, FUSE, PAT, T, W} from "../../src/game/data/index.js";
import type {Player, WeaponSpec} from "../../src/game/types.js";
import {fighter} from "./fighter.js";

/** Anything the game renders from a missing lookup surfaces as one of these in the output string. */
const BROKEN = /undefined|NaN|\[object Object\]/;

/** attackTiles only reads the position, so a fighter parked mid-board is enough to walk every pattern. */
const MIDBOARD: Player = fighter();

const elementKeys = [...Object.keys(EL), ...Object.keys(CFORGE)];
const weaponKeys = Object.keys(W);

describe("elements crossed with weapons", () => {
	it("covers every base element, every fusion, and every weapon", () => {
		expect(elementKeys.length).toBe(Object.keys(EL).length + Object.keys(FUSE).length);
		expect(weaponKeys.length).toBeGreaterThan(3);
	});

	it("forges every element onto every weapon without a missing lookup", () => {
		const broken: string[] = [];

		for (const el of elementKeys) {
			for (const w of weaponKeys) {
				const card: WeaponSpec = {ids: [w], els: [el]};
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
		const broken: string[] = [];

		for (const el of elementKeys) {
			const card: WeaponSpec = {ids: ["dagger"], els: [el]};
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
		const broken: string[] = [];

		for (const el of elementKeys) {
			// forgeOf promises an entry for every element, so a miss throws here rather than reporting
			const forge = forgeOf(el);
			if (forge.fx === "" || BROKEN.test(forge.fx)) broken.push(`${el}: forge effect ${forge.fx}`);
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
		const broken: string[] = [];

		for (const key of weaponKeys) {
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
