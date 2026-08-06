// @vitest-environment jsdom
import {describe, it, expect} from "vitest";
import {act, fireEvent, render, screen} from "@testing-library/react";
import {TableTalk} from "../../src/ui/TableTalk.js";
import type {ChatLine, ChatView} from "../../src/game/bridge.js";
import {sampleChat} from "../../src/ui/matchSample.js";

/** Something said with nothing behind it, which every line below is an edit or two from. */
function line(patch: Partial<ChatLine> = {}): ChatLine {
	return {
		id: 1,
		who: "Vermilion",
		colour: "#ff4d8d",
		round: 4,
		text: "the middle is mine",
		quote: null,
		reply: () => undefined,
		...patch,
	};
}

function talk(patch: Partial<ChatView> = {}): ChatView {
	return {lines: [], replyingTo: null, cancelReply: () => undefined, say: () => undefined, ...patch};
}

const input = (): HTMLInputElement => screen.getByLabelText("Message the table");

describe("TableTalk", () => {
	it("says so when nobody has said anything", () => {
		const {container} = render(<TableTalk view={talk()} />);

		expect(container.querySelector("#chatlog")?.innerHTML).toBe('<p class="none">Nothing said yet.</p>');
	});

	it("prints a line under whoever said it, with the round it was said in", () => {
		const {container} = render(<TableTalk view={talk({lines: [line()]})} />);
		const said = container.querySelector("#chatlog p");

		expect(said?.querySelector("b")?.textContent).toBe("Vermilion");
		expect(said?.querySelector("b")?.getAttribute("style")).toBe("color: rgb(255, 77, 141);");
		expect(said?.querySelector(".rnd")?.textContent).toBe("r4");
		expect(said?.lastChild?.textContent).toBe("the middle is mine");
		expect(said?.querySelector(".quote")).toBe(null);
	});

	it("stands the line being answered above the answer, in its own author's colour", () => {
		const answered = line({
			id: 2,
			who: "Cyan",
			colour: "#4dd8ff",
			round: 5,
			text: "not for long",
			quote: {who: "Vermilion", colour: "#ff4d8d", text: "the middle is mine"},
		});
		const {container} = render(<TableTalk view={talk({lines: [answered]})} />);
		const quote = container.querySelector(".quote");

		expect(quote?.textContent).toBe("Vermilion the middle is mine");
		expect(quote?.querySelector("b")?.getAttribute("style")).toBe("color: rgb(255, 77, 141);");
	});

	it("hands a reply straight back to the game", () => {
		let replied = 0;
		render(<TableTalk view={talk({lines: [line({reply: () => replied++})]})} />);

		act(() => {
			screen.getByRole("button", {name: "reply"}).click();
		});

		expect(replied).toBe(1);
	});

	it("shows what the next message answers, and offers to drop it", () => {
		let cancelled = 0;
		const view = talk({
			replyingTo: {who: "Cyan", colour: "#4dd8ff", text: "not for long"},
			cancelReply: () => cancelled++,
		});
		const {container} = render(<TableTalk view={view} />);

		expect(container.querySelector(".rto")?.textContent).toBe("replying to Cyan not for long cancel");
		act(() => {
			screen.getByRole("button", {name: "cancel"}).click();
		});

		expect(cancelled).toBe(1);
	});

	it("leaves the reply bar empty while nothing is being answered", () => {
		const {container} = render(<TableTalk view={talk()} />);

		expect(container.querySelector("#replybar")?.innerHTML).toBe("");
	});

	it("says what was typed and clears the box", () => {
		const said: string[] = [];
		render(<TableTalk view={sampleChat((text) => said.push(text))} />);

		fireEvent.change(input(), {target: {value: "hold the middle"}});
		act(() => {
			screen.getByRole("button", {name: "Say"}).click();
		});

		expect(said).toStrictEqual(["hold the middle"]);
		expect(input().value).toBe("");
	});

	it("takes Enter as the Say button", () => {
		const said: string[] = [];
		render(<TableTalk view={sampleChat((text) => said.push(text))} />);

		fireEvent.change(input(), {target: {value: "mine now"}});
		fireEvent.keyDown(input(), {key: "Enter"});

		expect(said).toStrictEqual(["mine now"]);
	});

	it("says nothing at all for an empty message", () => {
		const said: string[] = [];
		render(<TableTalk view={sampleChat((text) => said.push(text))} />);

		act(() => {
			screen.getByRole("button", {name: "Say"}).click();
		});
		fireEvent.change(input(), {target: {value: "   "}});
		act(() => {
			screen.getByRole("button", {name: "Say"}).click();
		});

		expect(said).toStrictEqual([]);
	});

	it("keeps the newest line in view", () => {
		const {container} = render(<TableTalk view={talk({lines: [line(), line({id: 2})]})} />);
		const log = container.querySelector("#chatlog");

		expect(log?.scrollTop).toBe(log?.scrollHeight);
	});
});
