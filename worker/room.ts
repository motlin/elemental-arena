/**
 * One match, one Durable Object.
 *
 * The room is the referee. Clients never send it state and never see anybody else's: they send the
 * move they would like to make, the room works it against the real rules, and every socket is
 * handed back the arena as its own seat is allowed to see it. That last step is the whole point of
 * putting a server in the middle at all -- see src/game/seat.ts, which is where the arena's secrets
 * are actually kept.
 *
 * The match itself never lives in this object. Cloudflare is free to run several rooms of the same
 * class in one isolate, and `S` in src/game/state.ts is a module-level object they would all be
 * sharing, so the room loads its own match into `S` for the length of one message and lifts it
 * straight back out again (src/game/snapshot.ts). Nothing is left in the game between messages.
 *
 * Three things here are about a match lasting longer than a socket does. A seat belongs to a token
 * rather than to a connection, so a dropped player sits back down where they were and the others
 * are told meanwhile that somebody has gone quiet. A match nothing happens in is let go by an
 * alarm rather than kept forever. And a socket is allowed to talk only about as fast as a person
 * could click, because every move it asks for loads and stores the whole match.
 */

import {applyIntent, openMatch} from "../src/game/intent.js";
import {seatState} from "../src/game/seat.js";
import {exportMatch, importMatch} from "../src/game/snapshot.js";
import type {MatchSnapshot} from "../src/game/snapshot.js";
import {PROTOCOL_VERSION, encode, parseClientMessage, parseSetup} from "../src/net/protocol.js";
import type {ServerMessage} from "../src/net/protocol.js";

/** Where the room keeps what it owns: the match, who may play which seat, and when it last stirred. */
const MATCH = "match";
const TOKENS = "tokens";
const TOUCHED = "touched";

/**
 * How long a match may go with nothing happening in it before the room lets it go. A socket merely
 * being open does not count as something happening, because a tab left open is precisely what a
 * player who walked away leaves behind.
 */
export const IDLE_MS = 60 * 60 * 1000;

/**
 * How many messages a socket may fire off in a burst, and how quickly the allowance comes back.
 * Far above what a person clicking can produce and far below what a loop can: the cost being
 * guarded is that every move reloads and re-stores the whole match.
 */
export const BURST = 24;
const PER_SECOND = 8;

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {status, headers: {"content-type": "application/json"}});
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * What the room keeps on a socket rather than in storage: which seat it claimed, and what is left
 * of its allowance to talk. It rides on the socket's attachment, so it survives hibernation and
 * costs no storage write -- the room may sleep between two moves of a match that lasts an hour.
 */
interface Held {
	/** The seat this socket claimed, or null for one that has not said hello yet. */
	readonly seat: number | null;
	readonly budget: number;
	/** When the budget was last worked out, which is what the refill is measured from. */
	readonly at: number;
}

function heldBy(ws: WebSocket): Held {
	const held: unknown = ws.deserializeAttachment();
	if (!isRecord(held)) return {seat: null, budget: BURST, at: 0};
	return {
		seat: typeof held["seat"] === "number" ? held["seat"] : null,
		budget: typeof held["budget"] === "number" ? held["budget"] : BURST,
		at: typeof held["at"] === "number" ? held["at"] : 0,
	};
}

/** Which seat a socket claimed, or null for one that has not said hello yet. */
function seatOf(ws: WebSocket): number | null {
	return heldBy(ws).seat;
}

export class MatchRoom {
	readonly #ctx: DurableObjectState;

	constructor(ctx: DurableObjectState) {
		this.#ctx = ctx;
	}

	// the Workers runtime calls this, not the rest of the codebase
	// fallow-ignore-next-line unused-class-member
	async fetch(request: Request): Promise<Response> {
		const {pathname} = new URL(request.url);
		if (pathname.endsWith("/open")) return this.#open(request);
		if (pathname.endsWith("/socket")) return this.#join(request);
		return json({error: "no such door"}, 404);
	}

