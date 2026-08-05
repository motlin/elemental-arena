/** A match from end to end: dealing it out, taking turns through it, and calling it. */

import {overStore} from "./bridge.js";
import {logit} from "./cards.js";
import {anchored, hurt} from "./combat.js";
import {EL, ELBYT, T} from "./data/index.js";
import type {Offset} from "./data/index.js";
import {elsOn, mvOwnedMask, wsOn} from "./lookups.js";
import {afterMove, canStand, voidOut} from "./movement.js";
import {save, saveSoon} from "./save.js";
import {readChaosRound, readMvUses, readOpenHand, readStartNrg} from "./settings.js";
import {$, PC, S, cheb, cur, idx, nameOf, occupant, show, teamName, teamsAlive} from "./state.js";
import type {Player} from "./types.js";
import {openReplay, redraw, redrawBoard, redrawCodex} from "./view.js";

export function ringSpots(dim: number, n: number): Offset[] {
	const m = 1,
		M = dim - 2,
		ring: Offset[] = [];
	for (let x = m; x <= M; x++) ring.push([x, m]);
	for (let y = m + 1; y <= M; y++) ring.push([M, y]);
	for (let x = M - 1; x >= m; x--) ring.push([x, M]);
	for (let y = M - 1; y > m; y--) ring.push([m, y]);
	const out: Offset[] = [],
		used = new Set<number>();
	for (let i = 0; i < n; i++) {
		let k = Math.round((i * ring.length) / n) % ring.length;
		while (used.has(k)) k = (k + 1) % ring.length;
		used.add(k);
		out.push(ring[k]!);
	}
	return out;
}

