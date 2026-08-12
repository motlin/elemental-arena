/**
 * The match screen, described from one seat's view of the arena and from nothing else.
 *
 * This used to read the live match: `S` in ninety-eight places, and a call into the rules every
 * time it wanted to know whether a square was worth lighting up. That works while the person
 * clicking is the person whose turn it is and the whole board is sitting in the same process.
 * Online neither is true. A seat is handed a censored arena, so the rules cannot be asked -- and a
 * client that tried to answer for itself would give the arena away by greying out the one square
 * somebody is hiding on.
 *
 * So the drawing takes a `SeatState` from src/game/seat.ts, which has already worked out both what
 * this seat may see and what it may do, and turns it into a `MatchView` for React. Hot-seat comes
 * through the same door: src/game/hotseat.ts builds a `SeatState` for whoever is to move and hands
 * it over. One account of what a screen may show, drawn by both modes, so a leak is a bug in the
 * one that is easy to look at rather than only in the one that goes over a socket.
 *
 * The buttons split the same way, and that half is the one worth saying out loud. A click used to
 * *be* the rule: the view carried `doJump` and `doSmash` and `endTurn`, bound and ready to change
 * the match. Online a click is a request a server may refuse. So every callback here is one of
 * three things:
 *
 *   - a **move**, which becomes an `Intent` handed to `act.submit`. Hot-seat applies it on the
 *     spot; a client sends it and waits.
 *   - **local UI** -- the move being aimed, the square Inspect is reading, the line a reply hangs
 *     off -- which becomes `act.patch`. No rule has an opinion about any of it.
 *   - a **door out of the match**: undo, leaving, the theme, the codex table. Those belong to the
 *     machine rather than to the arena, so the caller supplies them.
 *
 * Which of the three each button gets is written down callback by callback in
 * tests/game/matchView.test.ts, because getting one wrong is silent: a move filed as local UI works
 * perfectly in hot-seat and only stops working once there is a server entitled to say no.
 */

import {COST, EL, MV, T} from "./data/index.js";
import {
	elColor,
	elName,
	foeEls,
	forgeOf,
	isComp,
	leaveFoe,
	leaveSelf,
	rgba,
	selfEls,
	wColor,
	wCost,
	wDesc,
	wHits,
	wRing,
	wStrip,
	wepDmg,
	wepName,
} from "./lookups.js";
import type {
	ActionBarView,
	ActionButton,
	BoardView,
	ChatQuote,
	ChatView,
	FootworkButton,
	FootworkView,
	FxHit,
	HandCard,
	HandView,
	InspectView,
	LeaveRow,
	MatchView,
	ReachChooser,
	RosterCard,
	TileFact,
	TileFighter,
	TileReadout,
	TileView,
	TopbarView,
	WeaponView,
} from "./bridge.js";
import type {ActionKey} from "./data/index.js";
import type {Intent} from "./intent.js";
import type {SeatFighter, SeatReach, SeatState, SeatSteal} from "./seat.js";
import type {ElCard, WepCard} from "./types.js";

/**
 * What the match screen knows that the arena never tells it: the move being aimed, the card picked
 * up, the square Inspect is reading. None of it is a rule, none of it goes on the wire, and two
 * people watching the same match hold different versions of all of it.
 *
 * Hot-seat keeps this in `S` rather than beside it, because the rules write to the same fields as
 * they go -- laying a card that will not lay leaves the board in `place` mode, starting a merge
 * puts it in `mix` -- and the keyboard writes them too. Reading them back out every redraw is what
 * keeps hot-seat playing exactly as it did. A client online keeps its own.
 */
export interface Local {
	/** The move the board is waiting for a square for, or null while it is waiting for nothing. */
	readonly mode: string | null;
	/** `uid` of the element card picked up, which is the one a lay would lay. */
	readonly sel: number | null;
	/** `uid` of the card a merge started from, which is what the highlighted cards would join. */
	readonly mixFrom: number | null;
	/** `uid` of the card a chaos throw has picked but not yet confirmed. */
	readonly tossPick: number | null;
	readonly imode: boolean;
	/** Board index Inspect is reading, or null while it is reading none. */
	readonly look: number | null;
	/** Seats the reach overlay is drawn for, which are the chips ticked under the readout. */
	readonly reach: readonly number[];
	/** `id` of the message the next thing said answers, or null. */
	readonly replyTo: number | null;
	/** True while a second tap on Forfeit would drop this fighter. */
	readonly forfeitArmed: boolean;
	readonly canUndo: boolean;
	readonly themeLabel: string;
	/** How much of the fusion codex the save has turned up, which is the device's own business. */
	readonly codex: string;
	/**
	 * The animations the move just made left behind, handed over once and then forgotten by
	 * whatever ran the move: `S.fx` in hot-seat, the server's message online.
	 */
	readonly fx: readonly FxHit[];
	/** True while the handoff curtain is up, which is what stops the hand being dragged. */
	readonly handoff: boolean;
}