	/**
	 * Deals the match and hands back one token per seat. Whoever opened the room is trusted with
	 * every token and has to get them to the right people; a token is the only thing that says a
	 * socket is the player who was invited to that seat.
	 */
	async #open(request: Request): Promise<Response> {
		if (await this.#ctx.storage.get<MatchSnapshot>(MATCH)) return json({error: "already open"}, 409);
		const body: unknown = await request.json().catch(() => null);
		const setup = parseSetup(body ?? {});
		if (!setup) return json({error: "that is not a setup"}, 400);
		const tokens = Array.from({length: setup.seats}, () => crypto.randomUUID());
		await this.#ctx.storage.put(MATCH, openMatch(setup));
		await this.#ctx.storage.put(TOKENS, tokens);
		await this.#touch();
		return json({seats: setup.seats, tokens});
	}

	async #join(request: Request): Promise<Response> {
		if (request.headers.get("upgrade") !== "websocket") return json({error: "websockets only"}, 426);
		if (!(await this.#ctx.storage.get<MatchSnapshot>(MATCH))) return json({error: "no match here"}, 404);
		const pair = new WebSocketPair();
		// accepted through the state rather than the socket, so the room may hibernate between moves
		this.#ctx.acceptWebSocket(pair[1]);
		return new Response(null, {status: 101, webSocket: pair[0]});
	}

	// the Workers runtime calls this, not the rest of the codebase
	// fallow-ignore-next-line unused-class-member
	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
		// before the bytes are so much as read, because reading them is part of what is being rationed
		if (!this.#allowed(ws)) return;
		const raw = typeof message === "string" ? message : new TextDecoder().decode(message);
		const said = parseClientMessage(raw);
		if (!said) {
			this.#hangUp(ws, "that is not something a client says");
			return;
		}
		if (said.k === "hello") {
			await this.#seat(ws, said.seat, said.token);
			return;
		}
		const seat = seatOf(ws);
		if (seat === null) {
			this.#hangUp(ws, "claim a seat before you move");
			return;
		}
		await this.#move(ws, seat, said.intent);
	}

	// the Workers runtime calls this, not the rest of the codebase
	// fallow-ignore-next-line unused-class-member
	async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
		// 1005 means the peer sent no code at all, which is not one a close frame may carry back
		ws.close(code === 1005 ? 1000 : code, reason);
		// the seat stays this socket's token's; what the others are told is that nobody is in it
		await this.#tellPresence(ws);
	}

