// @vitest-environment jsdom
import {describe, it, expect} from "vitest";
import {matchStore, type MatchView, type TileView} from "../../src/game/bridge.js";
import {T} from "../../src/game/data/index.js";
import {startMatch} from "../../src/game/match.js";
import {render} from "../../src/game/render.js";
import {S, blind, hidden, idx, isLit, seesTile} from "../../src/game/state.js";
import type {Player} from "../../src/game/types.js";

/**
 * The match screen is the one screen that has to keep secrets: two people share a seat, so anything
 * the game publishes about a fighter one of them cannot see is a secret already told. These pin the
 * rule at the boundary React reads -- the published view -- rather than anywhere upstream of it.
 */

/** A two-seat match seen from seat 0, with every prompt and overlay out of the way. */
function twoSeats(): {watcher: Player; hider: Player} {
	S.np = 2;
	S.preset = null;
	S.presetDim = 0;
	startMatch();
	S.handoff = false;
	S.imode = false;
	S.look = null;
	S.reach = [];
	S.mode = null;
	S.sel = null;
	const [watcher, hider] = S.players;
	return {watcher: watcher!, hider: hider!};
}

/** Writes one square of ground, laid by nobody in particular. */
function lay(x: number, y: number, key: string): void {
	const cell = S.board[idx(x, y)]!;
	cell.t = key;
	cell.el = null;
	cell.life = T[key]!.life;
}

/** Lays hiding ground and stands a fighter on it, which is the whole of how concealment works. */
function conceal(q: Player, x: number, y: number): void {
	q.x = x;
	q.y = y;
	lay(x, y, "shadow");
	S.board[idx(x, y)]!.by = q.i;
}

function published(): MatchView {
	const view = matchStore.get();
	expect(view).not.toBeNull();
	return view!;
}

function tileAt(x: number, y: number): TileView {
	return published().board.tiles[idx(x, y)]!;
}

describe("what the published view gives away", () => {
	it("leaves a fighter on hiding ground off the other seat's board entirely", () => {
		const {watcher, hider} = twoSeats();
		conceal(hider, 4, 4);
		expect(hidden(hider)).toBe(true);

		render();

		const square = tileAt(4, 4);
		expect(square.occupants).toStrictEqual([]);
		expect(square.title).toBe("");
		expect(square.stack).toBeNull();
		// the same board does publish the seat doing the looking, so an empty square means something
		expect(tileAt(watcher.x, watcher.y).occupants.map((o) => o.seat)).toStrictEqual([watcher.i]);
	});

	/* Hiding ground conceals itself while it is concealing somebody: a lone dark square in the
	   middle of a bare board would say exactly where to swing. */
	it("hides the hiding ground along with whoever is standing on it", () => {
		const {watcher, hider} = twoSeats();
		conceal(hider, 4, 4);
		lay(5, 4, "lava");

		render();

		const square = tileAt(4, 4);
		expect([square.colour, square.shadow, square.terrain]).toStrictEqual([null, null, false]);
		expect(seesTile(watcher, 4, 4)).toBe(false);
		// ordinary ground on the next square over is published in full, cover apart
		expect([tileAt(5, 4).colour, tileAt(5, 4).terrain]).toStrictEqual([T["lava"]!.c, true]);
	});

	it("keeps the concealed fighter out of the readout and out of the reach chooser", () => {
		const {watcher, hider} = twoSeats();
		conceal(hider, 4, 4);
		S.imode = true;
		S.look = idx(4, 4);

		render();

		const inspect = published().inspect;
		expect(inspect.tile?.facts.find((fact) => fact.label === "Standing on it")?.value).toBe(
			"someone you cannot see",
		);
		expect(inspect.chooser?.chips.map((chip) => chip.seat)).toStrictEqual([watcher.i]);
	});

	/* Blinded, a seat may still swing wherever they like -- they just are not told where anybody is,
	   so no square is marked as a sure thing and the weapon panel says why. */
	it("marks no square a sure target for a seat that cannot see", () => {
		const {watcher, hider} = twoSeats();
		hider.x = watcher.x + 1;
		hider.y = watcher.y;
		watcher.darkTurns = 1;
		watcher.hand = [{uid: 1, k: "w", ids: ["dagger"], els: []}];
		watcher.held = 1;
		watcher.nrg = 9;
		S.mode = "attack";
		expect(blind(watcher)).toBe(true);

		render();

		const view = published();
		expect(view.board.tiles.filter((tile) => tile.aim === "aimsure")).toStrictEqual([]);
		expect(view.board.tiles.some((tile) => tile.aim === "aim")).toBe(true);
		expect(view.weapon?.hint).toBe("Blinded. Swing where you think they are.");
	});

	/* A glare beats any cover, and it exposes the ground under them along with them. The fighter
	   wearing it is the one person never shown it, so their own screen reads as it always did. */
	it("publishes a lit fighter to everyone, and never shows them their own glow", () => {
		const {hider} = twoSeats();
		conceal(hider, 4, 4);
		hider.lit = true;
		expect(hidden(hider)).toBe(false);
		expect(isLit(4, 4)).toBe(true);

		render();

		const seen = tileAt(4, 4);
		expect(seen.occupants.map((o) => [o.seat, o.lit])).toStrictEqual([[hider.i, true]]);
		expect([seen.terrain, seen.litsq]).toStrictEqual([true, true]);

		S.turn = hider.i;
		render();

		expect(tileAt(4, 4).occupants.map((o) => [o.seat, o.lit])).toStrictEqual([[hider.i, false]]);
	});
});