/** What a click does. Which of the three a given button gets is the whole of the split. */
export interface MatchActions {
	/** A move: a request the rules may turn down, and say so. */
	readonly submit: (intent: Intent) => void;
	/** A change to this screen's own state, which no rule has an opinion about. */
	readonly patch: (next: Partial<Local>) => void;
	readonly undo: () => void;
	readonly leave: () => void;
	/** Arms on the first tap and drops this fighter on the second, which is two different things. */
	readonly forfeit: () => void;
	readonly toggleTheme: () => void;
	readonly openTable: () => void;
	/** Shuts the hand a theft opened without taking anything out of it. */
	readonly cancelSteal: () => void;
}

/** The match screen as it stands after the move just made. */
export function matchView(v: SeatState, local: Local, act: MatchActions): MatchView {
	return {
		topbar: topbarView(v, local, act),
		board: boardView(v, local, act),
		footwork: footworkView(v, local, act),
		weapon: weaponView(v, local, act),
		actions: actionsView(v, local, act),
		roster: rosterView(v),
		hand: handView(v, local, act),
		chat: chatView(v, local, act),
		inspect: inspectView(v, local, act),
		codex: local.codex,
	};
}

const index = (v: SeatState, x: number, y: number): number => y * v.dim + x;
const cheb = (a: number, b: number, c: number, d: number): number => Math.max(Math.abs(a - c), Math.abs(b - d));

/** The element card picked up, or null: only an element is ever selected, only a weapon ever held. */
function selected(v: SeatState, local: Local): ElCard | null {
	const c = v.you.hand.find((q) => q.uid === local.sel);
	return c?.k === "el" ? c : null;
}

function weapon(v: SeatState): WepCard | null {
	const c = v.you.hand.find((q) => q.uid === v.you.held);
	return c?.k === "w" ? c : null;
}

/** What the card `uid` merges with, out of the block the seat was handed. */
function mixWith(v: SeatState, uid: number | null): readonly number[] {
	if (uid == null) return [];
	return v.legal.mix.find((m) => m.uid === uid)?.with ?? [];
}

/** Whoever this seat can see standing on a square, in seat order. */
function standingAt(v: SeatState, x: number, y: number): SeatFighter[] {
	return v.fighters.filter((f) => f.at?.[0] === x && f.at[1] === y);
}

/* The strip along the top: whose turn it is, and every door out of the match. */

function topbarView(v: SeatState, local: Local, act: MatchActions): TopbarView {
	const me = v.fighters[v.you.seat]!;
	const paint = v.paint ? "  ·  PAINTBALL" : "";
	const smash = v.smash ? `  ·  SMASH MODE x${v.smashMult}` : "";
	const chaos = v.chaos
		? v.round >= v.chaosRound
			? "  ·  CHAOS MODE"
			: v.round >= v.chaosRound - 3
				? `  ·  CHAOS IN ${v.chaosRound - v.round}`
				: ""
		: "";
	return {
		seat: me.seat,
		name: me.name,
		colour: me.colour,
		round: `ROUND ${v.round}  ·  ${v.you.nrg}/${v.you.cap} ENERGY${v.you.bank ? `  ·  ${v.you.bank} CARRIED` : ""}${smash}${paint}${chaos}`,
		inspecting: local.imode,
		// turning Inspect off puts down the square it was reading, and the chips ticked under it
		toggleInspect: () => {
			act.patch(local.imode ? {imode: false, look: null, reach: []} : {imode: true});
		},
		openTable: act.openTable,
		canUndo: local.canUndo,
		undo: act.undo,
		canEndTurn: !v.toss,
		endTurn: () => {
			act.submit({k: "end"});
		},
		forfeitLabel: local.forfeitArmed ? "Tap again to fall" : "Forfeit",
		forfeitArmed: local.forfeitArmed,
		forfeit: act.forfeit,
		leave: act.leave,
		themeLabel: local.themeLabel,
		toggleTheme: act.toggleTheme,
	};
}

/* The board. Everything this seat cannot see was left out before the view was built, so there is
   nothing here for React to be careful with. */

