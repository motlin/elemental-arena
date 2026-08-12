// @vitest-environment jsdom
/**
 * Online play, end to end on this side of the wire: a seat view arrives, the same drawing code
 * hot-seat uses turns it into a screen, and every button on it is either a request the room may
 * turn down or this device's own business.
 *
 * The room is a fake socket. What is being pinned is not the protocol -- tests/net/client.test.ts
 * does that -- but the half that only exists here: the aim. Hot-seat keeps the move being aimed in
 * `S` and lets the rules clear it as they go; online has no `S` to read, so it mirrors them, and a
 * mistake in that mirror is exactly the kind of bug that works perfectly until somebody is told no.
 */

import {describe, it, expect, beforeEach, afterEach, vi} from "vitest";
import {lobbyStore, matchStore, menuStore} from "../../src/game/bridge.js";
import {startMatch} from "../../src/game/match.js";
import {goOffline, playOnline} from "../../src/game/online.js";
import {seatState} from "../../src/game/seat.js";
import {S} from "../../src/game/state.js";
import type {MatchView} from "../../src/game/bridge.js";
import type {SeatState} from "../../src/game/seat.js";

vi.stubGlobal("storage", {
	get: async () => Promise.resolve(null),
	set: async () => Promise.resolve(),
	delete: async () => Promise.resolve(),
});

/** A socket the test holds both ends of, standing in for the room. */
class FakeSocket {
	static last: FakeSocket | null = null;
	readyState = 1;
	readonly sent: string[] = [];
	readonly listeners = new Map<string, ((event: unknown) => void)[]>();

	constructor(_url: string) {
		FakeSocket.last = this;
	}

	addEventListener(kind: string, listener: (event: unknown) => void): void {
		this.listeners.set(kind, [...(this.listeners.get(kind) ?? []), listener]);
	}

	send(raw: string): void {
		this.sent.push(raw);
	}

	close(): void {
		for (const listener of this.listeners.get("close") ?? []) listener({});
	}

	/** The room speaking. */
	say(message: unknown): void {
		for (const listener of this.listeners.get("message") ?? []) listener({data: JSON.stringify(message)});
	}

	/** The moves the client has asked for, which is everything it says apart from claiming its seat. */
	moves(): unknown[] {
		const said = this.sent.map((raw): unknown => JSON.parse(raw));
		return said.filter((one) => !(typeof one === "object" && one !== null && "k" in one && one.k === "hello"));
	}
}

await (
	await import("../../src/game/game.js")
).boot;

/** The seat view a real match would send, built here rather than made up, so the screen is real. */
function dealt(): SeatState {
	S.np = 2;
	S.dim = 9;
	startMatch();
	return seatState(0);
}

/** The screen as it stands, which is never null while a seat view has arrived. */
function screen(): MatchView {
	const view = matchStore.get();
	if (view === null) throw new Error("nothing is on screen");
	return view;
}

/** Hands the room's answer over: an arena means the move was taken, a refusal means it was not. */
function answer(state?: SeatState): void {
	if (state) room().say({k: "state", state});
	else room().say({k: "refused", why: "the arena will not take that move"});
}

/** The room, which is whatever socket this device opened last. */
function room(): FakeSocket {
	const socket = FakeSocket.last;
	if (socket === null) throw new Error("nothing opened a socket");
	return socket;
}

let arena: SeatState;

beforeEach(() => {
	vi.stubGlobal("WebSocket", FakeSocket);
	FakeSocket.last = null;
	arena = dealt();
	playOnline({code: "quiet-forge", seat: 0, token: "a-token"});
	for (const listener of room().listeners.get("open") ?? []) listener({});
	answer(arena);
});

afterEach(() => {
	goOffline();
	vi.unstubAllGlobals();
});

describe("sitting down in an online match", () => {
	it("draws the arena the room sent, with the setup screen down behind it", () => {
		expect(menuStore.get()).toBeNull();
		expect(screen().topbar.seat).toBe(0);
	});

	it("never offers undo, because a move the room took is taken", () => {
		expect(screen().topbar.canUndo).toBe(false);
	});

	it("puts the setup screen back when this device gets up", () => {
		goOffline();

		expect(matchStore.get()).toBeNull();
		expect(menuStore.get()).not.toBeNull();
		expect(lobbyStore.get()).not.toBeNull();
	});
});

describe("a click that is a move", () => {
	it("goes to the room and changes nothing here until the room answers", () => {
		const before = screen();

		before.topbar.endTurn();

		expect(room().moves()).toStrictEqual([{k: "move", intent: {k: "end"}}]);
		expect(matchStore.get()).toBe(before);
	});

	it("picks a card up only once the room says the card is picked up", () => {
		const card = screen().hand.cards.find((c) => c.kind === "ELEMENT");
		if (!card) throw new Error("the deal gave this seat no element card");

		screen().hand.click(card.uid);

		expect(room().moves()).toStrictEqual([{k: "move", intent: {k: "card", uid: card.uid}}]);
		expect(screen().hand.cards.find((c) => c.uid === card.uid)?.on).toBe(false);

		answer(arena);

		expect(screen().hand.cards.find((c) => c.uid === card.uid)?.on).toBe(true);
	});

	it("puts the same card back down when it is clicked again", () => {
		const card = screen().hand.cards.find((c) => c.kind === "ELEMENT");
		if (!card) throw new Error("the deal gave this seat no element card");
		screen().hand.click(card.uid);
		answer(arena);

		screen().hand.click(card.uid);
		answer(arena);

		expect(screen().hand.cards.find((c) => c.uid === card.uid)?.on).toBe(false);
	});
});

describe("the move being aimed", () => {
	/** Picks up an element card and puts the board into the mode that would lay it. */
	function aimAtALay(): void {
		const card = screen().hand.cards.find((c) => c.kind === "ELEMENT");
		if (!card) throw new Error("the deal gave this seat no element card");
		screen().hand.click(card.uid);
		answer(arena);
		const lay = screen().actions.buttons.find((b) => b.key === "place");
		if (!lay) throw new Error("the bar offered no way to lay a card");
		lay.click();
	}

	it("is this device's own business, and never reaches the socket", () => {
		screen().topbar.toggleInspect();

		expect(screen().inspect.inspecting).toBe(true);
		expect(room().moves()).toStrictEqual([]);
	});

	it("stays up when the room turns the move down, because nothing there changed either", () => {
		aimAtALay();
		expect(screen().actions.hint[0]?.text).toContain("Pick a tile");

		screen().board.click(1, 1);
		answer();

		expect(screen().actions.hint[0]?.text).toContain("Pick a tile");
	});

	it("is spent once the room takes the move it was aiming", () => {
		aimAtALay();

		screen().board.click(1, 1);
		answer(arena);

		expect(screen().actions.hint[0]?.text).not.toContain("Pick a tile");
	});
});
