// @vitest-environment jsdom
/**
 * The client half of the wire: what goes out of the socket, what comes back in, and the one
 * promise the whole design rests on -- that a move this side sends changes nothing this side until
 * the room says it did.
 *
 * No server here, and no game either. A fake socket stands in for the room, so the messages can be
 * read as bytes rather than inferred from a screen.
 */

import {describe, it, expect, beforeEach, afterEach, vi} from "vitest";
import {onlineStore, seatStore} from "../../src/game/bridge.js";
import {inviteFrom, inviteLink, leave, newCode, openRoom, sendIntent, sit} from "../../src/net/client.js";
import {PROTOCOL_VERSION} from "../../src/net/protocol.js";
import type {Intent} from "../../src/net/protocol.js";

/** A socket the test holds both ends of: what the client sent, and what the room may say back. */
class FakeSocket {
	static last: FakeSocket | null = null;
	readonly url: string;
	readyState = 1;
	readonly sent: string[] = [];
	closed: number | null = null;
	readonly listeners = new Map<string, ((event: unknown) => void)[]>();

	constructor(url: string) {
		this.url = url;
		FakeSocket.last = this;
	}

	addEventListener(kind: string, listener: (event: unknown) => void): void {
		this.listeners.set(kind, [...(this.listeners.get(kind) ?? []), listener]);
	}

	send(raw: string): void {
		this.sent.push(raw);
	}

	close(code: number): void {
		this.closed = code;
		this.fire("close", {});
	}

	fire(kind: string, event: unknown): void {
		for (const listener of this.listeners.get(kind) ?? []) listener(event);
	}

	/** The room speaking. */
	say(message: unknown): void {
		this.fire("message", {data: JSON.stringify(message)});
	}

	/** What the client has said, parsed. */
	said(): unknown[] {
		return this.sent.map((raw): unknown => JSON.parse(raw));
	}
}

/** As much of a seat view as `parseServerMessage` insists on, which is the envelope and no more. */
function arena(seat: number, over: Record<string, unknown> = {}): Record<string, unknown> {
	return {seat, round: 1, turn: seat, you: {seat, hand: []}, legal: {step: []}, ...over};
}

const INVITE = {code: "quiet-forge", seat: 1, token: "a-token"};

beforeEach(() => {
	FakeSocket.last = null;
	vi.stubGlobal("WebSocket", FakeSocket);
});

afterEach(() => {
	leave();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("an invite", () => {
	it("survives the round trip through a link", () => {
		expect(inviteFrom(inviteLink(INVITE))).toStrictEqual(INVITE);
	});

	it("is nothing at all when the link is missing any part of one", () => {
		const dropped = ["code", "seat", "token"].map((part) => {
			const url = new URL(inviteLink(INVITE));
			url.searchParams.delete(part);
			return inviteFrom(url.toString());
		});

		expect(dropped).toStrictEqual([null, null, null]);
	});

	it("is refused for a code the match server's own door would not open", () => {
		expect(inviteFrom("/?code=no/&seat=0&token=t")).toBeNull();
	});

	it("carries a code the door will open", () => {
		expect(/^[A-Za-z0-9_-]{4,64}$/.test(newCode())).toBe(true);
	});
});

describe("opening a match", () => {
	it("asks the room for one and comes back with a token per seat", async () => {
		const fetched = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(Response.json({seats: 2, tokens: ["one", "two"]}));

		const tokens = await openRoom("quiet-forge", {seats: 2, dim: 9, hp: 60, priv: true});

		expect(tokens).toStrictEqual(["one", "two"]);
		expect(fetched.mock.calls[0]?.[0]).toBe("/api/match/quiet-forge/open");
	});

	it("says what the room said when the room said no", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({error: "already open"}, {status: 409}));

		await expect(openRoom("quiet-forge", {seats: 2, dim: 9, hp: 60, priv: true})).rejects.toThrow("already open");
	});
});