function dealOpening(p: Player): number {
	const n = S.openHand;
	const nEl = Math.random() < 0.5 ? Math.ceil(n / 2) : Math.floor(n / 2),
		wk = wsOn(p.i),
		ek = elsOn(p.i);
	for (let i = 0; i < nEl; i++) p.hand.push({uid: S.uid++, k: "el", id: ek[(Math.random() * ek.length) | 0]!});
	for (let i = 0; i < n - nEl; i++)
		p.hand.push({uid: S.uid++, k: "w", ids: [wk[(Math.random() * wk.length) | 0]!], els: []});
	for (let i = p.hand.length - 1; i > 0; i--) {
		const j = (Math.random() * (i + 1)) | 0;
		[p.hand[i], p.hand[j]] = [p.hand[j]!, p.hand[i]!];
	}
	return nEl;
}
export function startMatch(): void {
	readStartNrg();
	readOpenHand();
	readChaosRound();
	readMvUses();
	S.board = Array.from({length: S.dim * S.dim}, () => ({t: null, el: null, life: 0, wid: 0, by: null}));
	S.wid = 1;
	S.uid = 1;
	if (S.preset && S.presetDim === S.dim) {
		S.preset.forEach((k, i) => {
			if (!k) return;
			const c = S.board[i]!;
			if (EL[k]) {
				c.el = k;
				c.t = EL[k].t;
			} else {
				c.el = null;
				c.t = k;
			}
			c.life = T[c.t]!.life;
			if (c.t === "whirl") c.wid = S.wid++;
		});
	}
	const spots = ringSpots(S.dim, S.np);
	S.players = Array.from({length: S.np}, (_, i) => ({
		i,
		name: nameOf(i),
		c: PC[S.cols[i]!]!,
		team: S.cols[i]!,
		mv: S.mv[i]! & mvOwnedMask(),
		used: {
			place: 0,
			merge: 0,
			jump: 0,
			dash: 0,
			leap: 0,
			float: 0,
			spin: 0,
			wipe: 0,
			warp: 0,
			ultra: 0,
			spread: 0,
			trail: 0,
			shift: 0,
			smash: 0,
			theft: 0,
			swap: 0,
			mark: 0,
			light: 0,
		},
		trail: null,
		float: false,
		x: spots[i]![0],
		y: spots[i]![1],
		hp: S.hp,
		max: S.hp,
		nrg: 0,
		cap: 5,
		drain: 0,
		bank: 0,
		rootTurns: 0,
		darkTurns: 0,
		litTurns: 0,
		hand: [],
		held: null,
		alive: true,
	}));
	S.players.forEach((p) => {
		const c = S.board[idx(p.x, p.y)]!;
		if (c.t && T[c.t]!.gone) {
			p.hp = 0;
			p.alive = false;
		}
	});
	S.turn = 0;
	S.round = 1;
	S.sel = null;
	S.mode = null;
	S.matchCoins = 0;
	S.warn = null;
	S.toss = false;
	S.tossPick = null;
	S.chat = [];
	S.cid = 1;
	S.replyTo = null;
	S.log = [];
	S.frames = [];
	S.rvi = 0;

	S.players.forEach(dealOpening);
	while (!S.players[S.turn]!.alive && S.turn < S.players.length - 1) S.turn++;
	show("game");
	redrawBoard();
	redrawCodex();
	if (teamsAlive().length <= 1) finish(teamsAlive()[0] ?? null);
	else beginTurn();
}
const REFILL = 5;
function drawCards(p: Player, n: number): void {
	const wk = wsOn(p.i),
		ek = elsOn(p.i);
	const nEl = Math.random() < 0.5 ? Math.ceil(n / 2) : Math.floor(n / 2);
	for (let i = 0; i < nEl; i++) p.hand.push({uid: S.uid++, k: "el", id: ek[(Math.random() * ek.length) | 0]!});
	for (let i = 0; i < n - nEl; i++)
		p.hand.push({uid: S.uid++, k: "w", ids: [wk[(Math.random() * wk.length) | 0]!], els: []});
}
// an empty hand is refilled at once, whoever is playing
export function checkRefill(): void {
	S.players.forEach((p) => {
		if (!p.alive || p.hand.length) return;
		drawCards(p, REFILL);
		logit(`ran out of cards and drew ${REFILL} more`, p);
	});
}
function beginTurn(): void {
	const p = cur();
	const gain = S.startNrg + (S.round - 1);
	p.cap = Math.max(0, p.bank + gain - p.drain);
	p.nrg = p.cap;
	p.drain = 0;
	S.sel = null;
	S.mode = null;
	S.phase = "act";
	p.trail = null;
	resetQuitBtn();
	const wk = wsOn(p.i),
		ek = elsOn(p.i);
	const e = ek[(Math.random() * ek.length) | 0]!;
	const w = wk[(Math.random() * wk.length) | 0]!;
	p.hand.push({uid: S.uid++, k: "el", id: e});
	p.hand.push({uid: S.uid++, k: "w", ids: [w], els: []});
	S.toss = S.chaos && S.round >= S.chaosRound && p.hand.length > 0;
	S.tossPick = null;
	S.handoff = S.priv;
	redraw();
}
function chaosTick(): void {
	if (!S.chaos) {
		S.warn = null;
		return;
	}
	// whatever was warned last round falls away now
	if (S.warn != null) {
		const j = S.warn,
			c = S.board[j]!;
		c.t = "collapsed";
		c.el = null;
		c.life = 999;
		c.wid = 0;
		S.fx.push([j, "bloom"]);
		const v = occupant(j % S.dim, (j / S.dim) | 0);
		logit(`the square at ${(j % S.dim) + 1},${((j / S.dim) | 0) + 1} fell away`, null);
		if (v?.alive) {
			v.hp = 0;
			v.alive = false;
			v.held = null;
			logit(`${v.name} went down with it`, v);
		}
		S.warn = null;
	}
	if (S.round >= S.chaosRound) {
		const free: number[] = [];
		S.board.forEach((c, j) => {
			if (c.t !== "collapsed") free.push(j);
		});
		if (free.length > 1) S.warn = free[(Math.random() * free.length) | 0]!;
	}
}
export function nextTurn(): void {
	let g = 0;
	do {
		S.turn = (S.turn + 1) % S.players.length;
		if (S.turn === 0) {
			S.round++;
			decay();
			chaosTick();
			if (!checkAlive()) return;
		}
	} while (!S.players[S.turn]!.alive && ++g < 24);
	beginTurn();
}
export function endTurn(): void {
	if (S.toss) return;
	const p = cur();
	if (p.float) {
		p.float = false;
		afterMove(p);
	} // you come down where you stopped
	if (p.alive) resolveStanding(p);
	p.bank = p.nrg;
	p.rootTurns = 0;
	if (p.darkTurns > 0) p.darkTurns--;
	if (p.litTurns > 0) p.litTurns--;
	saveSoon();
	if (!checkAlive()) return;
	nextTurn();
}
function resolveStanding(p: Player): void {
	let best: Offset | null = null,
		bd = 99;
	S.board.forEach((c, j) => {
		if (!c.t || !T[c.t]!.pull) return;
		const x = j % S.dim,
			y = (j / S.dim) | 0,
			d = cheb(p.x, p.y, x, y);
		if (d > 0 && d <= T[c.t]!.pull! && d < bd) {
			bd = d;
			best = [x, y];
		}
	});
	if (best && !anchored(p)) {
		const sx = Math.sign(best[0] - p.x),
			sy = Math.sign(best[1] - p.y);
		if (canStand(p.x + sx, p.y + sy)) {
			p.x += sx;
			p.y += sy;
			afterMove(p);
			if (!p.alive) return;
		}
	}
	const here = S.board[idx(p.x, p.y)]!;
	if (here.t && T[here.t]!.gone) {
		voidOut(p);
		return;
	}
	if (here.t && T[here.t]!.ward) return;
	S.board.forEach((q, j) => {
		if (!q.t) return;
		const a = T[q.t]!;
		if (!a.aura && !a.auraHeal) return;
		const x = j % S.dim,
			y = (j / S.dim) | 0,
			dist = cheb(p.x, p.y, x, y);
		if (dist > (a.rad || 2)) return;
		if (a.aura) hurt(p, a.aura, null);
		if (a.auraHeal) p.hp = Math.min(p.max, p.hp + a.auraHeal);
	});
	if (!p.alive) return;
	const c = S.board[idx(p.x, p.y)]!;
	if (!c.t) return;
	const d = T[c.t]!;
	if (d.end > 0) {
		hurt(p, d.end, null);
	}
	if (d.heal) p.hp = Math.min(p.max, p.hp + d.heal);
	if (d.gain) p.drain = (p.drain || 0) - d.gain;
	if (d.sap) p.drain = (p.drain || 0) + d.sap;
	if (d.shove && p.alive) {
		const dirs: Offset[] = [
				[1, 0],
				[-1, 0],
				[0, 1],
				[0, -1],
			],
			r = dirs[(Math.random() * 4) | 0]!;
		if (canStand(p.x + r[0], p.y + r[1])) {
			p.x += r[0];
			p.y += r[1];
		}
	}
}
function decay(): void {
	S.board.forEach((c) => {
		if (!c.t || c.life >= 900) return;
		if (--c.life > 0) return;
		const into = T[c.t]!.melts;
		if (into) {
			c.t = into;
			c.el = ELBYT[into] || null;
			c.life = T[into]!.life;
		} else {
			c.t = null;
			c.el = null;
			c.wid = 0;
			c.by = null;
		}
	});
}
export function checkAlive(): boolean {
	const teams = teamsAlive();
	if (teams.length <= 1) {
		finish(teams[0] ?? null);
		return false;
	}
	return true;
}
/** Takes the game-over screen down on the way to the menu; a stable reference, so republishing
 * the same screen compares equal. */
