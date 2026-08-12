/** Playing a card: laying ground with it, mixing two into one, tossing one, and who owns the result. */

import {CFORGE, COST, EL, FUSE, T, fkey} from "./data/index.js";
import type {Offset} from "./data/index.js";
import {elName, isComp, wepName} from "./lookups.js";
import {checkAlive} from "./match.js";
import {afterMove, voidOut} from "./movement.js";
import {save} from "./save.js";
import {S, cheb, cur, held, idx, inb, layFor, layingFor, occupant, occupantsAt, putTerrain, selCard} from "./state.js";
import type {Card, LogEntry, Player} from "./types.js";
import {markIrreversible, pushUndo} from "./undo.js";
import {redraw, redrawCodex} from "./view.js";

export const cardLabel = (c: Card): string => (c.k === "el" ? elName(c.id) : wepName(c));
function snapshot(entry: LogEntry): void {
	S.frames.push({
		...entry,
		turn: S.turn,
		board: S.board.map((c) => c.t),
		players: S.players.map((q) => ({
			name: q.name,
			c: q.c,
			team: q.team,
			x: q.x,
			y: q.y,
			hp: q.hp,
			max: q.max,
			alive: q.alive,
			hand: q.hand.map(cardLabel),
			held: q.held,
		})),
	});
}
export function logit(t: string, who?: Player | null, say?: boolean): void {
	const p = who === undefined ? S.players[S.turn]! || null : who;
	const entry = {r: S.round, who: p ? p.name : "", c: p ? p.c : "var(--muted)", t, say: !!say};
	S.log.push(entry);
	snapshot(entry);
}
export function spend(n: number): boolean {
	const p = cur();
	if (p.nrg < n) return false;
	pushUndo();
	p.nrg -= n;
	return true;
}
function mixable(c: Card | null): boolean {
	return !!c && c.k === "el" && !isComp(c.id);
}
function mixSource(p: Player): Card | null {
	return p.hand.find((q) => q.uid === S.mixFrom) || null;
}
function canPair(a: Card | null, b: Card | null): boolean {
	if (!a || !b || a.uid === b.uid) return false;
	if (a.k === "w" || b.k === "w") return true;
	return mixable(a) && mixable(b) && !!FUSE[fkey(a.id, b.id)];
}
export function mixPartners(p: Player, a?: Card | null): Card[] {
	a = a || mixSource(p) || selCard(p) || held(p);
	if (!a) return [];
	return p.hand.filter((q) => canPair(a, q));
}
export function startMix(uid: number): void {
	S.mixFrom = uid;
	S.mode = "mix";
	redraw();
}
function doMix(u2: number): void {
	const p = cur(),
		a = mixSource(p),
		b = p.hand.find((q) => q.uid === u2);
	if (!a || !b || a.uid === b.uid) return;
	// the result takes the slot the mix started from, so the hand keeps its order
	const ia = p.hand.indexOf(a),
		ib = p.hand.indexOf(b);
	const slot = ib < ia ? ia - 1 : ia;
	if (!canPair(a, b)) return;
	let made: Card | null = null;
	if (a.k === "el" && b.k === "el") {
		const res = FUSE[fkey(a.id, b.id)];
		if (!res || !spend(COST.merge)) return;
		made = {uid: S.uid++, k: "el", id: res};
		if (!S.codex[res]) {
			markIrreversible();
			S.codex[res] = 1;
			void save();
			redrawCodex();
		}
	} else if (a.k === "w" && b.k === "w") {
		if (!spend(COST.merge)) return;
		made = {uid: S.uid++, k: "w", ids: [...a.ids, ...b.ids], els: [...a.els, ...b.els]};
	} else {
		const el = a.k === "el" ? a : b.k === "el" ? b : null,
			w = a.k === "w" ? a : b.k === "w" ? b : null;
		if (!el || !w) return;
		if (!spend(COST.merge)) return;
		made = {uid: S.uid++, k: "w", ids: [...w.ids], els: [...w.els, el.id]};
	}
	const cardName = (c: Card): string => (c.k === "el" ? elName(c.id) : wepName(c));
	if (!made) return;
	logit(`merged ${cardName(a)} with ${cardName(b)} into ${cardName(made)}`);
	p.hand = p.hand.filter((q) => q.uid !== a.uid && q.uid !== b.uid);
	p.hand.splice(Math.max(0, Math.min(slot, p.hand.length)), 0, made);
	if (made.k === "w") p.held = made.uid;
	S.sel = null;
	S.mixFrom = null;
	S.mode = null;
	redraw();
}
export function doToss(uid: number): void {
	const p = cur();
	const c = p.hand.find((q) => q.uid === uid);
	pushUndo();
	if (c) logit(`threw away ${c.k === "el" ? elName(c.id) : wepName(c)}`);
	p.hand = p.hand.filter((q) => q.uid !== uid);
	if (p.held === uid) p.held = null;
	if (S.sel === uid) S.sel = null;
	S.toss = false;
	S.tossPick = null;
	S.mode = null;
	redraw();
}
/**
 * Moves a card in the hand to where a drag let go of it. `to` counts the cards the dragged one left
 * behind, which is where it lands among them, so it is read against the hand with that card already
 * lifted out rather than against the hand as it stood. Hand order is the arena's own business and
 * not the screen's: it travels in the snapshot, and it is what the keyboard numbers the cards by.
 */
