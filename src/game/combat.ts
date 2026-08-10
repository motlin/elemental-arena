/** Swinging a weapon: what it reaches, what it does on the way in, and what the damage lands on. */

import {logit, place, setTerrain, spend} from "./cards.js";
import {PAT, T, W, boon} from "./data/index.js";
import type {Offset} from "./data/index.js";
import {forgeOf, isComp, wCost, wHits, wRing, wepDmg, wepName} from "./lookups.js";
import {checkAlive} from "./match.js";
import {afterMove, canStand, settle} from "./movement.js";
import {saveSoon} from "./save.js";
import {PC, S, ally, cheb, cur, held, hidden, idx, inb, layFor, occupantsAt} from "./state.js";
import type {Player, WeaponSpec} from "./types.js";
import {markIrreversible} from "./undo.js";
import {redraw} from "./view.js";

export function attackTiles(p: Player, c: WeaponSpec): Offset[] {
	const out = new Set<string>();
	if (c.ids.some((id) => W[id]!.pat === "any")) {
		// a cannon reaches the whole arena
		for (let y = 0; y < S.dim; y++)
			for (let x = 0; x < S.dim; x++) if (x !== p.x || y !== p.y) out.add(x + "," + y);
	}
	c.ids.forEach((id) => {
		(W[id]!.pat === "any" ? [] : PAT[W[id]!.pat]!()).forEach(([dx, dy]) => {
			const x = p.x + dx,
				y = p.y + dy;
			if (inb(x, y)) out.add(x + "," + y);
		});
	});
	return [...out].map((k) => k.split(",").map(Number) as Offset);
}
export function liveTargets(p: Player, c: WeaponSpec): Offset[] {
	return attackTiles(p, c).filter(([x, y]) => occupantsAt(x, y).some((v) => v !== p && !ally(v, p) && !hidden(v)));
}
export function doAttack(tx: number, ty: number): void {
	const p = cur(),
		c = held(p);
	if (!c) return;
	const ring = wRing(c),
		hits = wHits(c);
	if (!ring && !attackTiles(p, c).some(([a, b]) => a === tx && b === ty)) return;
	if (!spend(wCost(c))) return;
	const tiles: Offset[] = ring ? attackTiles(p, c) : [[tx, ty]];
	const dmg = wepDmg(c);
	const struck: string[] = [];
	tiles.forEach(([x, y]) => {
		S.fx.push([idx(x, y), "struck"]);
		occupantsAt(x, y).forEach((v) => {
			if (v === p || ally(v, p)) return;
			if (hidden(v)) markIrreversible();
			struck.push(v.name);
			for (let h = 0; h < hits; h++) if (v.alive) hurt(v, dmg, p);
			applyOnHit(p, c, v, x, y);
		});
	});
	logit(
		`swung the ${wepName(c)} for ${dmg}${hits > 1 ? ` x${hits}` : ""}${
			struck.length ? `, hitting ${struck.join(" and ")}` : ", hitting nothing"
		}`,
	);
	p.hand = p.hand.filter((q) => q.uid !== c.uid);
	p.held = null;
	S.mode = null;
	redraw();
	checkAlive();
}
// which forged elements would leave ground behind, and which one you have chosen
const groundEls = (c: WeaponSpec): string[] => [...new Set(c.els.filter((e) => isComp(e) || e === "fire"))];
// ground under you and ground under them are separate squares, so each gets its own pick
export const selfEls = (c: WeaponSpec): string[] => groundEls(c).filter((e) => boon(e));
export const foeEls = (c: WeaponSpec): string[] => groundEls(c).filter((e) => !boon(e));
const pickFrom = (opts: string[], chosen: string | undefined): string | undefined =>
	chosen && opts.includes(chosen) ? chosen : opts[0];
