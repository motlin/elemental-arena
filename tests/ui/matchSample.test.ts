// @vitest-environment jsdom
import {describe, it, expect, beforeAll, vi} from "vitest";
import {matchStore, type MatchView} from "../../src/game/bridge.js";
import {mvOwnedMask} from "../../src/game/lookups.js";
import {startMatch} from "../../src/game/match.js";
import {render} from "../../src/game/hotseat.js";
import {S, cur, idx} from "../../src/game/state.js";
import {sampleMatch} from "../../src/ui/matchSample.js";

/**
 * src/ui/matchSample.ts is written by hand, and every story and most of the tests under tests/ui
 * are posed from it. Nothing has made it follow the view the game actually publishes, so a field
 * added to `MatchView` and to the renderer could be left out of the sample and the screen would go
 * on being tested against a position it no longer has. These compare the two by shape alone: the
 * values are meant to differ, the fields are not.
 */

/** Stands in for the Claude-artifact `window.storage` that public/storage-shim.js provides. */
vi.stubGlobal("storage", {
	get: async () => Promise.resolve(null),
	set: async () => Promise.resolve(),
	delete: async () => Promise.resolve(),
});

/* The entry module is what hands the rules the drawing they call for, so a screen only goes up and
   comes down for real once it has loaded. It reads the save on the way in, hence the stub above. */
await (
	await import("../../src/game/game.js")
).boot;

/** Fields deep enough that reaching them proves the comparison is reading the whole view. */
const DEEP = [
	"board.tiles[].occupants[].seat",
	"chat.lines[].quote.who",
	"footwork.buttons[].label",
	"inspect.chooser.chips[].budget",
	"inspect.tile.facts[].label",
	"weapon.rows[].options[].key",
];

/** The match screen as the game last published it. */
function match(): MatchView {
	const view = matchStore.get();
	expect(view).not.toBeNull();
	return view!;
}

/**
 * A position with every branch of the view filled in: a weapon in hand with a leaving to choose, a
 * chaos throw waiting on an answer, Inspect reading a square, and a line of talk answering another.
 * Anything left empty is a field the comparison would have nothing to say about.
 */
function livePosition(): void {
	S.np = 2;
	S.dim = 9;
	S.priv = false;
	S.chaos = true;
	S.smash = false;
	S.preset = null;
	S.presetDim = 0;
	S.munlocked = ["jump", "dash"];
	S.mv = S.mv.map(() => mvOwnedMask());
	startMatch();
	S.handoff = false;
	const p = cur();
	p.nrg = 9;
	p.cap = 9;
	p.hand = [
		{uid: 9001, k: "el", id: "fire"},
		{uid: 9002, k: "w", ids: ["dagger"], els: ["steam", "fire"]},
	];
	p.held = 9002;
	S.toss = true; // the bar a chaos throw puts up is the one that both says something and offers buttons
	S.tossPick = 9001;
	S.imode = true; // the readout and the reach chips are only there while Inspect is on
	S.look = idx(p.x, p.y);
	S.reach = [p.i];
	render();
	match().chat.say("the middle is mine");
	match().chat.lines[0]!.reply();
	match().chat.say("not for long"); // an answer, so that one line carries a quote
	render();
}

/** Where every value in a view sits, named by the path down to it. An empty list is a leaf. */
function paths(value: unknown, at: string): string[] {
	if (Array.isArray(value)) return value.length ? value.flatMap((item) => paths(item, `${at}[]`)) : [at];
	if (typeof value === "object" && value !== null)
		return Object.entries(value).flatMap(([key, v]) => paths(v, at ? `${at}.${key}` : key));
	return [at];
}

/**
 * The shape of a view: every field it carries, once each. A field that is null in one position and
 * filled in in the other is still the same field, so a branch only counts where nothing hangs off
 * it.
 */
function shape(view: MatchView): string[] {
	const all = [...new Set(paths(view, ""))];
	return all
		.filter((path) => !all.some((other) => other.startsWith(`${path}.`) || other.startsWith(`${path}[`)))
		.sort();
}

describe("the sample the match screen is posed from", () => {
	beforeAll(() => {
		livePosition();
	});

	it("is read all the way down, or the comparison would be saying nothing", () => {
		const unreached = DEEP.filter((path) => !shape(sampleMatch()).includes(path));

		expect(unreached).toStrictEqual([]);
	});

	it("stands a real position up in the same shape, so no panel is posed from a stale one", () => {
		expect(shape(sampleMatch())).toStrictEqual(shape(match()));
	});
});
