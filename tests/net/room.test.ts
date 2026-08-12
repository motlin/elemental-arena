/**
 * The room's own half of a long match: who is still in the building, what happens to a socket that
 * will not stop talking, and when a match nobody came back to is let go.
 *
 * There is no Cloudflare here. The Durable Object's runtime is a handful of fakes -- storage that
 * is a Map, an alarm that is a number, and sockets the test holds both ends of -- because every
 * one of the behaviours below is the room's own bookkeeping rather than the platform's. What the
 * platform actually does with them is pinned by scripts/multiplayer-smoke.mjs, which runs the real
 * thing on miniflare.
 */

import {describe, it, expect, beforeEach, afterEach, vi} from "vitest";
import {PROTOCOL_VERSION} from "../../src/net/protocol.js";
import {BURST, IDLE_MS, MatchRoom} from "../../worker/room.js";
import type {ServerMessage} from "../../src/net/protocol.js";

/** A socket the test holds both ends of: what the room said to it, and whether it is still up. */
class FakeSocket {
	held: unknown = null;
	readonly sent: string[] = [];
	closed: {code: number; why: string} | null = null;

	serializeAttachment(value: unknown): void {
		this.held = value;
	}

	deserializeAttachment(): unknown {
		return this.held;
	}

	send(raw: string): void {
		if (this.closed !== null) throw new Error("that socket has gone");
		this.sent.push(raw);
	}

	close(code: number, why: string): void {
		this.closed ??= {code, why};
	}

	said(): ServerMessage[] {
		return this.sent.map((raw): ServerMessage => JSON.parse(raw) as ServerMessage);
	}

	latest<K extends ServerMessage["k"]>(kind: K): Extract<ServerMessage, {k: K}> | undefined {
		return this.said()
			.filter((one): one is Extract<ServerMessage, {k: K}> => one.k === kind)
			.at(-1);
	}
}

/** As much of a Durable Object as the room touches: some storage, an alarm, and its sockets. */
class FakeRoomState {
	readonly kept = new Map<string, unknown>();
	readonly sockets: FakeSocket[] = [];
	when: number | null = null;

	readonly storage = {
		get: async <T>(key: string): Promise<T | undefined> => Promise.resolve(this.kept.get(key) as T | undefined),
		put: async (key: string, value: unknown): Promise<void> => {
			this.kept.set(key, value);
			return Promise.resolve();
		},
		deleteAll: async (): Promise<void> => {
			this.kept.clear();
			return Promise.resolve();
		},
		getAlarm: async (): Promise<number | null> => Promise.resolve(this.when),
		setAlarm: async (when: number): Promise<void> => {
			this.when = when;
			return Promise.resolve();
		},
	};

	acceptWebSocket(ws: FakeSocket): void {
		this.sockets.push(ws);
	}

	/** A socket the far end hung up on is one the runtime stops handing back, so nor does this. */
	getWebSockets(): FakeSocket[] {
		return this.sockets.filter((ws) => ws.closed === null);
	}
}

/** The runtime hands the room real sockets; these are the test's, which is all the room touches. */
function asSocket(ws: FakeSocket): WebSocket {
	return ws as unknown as WebSocket;
}

/** What the room answers somebody asking for a seat with: a seat and its token, or a refusal. */
interface Dealt {
	readonly seat?: number;
	readonly token?: string;
	readonly error?: string;
}

/** Asks a room for a seat, the way a tab that followed the match link does. */
async function claim(room: MatchRoom): Promise<Dealt> {
	const answer = await room.fetch(new Request("https://arena.test/api/match/quiet-forge/join", {method: "POST"}));
	return JSON.parse(await answer.text()) as Dealt;
}

/** One room, opened, with every seat of it claimed in turn, which is what a full match looks like. */
async function openRoom(seats = 2): Promise<{room: MatchRoom; ctx: FakeRoomState; tokens: string[]}> {
	const ctx = new FakeRoomState();
	const room = new MatchRoom(ctx as unknown as DurableObjectState);
	await room.fetch(
		new Request("https://arena.test/api/match/quiet-forge/open", {
			method: "POST",
			body: JSON.stringify({seats, dim: 9}),
		}),
	);
	const tokens: string[] = [];
	for (let seat = 0; seat < seats; seat++) tokens.push((await claim(room)).token!);
	return {room, ctx, tokens};
}

/** Sits a fresh socket down in a seat, the way a client's first message does. */
async function sit(room: MatchRoom, ctx: FakeRoomState, seat: number, token: string): Promise<FakeSocket> {
	const ws = new FakeSocket();
	ctx.acceptWebSocket(ws);
	await room.webSocketMessage(asSocket(ws), JSON.stringify({k: "hello", v: PROTOCOL_VERSION, seat, token}));
	return ws;
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-08-12T12:00:00Z"));
});

