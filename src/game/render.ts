/**
 * The match screen, described afresh from `S` after every move. Nothing here touches the page: it
 * builds a plain account of what the arena looks like and publishes it, and React paints that.
 */

import {handoffStore, matchStore} from "./bridge.js";
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
import {badPlace, cardLabel, clickCard, doToss, lethalRaw, logit, mixPartners, sealed, startMix} from "./cards.js";
import {attackTiles, foeEls, leaveFoe, leaveSelf, liveTargets, selfEls, smashMult, startAttack} from "./combat.js";
import {COST, EL, MV, T} from "./data/index.js";
import type {ActionKey} from "./data/index.js";
import {dropCurtain, onTile, toggleInspect} from "./input.js";
import {elColor, elName, forgeOf, isComp, wColor, wCost, wDesc, wHits, wStrip, wepDmg, wepName} from "./lookups.js";
import {checkRefill, endTurn, forfeit, forfeitArmed, leaveMatch} from "./match.js";
import {codexLine, openTable} from "./menu.js";
import {
	canEnter,
	dashTargets,
	doFloat,
	doShift,
	doSmash,
	doSpin,
	doTrail,
	doUltra,
	doWipe,
	jumpTargets,
	leapTargets,
	lightTargets,
	markTargets,
	moveBudget,
	reachMap,
	seenBy,
	smashable,
	spinTiles,
	spreadTargets,
	swapTargets,
	takeCard,
	theftTargets,
	warpTargets,
	whirlList,
	wipeTiles,
} from "./movement.js";
import {flipTheme, themeLabel} from "./settings.js";
import {S, ally, blind, cheb, cur, held, hidden, idx, isLit, occupantsAt, rgba, seesTile, selCard} from "./state.js";
import type {Card, ChatMsg, Player, WepCard} from "./types.js";
import {auditReveal} from "./undo.js";

/**
 * The match as it stands, or nothing at all while the setup screen has the page. Every callback in
 * the view is built fresh here, which costs nothing: a move always changes something, so React is
 * told to repaint whatever it was already showing.
 */
export function render(): void {
	if (!S.players.length || S.screen !== "game") {
		matchStore.set(null);
		handoffStore.set(null);
		return;
	}
	checkRefill();
	auditReveal();
	const p = cur();
	const dark = blind(p);
	handoffStore.set(S.handoff ? {seat: p.i, name: p.name, colour: p.c, dismiss: dropCurtain} : null);
	matchStore.set(matchView(p, dark));
}

function matchView(p: Player, dark: boolean): MatchView {
	return {
		topbar: topbarView(p),
		board: boardView(p, dark),
		footwork: footworkView(p),
		weapon: weaponView(p, dark),
		actions: actionsView(p),
		roster: rosterView(),
		hand: handView(p),
		chat: chatView(),
		inspect: inspectView(p, dark),
		codex: codexLine(),
	};
}

/* The strip along the top: whose turn it is, and every door out of the match. */

function topbarView(p: Player): TopbarView {
	const paint = S.paint ? "  ·  PAINTBALL" : "";
	const smash = S.smash ? `  ·  SMASH MODE x${smashMult()}` : "";
	const chaos = S.chaos
		? S.round >= S.chaosRound
			? "  ·  CHAOS MODE"
			: S.round >= S.chaosRound - 3
				? `  ·  CHAOS IN ${S.chaosRound - S.round}`
				: ""
		: "";
	const armed = forfeitArmed();
	return {
		seat: p.i,
		name: p.name,
		colour: p.c,
		round: `ROUND ${S.round}  ·  ${p.nrg}/${p.cap} ENERGY${p.bank ? `  ·  ${p.bank} CARRIED` : ""}${smash}${paint}${chaos}`,
		inspecting: S.imode,
		toggleInspect,
		openTable,
		canEndTurn: !S.toss,
		endTurn,
		forfeitLabel: armed ? "Tap again to fall" : "Forfeit",
		forfeitArmed: armed,
		forfeit,
		leave: leaveMatch,
		themeLabel: themeLabel(),
		toggleTheme: flipTheme,
	};
}

