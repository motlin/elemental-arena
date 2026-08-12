/**
 * The client's half of an online match: one socket, the moves that go out of it, and the arena that
 * comes back.
 *
 * Nothing here works a rule. A click is a request, the room is the only thing that may take it, and
 * the arena on screen is always the last one the room sent -- never one this side guessed at. That
 * is what makes a refusal harmless: a move the room turns down changed nothing here to put back.
 *
 * A seat belongs to the token in the link, not to the socket holding it, so a wire that drops is
 * not the end of a match: the tab sits back down by itself, with the arena still on screen and the
 * strip saying it is stale. Only the room hanging up and saying why ends anything.
 *
 * Joining is by link rather than by anything kept on the device, and that is the whole reason it
 * looks the way it does. Two ordinary tabs of one browser share local storage, so a token left
 * there would have the second tab opened take the first tab's seat. The address bar is the one
 * thing two tabs of the same profile hold different copies of, so the seat and its token ride in
 * the URL and two tabs can play each other with no incognito window in sight.
 *
 * The link that goes round names only the match. A seat is asked for on arrival and written into
 * the address bar afterwards, so nobody has to be handed a seat by whoever opened the match, and
 * whoever opened it cannot sit down as somebody else.
 */

import {onlineStore, seatStore} from "../game/bridge.js";
import {PROTOCOL_VERSION, encode, parseServerMessage} from "./protocol.js";
import type {NetStatus} from "../game/bridge.js";
import type {LogEntry} from "../game/types.js";
import type {Intent, MatchSetup} from "./protocol.js";

/** Everything a seat needs to sit down: which match, which seat of it, and what claims the seat. */
export interface Invite {
	readonly code: string;
	readonly seat: number;
	readonly token: string;
}

/** What the screen asked to be told: a move of its own was taken, so what it was aiming is spent. */
export type Took = (intent: Intent) => void;

/**
 * What the screen asked to be told when the match is played out, which is the one time the room
 * sends the log. The screen is welcome to it: by then it is a record rather than a leak.
 */
export type Ended = (log: readonly LogEntry[]) => void;

/** `WebSocket.OPEN`, spelled out, because a socket stubbed in a test has no class constants. */
const OPEN = 1;

/**
 * What a match code is made of. It is only ever a name for a room, and the token beside it is what
 * says a socket may sit in a seat, so the code keeps no secret and only has to be short enough to
 * paste. The letter `l` is left out for the same reason the digits stop at 8: a code is read aloud
 * and typed by hand often enough that the pairs which look alike are not worth the extra bit.
 */
const ALPHABET = "abcdefghijkmnopqrstuvwxyz2345678";

/** What the door in worker/index.ts will open for, which a pasted link is held to before it is used. */
const CODE = /^[A-Za-z0-9_-]{4,64}$/;

export function newCode(): string {
	// 32 divides 256, so the byte does not favour the front of the alphabet
	return Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) => ALPHABET[byte % 32]).join("");
}

/**
 * Wherever the page came from, which is also where the match server is: they are one Worker. The
 * query and the fragment come off here rather than at each use, because everything built out of
 * this address is either a socket or an invite, and neither wants whatever the tab was opened on.
 */
function here(): URL {
	const url = new URL(globalThis.location.href);
	url.search = "";
	url.hash = "";
	return url;
}

function socketUrl(code: string): string {
	const url = here();
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
	url.pathname = `/api/match/${code}/socket`;
	return url.toString();
}

/**
 * The link that goes round, which is this page and the match to join at it. It names no seat: the
 * room deals those one at a time, so the same link can go to everybody and still seat them apart.
 */
export function matchLink(code: string): string {
	const url = here();
	url.searchParams.set("code", code);
	return url.toString();
}

/**
 * The link a seat is already sitting in, which is the match link with the seat and its token on it.
 * Nobody is sent one of these: it is what `claimSeat` writes into the address bar once the room has
 * dealt a seat, so that reloading the tab is that seat sitting back down rather than asking for
 * another one.
 */
export function inviteLink(invite: Invite): string {
	const url = new URL(matchLink(invite.code));
	url.searchParams.set("seat", String(invite.seat));
	url.searchParams.set("token", invite.token);
	return url.toString();
}

