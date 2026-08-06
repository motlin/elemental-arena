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

/** The fields each move carries, which is also the list nothing may be added to. */
const INTENT_FIELDS = {
	step: ["x", "y"],
	card: ["uid"],
	place: ["uid", "x", "y"],
	swing: ["x", "y"],
	merge: ["uid", "into"],
	end: [],
	forfeit: [],
} as const satisfies Record<Intent["k"], readonly string[]>;

function isIntentKind(kind: unknown): kind is Intent["k"] {
	return typeof kind === "string" && Object.hasOwn(INTENT_FIELDS, kind);
}

/** Exactly these keys, no more and no fewer, and every one of them a whole number. */
function shaped(value: Record<string, unknown>, fields: readonly string[]): boolean {
	const keys = Object.keys(value).filter((key) => key !== "k");
	if (keys.length !== fields.length) return false;
	return fields.every((field) => isCount(value[field]));
}

/** A checked field, as a number. `shaped` has already said the ones a move needs are there. */
function count(value: unknown): number {
	return typeof value === "number" ? value : 0;
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
		case "place":
			return {k, uid, x, y};
		case "swing":
			return {k, x, y};
		case "merge":
			return {k, uid, into: count(value["into"])};
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
