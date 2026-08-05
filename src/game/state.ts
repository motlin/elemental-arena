/**
 * The live game and the small vocabulary every other module reads it through: which square is which,
 * whose turn it is, who can see whom, and how ground gets written.
 */

import {BASE, ELBYT, T, WBASE} from "./data/index.js";
import type {Cell, ElCard, GameEl, GameState, Player, WepCard} from "./types.js";
import {redrawMenu} from "./view.js";

/** The element an event came from, which the handlers read values and `data-` attributes off. */
export const src = (e: Event): GameEl => e.target as GameEl;
/** Seat colours, the names that go with them, and the shorter names the swatches are labelled with. */
export const PC = ["#ff4d8d", "#4dd8ff", "#b8ff4d", "#c98cff", "#ff9a4d", "#4dffb0", "#f2ecd8", "#6d7fff"];
export const PN = ["Vermilion", "Cyan", "Verdant", "Amethyst", "Amber", "Jade", "Bone", "Indigo"];
export const PCN = ["Rose", "Sky", "Lime", "Violet", "Amber", "Jade", "Bone", "Indigo"];
export const CHAOS = 1; // default only; the live value is S.chaosRound
export const MVUSES = 3; // default only; the live value is S.mvUses
export const S: GameState = {
	dim: 9,
	np: 2,
	hp: 60,
	startNrg: 2,
	openHand: 3,
	players: [],
	board: [],
	turn: 0,
	round: 1,
	phase: "act",
	names: ["", "", "", "", "", "", "", ""],
	cols: [0, 1, 2, 3, 4, 5, 6, 7],
	mv: [0, 0, 0, 0, 0, 0, 0, 0],
	munlocked: [],
	mvShared: 0,
	priv: true,
	smash: false,
	mvUses: MVUSES,
	paint: false,
	chaos: false,
	chaosRound: CHAOS,
	handoff: false,
	theme: "night",
	screen: "menu",
	saveErr: null,
	loadErr: null,
	cheat: 0,
	tries: 0,
	mixFrom: null,
	steal: null,
	warn: null,
	toss: false,
	tossPick: null,
	chat: [],
	cid: 1,
	replyTo: null,
	log: [],
	frames: [],
	rvi: 0,
	preset: null,
	presetDim: 0,
	btool: "fire",
	look: null,
	imode: false,
	reach: [],
	sel: null,
	mode: null,
	wid: 1,
	uid: 1,
	fx: [],
	coins: 0,
	unlocked: [...BASE],
	wunlocked: [...WBASE],
	elOff: [],
	wOff: [],
	pOff: {},
	who: "all",
	codex: {},
	matchCoins: 0,
};
export const $ = (id: string): GameEl => document.getElementById(id) as GameEl;
export const idx = (x: number, y: number): number => y * S.dim + x;
export const inb = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < S.dim && y < S.dim;
export const cheb = (a: number, b: number, c: number, d: number): number => Math.max(Math.abs(a - c), Math.abs(b - d));
export const cur = (): Player => S.players[S.turn]!;
export const ally = (a: Player | null, b: Player | null): boolean => !!a && !!b && a.team === b.team;
export const teamsAlive = (): number[] => [...new Set(S.players.filter((p) => p.alive).map((p) => p.team))];
// a team of nobody still needs a word for itself, which is what the very last match log line uses
export const teamName = (t: number | null): string =>
	t === null ? "Team" : (S.names[t]! || "").trim() || PN[t]! || "Team";
export const nameOf = (i: number): string => teamName(S.cols[i]!);
export const occupantsAt = (x: number, y: number): Player[] =>
	S.players.filter((q) => q.alive && q.x === x && q.y === y);
// a concealed fighter blocks nothing and can be walked on top of
export function occupant(x: number, y: number): Player | null {
	return occupantsAt(x, y).find((q) => !hidden(q)) || null;
}
export function blind(p: Player): boolean {
	const c = S.board[idx(p.x, p.y)]!;
	return !!(p.darkTurns > 0 || (c.t && T[c.t]!.los));
}
export function hidden(q: Player): boolean {
	if (q.lit || q.litTurns > 0) return false; // a glare beats any cover
	const c = S.board[idx(q.x, q.y)]!;
	if (!(c.t && T[c.t]!.hide)) return false;
	// shining ground nearby strips the concealment
	for (let i = 0; i < S.board.length; i++) {
		const b = S.board[i]!;
		if (!b.t || !T[b.t]!.reveal) continue;
		if (cheb(q.x, q.y, i % S.dim, (i / S.dim) | 0) <= T[b.t]!.reveal!) return false;
	}
	return true;
}
export const isLit = (x: number, y: number): boolean => occupantsAt(x, y).some((q) => q.lit);
// hiding ground conceals itself too: only the fighter who laid it, or one standing on it, sees it
export function seesTile(p: Player, x: number, y: number): boolean {
	const c = S.board[idx(x, y)]!;
	if (!c.t || !T[c.t]!.hide) return true;
	if (isLit(x, y)) return true; // their ground is exposed with them
	if (p.x === x && p.y === y) return true; // you are standing on it
	// the moment it is concealing somebody it reads as empty ground, even to whoever laid it
	if (occupantsAt(x, y).some((q) => hidden(q))) return false;
	return c.by === p.i;
}
// only a weapon card is ever held, and only an element card is ever selected: see `clickCard`
export const held = (p: Player): WepCard | null => {
	const c = p.hand.find((q) => q.uid === p.held);
	return c?.k === "w" ? c : null;
};
export const selCard = (p: Player): ElCard | null => {
	const c = p.hand.find((q) => q.uid === S.sel);
	return c?.k === "el" ? c : null;
};
export function rgba(h: string, a: number): string {
	const n = parseInt(h.slice(1), 16);
	return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

let placedBy: number | null = null;

/** The seat whose card is laying ground right now, or null between cards. */
export function layingFor(): number | null {
	return placedBy;
}

/** Names the seat a card is laying ground for, so every tile it writes remembers who owns it. */
export function layFor(seat: number | null): void {
	placedBy = seat;
}

/** The one way ground is written, so `t`, `el` and `by` never drift apart. */
export function putTerrain(c: Cell, k: string): void {
	c.t = k;
	c.el = ELBYT[k] || null;
	c.life = T[k]!.life;
	c.by = placedBy;
}
/** Swaps between the setup screen and the arena. */
export function show(s: string): void {
	S.screen = s;
	$("menu").classList.toggle("on", s === "menu");
	$("game").classList.toggle("on", s === "game");
	if (s === "menu") redrawMenu();
}
