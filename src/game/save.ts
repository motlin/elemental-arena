/** Progress between matches, kept in `window.storage` and reloaded on the way in. */

import {BASE, WBASE} from "./data/index.js";
import {S} from "./state.js";
import type {Offs} from "./types.js";
import {redrawShop} from "./view.js";

/** The saved progress, as it comes back off `window.storage`. */
interface SavedGame {
	v?: number;
	coins?: number;
	unlocked?: string[];
	wunlocked?: string[];
	munlocked?: string[];
	elOff?: string[];
	wOff?: string[];
	pOff?: Record<string, Offs>;
	mvShared?: number;
	theme?: string;
	codex?: Record<string, number>;
	cheat?: number;
	tries?: number;
}

/** What went wrong, as the save and load banners word it. */
export function errText(e: unknown): string {
	if (e instanceof Error && e.message) return e.message;
	if (typeof e === "string" && e) return e;
	return "unknown";
}
export async function load(): Promise<void> {
	try {
		const r = await window.storage.get("arena:v3", false);
		if (r?.value) {
			const p = JSON.parse(r.value) as SavedGame;
			S.coins = p.coins || 0;
			S.unlocked = [...new Set([...BASE, ...(p.unlocked || [])])];
			let w = p.wunlocked || [];
			if ((p.v || 1) < 2) w = w.filter((k) => k !== "hammer"); // it used to be free; now it is bought
			S.wunlocked = [...new Set([...WBASE, ...w])];
			S.codex = p.codex || {};
			S.cheat = p.cheat || 0;
			S.tries = p.tries || 0;
			S.elOff = p.elOff || [];
			S.wOff = p.wOff || [];
			S.pOff = p.pOff || {};
			S.mvShared = p.mvShared || 0;
			S.munlocked = p.munlocked || [];
			S.theme = p.theme || "night";
		}
	} catch (e) {
		S.loadErr = errText(e);
	}
}
let saveQ = Promise.resolve(),
	saveT: ReturnType<typeof setTimeout> | null = null;
export async function save(): Promise<void> {
	saveQ = saveQ
		.then(async () =>
			window.storage.set(
				"arena:v3",
				JSON.stringify({
					coins: S.coins,
					unlocked: S.unlocked,
					v: 2,
					wunlocked: S.wunlocked,
					munlocked: S.munlocked,
					elOff: S.elOff,
					wOff: S.wOff,
					pOff: S.pOff,
					mvShared: S.mvShared,
					theme: S.theme,
					codex: S.codex,
					cheat: S.cheat,
					tries: S.tries,
				}),
				false,
			),
		)
		.then(() => {
			S.saveErr = null;
			if (S.screen === "menu") redrawShop();
		})
		.catch((e: unknown) => {
			S.saveErr = errText(e);
			if (S.screen === "menu") redrawShop();
		});
	return saveQ;
}
export function saveSoon(): void {
	if (saveT !== null) clearTimeout(saveT);
	saveT = setTimeout(() => void save(), 300);
}
