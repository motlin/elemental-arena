/**
 * Every way a fighter changes square: walking, the footwork that skips over ground, what the ground
 * does to whoever lands on it, and how far anyone can reach.
 */

import {cardLabel, claim, logit, sealed, spend} from "./cards.js";
import {anchored, hurt, respawn} from "./combat.js";
import {COST, DIR8, T} from "./data/index.js";
import type {ActionKey, Offset} from "./data/index.js";
import {checkAlive, nextTurn} from "./match.js";
import {saveSoon} from "./save.js";
import {S, ally, cur, hidden, idx, inb, layFor, occupant, occupantsAt, putTerrain} from "./state.js";
import type {Card, Player, WepCard} from "./types.js";
import {redraw} from "./view.js";

export function canStand(x: number, y: number): boolean {
	if (!inb(x, y)) return false;
	const c = S.board[idx(x, y)]!;
	return !(c.t && T[c.t]!.solid); // fighters share squares, walls do not
}
const emptySquare = (x: number, y: number): boolean => canStand(x, y) && !occupantsAt(x, y).length;
export function canEnter(x: number, y: number, p: Player | null): boolean {
	if (!inb(x, y) || occupant(x, y)) return false;
	if (p?.float) return true; // drifting over the top of everything
	const c = S.board[idx(x, y)]!;
	return !(c.t && T[c.t]!.solid);
}
function shiftAll(dx: number, dy: number): void {
	const list = S.players.filter((p) => p.alive);
	// whoever is nearest the destination edge settles first, so nobody jumps the queue
	list.sort((a, b) => b.x * dx + b.y * dy - (a.x * dx + a.y * dy));
	list.forEach((p) => {
		if (!p.alive || anchored(p)) return;
		let n = 0,
			fell = false;
		while (canStand(p.x + dx, p.y + dy) && n < S.dim) {
			p.x += dx;
			p.y += dy;
			n++;
			const c = S.board[idx(p.x, p.y)]!;
			if (c.t && T[c.t]!.gone) {
				afterMove(p);
				fell = true;
				break;
			} // you slide into it, not over it
		}
		if (n && !fell) afterMove(p);
	});
}
export function doShift(dx: number, dy: number): void {
	const p = cur();
	if (!(p.mv & 1024) || p.used.shift >= S.mvUses) return;
	if (!spend(COST.shift)) return;
	p.used.shift++;
	const dir = dx > 0 ? "right" : dx < 0 ? "left" : dy > 0 ? "down" : "up";
	shiftAll(dx, dy);
	logit(`shifted everyone ${dir}`);
	S.mode = null;
	redraw();
	checkAlive();
}
function hopTargets(p: Player, dist: number): Offset[] {
	const out: Offset[] = [];
	for (let dy = -dist; dy <= dist; dy++)
		for (let dx = -dist; dx <= dist; dx++) {
			if (Math.max(Math.abs(dx), Math.abs(dy)) !== dist) continue;
			const x = p.x + dx,
				y = p.y + dy;
			if (inb(x, y) && canStand(x, y)) out.push([x, y]);
		}
	return out;
}
export const jumpTargets = (p: Player): Offset[] => hopTargets(p, 2);
export const leapTargets = (p: Player): Offset[] => hopTargets(p, 4);
export function dashTargets(p: Player): Offset[] {
	const out: Offset[] = [];
	DIR8.forEach(([dx, dy]) => {
		for (let r = 1; r <= 3; r++) {
			const x = p.x + dx * r,
				y = p.y + dy * r;
			if (!inb(x, y)) break;
			if (!canStand(x, y)) break; // a wall or a body stops the run
			if (r >= 2) out.push([x, y]);
		}
	});
	return out;
}
export function doJump(x: number, y: number): void {
	const p = cur();
	if (p.rootTurns > 0) return;
	if (!(p.mv & 1) || p.used.jump >= S.mvUses) return;
	if (!jumpTargets(p).some(([a, b]) => a === x && b === y)) return;
	if (!spend(COST.jump)) return;
	p.used.jump++;
	const ox = p.x,
		oy = p.y;
	p.x = x;
	p.y = y;
	S.mode = null;
	layTrail(p, ox, oy);
	afterMove(p);
	logit(`jumped from ${ox + 1},${oy + 1} to ${p.x + 1},${p.y + 1}`);
	redraw();
	if (!p.alive && checkAlive()) nextTurn();
}
function sweepTiles(p: Player, r: number): Offset[] {
	const out: Offset[] = [];
	for (let dy = -r; dy <= r; dy++)
		for (let dx = -r; dx <= r; dx++) {
			if (!dx && !dy) continue;
			const x = p.x + dx,
				y = p.y + dy;
			if (inb(x, y) && !sealed(x, y) && S.board[idx(x, y)]!.t) out.push([x, y]);
		}
	return out;
}
export const spinTiles = (p: Player): Offset[] => sweepTiles(p, 1);
export const wipeTiles = (p: Player): Offset[] => sweepTiles(p, 3);
function doSweep(bit: number, key: ActionKey, r: number, cost: number): void {
	const p = cur();
	if (!(p.mv & bit) || p.used[key] >= S.mvUses) return;
	const hit = sweepTiles(p, r);
	if (!hit.length || !spend(cost)) return;
	p.used[key]++;
	hit.forEach(([x, y]) => {
		const c = S.board[idx(x, y)]!;
		c.t = null;
		c.el = null;
		c.life = 0;
		c.wid = 0;
		c.by = null;
		S.fx.push([idx(x, y), "bloom"]);
	});
	S.mode = null;
	redraw();
}
export const doSpin = (): void => {
	doSweep(16, "spin", 1, COST.spin);
};
export const doWipe = (): void => {
	doSweep(32, "wipe", 3, COST.wipe);
};
export function spreadTargets(): Offset[] {
	const out: Offset[] = [];
	S.board.forEach((c, i) => {
		if (c.t && !T[c.t]!.dead) out.push([i % S.dim, (i / S.dim) | 0]);
	});
	return out;
}
export function doTrail(): void {
	const p = cur();
	if (!(p.mv & 512) || p.used.trail >= S.mvUses || p.trail) return;
	const c = S.board[idx(p.x, p.y)]!;
	if (!c.t || T[c.t]!.dead) return;
	if (!spend(COST.trail)) return;
	p.used.trail++;
	p.trail = c.t;
	redraw();
}
function layTrail(p: Player, x: number, y: number): void {
	if (!p.trail || !inb(x, y) || sealed(x, y)) return;
	const c = S.board[idx(x, y)]!;
	layFor(p.i);
	putTerrain(c, p.trail);
	layFor(null);
	if (p.trail === "whirl") c.wid = S.wid++;
	S.fx.push([idx(x, y), "bloom"]);
	claim(x, y);
}
export function doSpread(x: number, y: number): void {
	const p = cur();
	if (!(p.mv & 256) || p.used.spread >= S.mvUses) return;
	if (!spreadTargets().some(([a, b]) => a === x && b === y)) return;
	const k = S.board[idx(x, y)]!.t;
	if (!k || !spend(COST.spread)) return;
	p.used.spread++;
	layFor(p.i);
	for (let dy = -2; dy <= 2; dy++)
		for (let dx = -2; dx <= 2; dx++) {
			const nx = x + dx,
				ny = y + dy;
			if (!inb(nx, ny) || sealed(nx, ny)) continue;
			const c = S.board[idx(nx, ny)]!;
			putTerrain(c, k);
			if (k === "whirl") c.wid = S.wid++;
			S.fx.push([idx(nx, ny), "bloom"]);
			claim(nx, ny);
		}
	layFor(null);
	S.mode = null;
	redraw();
	checkAlive();
}
export function smashable(p: Player): boolean {
	return p.hand.length > 1 && p.hand.some((c) => c.k === "w");
}
export function doSmash(): void {
	const p = cur();
	if (!(p.mv & 2048) || p.used.smash >= S.mvUses) return;
	if (!smashable(p) || !spend(COST.smash)) return;
	p.used.smash++;
	const ids: string[] = [],
		els: string[] = [];
	p.hand.forEach((c) => {
		if (c.k === "w") {
			ids.push(...c.ids);
			els.push(...c.els);
		} else els.push(c.id);
	});
	const made: WepCard = {uid: S.uid++, k: "w", ids, els};
	p.hand = [made];
	p.held = made.uid;
	S.sel = null;
	S.mode = null;
	redraw();
}
export function doUltra(): void {
	const p = cur();
	if (!(p.mv & 128) || p.used.ultra >= S.mvUses) return;
	const dirty: number[] = [];
	S.board.forEach((c, i) => {
		if (c.t) dirty.push(i);
	});
	if (!dirty.length || !spend(COST.ultra)) return;
	p.used.ultra++;
	dirty.forEach((i) => {
		const c = S.board[i]!;
		c.t = null;
		c.el = null;
		c.life = 0;
		c.wid = 0;
		c.by = null;
		S.fx.push([i, "bloom"]);
	});
	S.mode = null;
	redraw();
}
export function warpTargets(p: Player): Offset[] {
	const out: Offset[] = [];
	for (let y = 0; y < S.dim; y++)
		for (let x = 0; x < S.dim; x++) {
			if (x === p.x && y === p.y) continue;
			if (S.board[idx(x, y)]!.t) continue; // bare ground only
			if (occupantsAt(x, y).length) continue;
			out.push([x, y]);
		}
	return out;
}
export const seenBy = (c: Card): boolean => !!c.mark; // a marked card is face up to every rival, never to its owner
export function lightTargets(): Offset[] {
	const p = cur();
	return S.players.filter((q) => q.alive && q !== p && !q.lit && !hidden(q)).map((q) => [q.x, q.y]);
}
export function doLight(x: number, y: number): void {
	const p = cur();
	if (!(p.mv & 32768) || p.used.light >= S.mvUses) return;
	const v = occupantsAt(x, y).find((q) => q !== p && !q.lit && !hidden(q));
	if (!v || !spend(COST.light)) return;
	p.used.light++;
	v.lit = true;
	logit(`lit up ${v.name}. They cannot hide again`);
	S.mode = null;
	redraw();
}
export function markTargets(): Offset[] {
	const p = cur();
	return S.players
		.filter((q) => q.alive && q !== p && !hidden(q) && q.hand.some((c) => !seenBy(c)))
		.map((q) => [q.x, q.y]);
}
export function doMark(x: number, y: number): void {
	const p = cur();
	if (!(p.mv & 16384) || p.used.mark >= S.mvUses) return;
	const v = occupant(x, y);
	if (!v || v === p || hidden(v)) return;
	const blind = v.hand.filter((c) => !seenBy(c));
	if (!blind.length || !spend(COST.mark)) return;
	p.used.mark++;
	const card = blind[(Math.random() * blind.length) | 0]!;
	card.mark = true;
	logit(`marked ${cardLabel(card)} in ${v.name}'s hand`);
	S.mode = null;
	redraw();
}
export function theftTargets(): Offset[] {
	const p = cur();
	return S.players.filter((q) => q.alive && q !== p && q.hand.length > 0 && !hidden(q)).map((q) => [q.x, q.y]);
}
export function swapTargets(): Offset[] {
	const p = cur();
	return S.players.filter((q) => q.alive && q !== p && !hidden(q)).map((q) => [q.x, q.y]);
}
export function doSwap(x: number, y: number): void {
	const p = cur();
	if (p.rootTurns > 0) return;
	if (!(p.mv & 8192) || p.used.swap >= S.mvUses) return;
	const v = occupant(x, y);
	if (!v || v === p) return;
	if (!spend(COST.swap)) return;
	p.used.swap++;
	const ox = p.x,
		oy = p.y;
	p.x = v.x;
	p.y = v.y;
	v.x = ox;
	v.y = oy;
	S.fx.push([idx(p.x, p.y), "bloom"]);
	S.fx.push([idx(v.x, v.y), "bloom"]);
	logit(`swapped places with ${v.name}`);
	layTrail(p, ox, oy);
	afterMove(p);
	if (v.alive) afterMove(v);
	S.mode = null;
	redraw();
	if (!checkAlive()) return;
	if (!p.alive) nextTurn();
}
export function doTheft(x: number, y: number): void {
	const p = cur();
	if (!(p.mv & 4096) || p.used.theft >= S.mvUses) return;
	const v = occupant(x, y);
	if (!v || v === p || !v.hand.length) return;
	S.steal = v.i;
	S.mode = null;
	redraw();
}
export function takeCard(v: Player, uid: number): void {
	const p = cur();
	if (!spend(COST.theft)) return;
	p.used.theft++;
	const at = v.hand.findIndex((c) => c.uid === uid);
	if (at < 0) {
		p.nrg += COST.theft;
		p.used.theft--;
		return;
	}
	const wasSeen = seenBy(v.hand[at]!);
	const [card] = v.hand.splice(at, 1);
	if (card === undefined) return;
	if (v.held === card.uid) v.held = null;
	card.mark = false;
	p.hand.push(card);
	logit(`stole ${cardLabel(card)} from ${v.name}${wasSeen ? ", a card they had marked" : ", taken face down"}`);
	S.fx.push([idx(v.x, v.y), "struck"]);
	S.steal = null;
	S.mode = null;
	redraw();
}
export function doWarp(x: number, y: number): void {
	const p = cur();
	if (p.rootTurns > 0) return;
	if (!(p.mv & 64) || p.used.warp >= S.mvUses) return;
	if (!warpTargets(p).some(([a, b]) => a === x && b === y)) return;
	if (!spend(COST.warp)) return;
	p.used.warp++;
	const ox = p.x,
		oy = p.y;
	S.fx.push([idx(p.x, p.y), "bloom"]);
	p.x = x;
	p.y = y;
	S.mode = null;
	layTrail(p, ox, oy);
	S.fx.push([idx(x, y), "bloom"]);
	afterMove(p);
	logit(`warped from ${ox + 1},${oy + 1} to ${p.x + 1},${p.y + 1}`);
	redraw();
	if (!p.alive && checkAlive()) nextTurn();
}
export function doFloat(): void {
	const p = cur();
	if (!(p.mv & 8) || p.used.float >= S.mvUses || p.float) return;
	if (!spend(COST.float)) return;
	p.used.float++;
	p.float = true;
	S.mode = null;
	redraw();
}
export function doLeap(x: number, y: number): void {
	const p = cur();
	if (p.rootTurns > 0) return;
	if (!(p.mv & 4) || p.used.leap >= S.mvUses) return;
	if (!leapTargets(p).some(([a, b]) => a === x && b === y)) return;
	if (!spend(COST.leap)) return;
	p.used.leap++;
	const ox = p.x,
		oy = p.y;
	p.x = x;
	p.y = y;
	S.mode = null;
	layTrail(p, ox, oy);
	afterMove(p);
	logit(`leapt from ${ox + 1},${oy + 1} to ${p.x + 1},${p.y + 1}`);
	redraw();
	if (!p.alive && checkAlive()) nextTurn();
}
export function doDash(x: number, y: number): void {
	const p = cur();
	if (p.rootTurns > 0) return;
	if (!(p.mv & 2) || p.used.dash >= S.mvUses) return;
	if (!dashTargets(p).some(([a, b]) => a === x && b === y)) return;
	if (!spend(COST.dash)) return;
	p.used.dash++;
	const dx = Math.sign(x - p.x),
		dy = Math.sign(y - p.y),
		ox = p.x,
		oy = p.y;
	p.x = x;
	p.y = y;
	S.mode = null;
	layTrail(p, ox, oy);
	afterMove(p);
	if (p.alive) settle(p, dx, dy, 0);
	if (p.alive) afterMove(p);
	logit(`dashed from ${ox + 1},${oy + 1} to ${p.x + 1},${p.y + 1}`);
	redraw();
	if (!p.alive && checkAlive()) nextTurn();
}
export function tryStep(x: number, y: number): void {
	if (S.phase !== "act") return;
	const p = cur();
	if (p.rootTurns > 0) return;
	if (!canEnter(x, y, p)) return;
	const c = S.board[idx(x, y)]!;
	const cost = p.float ? 1 : c.t ? T[c.t]!.enter : 1;
	if (cost > 50 || p.nrg < cost) return;
	const dx = x - p.x,
		dy = y - p.y,
		ox = p.x,
		oy = p.y;
	p.x = x;
	p.y = y;
	p.nrg -= cost;
	layTrail(p, ox, oy);
	if (!p.float) {
		settle(p, dx, dy, 0);
		afterMove(p);
	}
	logit(
		p.x !== x || p.y !== y
			? `moved from ${ox + 1},${oy + 1} and was carried on to ${p.x + 1},${p.y + 1}`
			: `moved from ${ox + 1},${oy + 1} to ${x + 1},${y + 1}`,
	);
	redraw();
	if (!p.alive && checkAlive()) nextTurn();
}
export function voidOut(p: Player): void {
	if (!p.alive) return;
	S.matchCoins += 40;
	S.coins += 40;
	saveSoon();
	S.fx.push([idx(p.x, p.y), "bloom"]);
	if (S.paint) {
		const cell = S.board[idx(p.x, p.y)]!;
		const owner = cell.by == null ? null : S.players[cell.by]!;
		const flip = owner && owner !== p && owner.alive && !ally(owner, p);
		respawn(p, flip ? owner.team : null);
		logit(
			flip ? `${p.name} was swallowed and now fights for ${owner.name}` : `${p.name} was swallowed and respawned`,
			owner || p,
		);
		return;
	}
	p.hp = 0;
	p.alive = false;
	logit(`${p.name} was swallowed by the ground`, p);
}
export function afterMove(p: Player): void {
	if (!p.alive) return;
	const c = S.board[idx(p.x, p.y)]!;
	if (!c.t) return;
	const d = T[c.t]!;
	if (d.gone) {
		voidOut(p);
		return;
	}
	if (d.root) p.rootTurns = 1;
	if (d.bite) hurt(p, d.bite, null);
	if (d.brittle) {
		c.t = null;
		c.el = null;
		c.life = 0;
		c.by = null;
		S.fx.push([idx(p.x, p.y), "bloom"]);
	}
}
function openTiles(): Offset[] {
	const out: Offset[] = [];
	for (let y = 0; y < S.dim; y++) for (let x = 0; x < S.dim; x++) if (emptySquare(x, y)) out.push([x, y]);
	return out;
}
export function settle(p: Player, dx: number, dy: number, depth: number): void {
	if (depth > 14 || !p.alive) return;
	const c = S.board[idx(p.x, p.y)]!;
	if (!c.t) return;
	const d = T[c.t]!;
	if (d.gone) {
		voidOut(p);
		return;
	}
	if (d.scatter) {
		const open = openTiles();
		if (open.length) {
			const [nx, ny] = open[(Math.random() * open.length) | 0]!;
			p.x = nx;
			p.y = ny;
			afterMove(p);
		}
		return;
	}
	if (d.warp) {
		const twin = whirlTwin(idx(p.x, p.y));
		if (twin >= 0) {
			const tx = twin % S.dim,
				ty = (twin / S.dim) | 0;
			if (!occupant(tx, ty)) {
				p.x = tx;
				p.y = ty;
				afterMove(p);
			}
		}
		return;
	}
	if (d.flow && (dx || dy)) {
		const nx = p.x + dx,
			ny = p.y + dy;
		if (!canStand(nx, ny)) return;
		p.x = nx;
		p.y = ny;
		settle(p, dx, dy, depth + 1);
	}
}
export function whirlList(): Offset[] {
	const all: Offset[] = [];
	S.board.forEach((c, j) => {
		if (c.t === "whirl") all.push([c.wid, j]);
	});
	all.sort((a, b) => a[0] - b[0]);
	return all;
}
function whirlTwin(i: number): number {
	const all = whirlList(),
		pos = all.findIndex((a) => a[1] === i);
	if (pos < 0) return -1;
	const partner = pos % 2 === 0 ? pos + 1 : pos - 1;
	return all[partner] ? all[partner][1] : -1;
}
export function moveBudget(p: Player): number {
	return p === cur() ? p.nrg : p.bank + S.startNrg + S.round;
}
function reachable(p: Player, budget: number): Map<number, number> {
	const dist = new Map<number, number>([[idx(p.x, p.y), 0]]);
	let frontier: [number, number, number][] = [[p.x, p.y, 0]];
	while (frontier.length) {
		frontier.sort((a, b) => a[2] - b[2]);
		const [x, y, d] = frontier.shift()!;
		if (d > (dist.get(idx(x, y)) ?? Infinity)) continue;
		for (const [dx, dy] of DIR8) {
			const nx = x + dx,
				ny = y + dy;
			if (!inb(nx, ny)) continue;
			const c = S.board[idx(nx, ny)]!;
			if (c.t && T[c.t]!.solid) continue;
			const step = c.t ? T[c.t]!.enter : 1;
			if (step > 50) continue;
			const nd = d + step;
			if (nd > budget) continue;
			const key = idx(nx, ny);
			if ((dist.get(key) ?? Infinity) <= nd) continue;
			dist.set(key, nd);
			frontier.push([nx, ny, nd]);
		}
	}
	dist.delete(idx(p.x, p.y));
	return dist;
}
export function reachMap(): Map<number, Player[]> {
	const out = new Map<number, Player[]>();
	S.players.forEach((p) => {
		if (!p.alive || !S.reach.includes(p.i)) return;
		reachable(p, moveBudget(p)).forEach((_cost, key) => {
			if (!out.has(key)) out.set(key, []);
			out.get(key)!.push(p);
		});
	});
	return out;
}
