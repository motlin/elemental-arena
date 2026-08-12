/**
 * Read-only questions about the data tables: what an element is called, what a forged weapon costs,
 * what mixes into what. Nothing here changes the game; it only reads it.
 */

import {CFORGE, COST, EL, FORGE, FUSE, MV, PAT, T, W, boon, fkey} from "./data/index.js";
import type {ActionKey, ForgeDef, MoveDef, TerrainDef, WeaponDef} from "./data/index.js";
import {S} from "./state.js";
import type {WeaponSpec} from "./types.js";

export const mvOwnedMask = (): number =>
	Object.entries(MV).reduce((m, [k, v]) => m | (S.munlocked.includes(k) ? v.bit : 0), 0);
export const forgeOf = (e: string): ForgeDef => CFORGE[e] || FORGE[e]!;
export const offFor = (kind: "el" | "w", i: number | null): string[] =>
	i != null && S.pOff[i] ? S.pOff[i][kind] : kind === "el" ? S.elOff : S.wOff;
export const elsOn = (i: number | null): string[] => S.unlocked.filter((k) => !offFor("el", i).includes(k));
export const wsOn = (i: number | null): string[] => S.wunlocked.filter((k) => !offFor("w", i).includes(k));
export const wCost = (c: WeaponSpec): number =>
	Math.min(...c.ids.map((i) => W[i]!.cost)) + (c.ids.length - 1) + c.els.length;
export const wHits = (c: WeaponSpec): number =>
	Math.max(...c.ids.map((i) => W[i]!.hits)) + c.els.reduce((s, e) => s + (forgeOf(e).hits || 0), 0);
export const wRing = (c: WeaponSpec): boolean => c.ids.some((i) => W[i]!.sweep);
/** One weapon by key, for the screens that stack weapons up by name and colour. */
export const wepOf = (k: string): WeaponDef => W[k]!;
/** How many distinct squares the weapons on a card reach between them. */
export const wReach = (c: WeaponSpec): number => {
	const seen = new Set<string>();
	c.ids.forEach((i) => {
		PAT[W[i]!.pat]!().forEach(([dx, dy]) => seen.add(dx + "," + dy));
	});
	return seen.size;
};
export const wColor = (c: WeaponSpec): string => W[c.ids[0]!]!.c;
export const wStrip = (c: WeaponSpec): string => {
	const cols = c.ids.map((i) => W[i]!.c);
	if (cols.length === 1) return cols[0]!;
	const seg = 100 / cols.length;
	return (
		"linear-gradient(90deg," + cols.map((col, i) => `${col} ${i * seg}%,${col} ${(i + 1) * seg}%`).join(",") + ")"
	);
};
export const wDesc = (c: WeaponSpec): string => [...new Set(c.ids.map((i) => W[i]!.d))].join(" ");
export const elName = (e: string): string => (EL[e] ? EL[e].n : T[e]!.n);
export const elColor = (e: string): string => (EL[e] ? EL[e].c : T[e]!.c);
/** Names a list the way a card reads it out: one entry per distinct name, doubles counted off. */
function tally(list: string[], label: (k: string) => string): string {
	const order: string[] = [],
		count = new Map<string, number>();
	list.forEach((x) => {
		const n = label(x);
		if (!count.has(n)) {
			order.push(n);
			count.set(n, 0);
		}
		count.set(n, count.get(n)! + 1);
	});
	return order.map((n) => (count.get(n)! > 1 ? `${n} x${count.get(n)}` : n)).join(" ");
}
export function wepName(c: WeaponSpec): string {
	return (tally(c.els, elName) + " " + tally(c.ids, (i) => W[i]!.n)).trim();
}
export function wepDmg(c: WeaponSpec): number {
	const forges = c.els.map(forgeOf);
	let d = c.ids.reduce((s, i) => s + W[i]!.dmg, 0) + forges.reduce((s, f) => s + (f.dmg || 0), 0);
	// poison doubles once regardless of stack count: extra stacks add a flat kicker instead of compounding
	const venom = forges.reduce((s, f) => s + (f.pow || 0), 0);
	if (venom) d = d * 2 + 6 * venom;
	const mult = forges.reduce((m, f) => m * (f.mult || 1), 1);
	return Math.round(d * mult);
}
export const isComp = (e: string): boolean => !!CFORGE[e];
/** Whether a key names one of the base elements rather than something fused out of them. */
export const isEl = (e: string): boolean => !!EL[e];
/** What a base element costs in the shop; the three starters are never bought, so they cost nothing. */
export const elCost = (e: string): number => EL[e]!.cost || 0;
/** What a pair of elements makes, which every pair of them does. */
export const fusionOf = (a: string, b: string): string => FUSE[fkey(a, b)]!;
/** One piece of footwork by key, for the screens that read it out by name. */
export const moveOf = (k: string): MoveDef => MV[k]!;
/** What one use of a piece of footwork costs in energy. */
export const mvCost = (k: string): number => COST[k as ActionKey];
// a tile is a gift only if it helps its occupant and costs them nothing
export const terrOf = (e: string): TerrainDef | undefined => (EL[e] ? T[EL[e].t] : T[e]);
/** The same ground, for the screens that only ever ask about an element the game already knows. */
export const groundOf = (e: string): TerrainDef => terrOf(e)!;
export const madeFrom = (e: string): string[] =>
	Object.entries(FUSE)
		.filter(([, v]) => v === e)
		.map(([k]) =>
			k
				.split("|")
				.map((x) => EL[x]!.n)
				.join(" + "),
		);
export const parentsOf = (k: string): string[] => {
	const hit = Object.entries(FUSE).find(([, v]) => v === k);
	return hit ? hit[0].split("|") : [];
};
export const ownEl = (k: string): boolean => S.unlocked.includes(k);
// you can only read something you own, or a fusion you have made from things you own
export const known = (k: string): boolean => (EL[k] ? ownEl(k) : !!S.codex[k] && parentsOf(k).every(ownEl));
export const mixesIntoKeys = (e: string): string[] =>
	Object.entries(FUSE)
		.filter(([k]) => k.split("|").includes(e))
		.map(([, v]) => v);

// which forged elements would leave ground behind, and which one you have chosen
const groundEls = (c: WeaponSpec): string[] => [...new Set(c.els.filter((e) => isComp(e) || e === "fire"))];
// ground under you and ground under them are separate squares, so each gets its own pick
export const selfEls = (c: WeaponSpec): string[] => groundEls(c).filter((e) => boon(e));
export const foeEls = (c: WeaponSpec): string[] => groundEls(c).filter((e) => !boon(e));
const pickFrom = (opts: string[], chosen: string | undefined): string | undefined =>
	chosen && opts.includes(chosen) ? chosen : opts[0];
export const leaveSelf = (c: WeaponSpec): string | undefined => pickFrom(selfEls(c), c.leaveSelf);
export const leaveFoe = (c: WeaponSpec): string | undefined => pickFrom(foeEls(c), c.leaveFoe);

/** One of the arena's colours at a given translucency, which is how every glow on a screen is made. */
export function rgba(h: string, a: number): string {
	const n = parseInt(h.slice(1), 16);
	return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
