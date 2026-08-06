// @vitest-environment jsdom
import {describe, it, expect, beforeEach, afterEach} from "vitest";
import {fireEvent, render, screen} from "@testing-library/react";
import {Hand} from "../../src/ui/Hand.js";
import type {HandCard, HandView} from "../../src/game/bridge.js";

/** jsdom measures everything as nothing, so the drop-index maths gets a laid-out hand of its own. */
const CARD = 100;

function box(left: number, width: number): DOMRect {
	return {
		x: left,
		y: 0,
		left,
		right: left + width,
		width,
		top: 0,
		bottom: 60,
		height: 60,
		toJSON: () => ({}),
	};
}

const realRect = Element.prototype.getBoundingClientRect;

beforeEach(() => {
	Element.prototype.getBoundingClientRect = function laidOut(this: Element): DOMRect {
		if (!this.classList.contains("hcard")) return box(0, 400);
		const strip = this.parentElement;
		const at = strip === null ? 0 : [...strip.children].indexOf(this);
		return box(at * CARD, CARD);
	};
});

afterEach(() => {
	Element.prototype.getBoundingClientRect = realRect;
});

function card(uid: number, over: Partial<HandCard> = {}): HandCard {
	return {
		uid,
		kind: "ELEMENT",
		number: uid,
		name: `Card ${uid}`,
		desc: "Does a thing.",
		colour: "#ff4d8d",
		strip: "#ff4d8d",
		on: false,
		mixable: false,
		doomed: false,
		...over,
	};
}

function view(over: Partial<HandView> = {}): HandView {
	return {cards: [], click: () => undefined, reorder: () => undefined, draggable: true, ...over};
}

/** A mouse press, one move and the release, as the window hears them. */
function dragTo(from: Element, x0: number, x1: number): void {
	const pointer = {pointerId: 1, pointerType: "mouse", clientY: 20};
	fireEvent.pointerDown(from, {...pointer, clientX: x0});
	fireEvent.pointerMove(window, {...pointer, clientX: x1});
	fireEvent.pointerUp(window, {...pointer, clientX: x1});
}

describe("Hand", () => {
	it("says so when there is nothing in hand", () => {
		render(<Hand view={view()} />);
		const strip = document.querySelector("#hand");

		expect(strip?.innerHTML).toBe('<span class="hint">Nothing in hand yet.</span>');
	});

	it("dresses a card in its own colours, flags and number", () => {
		render(<Hand view={view({cards: [card(1, {kind: "FUSED", on: true, mixable: true, strip: "#123456"})]})} />);
		const button = screen.getByRole("button", {name: /Card 1/});

		expect(button.className).toBe("hcard mixable");
		expect(button.getAttribute("style")).toBe("--ec: #ff4d8d; --strip: #123456;");
		expect(button.getAttribute("aria-pressed")).toBe("true");
		expect(button.getAttribute("draggable")).toBe("false");
		expect([...button.children].map((c) => `${c.className}:${c.textContent}`)).toEqual([
			"ck:FUSED · 1",
			"cn:Card 1",
			"cd:Does a thing.",
		]);
	});

	it("marks the card a chaos throw is asking about", () => {
		render(<Hand view={view({cards: [card(1, {doomed: true})]})} />);

		expect(screen.getByRole("button", {name: /Card 1/}).className).toBe("hcard doomed");
	});

	it("hands a plain click straight back to the game", () => {
		const picked: number[] = [];
		render(<Hand view={view({cards: [card(1), card(2)], click: (uid) => picked.push(uid)})} />);

		fireEvent.click(screen.getByRole("button", {name: /Card 2/}));

		expect(picked).toEqual([2]);
	});

	it("shows where a drop would land while the card is being carried", () => {
		render(<Hand view={view({cards: [card(1), card(2), card(3)]})} />);
		const first = screen.getByRole("button", {name: /Card 1/});

		const pointer = {pointerId: 1, pointerType: "mouse", clientY: 20};
		fireEvent.pointerDown(first, {...pointer, clientX: 50});
		fireEvent.pointerMove(window, {...pointer, clientX: 210});

		expect(first.className).toBe("hcard dragging");
		expect(first.getAttribute("style")).toBe(
			"--ec: #ff4d8d; --strip: #ff4d8d; transform: translate(160px, 0px) scale(1.04);",
		);
		expect(screen.getByRole("button", {name: /Card 3/}).className).toBe("hcard slotL");
	});

	it("reorders to the place the card was let go of, counted among the cards it left behind", () => {
		const moved: Array<readonly [number, number]> = [];
		render(<Hand view={view({cards: [card(1), card(2), card(3)], reorder: (uid, to) => moved.push([uid, to])})} />);

		dragTo(screen.getByRole("button", {name: /Card 1/}), 50, 210);

		expect(moved).toEqual([[1, 1]]);
	});

	it("leaves a card where it is when the pointer barely moves", () => {
		const moved: Array<readonly [number, number]> = [];
		render(<Hand view={view({cards: [card(1), card(2)], reorder: (uid, to) => moved.push([uid, to])})} />);

		dragTo(screen.getByRole("button", {name: /Card 1/}), 50, 54);

		expect(moved).toEqual([]);
	});

	it("does not count the click that ends a drag as a pick", () => {
		const picked: number[] = [];
		const first = (): HTMLElement => screen.getByRole("button", {name: /Card 1/});
		render(<Hand view={view({cards: [card(1), card(2), card(3)], click: (uid) => picked.push(uid)})} />);

		dragTo(first(), 50, 210);
		fireEvent.click(first());

		expect(picked).toEqual([]);

		fireEvent.click(first());

		expect(picked).toEqual([1]);
	});

	it("cannot be dragged at all between turns", () => {
		const picked: number[] = [];
		const moved: Array<readonly [number, number]> = [];
		render(
			<Hand
				view={view({
					cards: [card(1), card(2), card(3)],
					click: (uid) => picked.push(uid),
					reorder: (uid, to) => moved.push([uid, to]),
					draggable: false,
				})}
			/>,
		);
		const first = screen.getByRole("button", {name: /Card 1/});

		dragTo(first, 50, 210);

		expect(moved).toEqual([]);
		expect(picked).toEqual([]);
		expect(first.className).toBe("hcard");
	});

	it("greys both arrows out while the hand fits", () => {
		render(<Hand view={view({cards: [card(1)]})} />);
		const arrows = screen.getAllByRole("button", {name: /Scroll hand/});

		expect(arrows.map((a) => [a.getAttribute("aria-label"), (a as HTMLButtonElement).disabled])).toEqual([
			["Scroll hand left", true],
			["Scroll hand right", true],
		]);
	});
});