/** The footwork that is aimed at a square, by the mode the board is waiting in. */
type AimedMove = "jump" | "dash" | "leap" | "warp" | "spread" | "swap" | "mark" | "light" | "theft";

const AIMED: Record<string, AimedMove | undefined> = {
	jump: "jump",
	dash: "dash",
	leap: "leap",
	warp: "warp",
	spread: "spread",
	swap: "swap",
	mark: "mark",
	light: "light",
	theft: "theft",
};

/** The squares the move being aimed can land on, and the ones with somebody visible already there. */
function aimSquares(v: SeatState, local: Local): {aim: Set<number>; sure: Set<number>} {
	const L = v.legal;
	const nothing = {aim: new Set<number>(), sure: new Set<number>()};
	if (local.mode === null) return nothing;
	if (local.mode === "place") {
		const sc = selected(v, local);
		// ground that kills on contact is turned down on a square somebody is standing on
		const bad = sc && L.lethal.includes(sc.uid) ? new Set(L.taken) : new Set<number>();
		return {aim: new Set(L.place.filter((i) => !bad.has(i))), sure: new Set<number>()};
	}
	if (local.mode === "attack") return {aim: new Set(L.swing), sure: new Set(L.foes)};
	const aimed = AIMED[local.mode];
	return aimed ? {aim: new Set(L[aimed]), sure: new Set<number>()} : nothing;
}

/** The letter each whirlpool is paired by, which is its place in the list twinned ones sit next to. */
function whirlLetters(v: SeatState): Map<number, string> {
	const all: [number, number][] = [];
	v.tiles.forEach((t, i) => {
		if (t.t === "whirl") all.push([t.wid, i]);
	});
	all.sort((a, b) => a[0] - b[0]);
	const out = new Map<number, string>();
	all.forEach(([, i], pos) => out.set(i, String.fromCharCode(65 + (pos >> 1))));
	return out;
}

/** The fighters the reach overlay is actually drawn for, which is the chips ticked while Inspect is on. */
function drawnReach(v: SeatState, local: Local): readonly SeatReach[] {
	if (!local.imode) return [];
	return v.reachable.filter((r) => local.reach.includes(r.seat));
}

/** Which of the ticked fighters could reach each square, in seat order, worked out in one pass. */
function reachMap(drawn: readonly SeatReach[]): Map<number, number[]> {
	const out = new Map<number, number[]>();
	drawn.forEach((r) => {
		r.tiles.forEach((i) => {
			const who = out.get(i);
			if (who) who.push(r.seat);
			else out.set(i, [r.seat]);
		});
	});
	return out;
}

/** One band per fighter who could reach the square, or null while nobody has been asked about it. */
function reachStripes(v: SeatState, who: readonly number[] | undefined): string | null {
	if (!who?.length) return null;
	const cols = who.map((seat) => v.fighters[seat]!.colour);
	if (cols.length === 1) return `linear-gradient(${rgba(cols[0]!, 0.34)},${rgba(cols[0]!, 0.34)})`;
	return `repeating-linear-gradient(135deg,${cols
		.map((c, z) => `${rgba(c, 0.4)} ${z * 7}px,${rgba(c, 0.4)} ${(z + 1) * 7}px`)
		.join(",")})`;
}

function boardView(v: SeatState, local: Local, act: MatchActions): BoardView {
	const {aim, sure} = aimSquares(v, local);
	const rmap = reachMap(drawnReach(v, local));
	const whirls = whirlLetters(v);
	// the walk-one-square highlight is only an offer while nothing else is being aimed or held
	const steps = new Set(!aim.size && local.mode === null && local.sel == null ? v.legal.step : []);
	const lit = new Set(v.litsq);
	const tiles: TileView[] = v.tiles.map((t, i) => {
		const x = i % v.dim,
			y = (i / v.dim) | 0;
		const ground = t.t ? T[t.t]! : null;
		const here = standingAt(v, x, y);
		return {
			colour: ground ? ground.c : null,
			shadow: ground ? rgba(ground.c, 0.44) : null,
			terrain: !!ground,
			solid: !!ground?.solid,
			dead: !!ground?.dead,
			gone: !!ground?.gone,
			whirl: t.t === "whirl" ? (whirls.get(i) ?? null) : null,
			aim: aim.has(i) ? (sure.has(i) ? "aimsure" : "aim") : null,
			step: steps.has(i),
			warn: v.warn === i,
			litsq: lit.has(i),
			look: local.look === i,
			reach: reachStripes(v, rmap.get(i)),
			// whoever is standing here has the last word on what the square says it is
			title: here.length
				? here.map((f) => `${f.name}: ${f.hp} HP`).join("  ·  ")
				: ground
					? `${ground.n}: ${ground.d}`
					: "",
			occupants: here.map((f, k) => tileFighter(v, f, k, here.length)),
			stack: here.length > 2 ? here.length : null,
		};
	});
	return {
		dim: v.dim,
		tiles,
		click: (x, y) => {
			onSquare(v, local, act, x, y);
		},
		fx: local.fx,
	};
}