function backToMenu(): void {
	overStore.set(null);
	show("menu");
}
function finish(t: number | null): void {
	void save();
	const won = S.players.filter((p) => p.alive);
	logit(t === null ? "nobody was left standing" : `${teamName(t)} took the arena`, null);
	overStore.set({
		seat: won[0] ? won[0].i : 0,
		colour: t === null ? "#6f7da8" : PC[t]!,
		headline: won.length
			? won.length === 1
				? `${won[0]!.name} holds the arena`
				: `${teamName(t)} holds the arena`
			: "Nobody walks out",
		earn: (won.length > 1 ? won.map((p) => p.name).join(" and ") + "  ·  " : "") + `+${S.matchCoins} coin banked`,
		log: [...S.log],
		openReplay,
		back: backToMenu,
	});
}
let quitArmed = false,
	quitT: ReturnType<typeof setTimeout> | null = null;
function resetQuitBtn(): void {
	const b = $("quit");
	quitArmed = false;
	b.textContent = "Forfeit";
	b.style.borderColor = "";
	b.style.color = "";
}
$("quit").onclick = () => {
	const b = $("quit"),
		p = cur();
	if (!quitArmed) {
		quitArmed = true;
		b.textContent = "Tap again to fall";
		b.style.borderColor = "#ff8f6b";
		b.style.color = "#ff8f6b";
		quitT = setTimeout(resetQuitBtn, 3500);
		return;
	}
	if (quitT !== null) clearTimeout(quitT);
	resetQuitBtn();
	p.hp = 0;
	p.alive = false;
	p.held = null;
	logit("gave up");
	void save();
	if (checkAlive()) nextTurn();
	else redraw();
};
$("leave").onclick = () => {
	void save();
	show("menu");
};