afterEach(() => {
	vi.useRealTimers();
});

/* Nobody is handed a seat by whoever opened the match. The room deals them one at a time to
   whoever turns up, which is what keeps the host from holding a seat that is not theirs. */
describe("seats, dealt one at a time", () => {
	it("hands nobody a seat for merely opening the match", async () => {
		const ctx = new FakeRoomState();
		const room = new MatchRoom(ctx as unknown as DurableObjectState);

		const answer = await room.fetch(
			new Request("https://arena.test/api/match/quiet-forge/open", {
				method: "POST",
				body: JSON.stringify({seats: 2, dim: 9}),
			}),
		);

		expect(JSON.parse(await answer.text())).toStrictEqual({seats: 2});
	});

	it("gives each player a seat of their own, and a token nobody else was told", async () => {
		const ctx = new FakeRoomState();
		const room = new MatchRoom(ctx as unknown as DurableObjectState);
		await room.fetch(
			new Request("https://arena.test/api/match/quiet-forge/open", {
				method: "POST",
				body: JSON.stringify({seats: 2, dim: 9}),
			}),
		);

		const first = await claim(room);
		const second = await claim(room);

		expect([first.seat, second.seat]).toStrictEqual([0, 1]);
		expect(first.token).not.toBe(second.token);
	});

	it("turns the next one away once every seat is taken", async () => {
		const {room} = await openRoom();

		expect((await claim(room)).error).toBe("that match is full");
	});

	it("seats nobody in a match that was never opened", async () => {
		const ctx = new FakeRoomState();
		const room = new MatchRoom(ctx as unknown as DurableObjectState);

		expect((await claim(room)).error).toBe("no match here");
	});
});

describe("who is in the room", () => {
	it("tells every seat which of them has a socket in it", async () => {
		const {room, ctx, tokens} = await openRoom();

		const first = await sit(room, ctx, 0, tokens[0]!);
		const second = await sit(room, ctx, 1, tokens[1]!);

		expect(first.latest("presence")?.here).toStrictEqual([true, true]);
		expect(second.latest("presence")?.here).toStrictEqual([true, true]);
	});

	it("says so when one of them goes quiet", async () => {
		const {room, ctx, tokens} = await openRoom();
		const first = await sit(room, ctx, 0, tokens[0]!);
		const second = await sit(room, ctx, 1, tokens[1]!);

		await room.webSocketClose(asSocket(second), 1006, "");

		expect(first.latest("presence")?.here).toStrictEqual([true, false]);
	});

	it("lets the same token sit back down in the seat it left", async () => {
		const {room, ctx, tokens} = await openRoom();
		const first = await sit(room, ctx, 0, tokens[0]!);
		const dropped = await sit(room, ctx, 1, tokens[1]!);
		await room.webSocketClose(asSocket(dropped), 1006, "");

		const again = await sit(room, ctx, 1, tokens[1]!);

		expect(again.latest("seated")?.seat).toBe(1);
		expect(again.latest("state")?.state.seat).toBe(1);
		expect(first.latest("presence")?.here).toStrictEqual([true, true]);
	});

	/**
	 * The room hears about a dead socket late or never, so a seat whose token turns up again takes
	 * it back rather than being told somebody is already there -- which would be the player who
	 * dropped, and who would then be locked out of their own match for as long as the room believed
	 * in a socket that had gone.
	 */
	it("hands the seat to the token, even over a socket it still believes in", async () => {
		const {room, ctx, tokens} = await openRoom();
		const stale = await sit(room, ctx, 1, tokens[1]!);

		const fresh = await sit(room, ctx, 1, tokens[1]!);

		expect(fresh.latest("seated")?.seat).toBe(1);
		expect(stale.closed?.why).toBe("you sat down in that seat somewhere else");
	});

	it("still turns away a socket that does not hold the seat's token", async () => {
		const {room, ctx, tokens} = await openRoom();
		await sit(room, ctx, 0, tokens[0]!);

		const intruder = await sit(room, ctx, 0, "not-the-token");

		expect(intruder.latest("closed")?.why).toBe("that seat is not yours");
	});
});

/* The log narrates every move by name and square, the concealed ones included, so it is the one
   thing a seat is never sent while there is anything left to conceal. */