describe("a socket in a seat", () => {
	it("claims the seat the invite names, and nothing else, the moment it opens", () => {
		sit(INVITE, vi.fn());
		FakeSocket.last?.fire("open", {});

		expect(FakeSocket.last?.said()).toStrictEqual([{k: "hello", v: PROTOCOL_VERSION, seat: 1, token: "a-token"}]);
	});

	it("publishes the arena it is sent and nothing it worked out for itself", () => {
		sit(INVITE, vi.fn());
		FakeSocket.last?.fire("open", {});
		FakeSocket.last?.say({k: "state", state: arena(1)});

		expect(seatStore.get()?.seat).toBe(1);
	});

	it("sends a move as a move, and applies none of it here", () => {
		sit(INVITE, vi.fn());
		FakeSocket.last?.fire("open", {});
		FakeSocket.last?.say({k: "state", state: arena(1, {round: 4})});
		const before = seatStore.get();

		sendIntent({k: "end"});

		expect(FakeSocket.last?.said().at(-1)).toStrictEqual({k: "move", intent: {k: "end"}});
		expect(seatStore.get()).toBe(before);
	});

	it("tells the screen a move was taken only once the arena that took it arrives", () => {
		const took = vi.fn<(intent: Intent) => void>();
		sit(INVITE, took);
		FakeSocket.last?.fire("open", {});
		sendIntent({k: "jump", x: 2, y: 3});

		expect(took).not.toHaveBeenCalled();

		FakeSocket.last?.say({k: "state", state: arena(1)});

		expect(took.mock.calls).toStrictEqual([[{k: "jump", x: 2, y: 3}]]);
	});

	it("leaves the arena exactly where it was when a move is refused", () => {
		const took = vi.fn<(intent: Intent) => void>();
		sit(INVITE, took);
		FakeSocket.last?.fire("open", {});
		FakeSocket.last?.say({k: "state", state: arena(1)});
		const before = seatStore.get();

		sendIntent({k: "jump", x: 2, y: 3});
		FakeSocket.last?.say({k: "refused", why: "you cannot afford that"});

		expect(took).not.toHaveBeenCalled();
		expect(seatStore.get()).toBe(before);
		expect(onlineStore.get()?.notice).toBe("you cannot afford that");
	});

	it("does not count somebody else's arena as an answer to a move never sent", () => {
		const took = vi.fn<(intent: Intent) => void>();
		sit(INVITE, took);
		FakeSocket.last?.fire("open", {});
		FakeSocket.last?.say({k: "state", state: arena(1)});

		expect(took).not.toHaveBeenCalled();
	});

	it("says which match and which seat it is holding, and how it is doing", () => {
		sit(INVITE, vi.fn());

		expect(onlineStore.get()).toMatchObject({code: "quiet-forge", seat: 1, status: "joining", notice: null});

		FakeSocket.last?.fire("open", {});
		FakeSocket.last?.say({k: "seated", v: PROTOCOL_VERSION, seat: 1});

		expect(onlineStore.get()?.status).toBe("playing");
	});

	it("says which of the other seats has gone quiet", () => {
		sit(INVITE, vi.fn());
		FakeSocket.last?.fire("open", {});
		FakeSocket.last?.say({k: "seated", v: PROTOCOL_VERSION, seat: 1});

		expect(onlineStore.get()?.away).toStrictEqual([]);

		FakeSocket.last?.say({k: "presence", here: [false, true]});

		expect(onlineStore.get()?.away).toStrictEqual([0]);

		FakeSocket.last?.say({k: "presence", here: [true, true]});

		expect(onlineStore.get()?.away).toStrictEqual([]);
	});

	/* This device's own seat is never one of the missing: the socket that would report it gone is
	   the socket that would have to be there to report anything. */
	it("does not count itself away when the roll call is stale about its own seat", () => {
		sit(INVITE, vi.fn());
		FakeSocket.last?.fire("open", {});
		FakeSocket.last?.say({k: "presence", here: [true, false]});

		expect(onlineStore.get()?.away).toStrictEqual([]);
	});

	it("says so when the room shuts the socket, rather than going quiet", () => {
		sit(INVITE, vi.fn());
		FakeSocket.last?.fire("open", {});
		FakeSocket.last?.say({k: "closed", why: "that seat is not yours"});

		expect(onlineStore.get()).toMatchObject({status: "gone", notice: "that seat is not yours"});
	});

	it("puts everything down again when this device gets up", () => {
		sit(INVITE, vi.fn());
		FakeSocket.last?.fire("open", {});
		FakeSocket.last?.say({k: "state", state: arena(1)});

		leave();

		expect(seatStore.get()).toBeNull();
		expect(onlineStore.get()).toBeNull();
		expect(FakeSocket.last?.closed).toBe(1000);
	});
});

/**
 * A wire that drops is not the room saying no. The seat belongs to the token rather than to the
 * connection, so the tab sits back down in it by itself, and the arena stays on screen meanwhile --
 * stale, and the strip says so, which is a better thing to look at than an empty page.
 */
describe("a socket the wire takes away", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	/** A tab already sat down and playing, with the room's first arena on screen. */
	function playing(): void {
		sit(INVITE, vi.fn());
		FakeSocket.last?.fire("open", {});
		FakeSocket.last?.say({k: "seated", v: PROTOCOL_VERSION, seat: 1});
		FakeSocket.last?.say({k: "state", state: arena(1)});
	}

	it("sits back down in the same seat, with the same token", () => {
		playing();
		const dropped = FakeSocket.last;

		dropped?.fire("close", {});

		expect(onlineStore.get()?.status).toBe("joining");

		vi.advanceTimersByTime(1000);
		FakeSocket.last?.fire("open", {});

		expect(FakeSocket.last).not.toBe(dropped);
		expect(FakeSocket.last?.said()).toStrictEqual([{k: "hello", v: PROTOCOL_VERSION, seat: 1, token: "a-token"}]);
	});

	it("keeps the arena on screen while it is finding the room again", () => {
		playing();
		const showing = seatStore.get();

		FakeSocket.last?.fire("close", {});

		expect(seatStore.get()).toBe(showing);
	});

	it("does not go back to a room that hung up on purpose", () => {
		playing();
		const dropped = FakeSocket.last;

		dropped?.say({k: "closed", why: "that seat is not yours"});
		dropped?.fire("close", {});
		vi.advanceTimersByTime(60_000);

		expect(FakeSocket.last).toBe(dropped);
		expect(onlineStore.get()).toMatchObject({status: "gone", notice: "that seat is not yours"});
	});

	/* A tab that says "joining" forever is lying about a match that is not coming back. */
	it("gives up eventually, and says so instead of trying for ever", () => {
		playing();

		for (let i = 0; i < 12; i++) {
			FakeSocket.last?.fire("close", {});
			vi.advanceTimersByTime(20_000);
		}

		expect(onlineStore.get()).toMatchObject({status: "gone", notice: "the match server did not come back"});
	});
});