/* The board. Anything this seat cannot see is left out here rather than drawn and hidden, so the
   published view carries no answer React could give away. */

/** The squares the move being aimed can land on, and the ones with a visible fighter already there. */
function aimSquares(p: Player, dark: boolean): {aim: Set<string>; sure: Set<string>} {
	const aim = new Set<string>(),
		sure = new Set<string>();
	if (S.phase !== "act") return {aim, sure};
	const mark = (list: [number, number][]): void => {
		list.forEach(([x, y]) => aim.add(x + "," + y));
	};
	if (S.mode === "place") {
		const sc = selCard(p);
		for (let y = 0; y < S.dim; y++)
			for (let x = 0; x < S.dim; x++) {
				const d = cheb(p.x, p.y, x, y);
				if (d > 0 && d <= 4 && !sealed(x, y) && !badPlace(sc ? sc.id : "", x, y)) aim.add(x + "," + y);
			}
	} else if (S.mode === "jump") mark(jumpTargets(p));
	else if (S.mode === "dash") mark(dashTargets(p));
	else if (S.mode === "leap") mark(leapTargets(p));
	else if (S.mode === "light") mark(lightTargets());
	else if (S.mode === "mark") mark(markTargets());
	else if (S.mode === "swap") mark(swapTargets());
	else if (S.mode === "theft") mark(theftTargets());
	else if (S.mode === "warp") mark(warpTargets(p));
	else if (S.mode === "spread") mark(spreadTargets());
	else if (S.mode === "attack") {
		const c = held(p);
		if (c) {
			mark(attackTiles(p, c));
			liveTargets(p, c).forEach(([x, y]) => {
				if (!dark || occupantsAt(x, y).some((q) => q.lit && q !== p && !ally(q, p))) sure.add(x + "," + y);
			});
		}
	}
	return {aim, sure};
}

function boardView(p: Player, dark: boolean): BoardView {
	const {aim, sure} = aimSquares(p, dark);
	const rmap = S.imode && S.reach.length ? reachMap() : null;
	const wl = whirlList();
	const tiles: TileView[] = [];
	for (let y = 0; y < S.dim; y++)
		for (let x = 0; x < S.dim; x++) {
			const i = idx(x, y),
				c = S.board[i]!,
				key = x + "," + y;
			const ground = c.t && seesTile(p, x, y) ? T[c.t]! : null;
			// a fighter reaches the view only when nothing is keeping them out of this seat's sight
			const here = occupantsAt(x, y).filter((o) => o === p || o.lit || (!dark && !hidden(o)));
			let step = false;
			if (
				!aim.size &&
				S.phase === "act" &&
				!S.mode &&
				!S.sel &&
				!p.rootTurns &&
				cheb(p.x, p.y, x, y) === 1 &&
				canEnter(x, y, p)
			) {
				const cost = p.float ? 1 : c.t ? T[c.t]!.enter : 1;
				step = cost <= p.nrg && cost < 50;
			}
			tiles.push({
				colour: ground ? ground.c : null,
				shadow: ground ? rgba(ground.c, 0.44) : null,
				terrain: !!ground,
				solid: !!ground?.solid,
				dead: !!ground?.dead,
				gone: !!ground?.gone,
				whirl:
					ground && c.t === "whirl" ? String.fromCharCode(65 + (wl.findIndex((a) => a[1] === i) >> 1)) : null,
				aim: aim.has(key) ? (sure.has(key) ? "aimsure" : "aim") : null,
				step,
				warn: S.warn === i,
				litsq: isLit(x, y),
				look: S.look === i,
				reach: reachStripes(rmap?.get(i)),
				// whoever is standing here has the last word on what the square says it is
				title: here.length
					? here.map((o) => `${o.name}: ${o.hp} HP`).join("  ·  ")
					: ground
						? `${ground.n}: ${ground.d}`
						: "",
				occupants: here.map((o, k) => tileFighter(o, p, k, here.length)),
				stack: here.length > 2 ? here.length : null,
			});
		}
	// the animations are handed over once and then forgotten, so each one plays on exactly one screen
	const fx: FxHit[] = S.fx.map(([index, animation]) => ({index, animation}));
	S.fx = [];
	return {dim: S.dim, tiles, click: onTile, fx};
}