describe("the end of a match", () => {
	/** Plays the match out: in a two-seat match, one of them giving up settles it. */
	async function playOut(room: MatchRoom, ws: FakeSocket): Promise<void> {
		await room.webSocketMessage(asSocket(ws), JSON.stringify({k: "move", intent: {k: "forfeit"}}));
	}

	it("says nothing of the log while the match is still being played", async () => {
		const {room, ctx, tokens} = await openRoom();
		const first = await sit(room, ctx, 0, tokens[0]!);

		await room.webSocketMessage(asSocket(first), JSON.stringify({k: "move", intent: {k: "end"}}));

		expect(first.latest("over")).toBeUndefined();
	});

	it("hands every seat the same log once it is over", async () => {
		const {room, ctx, tokens} = await openRoom();
		const first = await sit(room, ctx, 0, tokens[0]!);
		const second = await sit(room, ctx, 1, tokens[1]!);

		await playOut(room, first);

		expect(first.latest("over")?.log.at(-1)?.t).toContain("took the arena");
		expect(second.latest("over")?.log).toStrictEqual(first.latest("over")?.log);
	});

	it("hands it to a seat that only sits back down after the end", async () => {
		const {room, ctx, tokens} = await openRoom();
		const first = await sit(room, ctx, 0, tokens[0]!);
		const dropped = await sit(room, ctx, 1, tokens[1]!);
		await room.webSocketClose(asSocket(dropped), 1006, "");
		await playOut(room, first);

		const again = await sit(room, ctx, 1, tokens[1]!);

		expect(again.latest("over")?.log.at(-1)?.t).toContain("took the arena");
	});
});

describe("a socket that will not stop talking", () => {
	/** One move, of the shape the parser takes, which the rules may well refuse on its own merits. */
	const MOVE = JSON.stringify({k: "move", intent: {k: "end"}});

	it("is heard as often as a person could click", async () => {
		const {room, ctx, tokens} = await openRoom();
		const ws = await sit(room, ctx, 0, tokens[0]!);

		for (let i = 0; i < BURST - 1; i++) await room.webSocketMessage(asSocket(ws), MOVE);

		expect(ws.latest("refused")?.why).not.toBe("you are talking too fast");
		expect(ws.closed).toBeNull();
	});

	it("is turned down once it goes faster than that", async () => {
		const {room, ctx, tokens} = await openRoom();
		const ws = await sit(room, ctx, 0, tokens[0]!);

		for (let i = 0; i < BURST + 1; i++) await room.webSocketMessage(asSocket(ws), MOVE);

		expect(ws.latest("refused")?.why).toBe("you are talking too fast");
		expect(ws.closed).toBeNull();
	});

	it("is hung up on if it keeps going anyway", async () => {
		const {room, ctx, tokens} = await openRoom();
		const ws = await sit(room, ctx, 0, tokens[0]!);

		for (let i = 0; i < BURST * 3; i++) await room.webSocketMessage(asSocket(ws), MOVE);

		expect(ws.closed?.why).toBe("you are talking too fast");
	});

	it("gets its allowance back by waiting", async () => {
		const {room, ctx, tokens} = await openRoom();
		const ws = await sit(room, ctx, 0, tokens[0]!);
		for (let i = 0; i < BURST + 1; i++) await room.webSocketMessage(asSocket(ws), MOVE);
		vi.advanceTimersByTime(10_000);

		const before = ws.said().length;
		await room.webSocketMessage(asSocket(ws), MOVE);

		expect(
			ws
				.said()
				.slice(before)
				.some((one) => one.k === "refused" && one.why === "you are talking too fast"),
		).toBe(false);
	});
});

describe("a match nobody came back to", () => {
	it("is left alone while something is still happening in it", async () => {
		const {room, ctx, tokens} = await openRoom();
		const ws = await sit(room, ctx, 0, tokens[0]!);
		vi.advanceTimersByTime(IDLE_MS - 1000);
		await room.webSocketMessage(asSocket(ws), JSON.stringify({k: "move", intent: {k: "end"}}));

		await room.alarm();

		expect(ctx.kept.get("match")).toBeDefined();
		expect(ws.closed).toBeNull();
		expect(ctx.when).toBe(Date.now() + IDLE_MS);
	});

	it("is let go once nothing has happened in it for long enough", async () => {
		const {room, ctx, tokens} = await openRoom();
		const ws = await sit(room, ctx, 0, tokens[0]!);
		vi.advanceTimersByTime(IDLE_MS + 1000);

		await room.alarm();

		expect(ws.latest("closed")?.why).toBe("this match was left too long");
		expect(ctx.kept.size).toBe(0);
	});

	it("keeps one alarm in the air rather than one per move", async () => {
		const {room, ctx, tokens} = await openRoom();
		const ws = await sit(room, ctx, 0, tokens[0]!);
		const first = ctx.when;
		vi.advanceTimersByTime(60_000);

		await room.webSocketMessage(asSocket(ws), JSON.stringify({k: "move", intent: {k: "end"}}));

		expect(ctx.when).toBe(first);
	});
});