function tileFighter(v: SeatState, f: SeatFighter, k: number, crowd: number): TileFighter {
	const active = f.seat === v.turn;
	return {
		seat: f.seat,
		colour: f.colour,
		active,
		lit: f.lit,
		// shoulder to shoulder
		inset: crowd > 1 ? (k ? "34% 8% 8% 34%" : "8% 34% 34% 8%") : null,
		z: crowd > 1 ? (active ? 2 : 1) : null,
	};
}

/**
 * What clicking a square asks for. Inspect reads it instead of playing it, and otherwise the move
 * the board is waiting for decides: a square is the second half of a move whose first half was a
 * button, or, when nothing is being aimed, a step onto the square next door.
 */
function onSquare(v: SeatState, local: Local, act: MatchActions, x: number, y: number): void {
	if (v.phase !== "act" || v.toss) return;
	const i = index(v, x, y);
	if (local.imode) {
		act.patch({look: local.look === i ? null : i});
		return;
	}
	if (local.mode === "place") {
		if (local.sel != null) act.submit({k: "place", uid: local.sel, x, y});
		return;
	}
	const aimed = local.mode === null ? undefined : AIMED[local.mode];
	if (aimed) {
		act.submit({k: aimed, x, y});
		return;
	}
	if (local.mode === "attack") {
		if (v.legal.swing.includes(i)) act.submit({k: "swing", x, y});
		return;
	}
	if (local.sel == null && cheb(v.you.x, v.you.y, x, y) === 1) act.submit({k: "step", x, y});
}

/* The footwork rail: one button per special move this fighter was given. A move can be offered,
   spent, or already running, and each of the three reads differently. */

/** The footwork that needs nothing from the board, so the button is the whole move. */
type PlainMove = "float" | "spin" | "wipe" | "ultra" | "trail" | "smash";

function liveMove(
	v: SeatState,
	key: ActionKey,
	used: number,
	disabled: boolean,
	click: () => void,
	aiming: boolean,
): FootworkButton {
	return {key, label: MV[key]!.n, cost: COST[key], left: v.mvUses - used, tip: MV[key]!.d, aiming, disabled, click};
}

function spentMove(key: ActionKey): FootworkButton {
	return {
		key,
		label: `${MV[key]!.n} · spent`,
		cost: null,
		left: null,
		tip: MV[key]!.d,
		aiming: false,
		disabled: true,
		click: null,
	};
}

/** A move already under way, which is not offered again while it is. */
function runningMove(key: ActionKey, label: string): FootworkButton {
	return {key, label, cost: null, left: null, tip: MV[key]!.d, aiming: true, disabled: true, click: null};
}