function tileFighter(o: Player, p: Player, k: number, crowd: number): TileFighter {
	return {
		seat: o.i,
		colour: o.c,
		active: o === p,
		lit: !!o.lit && o !== p, // the lit fighter is never shown their own glow
		// shoulder to shoulder
		inset: crowd > 1 ? (k ? "34% 8% 8% 34%" : "8% 34% 34% 8%") : null,
		z: crowd > 1 ? (o === p ? 2 : 1) : null,
	};
}

/** One band per fighter who could reach the square, or null while nobody has been asked about it. */
function reachStripes(who: Player[] | undefined): string | null {
	if (!who?.length) return null;
	if (who.length === 1) return `linear-gradient(${rgba(who[0]!.c, 0.34)},${rgba(who[0]!.c, 0.34)})`;
	return `repeating-linear-gradient(135deg,${who
		.map((q, z) => `${rgba(q.c, 0.4)} ${z * 7}px,${rgba(q.c, 0.4)} ${(z + 1) * 7}px`)
		.join(",")})`;
}

/* The footwork rail: one button per special move this fighter was given. A move can be offered,
   spent, or already running, and each of the three reads differently. */

function liveMove(key: ActionKey, used: number, disabled: boolean, click: () => void, aiming: boolean): FootworkButton {
	return {key, label: MV[key]!.n, cost: COST[key], left: S.mvUses - used, tip: MV[key]!.d, aiming, disabled, click};
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

/** Puts the board into a mode, or back out of the one it is already waiting in. */
function aimAt(mode: string): () => void {
	return () => {
		S.mode = S.mode === mode ? null : mode;
		S.sel = null;
		render();
	};
}

function footworkView(p: Player): FootworkView {
	const rooted = p.rootTurns > 0;
	const buttons: FootworkButton[] = [];
	const add = (has: number, key: ActionKey, disabled: boolean, click: () => void, aiming: boolean): void => {
		if (!has) return;
		buttons.push(p.used[key] >= S.mvUses ? spentMove(key) : liveMove(key, p.used[key], disabled, click, aiming));
	};
	add(p.mv & 1, "jump", rooted || p.nrg < COST.jump || !jumpTargets(p).length, aimAt("jump"), S.mode === "jump");
	add(p.mv & 2, "dash", rooted || p.nrg < COST.dash || !dashTargets(p).length, aimAt("dash"), S.mode === "dash");
	add(p.mv & 4, "leap", rooted || p.nrg < COST.leap || !leapTargets(p).length, aimAt("leap"), S.mode === "leap");
	if (p.mv & 8 && p.float) buttons.push(runningMove("float", "Floating"));
	else add(p.mv & 8, "float", p.nrg < COST.float, doFloat, false);
	add(p.mv & 16, "spin", p.nrg < COST.spin || !spinTiles(p).length, doSpin, false);
	add(p.mv & 32, "wipe", p.nrg < COST.wipe || !wipeTiles(p).length, doWipe, false);
	add(p.mv & 64, "warp", rooted || p.nrg < COST.warp || !warpTargets(p).length, aimAt("warp"), S.mode === "warp");
	if (p.mv & 512 && p.trail) buttons.push(runningMove("trail", `Trailing ${T[p.trail]!.n}`));
	else add(p.mv & 512, "trail", p.nrg < COST.trail || !S.board[idx(p.x, p.y)]!.t, doTrail, false);
	add(p.mv & 128, "ultra", p.nrg < COST.ultra || !S.board.some((c) => c.t), doUltra, false);
	add(p.mv & 256, "spread", p.nrg < COST.spread || !spreadTargets().length, aimAt("spread"), S.mode === "spread");
	add(p.mv & 32768, "light", p.nrg < COST.light || !lightTargets().length, aimAt("light"), S.mode === "light");
	add(p.mv & 16384, "mark", p.nrg < COST.mark || !markTargets().length, aimAt("mark"), S.mode === "mark");
	add(p.mv & 8192, "swap", rooted || p.nrg < COST.swap || !swapTargets().length, aimAt("swap"), S.mode === "swap");
	add(p.mv & 4096, "theft", p.nrg < COST.theft || !theftTargets().length, aimAt("theft"), S.mode === "theft");
	add(p.mv & 2048, "smash", p.nrg < COST.smash || !smashable(p), doSmash, false);
	add(p.mv & 1024, "shift", p.nrg < COST.shift, aimAt("shift"), S.mode === "shift");
	return {any: !!p.mv, floating: p.float, rooted, buttons};
}

/* The weapon panel, which is only ever about the one card being held. */

/** A row of leavings, or nothing at all when the weapon carries no choice to make. */
function leaveRow(
	c: WepCard,
	label: string,
	opts: string[],
	pick: string | undefined,
	key: "leaveSelf" | "leaveFoe",
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
				choose: () => {
					c[key] = e;
					render();
				},
			})),
		},
	];
}

