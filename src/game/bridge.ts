/**
 * The one-way channel from the game modules under src/game to the React tree in src/main.tsx. The
 * game publishes a plain description of a screen whenever it redraws; React subscribes and paints
 * it. Screens migrate one at a time: each one drops its markup from index.html and the writes that
 * filled it in from the renderer, and gains a store here plus a component in src/ui/.
 */

import type {LogEntry} from "./types.js";

type Listener = () => void;

export interface Store<T> {
	get: () => T;
	set: (next: T) => void;
	subscribe: (listener: Listener) => () => void;
}

/**
 * The game redraws far more often than any one screen changes, so `equals` decides what counts as
 * news. Republishing an equal value is ignored, which keeps React off the treadmill and keeps the
 * snapshot stable enough for `useSyncExternalStore`, which compares snapshots by identity.
 */
function createStore<T>(initial: T, equals: (a: T, b: T) => boolean): Store<T> {
	let value = initial;
	const listeners = new Set<Listener>();
	return {
		get: () => value,
		set: (next) => {
			if (equals(value, next)) return;
			value = next;
			for (const listener of [...listeners]) listener();
		},
		subscribe: (listener) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}

/** What the handoff curtain needs to know about the seat whose turn is starting. */
export interface HandoffView {
	/** Seat number, which picks the glyph's `p0`..`p7` class. */
	readonly seat: number;
	readonly name: string;
	/** The seat's colour, fed to the glyph as `--pc`. */
	readonly colour: string;
	/** Drops the curtain and hands control back to the game. */
	readonly dismiss: () => void;
}

function sameHandoff(a: HandoffView | null, b: HandoffView | null): boolean {
	if (a === null || b === null) return a === b;
	return a.seat === b.seat && a.name === b.name && a.colour === b.colour && a.dismiss === b.dismiss;
}

export const handoffStore = createStore<HandoffView | null>(null, sameHandoff);

/** What the game-over screen needs to know about the match that just ended. */
export interface OverView {
	/** The winner's seat number, which picks the glyph's `p0`..`p7` class. */
	readonly seat: number;
	/** The winning team's colour, or a grey when nobody walked out. */
	readonly colour: string;
	/** Who holds the arena, or that nobody does. */
	readonly headline: string;
	/** Everyone who shares the win, and the coin banked for it. */
	readonly earn: string;
	/** The whole match log, oldest line first. */
	readonly log: readonly LogEntry[];
	/** Puts the replay up over the screen. */
	readonly openReplay: () => void;
	/** Drops the screen and goes back to the menu. */
	readonly back: () => void;
}

function sameOver(a: OverView | null, b: OverView | null): boolean {
	if (a === null || b === null) return a === b;
	return (
		a.seat === b.seat &&
		a.colour === b.colour &&
		a.headline === b.headline &&
		a.earn === b.earn &&
		a.log === b.log &&
		a.openReplay === b.openReplay &&
		a.back === b.back
	);
}

export const overStore = createStore<OverView | null>(null, sameOver);