function footworkView(v: SeatState, local: Local, act: MatchActions): FootworkView {
	const you = v.you,
		L = v.legal,
		rooted = you.rootTurns > 0;
	const buttons: FootworkButton[] = [];
	const add = (has: number, key: ActionKey, disabled: boolean, click: () => void, aiming: boolean): void => {
		if (!has) return;
		buttons.push(
			you.used[key] >= v.mvUses ? spentMove(key) : liveMove(v, key, you.used[key], disabled, click, aiming),
		);
	};
	/** Puts the board into a mode, or back out of the one it is already waiting in. */
	const aimAt =
		(mode: string): (() => void) =>
		() => {
			act.patch({mode: local.mode === mode ? null : mode, sel: null});
		};
	const move =
		(k: PlainMove): (() => void) =>
		() => {
			act.submit({k});
		};
	const under = v.tiles[index(v, you.x, you.y)]!.t;
	add(you.mv & 1, "jump", rooted || !L.afford.jump || !L.jump.length, aimAt("jump"), local.mode === "jump");
	add(you.mv & 2, "dash", rooted || !L.afford.dash || !L.dash.length, aimAt("dash"), local.mode === "dash");
	add(you.mv & 4, "leap", rooted || !L.afford.leap || !L.leap.length, aimAt("leap"), local.mode === "leap");
	if (you.mv & 8 && you.float) buttons.push(runningMove("float", "Floating"));
	else add(you.mv & 8, "float", !L.afford.float, move("float"), false);
	add(you.mv & 16, "spin", !L.afford.spin || !L.spin.length, move("spin"), false);
	add(you.mv & 32, "wipe", !L.afford.wipe || !L.wipe.length, move("wipe"), false);
	add(you.mv & 64, "warp", rooted || !L.afford.warp || !L.warp.length, aimAt("warp"), local.mode === "warp");
	if (you.mv & 512 && you.trail) buttons.push(runningMove("trail", `Trailing ${T[you.trail]!.n}`));
	else add(you.mv & 512, "trail", !L.afford.trail || !under, move("trail"), false);
	add(you.mv & 128, "ultra", !L.afford.ultra || !L.ultra.length, move("ultra"), false);
	add(you.mv & 256, "spread", !L.afford.spread || !L.spread.length, aimAt("spread"), local.mode === "spread");
	add(you.mv & 32768, "light", !L.afford.light || !L.light.length, aimAt("light"), local.mode === "light");
	add(you.mv & 16384, "mark", !L.afford.mark || !L.mark.length, aimAt("mark"), local.mode === "mark");
	add(you.mv & 8192, "swap", rooted || !L.afford.swap || !L.swap.length, aimAt("swap"), local.mode === "swap");
	add(you.mv & 4096, "theft", !L.afford.theft || !L.theft.length, aimAt("theft"), local.mode === "theft");
	add(you.mv & 2048, "smash", !L.afford.smash || !L.smash, move("smash"), false);
	add(you.mv & 1024, "shift", !L.afford.shift, aimAt("shift"), local.mode === "shift");
	return {any: !!you.mv, floating: you.float, rooted, buttons};
}

/* The weapon panel, which is only ever about the one card being held. */

/** A row of leavings, or nothing at all when the weapon carries no choice to make. */
function leaveRow(
	label: string,
	opts: string[],
	pick: string | undefined,
	row: "self" | "foe",
	act: MatchActions,
): LeaveRow[] {
	if (opts.length < 2) return [];
	return [
		{
			label,
			options: opts.map((e) => ({
				key: e,
				name: elName(e),
				colour: EL[e] ? EL[e].c : T[e]!.c,
				on: e === pick,
				// what a weapon leaves behind is written on the card, so it is the match's business
				choose: () => {
					act.submit({k: "leaving", row, el: e});
				},
			})),
		},
	];
}

/**
 * Swinging, which is two different things wearing one button. A weapon with a pattern needs a
 * square, so the button only puts the board into the mode that asks for one. A weapon that sweeps
 * has nowhere to be pointed, so the button is the whole swing.
 */
function swing(v: SeatState, local: Local, act: MatchActions, c: WepCard, poor: boolean): void {
	if (poor) return;
	if (local.mode === "attack") {
		act.patch({mode: null});
		return;
	}
	if (wRing(c)) {
		act.patch({sel: null});
		act.submit({k: "swing", x: v.you.x, y: v.you.y});
		return;
	}
	act.patch({mode: "attack", sel: null});
}

function weaponView(v: SeatState, local: Local, act: MatchActions): WeaponView | null {
	const c = weapon(v);
	if (!c) return null;
	const dmg = wepDmg(c),
		cost = wCost(c),
		hits = wHits(c);
	const uniq = [...new Set(c.els.map((e: string) => forgeOf(e).fx))];
	// the seat was handed the squares its swing would land on, already read down to what it can see
	const tg = v.legal.foes.length;
	const poor = v.you.nrg < cost;
	return {
		name: wepName(c),
		colour: wColor(c),
		damage: `${dmg}${hits > 1 ? ` x ${hits}` : ""}`,
		desc: `${wDesc(c)} Breaks the moment you swing it.`,
		onHit: uniq.length ? uniq.join(", ") : null,
		strip: wStrip(c),
		rows: [
			...leaveRow("Leaves under them:", foeEls(c), leaveFoe(c), "foe", act),
			...leaveRow("Lays under you:", selfEls(c), leaveSelf(c), "self", act),
		],
		cost,
		aiming: local.mode === "attack",
		disabled: poor,
		swing: () => {
			swing(v, local, act, c, poor);
		},
		hint: poor
			? "Not enough energy this turn."
			: v.blind
				? "Blinded. Swing where you think they are."
				: tg
					? `${tg} square${tg === 1 ? "" : "s"} you can see someone on. You may swing anywhere in reach.`
					: "Nobody visible in reach. Swing anyway to sweep for someone hidden.",
	};
}

