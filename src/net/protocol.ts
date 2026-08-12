/**
 * What a client and a match server may say to each other, and the parser that decides whether a
 * client actually said it.
 *
 * The server is authoritative: a client never sends state, only the move it would like to make, and
 * only ever gets back the arena as its own seat is allowed to see it (src/game/seat.ts). So this
 * file is a trust boundary as well as a vocabulary. `parseClientMessage` is the only way a socket's
 * bytes become something the room will act on, and it is deliberately unforgiving -- an unknown
 * kind, a coordinate that is not a whole number, or a field the message was never given all read as
 * a client the server does not understand, and the safe reading of that is to refuse it rather than
 * to guess which half was meant.
 */

import {SAY_MAX} from "../game/chat.js";
import {DEFAULT_SETUP, SETUP_LIMITS} from "../game/intent.js";
import type {Intent, MatchSetup} from "../game/intent.js";
import type {SeatState} from "../game/seat.js";

export type {Intent, MatchSetup};

/** Bumped whenever a message changes shape, so an old tab is turned away rather than half-served. */
export const PROTOCOL_VERSION = 1;

export type ClientMessage =
	/** Claims a seat. The token is what says this socket is the player who was invited to it. */
	| {readonly k: "hello"; readonly v: number; readonly seat: number; readonly token: string}
	| {readonly k: "move"; readonly intent: Intent};

export type ServerMessage =
	| {readonly k: "seated"; readonly v: number; readonly seat: number}
	| {readonly k: "state"; readonly state: SeatState}
	/** The move was not taken, and why. The state that follows is still the truth. */
	| {readonly k: "refused"; readonly why: string}
	/** The socket is being shut, and why. */
	| {readonly k: "closed"; readonly why: string};

