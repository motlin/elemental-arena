import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {JSDOM, VirtualConsole} from "jsdom";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const indexHtmlPath = path.join(repoRoot, "index.html");

export function readIndexHtml(): string {
	return readFileSync(indexHtmlPath, "utf8");
}

/**
 * The game lives in the one attribute-less `<script>` in index.html. The other two script tags
 * carry `src`, so matching `<script>` with no attributes picks out the game and nothing else.
 */
export function extractGameScript(html: string): string {
	const body = /<script>\n([\s\S]*?)\n\t*<\/script>/.exec(html)?.[1];
	if (body === undefined || body === "") throw new Error("no inline <script> found in index.html");
	return body;
}

/**
 * Top-level declarations in the game script are indented exactly three tabs; anything nested sits
 * deeper. Only the first declarator of a comma-separated `let a = 1, b = 2` is picked up, which is
 * enough because every binding the tests touch is declared on its own.
 */
export function topLevelNames(script: string): string[] {
	const names = new Set<string>();
	const re = /^\t{3}(?:const|let|var|async function|function)\s+([A-Za-z_$][\w$]*)/gm;
	for (const match of script.matchAll(re)) {
		const name = match[1];
		if (name !== undefined) names.add(name);
	}
	return [...names];
}

/**
 * Live getters rather than a snapshot, so tests observe `let` bindings the game reassigns.
 */
function exportEpilogue(names: readonly string[]): string {
	const props = names.map((n) => `${JSON.stringify(n)}:{enumerable:true,get(){return ${n};}}`).join(",\n");
	return `\n;window.__GAME__ = Object.defineProperties({}, {\n${props}\n});\n`;
}

const LOAD_CALL = "load().then(";

/** Expose the boot promise so tests can await load-time DOM wiring instead of racing it. */
function captureBootPromise(script: string): string {
	const at = script.indexOf(LOAD_CALL);
	if (at === -1) throw new Error(`index.html no longer boots via ${LOAD_CALL}`);
	if (script.includes(LOAD_CALL, at + 1)) throw new Error(`${LOAD_CALL} appears more than once`);
	return script.slice(0, at) + "window.__BOOT__ = " + script.slice(at);
}

export interface ElementDef {
	n: string;
	c: string;
	t: string;
	cost?: number;
	blurb?: string;
}

export interface TerrainDef {
	n: string;
	c: string;
	life: number;
	gone?: number;
}

export interface WeaponDef {
	n: string;
	c: string;
	cost: number;
	dmg: number;
	hits: number;
	pat: string;
	sweep?: number;
	price?: number;
	d: string;
}

export interface ForgeDef {
	dmg: number;
	fx: string;
	mult?: number;
	pow?: number;
	hits?: number;
}

export interface MoveDef {
	n: string;
	bit: number;
	price: number;
	d: string;
}

export interface Card {
	uid: number;
	k: "el" | "w";
	id?: string;
	ids?: string[];
	els?: string[];
	mark?: boolean;
}

export interface WeaponCard {
	ids: string[];
	els: string[];
	leaveSelf?: string;
	leaveFoe?: string;
}

export interface Player {
	i: number;
	name: string;
	team: number;
	x: number;
	y: number;
	hp: number;
	nrg: number;
	cap: number;
	alive: boolean;
	hand: Card[];
	held: number | null;
}

export interface GameState {
	dim: number;
	np: number;
	hp: number;
	startNrg: number;
	names: string[];
	cols: number[];
	mv: number[];
	mvShared: number;
	coins: number;
	screen: string;
	phase: string;
	turn: number;
	round: number;
	mode: string | null;
	sel: number | null;
	players: Player[];
	board: {t: string | null; el: string | null; life: number}[];
	unlocked: string[];
	wunlocked: string[];
	munlocked: string[];
	codex: Record<string, unknown>;
	imode: boolean;
	steal: number | null;
	toss: boolean;
	tossPick: number | null;
	chaos: boolean;
	smash: boolean;
	replyTo: number | null;
	pOff: Record<string, unknown>;
	handoff: boolean;
	loadErr: string | null;
	saveErr: string | null;
	log: unknown[];
	chat: unknown[];
	fx: unknown[];
	look: number | null;
	tsel: string | null;
	mixFrom: number | null;
	who: string | number;
	preset: (string | null)[] | null;
	presetDim: number;
	btool: string;
	reach: unknown[];
}