export const MODEHINT: Record<string, string | undefined> = {
	jump: "Pick a square exactly two away to land on.",
	dash: "Pick a square along a clear straight line.",
	leap: "Pick a square exactly four away to land on.",
	theft: "Pick a fighter to take a card from. You do not choose which one.",
	swap: "Pick a fighter to trade places with.",
	mark: "Pick a fighter to peek at one of their cards.",
	light: "Pick a fighter to fix a glare on for good.",
	warp: "Pick any bare, empty square on the board.",
	spread: "Pick a square with something on it to grow into a 5x5.",
};

/* The bar under the board: what the game is waiting for, and what can be done about it. */

/** A bar that only says something, which is most of them. */
function saying(text: string): ActionBarView {
	return {hint: [{text, strong: false}], alarm: false, buttons: [], tail: null};
}

function press(key: string, label: string, click: () => void, disabled = false): ActionButton {
	return {key, label, disabled, facedown: false, click};
}

/** What a card is called, which for the seat holding it is never a secret. */
const nameOfCard = (c: ElCard | WepCard): string => (c.k === "el" ? elName(c.id) : wepName(c));

function actionsView(v: SeatState, local: Local, act: MatchActions): ActionBarView {
	if (MODEHINT[local.mode!]) return saying(`${MODEHINT[local.mode!]} Esc to cancel.`);
	if (local.mode === "attack") return saying("Pick a tile to strike. Esc to cancel.");
	if (local.mode === "place") {
		const sc = selected(v, local);
		const lethal =
			sc && v.legal.lethal.includes(sc.uid)
				? ` ${elName(sc.id)} cannot be laid on a square someone is standing on.`
				: "";
		return saying(`Pick a tile within 4.${lethal} Esc to cancel.`);
	}
	if (v.steal !== null) return stealBar(v.steal, act);
	if (v.toss) return tossBar(v, local, act);
	if (local.mode === "shift") return shiftBar(act);
	if (local.mode === "mix") return saying("Click any highlighted card to merge with. Esc to cancel.");
	const c = selected(v, local),
		h = weapon(v),
		active = c || h;
	if (!active)
		return saying(
			v.you.rootTurns > 0
				? "Stuck in the mud. You cannot move until this turn ends."
				: "Click a card, or step onto a highlighted tile.",
		);
	const parts = mixWith(v, active.uid).length;
	const buttons: ActionButton[] = [];
	if (c)
		buttons.push(
			press(
				"place",
				`Lay on a tile · ${COST.place}`,
				() => {
					act.patch({mode: "place"});
				},
				!v.legal.afford.place,
			),
		);
	buttons.push(
		press(
			"merge",
			`Merge · ${COST.merge}`,
			() => {
				act.patch({mode: "mix", mixFrom: active.uid});
			},
			!v.legal.afford.merge || !parts,
		),
	);
	return {
		hint: [],
		alarm: false,
		buttons,
		tail: parts
			? "Two elements fuse, two weapons combine, an element goes into a weapon."
			: "Nothing in hand merges with this.",
	};
}

/** The hand being robbed, already read down to the slots this seat is entitled to read. */
function stealBar(steal: SeatSteal, act: MatchActions): ActionBarView {
	const buttons: ActionButton[] = steal.cards.map((c) => ({
		key: String(c.uid),
		label: c.label,
		disabled: false,
		facedown: c.facedown,
		click: () => {
			act.submit({k: "take", uid: c.uid});
		},
	}));
	buttons.push(press("cancel", "Cancel", act.cancelSteal));
	return {
		hint: [{text: `Take a card from ${steal.name}:`, strong: false}],
		alarm: false,
		buttons,
		tail: null,
	};
}

function tossBar(v: SeatState, local: Local, act: MatchActions): ActionBarView {
	const pick = v.you.hand.find((q) => q.uid === local.tossPick);
	if (!pick)
		return {
			hint: [
				{
					text: "Chaos mode. Pick a card from your hand to throw away before you do anything else.",
					strong: false,
				},
			],
			alarm: true,
			buttons: [],
			tail: null,
		};
	return {
		hint: [
			{text: "Throw away ", strong: false},
			{text: nameOfCard(pick), strong: true},
			{text: "?", strong: false},
		],
		alarm: true,
		buttons: [
			press("toss", "Yes, bin it", () => {
				act.submit({k: "toss", uid: pick.uid});
			}),
			press("another", "Pick another", () => {
				act.patch({tossPick: null});
			}),
		],
		tail: null,
	};
}