export function moveCard(uid: number, to: number): void {
	const p = cur();
	const from = p.hand.findIndex((q) => q.uid === uid);
	if (from < 0 || to < 0 || to >= p.hand.length) return;
	const c = p.hand[from]!;
	p.hand.splice(from, 1);
	p.hand.splice(to, 0, c);
	redraw();
}
export function clickCard(uid: number): void {
	if (S.phase !== "act") return;
	const p = cur(),
		c = p.hand.find((q) => q.uid === uid);
	if (!c) return;
	if (S.toss) {
		if (S.tossPick !== uid) {
			S.tossPick = uid;
			redraw();
			return;
		} // first tap picks, second confirms
		doToss(uid);
		return;
	}
	if (S.mode === "mix" && mixPartners(p).some((q) => q.uid === uid)) {
		doMix(uid);
		return;
	}
	if (c.k === "w") {
		p.held = p.held === uid ? null : uid;
		S.sel = null;
		S.mode = null;
	} else {
		S.sel = S.sel === uid ? null : uid;
		S.mode = null;
	}
	redraw();
}
export function doPlace(x: number, y: number): void {
	const p = cur(),
		c = selCard(p);
	if (!c) return;
	const d = cheb(p.x, p.y, x, y);
	if (d === 0 || d > 4 || sealed(x, y) || badPlace(c.id, x, y)) return;
	if (!spend(COST.place)) return;
	const before = S.board[idx(x, y)]!.t;
	layFor(p.i);
	place(x, y, c.id);
	layFor(null);
	const after = S.board[idx(x, y)]!.t;
	logit(
		before && after !== before
			? `laid ${elName(c.id)} on ${T[before]!.n} at ${x + 1},${y + 1}, making ${T[after!]!.n}`
			: `laid ${elName(c.id)} at ${x + 1},${y + 1}`,
	);
	p.hand = p.hand.filter((q) => q.uid !== c.uid);
	S.sel = null;
	S.mode = null;
	redraw();
	checkAlive();
}
// a raw element that kills on contact cannot be dropped straight onto somebody
export const lethalRaw = (k: string): boolean => !!(EL[k] && T[EL[k].t]?.gone);
export function badPlace(el: string, x: number, y: number): boolean {
	return lethalRaw(el) && !!occupant(x, y);
}
export function sealed(x: number, y: number): boolean {
	const c = S.board[idx(x, y)]!;
	return !!(c.t && T[c.t]!.dead);
}
// the ground opening under you throws you clear; walking in is what kills
function evict(v: Player): boolean {
	for (let r = 1; r <= Math.max(S.dim, 4); r++) {
		const ring: Offset[] = [];
		for (let dy = -r; dy <= r; dy++)
			for (let dx = -r; dx <= r; dx++) {
				if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
				const nx = v.x + dx,
					ny = v.y + dy;
				if (!inb(nx, ny) || occupantsAt(nx, ny).length) continue;
				const c = S.board[idx(nx, ny)]!;
				if (c.t && (T[c.t]!.gone || T[c.t]!.solid)) continue;
				ring.push([nx, ny]);
			}
		if (ring.length) {
			markIrreversible();
			const [nx, ny] = ring[(Math.random() * ring.length) | 0]!;
			const ox = v.x,
				oy = v.y;
			v.x = nx;
			v.y = ny;
			S.fx.push([idx(nx, ny), "bloom"]);
			logit(`${v.name} scrambled clear of the hole at ${ox + 1},${oy + 1}`, v);
			afterMove(v);
			return true;
		}
	}
	return false; // nowhere left to stand
}
export function claim(x: number, y: number): void {
	const c = S.board[idx(x, y)]!;
	if (!c.t || !T[c.t]!.gone) return;
	occupantsAt(x, y).forEach((v) => {
		if (v.alive && !evict(v)) voidOut(v);
	});
}
export function setTerrain(x: number, y: number, k: string): void {
	const r = T[k]!.spread || 0;
	for (let dy = -r; dy <= r; dy++)
		for (let dx = -r; dx <= r; dx++) {
			const nx = x + dx,
				ny = y + dy;
			if (!inb(nx, ny) || sealed(nx, ny)) continue;
			const c = S.board[idx(nx, ny)]!;
			putTerrain(c, k);
			if (k === "whirl") c.wid = S.wid++;
			S.fx.push([idx(nx, ny), "bloom"]);
			claim(nx, ny);
		}
	if (!S.codex[k] && CFORGE[k]) {
		markIrreversible();
		S.codex[k] = 1;
		void save();
		redrawCodex();
	}
}
export function place(x: number, y: number, el: string): void {
	if (sealed(x, y)) return;
	if (isComp(el)) {
		setTerrain(x, y, el);
		return;
	}
	const c = S.board[idx(x, y)]!;
	if (c.el) {
		const nk = FUSE[fkey(c.el, el)];
		if (nk) {
			setTerrain(x, y, nk);
			return;
		}
		c.el = el;
		c.t = EL[el]!.t;
		c.life = T[c.t]!.life;
		c.by = layingFor();
	} else {
		c.el = el;
		c.t = EL[el]!.t;
		c.life = T[c.t]!.life;
		c.by = layingFor();
	}
	S.fx.push([idx(x, y), "bloom"]);
	claim(x, y);
}