export function encode(message: ClientMessage | ServerMessage): string {
	return JSON.stringify(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Whole numbers only: a board index is never 1.5, and NaN is never a square. */
function isCount(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** One square along one axis, or none: the only numbers a move carries that go below zero. */
function isStep(value: unknown): value is number {
	return value === -1 || value === 0 || value === 1;
}

/** Something said at the table. The cap is the chat box's own, so both ends hold to the same one. */
function isLine(value: unknown): value is string {
	return typeof value === "string" && value.length > 0 && value.length <= SAY_MAX;
}

/** Which of a weapon's two rows of leavings a pick was made in: under you, or under them. */
function isRow(value: unknown): value is "self" | "foe" {
	return value === "self" || value === "foe";
}

/** Longer than any ground the arena has a name for, which is all the parser needs to know of one. */
const KEY_MAX = 24;

/**
 * A piece of ground, by key. Whether the weapon in hand actually leaves that ground is a rule, and
 * the rules refuse it themselves, so all the parser owes them is a word short enough to be a key.
 */
function isKey(value: unknown): value is string {
	return typeof value === "string" && value.length > 0 && value.length <= KEY_MAX;
}

/** What each field a move can carry has to be. A field missing from here is a field no move has. */
const FIELD: Record<string, ((value: unknown) => boolean) | undefined> = {
	x: isCount,
	y: isCount,
	uid: isCount,
	into: isCount,
	to: isCount,
	dx: isStep,
	dy: isStep,
	text: isLine,
	row: isRow,
	el: isKey,
};

/** The fields each move carries, which is also the list nothing may be added to. */
const INTENT_FIELDS = {
	step: ["x", "y"],
	card: ["uid"],
	reorder: ["uid", "to"],
	place: ["uid", "x", "y"],
	swing: ["x", "y"],
	leaving: ["row", "el"],
	merge: ["uid", "into"],
	jump: ["x", "y"],
	dash: ["x", "y"],
	leap: ["x", "y"],
	warp: ["x", "y"],
	spread: ["x", "y"],
	swap: ["x", "y"],
	mark: ["x", "y"],
	light: ["x", "y"],
	theft: ["x", "y"],
	float: [],
	spin: [],
	wipe: [],
	ultra: [],
	trail: [],
	smash: [],
	shift: ["dx", "dy"],
	take: ["uid"],
	toss: ["uid"],
	chat: ["text", "to"],
	end: [],
	forfeit: [],
} as const satisfies Record<Intent["k"], readonly string[]>;

function isIntentKind(kind: unknown): kind is Intent["k"] {
	return typeof kind === "string" && Object.hasOwn(INTENT_FIELDS, kind);
}

/** Exactly these keys, no more and no fewer, and every one of them what its field has to be. */
function shaped(value: Record<string, unknown>, fields: readonly string[]): boolean {
	const keys = Object.keys(value).filter((key) => key !== "k");
	if (keys.length !== fields.length) return false;
	return fields.every((field) => FIELD[field]?.(value[field]) === true);
}

/** A checked field, as a number. `shaped` has already said the ones a move needs are there. */
function count(value: unknown): number {
	return typeof value === "number" ? value : 0;
}

/** A checked field, as text. */
function line(value: unknown): string {
	return typeof value === "string" ? value : "";
}

/** A checked field, as one of the two rows a weapon leaves ground in. */
function row(value: unknown): "self" | "foe" {
	return value === "foe" ? "foe" : "self";
}

/**
 * A move, rebuilt field by field rather than waved through. Building the move here rather than
 * casting the message into one is what keeps a client from smuggling a field past the parser.
 */
function parseIntent(value: unknown): Intent | null {
	if (!isRecord(value) || !isIntentKind(value["k"])) return null;
	const k = value["k"];
	if (!shaped(value, INTENT_FIELDS[k])) return null;
	const x = count(value["x"]),
		y = count(value["y"]),
		uid = count(value["uid"]);
	switch (k) {
		case "step":
			return {k, x, y};
		case "card":
			return {k, uid};
		case "reorder":
			return {k, uid, to: count(value["to"])};
		case "place":
			return {k, uid, x, y};
		case "swing":
			return {k, x, y};
		case "leaving":
			return {k, row: row(value["row"]), el: line(value["el"])};
		case "merge":
			return {k, uid, into: count(value["into"])};
		case "jump":
		case "dash":
		case "leap":
		case "warp":
		case "spread":
		case "swap":
		case "mark":
		case "light":
		case "theft":
			return {k, x, y};
		case "float":
		case "spin":
		case "wipe":
		case "ultra":
		case "trail":
		case "smash":
			return {k};
		case "shift": {
			// the four the shift bar offers: standing still is not a direction, and nor is a diagonal
			const dx = count(value["dx"]),
				dy = count(value["dy"]);
			return Math.abs(dx) + Math.abs(dy) === 1 ? {k, dx, dy} : null;
		}
		case "take":
			return {k, uid};
		case "toss":
			return {k, uid};
		case "chat":
			return {k, text: line(value["text"]), to: count(value["to"])};
		case "end":
			return {k};
		case "forfeit":
			return {k};
	}
	return null;
}

/** A client's bytes, or null for anything the server was never taught to hear. */
export function parseClientMessage(raw: string): ClientMessage | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!isRecord(parsed)) return null;
	if (parsed["k"] === "hello") {
		const {v, seat, token} = parsed;
		if (Object.keys(parsed).length !== 4) return null;
		if (v !== PROTOCOL_VERSION || !isCount(seat) || typeof token !== "string" || !token) return null;
		return {k: "hello", v, seat, token};
	}
	if (parsed["k"] === "move") {
		if (Object.keys(parsed).length !== 2) return null;
		const intent = parseIntent(parsed["intent"]);
		return intent === null ? null : {k: "move", intent};
	}
	return null;
}

/**
 * Whether a message is one carrying an arena. The envelope is checked and the arena inside it is
 * taken as given, which is the one place on this wire where something is trusted rather than
 * rebuilt. That is deliberate: `parseClientMessage` above is a trust boundary because a client is a
 * stranger, and this is not, because a room that lied to its own players would be lying about a
 * match it already has every power over. Describing `SeatState` a second time here would buy
 * nothing and would be one more place for the two descriptions to drift apart.
 */
function carriesArena(value: Record<string, unknown>): value is {readonly state: SeatState} {
	const state = value["state"];
	return isRecord(state) && isCount(state["seat"]) && isRecord(state["you"]) && isRecord(state["legal"]);
}

/** What the room said, or null for anything a client was never taught to hear. */
export function parseServerMessage(raw: string): ServerMessage | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!isRecord(parsed)) return null;
	const kind = parsed["k"];
	if (kind === "seated" && parsed["v"] === PROTOCOL_VERSION && isCount(parsed["seat"]))
		return {k: "seated", v: PROTOCOL_VERSION, seat: parsed["seat"]};
	if (kind === "state" && carriesArena(parsed)) return {k: "state", state: parsed.state};
	if ((kind === "refused" || kind === "closed") && typeof parsed["why"] === "string")
		return {k: kind, why: parsed["why"]};
	return null;
}

/** One of the numbers a match is opened on, or the default when the host left it out. */
function within(value: unknown, [low, high]: readonly [number, number], fallback: number): number | null {
	if (value === undefined) return fallback;
	if (!isCount(value) || value < low || value > high) return null;
	return value;
}

/**
 * The setup a host asks for, clamped to what the arena will actually deal. Anything out of range is
 * refused rather than pulled into range: a host who asked for a 40x40 board should be told no, not
 * handed a 25x25 one and left to wonder.
 */
export function parseSetup(value: unknown): MatchSetup | null {
	if (!isRecord(value)) return null;
	if (Object.keys(value).some((key) => !Object.hasOwn(DEFAULT_SETUP, key))) return null;
	const seats = within(value["seats"], SETUP_LIMITS.seats, DEFAULT_SETUP.seats);
	const dim = within(value["dim"], SETUP_LIMITS.dim, DEFAULT_SETUP.dim);
	const hp = within(value["hp"], SETUP_LIMITS.hp, DEFAULT_SETUP.hp);
	const priv = value["priv"] === undefined ? DEFAULT_SETUP.priv : value["priv"];
	if (seats === null || dim === null || hp === null || typeof priv !== "boolean") return null;
	return {seats, dim, hp, priv};
}
