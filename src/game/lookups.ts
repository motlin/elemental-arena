/**
 * Read-only questions about the data tables: what an element is called, what a forged weapon costs,
 * what mixes into what. Nothing here changes the game; it only reads it.
 */

import {CFORGE, EL, FORGE, FUSE, MV, T, W} from "./data/index.js";
import type {ForgeDef, TerrainDef} from "./data/index.js";
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
export const isComp = (e: string): boolean => !!CFORGE[e];
// a tile is a gift only if it helps its occupant and costs them nothing
export const terrOf = (e: string): TerrainDef | undefined => (EL[e] ? T[EL[e].t] : T[e]);
export const madeFrom = (e: string): string[] =>
	Object.entries(FUSE)
		.filter(([, v]) => v === e)
		.map(([k]) =>
			k
				.split("|")
				.map((x) => EL[x]!.n)
				.join(" + "),
		);
export const mixesInto = (e: string): string[] =>
	Object.entries(FUSE)
		.filter(([k]) => k.split("|").includes(e))
		.map(([, v]) => T[v]!.n);
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