function shiftBar(act: MatchActions): ActionBarView {
	const slide = (key: string, label: string, dx: number, dy: number): ActionButton =>
		press(key, label, () => {
			act.submit({k: "shift", dx, dy});
		});
	return {
		hint: [{text: "Slide everyone:", strong: false}],
		alarm: false,
		buttons: [
			slide("left", "← Left", -1, 0),
			slide("right", "Right →", 1, 0),
			slide("up", "↑ Up", 0, -1),
			slide("down", "↓ Down", 0, 1),
		],
		tail: "Esc to cancel.",
	};
}

/* The roster down the left: one card per seat, read from where this seat is sitting. */

function rosterView(v: SeatState): RosterCard[] {
	return v.fighters.map((f) => {
		// what this card may say is settled by who is reading it, which is not always who is playing
		const mine = f.seat === v.seat;
		const line = f.weapon
			? `${f.weapon} · ${f.weaponDamage} dmg · ${f.cards} in hand`
			: mine || !v.priv
				? `unarmed · ${f.cards} in hand`
				: `${f.cards} in hand`;
		const mates = v.fighters.filter((q) => q.seat !== f.seat && q.team === f.team && q.alive);
		return {
			seat: f.seat,
			name: f.name,
			colour: f.colour,
			alive: f.alive,
			allies: mates.length,
			hp: f.hp,
			health: f.hp / f.max,
			// a cap too big to draw as pips reads as a line instead
			energy: f.cap > 12 ? `${mine ? f.nrg : f.cap} / ${f.cap} energy` : null,
			pips: f.cap > 12 ? null : {total: f.cap, filled: mine ? (f.nrg ?? 0) : 0},
			seen: f.seen.length ? f.seen.join(", ") : null,
			line,
		};
	});
}

/* The hand: the cards this seat is holding, in whatever order they have been left in. */

function handCard(v: SeatState, local: Local, c: ElCard | WepCard, i: number, merges: readonly number[]): HandCard {
	const el = c.k === "el",
		comp = el && isComp(c.id);
	const colour = el ? elColor(c.id) : wColor(c);
	const f = el ? forgeOf(c.id) : null;
	const desc = el
		? `${comp && T[c.id]!.spread ? `Covers a ${T[c.id]!.spread! * 2 + 1}x${T[c.id]!.spread! * 2 + 1}. ` : ""}${T[EL[c.id] ? EL[c.id]!.t : c.id]!.d}. Forge: ${f!.mult && !f!.dmg ? f!.fx : `+${f!.dmg} damage`}.`
		: `${wDesc(c)} ${wepDmg(c)}${wHits(c) > 1 ? ` x${wHits(c)}` : ""} damage, ${wCost(c)} energy.`;
	return {
		uid: c.uid,
		kind: el ? (comp ? "FUSED" : "ELEMENT") : "WEAPON",
		number: i + 1,
		name: el ? elName(c.id) : wepName(c),
		desc,
		colour,
		strip: el ? colour : wStrip(c),
		on: el ? local.sel === c.uid : v.you.held === c.uid,
		mixable: (v.toss && local.tossPick == null) || (local.mode === "mix" && merges.includes(c.uid)),
		doomed: v.toss && local.tossPick === c.uid,
	};
}

/**
 * What clicking a card asks for. A chaos throw picks first and confirms second, so the first tap is
 * this screen's own business and only the second is a move. Everything else is one.
 */
function onCard(v: SeatState, local: Local, act: MatchActions, uid: number): void {
	if (v.phase !== "act") return;
	if (v.toss) {
		if (local.tossPick === uid) {
			act.submit({k: "toss", uid});
		} else {
			act.patch({tossPick: uid});
		}
		return;
	}
	if (local.mode === "mix" && local.mixFrom != null && mixWith(v, local.mixFrom).includes(uid)) {
		act.submit({k: "merge", uid: local.mixFrom, into: uid});
		return;
	}
	act.submit({k: "card", uid});
}

function handView(v: SeatState, local: Local, act: MatchActions): HandView {
	const merges = local.mode === "mix" ? mixWith(v, local.mixFrom) : [];
	return {
		cards: v.you.hand.map((c, i) => handCard(v, local, c, i, merges)),
		click: (uid: number) => {
			onCard(v, local, act, uid);
		},
		// `to` counts the cards the dragged one left behind, which is where it lands among them
		reorder: (uid: number, to: number) => {
			act.submit({k: "reorder", uid, to});
		},
		draggable: v.phase === "act" && !local.handoff,
	};
}

/* Table talk. */