/** The game bindings the tests reach for. */
export interface GameGlobals {
	EL: Record<string, ElementDef | undefined>;
	T: Record<string, TerrainDef | undefined>;
	W: Record<string, WeaponDef | undefined>;
	FUSE: Record<string, string | undefined>;
	CFORGE: Record<string, ForgeDef | undefined>;
	MV: Record<string, MoveDef | undefined>;
	PAT: Record<string, (() => number[][]) | undefined>;
	MODEHINT: Record<string, string | undefined>;
	BASE: string[];
	WBASE: string[];
	S: GameState;
	elName: (e: string) => string;
	elColor: (e: string) => string;
	terrOf: (e: string) => TerrainDef | undefined;
	forgeOf: (e: string) => ForgeDef | undefined;
	wCost: (c: WeaponCard) => number;
	wHits: (c: WeaponCard) => number;
	wColor: (c: WeaponCard) => string;
	wStrip: (c: WeaponCard) => string;
	wDesc: (c: WeaponCard) => string;
	wepName: (c: WeaponCard) => string;
	wepDmg: (c: WeaponCard) => number;
	leaveSelf: (c: WeaponCard) => string | undefined;
	leaveFoe: (c: WeaponCard) => string | undefined;
	attackTiles: (p: Player, c: WeaponCard) => number[][];
	mvOwnedMask: () => number;
	startMatch: () => void;
	render: () => void;
	drawChat: () => void;
	drawCodex: () => void;
	drawShop: () => void;
	drawLoadout: () => void;
	drawMatchLog: () => void;
	drawSeg: () => void;
	drawTeams: () => void;
	drawNames: () => void;
	drawWho: () => void;
	drawMvChips: () => void;
	drawPalette: () => void;
	drawSpawnPicker: () => void;
	drawSpawns: () => void;
	drawCheat: () => void;
	drawSim: () => void;
	simAdd: (kind: string, key: string) => void;
	drawReplay: () => void;
	drawDetail: () => void;
	buildTable: () => void;
	cur: () => Player;
	GAME_PAD: number;
	ARENA_GAP: number;
	SIDE_MIN: number;
	SIDE_MAX: number;
	SIDE_VW: number;
	ARENA_STACK_AT: number;
	ARENA_BOARD_MAX: number;
	ARENA_CELL_MIN: number;
	ARENA_CELL_MAX: number;
	boardWidth: (dim: number, cell: number) => number;
	boardCell: (dim: number, avail: number, min: number, max: number) => number;
	arenaBoardRoom: (w: number) => number;
}

export interface GameHarness {
	dom: JSDOM;
	window: JSDOM["window"];
	document: Document;
	game: GameGlobals;
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

/** Doubles as a smoke check that the export epilogue ran and picked up the bindings tests rely on. */
function isGameGlobals(value: unknown): value is GameGlobals {
	if (typeof value !== "object" || value === null) return false;
	return ["EL", "T", "W", "S", "render", "startMatch"].every((key) => key in value);
}

export interface LoadGameOptions {
	/** Pre-seeded `window.storage` cells, keyed the way the game keys them (e.g. "arena:v3"). */
	storage?: Record<string, string>;
}

/**
 * Parses index.html into jsdom and runs the game script against it. The script is evaluated rather
 * than executed in place so that (a) the two `src` scripts stay inert and (b) an export epilogue can
 * hand the tests the script's top-level `const` bindings, which never land on `window`.
 */
export async function loadGame(options: LoadGameOptions = {}): Promise<GameHarness> {
	const html = readIndexHtml();
	const script = extractGameScript(html);
	const source = captureBootPromise(script) + exportEpilogue(topLevelNames(script));

	const errors: string[] = [];
	const virtualConsole = new VirtualConsole();
	virtualConsole.on("jsdomError", (error: Error) => errors.push(error.message));
	virtualConsole.on("error", (...args: unknown[]) => errors.push(args.map(String).join(" ")));

	const dom = new JSDOM(html, {
		runScripts: "outside-only",
		url: "http://localhost/",
		pretendToBeVisual: true,
		virtualConsole,
	});
	const window = dom.window;
	installStorage(window, options.storage ?? {});
	window.eval(source);

	const exported: unknown = window["__GAME__"];
	if (!isGameGlobals(exported)) throw new Error("the game script exported no top-level bindings");
	const boot: unknown = window["__BOOT__"];
	await boot;

	return {
		dom,
		window,
		document: window.document,
		game: exported,
		errors,
		close: () => {
			dom.window.close();
		},
	};
}
