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
 */

import {applyIntent, openMatch} from "../src/game/intent.js";
import {seatState} from "../src/game/seat.js";
import {exportMatch, importMatch} from "../src/game/snapshot.js";
import type {MatchSnapshot} from "../src/game/snapshot.js";
import {PROTOCOL_VERSION, encode, parseClientMessage, parseSetup} from "../src/net/protocol.js";
import type {ServerMessage} from "../src/net/protocol.js";

/** Where the room keeps the two things it owns: the match, and who is allowed to play which seat. */
const MATCH = "match";
const TOKENS = "tokens";

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {status, headers: {"content-type": "application/json"}});
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Which seat a socket claimed, or null for one that has not said hello yet. */
function seatOf(ws: WebSocket): number | null {
	const held: unknown = ws.deserializeAttachment();
	if (!isRecord(held) || typeof held["seat"] !== "number") return null;
	return held["seat"];
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
		return Promise.resolve();
	}

	/** Puts a socket in a seat, or turns it away. A wrong token is never told which part was wrong. */
	async #seat(ws: WebSocket, seat: number, token: string): Promise<void> {
		const tokens = (await this.#ctx.storage.get<string[]>(TOKENS)) ?? [];
		if (tokens[seat] !== token) {
			this.#hangUp(ws, "that seat is not yours");
			return;
		}
		if (this.#ctx.getWebSockets().some((other) => other !== ws && seatOf(other) === seat)) {
			this.#hangUp(ws, "somebody is already sitting there");
			return;
		}
		ws.serializeAttachment({seat});
		send(ws, {k: "seated", v: PROTOCOL_VERSION, seat});
		await this.#tellEverybody();
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