/** The match a link names, whether or not it carries a seat of it, or null for anything else. */
export function codeFrom(href: string): string | null {
	let url: URL;
	try {
		url = new URL(href, here());
	} catch {
		return null;
	}
	const code = url.searchParams.get("code");
	return code !== null && CODE.test(code) ? code : null;
}

/** The invite a link carries, or null for anything that is not one. */
export function inviteFrom(href: string): Invite | null {
	let url: URL;
	try {
		url = new URL(href, here());
	} catch {
		return null;
	}
	const code = url.searchParams.get("code");
	const seat = url.searchParams.get("seat");
	const token = url.searchParams.get("token");
	if (code === null || seat === null || token === null) return null;
	if (!CODE.test(code) || !/^[0-7]$/.test(seat) || token.length === 0) return null;
	return {code, seat: Number(seat), token};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One seat's claim on a match, as it comes back off the wire. */
function isToken(value: unknown): value is string {
	return typeof value === "string" && value.length > 0;
}

/** What the room said went wrong, if it troubled to say. */
function complaint(body: unknown): string | null {
	if (!isRecord(body)) return null;
	const error = body["error"];
	return typeof error === "string" ? error : null;
}

/** Why the room would not do what was asked of it, or the bare fact that it would not. */
function refusal(answer: Response, body: unknown): Error {
	return new Error(complaint(body) ?? `the match server answered ${answer.status}`);
}

/**
 * Opens a match and comes back with the number of seats it was dealt. No token comes back with
 * them: whoever opens a match holds no more of it than anybody else does, and gets a seat the same
 * way everybody else does, by asking for one.
 */
export async function openRoom(code: string, setup: MatchSetup): Promise<number> {
	const answer = await fetch(`/api/match/${code}/open`, {
		method: "POST",
		headers: {"content-type": "application/json"},
		body: JSON.stringify(setup),
	});
	const body: unknown = await answer.json().catch(() => null);
	if (!answer.ok) throw refusal(answer, body);
	const seats: unknown = isRecord(body) ? body["seats"] : null;
	if (typeof seats !== "number") throw new Error("the match server dealt no match");
	return seats;
}

/**
 * Asks a match for a seat, and takes whichever one it deals. The room decides, which is the whole
 * point: the link that went round names the match alone, so nobody holds a seat they were not
 * dealt and the host holds no more of the match than anybody else.
 *
 * The seat and its token go straight into the address bar, because that is where this client keeps
 * a claim -- see the note at the top of this file. A reload is then the same seat sitting back
 * down, rather than a stranger asking the room for another one.
 */
export async function claimSeat(code: string): Promise<Invite> {
	const answer = await fetch(`/api/match/${code}/join`, {method: "POST"});
	const body: unknown = await answer.json().catch(() => null);
	if (!answer.ok) throw refusal(answer, body);
	const seat: unknown = isRecord(body) ? body["seat"] : null;
	const token: unknown = isRecord(body) ? body["token"] : null;
	if (typeof seat !== "number" || !isToken(token)) throw new Error("the match server dealt no seat");
	const invite: Invite = {code, seat, token};
	globalThis.history.replaceState(null, "", inviteLink(invite));
	return invite;
}

let socket: WebSocket | null = null;
let seated: Invite | null = null;
let took: Took = () => {};
let ended: Ended = () => {};
let status: NetStatus = "gone";
let notice: string | null = null;

/**
 * The move waiting on the room's answer. A client only ever has one in the air, because the person
 * clicking is waiting to see what happened before they click again, and the room answers every move
 * either with a refusal to the seat that asked or with an arena to everybody.
 */
let pending: Intent | null = null;

/**
 * Sitting back down after the wire drops: how long to wait, how far that grows while the room stays
 * away, and how many goes before a tab still saying "joining" would be lying to whoever is watching
 * it. Roughly a minute and a half of trying, after which the link in the address bar is still good
 * and reloading the tab is one more go.
 */
const FIRST_WAIT = 1000;
const LONGEST_WAIT = 15_000;
const TRIES = 8;

let retry: ReturnType<typeof setTimeout> | null = null;
let wait = FIRST_WAIT;
let tries = 0;
/** Whether the room hung up rather than the wire dropping, which is the difference that matters. */
let shutOut = false;

/**
 * Which seats the room last said had somebody in them. It is empty until the room says, and a seat
 * nobody has been reported in is not reported gone -- an empty roll call means the room has not
 * spoken yet, not that the match is deserted.
 */
let sitting: readonly boolean[] = [];

/** The other seats with nobody in them. This device's own is never one: it is the one asking. */
function away(mine: number): readonly number[] {
	return sitting.flatMap((there, seat) => (there || seat === mine ? [] : [seat]));
}

function post(): void {
	onlineStore.set(
		seated === null
			? null
			: {code: seated.code, seat: seated.seat, status, notice, away: away(seated.seat), dismiss},
	);
}

function dismiss(): void {
	notice = null;
	post();
}

function hear(raw: string): void {
	const said = parseServerMessage(raw);
	if (said === null) return;
	if (said.k === "seated") {
		status = "playing";
		// sat down again, so the next drop starts its patience over rather than continuing this one
		wait = FIRST_WAIT;
		tries = 0;
		post();
		return;
	}
	if (said.k === "presence") {
		sitting = said.here;
		post();
		return;
	}
	if (said.k === "state") {
		// the outcome first, so the screen has finished with the move before the arena it made lands
		const mine = pending;
		pending = null;
		if (mine !== null) took(mine);
		seatStore.set(said.state);
		return;
	}
	// the arena that ended the match came first, so the screen has it to write the ending from
	if (said.k === "over") {
		ended(said.log);
		return;
	}
	// a refusal changed nothing, so there is nothing to put back: only something to say
	pending = null;
	notice = said.why;
	if (said.k === "closed") {
		shutOut = true;
		status = "gone";
	}
	post();
}

/** Opens a socket and claims the seat, which is the same thing whether it is the first time or not. */
function connect(): void {
	const invite = seated;
	if (invite === null) return;
	retry = null;
	const ws = new WebSocket(socketUrl(invite.code));
	socket = ws;
	ws.addEventListener("open", () => {
		ws.send(encode({k: "hello", v: PROTOCOL_VERSION, seat: invite.seat, token: invite.token}));
	});
	ws.addEventListener("message", (event: MessageEvent) => {
		hear(typeof event.data === "string" ? event.data : "");
	});
	ws.addEventListener("close", () => {
		if (socket !== ws) return;
		socket = null;
		again();
	});
}

/**
 * What to do about a socket that has gone. A room that hung up said why and meant it, so that is
 * the end of the match; anything else is the wire, and the seat is still this token's to sit back
 * down in. The arena on screen is left exactly where it was throughout: it is still the last thing
 * the room said, and a stale arena under a strip that says so beats an empty page.
 */
function again(): void {
	if (shutOut || seated === null) {
		status = "gone";
		notice ??= "the match server hung up";
		post();
		return;
	}
	if (tries >= TRIES) {
		status = "gone";
		notice ??= "the match server did not come back";
		post();
		return;
	}
	tries += 1;
	status = "joining";
	post();
	retry = setTimeout(connect, wait);
	wait = Math.min(wait * 2, LONGEST_WAIT);
}

/** Opens a socket, claims the seat the invite names, and starts drawing whatever comes back. */
export function sit(invite: Invite, onTook: Took, onEnded: Ended): void {
	leave();
	seated = invite;
	took = onTook;
	ended = onEnded;
	status = "joining";
	post();
	connect();
}

/**
 * Asks the room for a move. Nothing is applied here and nothing is drawn: the arena only ever
 * changes when the room says it has, which is what a client that cannot desync looks like.
 */
export function sendIntent(intent: Intent): void {
	if (socket === null || socket.readyState !== OPEN) {
		notice = "you are not connected to the match";
		post();
		return;
	}
	pending = intent;
	socket.send(encode({k: "move", intent}));
}

/** Gets up: shuts the socket, and puts down everything that was only true while it was open. */
export function leave(): void {
	const ws = socket;
	if (retry !== null) clearTimeout(retry);
	retry = null;
	wait = FIRST_WAIT;
	tries = 0;
	shutOut = false;
	socket = null;
	seated = null;
	took = () => {};
	ended = () => {};
	pending = null;
	sitting = [];
	status = "gone";
	notice = null;
	seatStore.set(null);
	onlineStore.set(null);
	ws?.close(1000, "left the match");
}