export const leaveSelf = (c: WeaponSpec): string | undefined => pickFrom(selfEls(c), c.leaveSelf);
export const leaveFoe = (c: WeaponSpec): string | undefined => pickFrom(foeEls(c), c.leaveFoe);
function applyOnHit(p: Player, c: WeaponSpec, v: Player, x: number, y: number): void {
	layFor(p.i);
	const bite = wepDmg(c);
	const mine = leaveSelf(c),
		theirs = leaveFoe(c);
	c.els.forEach((e) => {
		if (forgeOf(e).steal) p.hp = Math.min(p.max, p.hp + Math.round(bite / 2));
		if (isComp(e)) {
			const wanted = boon(e) ? e === mine : e === theirs;
			if (wanted) {
				const sp = T[e]!.spread;
				T[e]!.spread = 0;
				// a gift belongs under your own feet, never under the person you just hit
				if (boon(e)) setTerrain(p.x, p.y, e);
				else setTerrain(x, y, e);
				if (sp === undefined) delete T[e]!.spread;
				else T[e]!.spread = sp;
			}
			return;
		}
		if (e === "fire" && e === theirs) place(x, y, "fire");
		if (forgeOf(e).dark) v.darkTurns = 2;
		if (forgeOf(e).freeze) v.rootTurns = 1;
		if (forgeOf(e).glow) v.litTurns = 2;
		if (forgeOf(e).drag && !anchored(v)) {
			const dx = Math.sign(p.x - v.x),
				dy = Math.sign(p.y - v.y);
			if ((dx || dy) && canStand(v.x + dx, v.y + dy)) {
				v.x += dx;
				v.y += dy;
				afterMove(v);
			}
		}
		if (e === "water") shove(v, p, 1);
		if (e === "air") shove(v, p, 3);
		if (e === "earth") v.drain = (v.drain || 0) + 2;
		if (e === "bolt") {
			const near = S.players.find(
				(q) => q.alive && q !== p && q !== v && !ally(q, p) && cheb(q.x, q.y, v.x, v.y) <= 2,
			);
			if (near) {
				hurt(near, Math.round(wepDmg(c) / 2), p);
			}
		}
	});
	layFor(null);
}
export function anchored(v: Player): boolean {
	const c = S.board[idx(v.x, v.y)]!;
	return !!(c.t && T[c.t]!.anchor);
}
function shove(v: Player, from: Player, n: number): void {
	if (anchored(v)) return;
	const sx = Math.sign(v.x - from.x) || 0,
		sy = Math.sign(v.y - from.y) || 0;
	if (!sx && !sy) return;
	for (let i = 0; i < n; i++) {
		if (!canStand(v.x + sx, v.y + sy)) break;
		v.x += sx;
		v.y += sy;
	}
	settle(v, sx, sy, 0);
	afterMove(v);
}
function safeSpot(): Offset | null {
	const bare: Offset[] = [],
		any: Offset[] = [];
	for (let y = 0; y < S.dim; y++)
		for (let x = 0; x < S.dim; x++) {
			if (!canStand(x, y)) continue;
			const c = S.board[idx(x, y)]!;
			if (c.t && T[c.t]!.gone) continue;
			(c.t ? any : bare).push([x, y]);
		}
	const pool = bare.length ? bare : any;
	return pool.length ? pool[(Math.random() * pool.length) | 0]! : null;
}
export function respawn(v: Player, team: number | null): void {
	v.hp = v.max;
	if (team != null) {
		v.team = team;
		v.c = PC[team]!;
	}
	const spot = safeSpot();
	if (spot) {
		v.x = spot[0];
		v.y = spot[1];
	}
	S.fx.push([idx(v.x, v.y), "bloom"]);
}
export const smashMult = () => (S.smash ? Math.pow(2, Math.floor(S.round / 5)) : 1);
export function hurt(v: Player, n: number, src: Player | null): void {
	n = Math.round(n * smashMult());
	if (!v.alive) return;
	v.hp -= n;
	S.matchCoins += n;
	S.coins += n;
	saveSoon();
	if (v.hp <= 0) {
		markIrreversible();
		S.matchCoins += 40;
		S.coins += 40;
		if (S.paint) {
			const cell = S.board[idx(v.x, v.y)]!;
			const owner = src || (cell.by == null ? null : S.players[cell.by]!);
			const flip = owner && owner !== v && owner.alive && !ally(owner, v);
			respawn(v, flip ? owner.team : null);
			logit(
				flip
					? `${v.name} was splattered and now fights for ${owner.name}`
					: `${v.name} was splattered and respawned`,
				owner || v,
			);
			return;
		}
		v.hp = 0;
		v.alive = false;
		logit(`${v.name} fell`, src || v);
	}
}
export function startAttack(): void {
	const p = cur(),
		c = held(p);
	if (!c || p.nrg < wCost(c)) return;
	if (S.mode === "attack") {
		S.mode = null;
		redraw();
		return;
	}
	S.sel = null;
	if (wRing(c)) {
		doAttack(p.x, p.y);
		return;
	}
	S.mode = "attack";
	redraw();
}
