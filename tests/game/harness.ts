import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {JSDOM, VirtualConsole} from "jsdom";
import {vi} from "vitest";
import type {Player} from "../../src/game/game.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const indexHtmlPath = path.join(repoRoot, "index.html");

const gameScriptPath = path.join(repoRoot, "src", "game", "game.ts");

const stylesDir = path.join(repoRoot, "src", "styles");

export function readIndexHtml(): string {
	return readFileSync(indexHtmlPath, "utf8");
}

/** The game module's source, for the tests that read the code rather than run it. */
export function readGameScript(): string {
	return readFileSync(gameScriptPath, "utf8");
}

/** Reads one of the stylesheets `index.css` pulls in, e.g. "arena.css". */
export function readStylesheet(name: string): string {
	return readFileSync(path.join(stylesDir, name), "utf8");
}

/** The game's own exports, which is everything the tests drive it through. */
export type GameGlobals = typeof import("../../src/game/game.js");

/** The bridge instance the game under test publishes to, which a fresh load replaces. */
export type Bridge = typeof import("../../src/game/bridge.js");

export type {Card, Player, WeaponSpec} from "../../src/game/game.js";
export type {WeaponDef} from "../../src/game/data/index.js";

/**
 * A whole fighter, so a test that only cares about one or two fields does not have to spell out the
 * rest. The defaults are the ones `startMatch` deals: full health, nothing used, nothing held.
 */
export function fighter(overrides: Partial<Player> = {}): Player {
	return {
		i: 0,
		name: "Tester",
		c: "#ff4d8d",
		team: 0,
		mv: 0,
		used: {
			place: 0,
			merge: 0,
			jump: 0,
			dash: 0,
			leap: 0,
			float: 0,
			spin: 0,
			wipe: 0,
			warp: 0,
			ultra: 0,
			spread: 0,
			trail: 0,
			shift: 0,
			smash: 0,
			theft: 0,
			swap: 0,
			mark: 0,
			light: 0,
		},
		trail: null,
		float: false,
		x: 4,
		y: 4,
		hp: 60,
		max: 60,
		nrg: 9,
		cap: 5,
		drain: 0,
		bank: 0,
		rootTurns: 0,
		darkTurns: 0,
		litTurns: 0,
		hand: [],
		held: null,
		alive: true,
		...overrides,
	};
}

export interface GameHarness {
	dom: JSDOM;
	window: JSDOM["window"];
	document: Document;
	game: GameGlobals;
	bridge: Bridge;
	/** Messages jsdom reported out of band: uncaught errors, rejections, console.error. */
	errors: string[];
	close(): void;
}

interface StorageRecord {
	key: string;
	value: string;
}

/** Stands in for the Claude-artifact `window.storage` that public/storage-shim.js provides in a browser. */
function installStorage(window: JSDOM["window"], seed: Record<string, string>): void {
	const cells = new Map<string, string>(Object.entries(seed));
	Object.defineProperty(window, "storage", {
		configurable: true,
		value: {
			get: async (key: string): Promise<StorageRecord | null> => {
				const value = cells.get(key);
				return Promise.resolve(value === undefined ? null : {key, value});
			},
			set: async (key: string, value: string): Promise<void> => {
				cells.set(key, value);
				return Promise.resolve();
			},
			delete: async (key: string): Promise<void> => {
				cells.delete(key);
				return Promise.resolve();
			},
		},
	});
}

/**
 * The game is a browser module, so it reads `document` and friends straight off the global object.
 * Point them at this load's jsdom for as long as the harness is open; `close` puts them back.
 */
function borrowGlobals(window: JSDOM["window"]): void {
	vi.stubGlobal("window", window);
	vi.stubGlobal("document", window.document);
	vi.stubGlobal("HTMLElement", window.HTMLElement);
	vi.stubGlobal("addEventListener", window.addEventListener.bind(window));
	vi.stubGlobal("removeEventListener", window.removeEventListener.bind(window));
}

export interface LoadGameOptions {
	/** Pre-seeded `window.storage` cells, keyed the way the game keys them (e.g. "arena:v3"). */
	storage?: Record<string, string>;
}

/**
 * Parses index.html into jsdom and imports the game module against it. `vi.resetModules()` makes
 * every load a fresh copy of the game, so one test's match never leaks into the next; the bridge
 * comes back alongside it because that fresh copy publishes to a fresh bridge too.
 */
export async function loadGame(options: LoadGameOptions = {}): Promise<GameHarness> {
	const errors: string[] = [];
	const virtualConsole = new VirtualConsole();
	virtualConsole.on("jsdomError", (error: Error) => errors.push(error.message));
	virtualConsole.on("error", (...args: unknown[]) => errors.push(args.map(String).join(" ")));

	const dom = new JSDOM(readIndexHtml(), {
		url: "http://localhost/",
		pretendToBeVisual: true,
		virtualConsole,
	});
	const window = dom.window;
	installStorage(window, options.storage ?? {});
	borrowGlobals(window);

	vi.resetModules();
	const bridge: Bridge = await import("../../src/game/bridge.js");
	const game: GameGlobals = await import("../../src/game/game.js");
	await game.boot;

	return {
		dom,
		window,
		document: window.document,
		game,
		bridge,
		errors,
		close: () => {
			vi.unstubAllGlobals();
			dom.window.close();
		},
	};
}