function weaponView(p: Player, dark: boolean): WeaponView | null {
	const c = held(p);
	if (!c) return null;
	const dmg = wepDmg(c),
		cost = wCost(c),
		hits = wHits(c);
	const uniq = [...new Set(c.els.map((e: string) => forgeOf(e).fx))];
	// a square only counts as a target when somebody this seat can actually see is standing on it
	const tg = liveTargets(p, c).filter(
		([x, y]) => !dark || occupantsAt(x, y).some((q) => q.lit && q !== p && !ally(q, p)),
	).length;
	const poor = p.nrg < cost;
	return {
		name: wepName(c),
		colour: wColor(c),
		damage: `${dmg}${hits > 1 ? ` x ${hits}` : ""}`,
		desc: `${wDesc(c)} Breaks the moment you swing it.`,
		onHit: uniq.length ? uniq.join(", ") : null,
		strip: wStrip(c),
		rows: [
			...leaveRow(c, "Leaves under them:", foeEls(c), leaveFoe(c), "leaveFoe"),
			...leaveRow(c, "Lays under you:", selfEls(c), leaveSelf(c), "leaveSelf"),
		],
		cost,
		aiming: S.mode === "attack",
		disabled: poor,
		swing: startAttack,
		hint: poor
			? "Not enough energy this turn."
			: dark
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

function actionsView(p: Player): ActionBarView {
	if (MODEHINT[S.mode!]) return saying(`${MODEHINT[S.mode!]} Esc to cancel.`);
	if (S.mode === "attack") return saying("Pick a tile to strike. Esc to cancel.");
	if (S.mode === "place") {
		const sc = selCard(p);
		const lethal =
			sc && lethalRaw(sc.id) ? ` ${elName(sc.id)} cannot be laid on a square someone is standing on.` : "";
		return saying(`Pick a tile within 4.${lethal} Esc to cancel.`);
	}
	if (S.steal != null) return stealBar(S.steal);
	if (S.toss) return tossBar(p);
	if (S.mode === "shift") return shiftBar();
	if (S.mode === "mix") return saying("Click any highlighted card to merge with. Esc to cancel.");
	const c = selCard(p),
		h = held(p),
		active = c || h;
	if (!active)
		return saying(
			p.rootTurns > 0
				? "Stuck in the mud. You cannot move until this turn ends."
				: "Click a card, or step onto a highlighted tile.",
		);
	const parts = mixPartners(p, active).length;
	const buttons: ActionButton[] = [];
	if (c)
		buttons.push(
			press(
				"place",
				`Lay on a tile · ${COST.place}`,
				() => {
					S.mode = "place";
					render();
				},
				p.nrg < COST.place,
			),
		);
	buttons.push(
		press(
			"merge",
			`Merge · ${COST.merge}`,
			() => {
				startMix(active.uid);
			},
			p.nrg < COST.merge || !parts,
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

/** The hand being robbed, with every card this seat has not been shown offered face down. */
function stealBar(seat: number): ActionBarView {
	const v = S.players[seat]!;
	const buttons: ActionButton[] = v
		? v.hand.map((c: Card, i: number) => ({
				key: String(c.uid),
				label: seenBy(c) ? cardLabel(c) : `Card ${i + 1}`,
				disabled: false,
				facedown: !seenBy(c),
				click: () => {
					takeCard(v, c.uid);
				},
			}))
		: [];
	buttons.push(
		press("cancel", "Cancel", () => {
			S.steal = null;
			render();
		}),
	);
	return {
		hint: [{text: `Take a card from ${v ? v.name : "them"}:`, strong: false}],
		alarm: false,
		buttons,
		tail: null,
	};
}

function tossBar(p: Player): ActionBarView {
	const pick = p.hand.find((q) => q.uid === S.tossPick);
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
			{text: cardLabel(pick), strong: true},
			{text: "?", strong: false},
		],
		alarm: true,
		buttons: [
			press("toss", "Yes, bin it", () => {
				doToss(pick.uid);
			}),
			press("another", "Pick another", () => {
				S.tossPick = null;
				render();
			}),
		],
		tail: null,
	};
}

function shiftBar(): ActionBarView {
	const slide = (key: string, label: string, dx: number, dy: number): ActionButton =>
		press(key, label, () => {
			doShift(dx, dy);
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

function rosterView(): RosterCard[] {
	return S.players.map((p) => {
		const c = held(p),
			mine = p === cur(),
			open = !S.priv;
		const line =
			mine || open
				? `${c ? `${wepName(c)} · ${wepDmg(c)} dmg` : "unarmed"} · ${p.hand.length} in hand`
				: `${p.hand.length} in hand`;
		const mates = S.players.filter((q) => q !== p && q.team === p.team && q.alive);
		const seen = mine ? [] : p.hand.filter((q) => seenBy(q));
		return {
			seat: p.i,
			name: p.name,
			colour: p.c,
			alive: p.alive,
			allies: mates.length,
			hp: p.hp,
			health: p.hp / p.max,
			// a cap too big to draw as pips reads as a line instead
			energy: p.cap > 12 ? `${mine ? p.nrg : p.cap} / ${p.cap} energy` : null,
			pips: p.cap > 12 ? null : {total: p.cap, filled: mine ? p.nrg : 0},
			seen: seen.length ? seen.map(cardLabel).join(", ") : null,
			line,
		};
	});
}

/* The hand: the cards this seat is holding, in whatever order they have been left in. */

function handCard(p: Player, c: Card, i: number): HandCard {
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
		on: el ? S.sel === c.uid : p.held === c.uid,
		mixable: (S.toss && S.tossPick == null) || (S.mode === "mix" && mixPartners(p).some((q) => q.uid === c.uid)),
		doomed: S.toss && S.tossPick === c.uid,
	};
}

function handView(p: Player): HandView {
	return {
		cards: p.hand.map((c, i) => handCard(p, c, i)),
		click: clickCard,
		// `to` counts the cards the dragged one left behind, which is where it lands among them
		reorder: (uid: number, to: number) => {
			const from = p.hand.findIndex((q) => q.uid === uid);
			if (from >= 0) {
				const [card] = p.hand.splice(from, 1);
				if (card) p.hand.splice(to, 0, card);
			}
			render();
		},
		draggable: S.phase === "act" && !S.handoff,
	};
}

/* Table talk. */

function chatById(id: number): ChatMsg | undefined {
	return S.chat.find((m) => m.id === id);
}

/** The line an answer hangs off, cut to whatever length the place it is shown in has room for. */
function quoteOf(id: number | null, cut: number): ChatQuote | null {
	const m = id ? chatById(id) : null;
	if (!m) return null;
	return {who: m.who, colour: m.c, text: m.t.length > cut ? m.t.slice(0, cut) + "…" : m.t};
}

function chatView(): ChatView {
	return {
		lines: S.chat.map((m) => ({
			id: m.id,
			who: m.who,
			colour: m.c,
			round: m.r,
			text: m.t,
			quote: quoteOf(m.to, 44),
			reply: () => {
				S.replyTo = m.id;
				render();
			},
		})),
		replyingTo: quoteOf(S.replyTo, 30),
		cancelReply: () => {
			S.replyTo = null;
			render();
		},
		say,
	};
}

/** Says something at the table, answering whatever the reply bar is pointing at. */
export function say(text: string): void {
	const t = text.trim().replace(/[<>]/g, "");
	if (!t) return;
	const p = cur();
	const par = S.replyTo ? chatById(S.replyTo) : null;
	S.chat.push({
		id: S.cid++,
		who: p ? p.name : "",
		c: p ? p.c : "var(--muted)",
		r: S.round,
		t,
		to: par ? par.id : null,
	});
	logit(par ? `to ${par.who}: “${t}”` : `“${t}”`, undefined, true);
	S.replyTo = null;
	render();
}

/* The tile inspector down the right, and the reach overlay offered under it. */

function reachChooser(p: Player, dark: boolean): ReachChooser {
	const list = S.players.filter((q) => q.alive && (q === p || q.lit || (!dark && !hidden(q))));
	return {
		chips: list.map((q) => ({
			seat: q.i,
			name: q.name,
			colour: q.c,
			budget: moveBudget(q),
			on: S.reach.includes(q.i),
			toggle: () => {
				const at = S.reach.indexOf(q.i);
				if (at >= 0) S.reach.splice(at, 1);
				else S.reach.push(q.i);
				render();
			},
		})),
		blinded: dark,
	};
}

/** Who can reach the square being read, or nothing at all while nobody has been asked. */
function reachFact(i: number, p: Player, dark: boolean): TileFact[] {
	if (!S.imode || !S.reach.length) return [];
	const who = reachMap().get(i);
	if (!who?.length) return [{label: "In reach of", value: "nobody selected"}];
	return [{label: "In reach of", value: who.map((q) => (q === p || !dark ? q.name : "someone hidden")).join(", ")}];
}

function tileReadout(p: Player, dark: boolean, i: number): TileReadout {
	const x = i % S.dim,
		y = (i / S.dim) | 0,
		c = S.board[i]!;
	const t = c.t && seesTile(p, x, y) ? T[c.t] : null;
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
	// the same rule the board reads by: cover keeps a fighter out of the readout as well as off the
	// square, or Inspect would name whoever the ground is busy hiding
	const all = occupantsAt(x, y),
		shown = all.filter((q) => q === p || q.lit || (!dark && !hidden(q)));
	if (all.length)
		facts.push({
			label: "Standing on it",
			value: shown.length
				? shown.map((q) => `${q.name}, ${q.hp} HP`).join(" and ") +
					(shown.length < all.length ? " and someone you cannot see" : "")
				: "someone you cannot see",
		});
	facts.push({label: "Square", value: `${x + 1}, ${y + 1}`});
	facts.push(...reachFact(i, p, dark));
	return {
		name: t ? t.n : "Bare ground",
		colour: t ? t.c : null,
		blurb: t ? t.d + "." : "Nothing has been laid here.",
		facts,
	};
}

function inspectView(p: Player, dark: boolean): InspectView {
	if (!S.imode) S.reach = [];
	const chooser = S.imode ? reachChooser(p, dark) : null;
	if (S.look == null)
		return {
			inspecting: S.imode,
			hint: S.imode
				? "Click any square to read it. Press I or Escape to go back to playing."
				: "Turn on Inspect to read any square without moving.",
			tile: null,
			chooser,
		};
	return {inspecting: S.imode, hint: null, tile: tileReadout(p, dark, S.look), chooser};
}