	/**
	 * The room's own clock, wound by nothing but the match being played. Every alarm is the same
	 * one moved along: the handler below reschedules itself while the match is fresh, so a move
	 * costs a storage write rather than a write and an alarm.
	 */
	// the Workers runtime calls this, not the rest of the codebase
	// fallow-ignore-next-line unused-class-member
	async alarm(): Promise<void> {
		const touched = (await this.#ctx.storage.get<number>(TOUCHED)) ?? 0;
		if (Date.now() - touched < IDLE_MS) {
			await this.#ctx.storage.setAlarm(touched + IDLE_MS);
			return;
		}
		for (const ws of this.#ctx.getWebSockets()) this.#hangUp(ws, "this match was left too long");
		// tokens and all: a match let go is gone, and the code is free for a new one
		await this.#ctx.storage.deleteAll();
	}

	async #touch(): Promise<void> {
		await this.#ctx.storage.put(TOUCHED, Date.now());
		if ((await this.#ctx.storage.getAlarm()) === null) await this.#ctx.storage.setAlarm(Date.now() + IDLE_MS);
	}

	/**
	 * Whether this socket has said little enough lately to be listened to. The allowance is spent
	 * per message and refills with time; a socket past it is told so, and one that carries on past
	 * that is hung up on, because a client still talking into a refusal is not a person clicking.
	 */
	#allowed(ws: WebSocket): boolean {
		const held = heldBy(ws);
		const now = Date.now();
		const budget = Math.min(BURST, held.budget + ((now - held.at) * PER_SECOND) / 1000) - 1;
		ws.serializeAttachment({...held, budget, at: now});
		if (budget >= 0) return true;
		if (budget < -BURST) this.#hangUp(ws, "you are talking too fast");
		else send(ws, {k: "refused", why: "you are talking too fast"});
		return false;
	}

	/**
	 * Puts a socket in a seat, or turns it away. A wrong token is never told which part was wrong.
	 *
	 * A right token takes the seat even when the room still has a socket in it, because that socket
	 * is the same player's -- one the room has not yet heard has gone. Refusing would lock a player
	 * out of their own match for as long as the room went on believing in a connection that had
	 * dropped, which is exactly the case reconnecting exists for.
	 */
	async #seat(ws: WebSocket, seat: number, token: string): Promise<void> {
		const tokens = (await this.#ctx.storage.get<string[]>(TOKENS)) ?? [];
		if (tokens[seat] !== token) {
			this.#hangUp(ws, "that seat is not yours");
			return;
		}
		for (const other of this.#ctx.getWebSockets())
			if (other !== ws && seatOf(other) === seat) this.#hangUp(other, "you sat down in that seat somewhere else");
		ws.serializeAttachment({...heldBy(ws), seat});
		send(ws, {k: "seated", v: PROTOCOL_VERSION, seat});
		await this.#touch();
		await this.#tellEverybody();
		await this.#tellPresence();
	}

	async #move(ws: WebSocket, seat: number, intent: Parameters<typeof applyIntent>[1]): Promise<void> {
		const snap = await this.#ctx.storage.get<MatchSnapshot>(MATCH);
		if (!snap) {
			this.#hangUp(ws, "no match here");
			return;
		}
		importMatch(snap);
		const verdict = applyIntent(seat, intent);
		if (!verdict.ok) {
			send(ws, {k: "refused", why: verdict.why});
			return;
		}
		await this.#ctx.storage.put(MATCH, exportMatch());
		await this.#touch();
		await this.#tellEverybody();
	}

	/**
	 * Hands every seated socket the arena as its own seat sees it. The match is loaded once and each
	 * view is built from it in turn, so no socket is ever passed a view addressed to another.
	 */
	async #tellEverybody(): Promise<void> {
		const snap = await this.#ctx.storage.get<MatchSnapshot>(MATCH);
		if (!snap) return;
		importMatch(snap);
		for (const ws of this.#ctx.getWebSockets()) {
			const seat = seatOf(ws);
			if (seat === null) continue;
			send(ws, {k: "state", state: seatState(seat)});
		}
	}

	/**
	 * Says which seats have somebody in them. It is the one thing about a match a seat view cannot
	 * carry: the arena looks the same whether the player of a seat is thinking or has closed the
	 * tab, and only the room can tell the difference.
	 *
	 * `gone` is the socket being closed as this is sent, which the runtime may still be handing back.
	 */
	async #tellPresence(gone?: WebSocket): Promise<void> {
		const tokens = (await this.#ctx.storage.get<string[]>(TOKENS)) ?? [];
		const sitting = this.#ctx.getWebSockets().filter((ws) => ws !== gone && seatOf(ws) !== null);
		const here = tokens.map((_, seat) => sitting.some((ws) => seatOf(ws) === seat));
		for (const ws of sitting) send(ws, {k: "presence", here});
	}

	#hangUp(ws: WebSocket, why: string): void {
		send(ws, {k: "closed", why});
		ws.close(1008, why);
	}
}

/** A socket that has already gone is not an error worth ending a move over. */
function send(ws: WebSocket, message: ServerMessage): void {
	try {
		ws.send(encode(message));
	} catch {
		/* the far end left */
	}
}