/** The line an answer hangs off, cut to whatever length the place it is shown in has room for. */
function quoteOf(v: SeatState, id: number | null, cut: number): ChatQuote | null {
	const m = id ? v.chat.find((q) => q.id === id) : null;
	if (!m) return null;
	return {who: m.who, colour: m.c, text: m.t.length > cut ? m.t.slice(0, cut) + "…" : m.t};
}

function chatView(v: SeatState, local: Local, act: MatchActions): ChatView {
	return {
		lines: v.chat.map((m) => ({
			id: m.id,
			who: m.who,
			colour: m.c,
			round: m.r,
			text: m.t,
			quote: quoteOf(v, m.to, 44),
			reply: () => {
				act.patch({replyTo: m.id});
			},
		})),
		replyingTo: quoteOf(v, local.replyTo, 30),
		cancelReply: () => {
			act.patch({replyTo: null});
		},
		say: (text: string) => {
			act.submit({k: "chat", text, to: local.replyTo ?? 0});
		},
	};
}

/* The tile inspector down the right, and the reach overlay offered under it. */

function reachChooser(v: SeatState, local: Local, act: MatchActions): ReachChooser {
	return {
		chips: v.reachable.map((r) => {
			const f = v.fighters[r.seat]!;
			const on = local.reach.includes(r.seat);
			return {
				seat: r.seat,
				name: f.name,
				colour: f.colour,
				budget: r.budget,
				on,
				toggle: () => {
					act.patch({
						reach: on ? local.reach.filter((s) => s !== r.seat) : [...local.reach, r.seat],
					});
				},
			};
		}),
		blinded: v.blind,
	};
}

/** Who can reach the square being read, or nothing at all while nobody has been asked. */
function reachFact(v: SeatState, local: Local, i: number): TileFact[] {
	const drawn = drawnReach(v, local);
	if (!drawn.length) return [];
	const who = drawn.filter((r) => r.tiles.includes(i));
	if (!who.length) return [{label: "In reach of", value: "nobody selected"}];
	return [{label: "In reach of", value: who.map((r) => v.fighters[r.seat]!.name).join(", ")}];
}

function tileReadout(v: SeatState, local: Local, i: number): TileReadout {
	const x = i % v.dim,
		y = (i / v.dim) | 0;
	const key = v.tiles[i]!.t;
	const t = key ? T[key]! : null;
	const facts: TileFact[] = [];
	if (t) {
		if (t.enter > 50) facts.push({label: "Entering", value: "impossible"});
		else facts.push({label: "Entering", value: t.enter + " energy"});
		if (t.end) facts.push({label: "Ending here", value: t.end + " damage"});
		if (t.bite) facts.push({label: "Crossing it", value: t.bite + " damage"});
		if (t.heal) facts.push({label: "Ending here", value: "heals " + t.heal});
		if (t.aura) facts.push({label: "Within " + (t.rad || 2), value: t.aura + " damage"});
		if (t.auraHeal) facts.push({label: "Within " + (t.rad || 2), value: "heals " + t.auraHeal});
		if (t.gain) facts.push({label: "Ending here", value: "+" + t.gain + " energy"});
		if (t.los) facts.push({label: "Standing here", value: "you are blind"});
		if (t.anchor) facts.push({label: "Shoves", value: "cannot move you"});
		if (t.ward) facts.push({label: "Ground effects", value: "cannot touch you"});
		if (t.gone) facts.push({label: "Touching it", value: "you are gone"});
		facts.push({label: "Lasts", value: t.life > 900 ? "permanent" : t.life + " more rounds"});
	}
	// whoever the ground is hiding was never in the view to be read out of it, which is the point:
	// clicking a square and being told somebody is on it is what the concealment is there to stop
	const here = standingAt(v, x, y);
	if (here.length)
		facts.push({label: "Standing on it", value: here.map((f) => `${f.name}, ${f.hp} HP`).join(" and ")});
	facts.push({label: "Square", value: `${x + 1}, ${y + 1}`});
	facts.push(...reachFact(v, local, i));
	return {
		name: t ? t.n : "Bare ground",
		colour: t ? t.c : null,
		blurb: t ? t.d + "." : "Nothing has been laid here.",
		facts,
	};
}

function inspectView(v: SeatState, local: Local, act: MatchActions): InspectView {
	const chooser = local.imode ? reachChooser(v, local, act) : null;
	if (local.look == null)
		return {
			inspecting: local.imode,
			hint: local.imode
				? "Click any square to read it. Press I or Escape to go back to playing."
				: "Turn on Inspect to read any square without moving.",
			tile: null,
			chooser,
		};
	return {inspecting: local.imode, hint: null, tile: tileReadout(v, local, local.look), chooser};
}
