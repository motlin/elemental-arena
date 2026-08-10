/** Turning clicks and keys into moves. */

import {replayStore, simStore, tableStore} from "./bridge.js";
import {clickCard, doPlace} from "./cards.js";
import {attackTiles, doAttack, startAttack} from "./combat.js";
import {endTurn} from "./match.js";
import {closeReplay, closeSim, closeTable} from "./menu.js";
import {
	doDash,
	doFloat,
	doJump,
	doLeap,
	doLight,
	doMark,
	doSmash,
	doSpin,
	doSpread,
	doSwap,
	doTheft,
	doTrail,
	doUltra,
	doWarp,
	doWipe,
	tryStep,
} from "./movement.js";
import {S, cheb, cur, held, idx} from "./state.js";
import type {GameEl} from "./types.js";
import {undo} from "./undo.js";
import {redraw} from "./view.js";

/* One stable reference shared by the curtain's button and the Enter/Space shortcut, so the
   view republished on every redraw compares equal and React stays put. */
export function dropCurtain(): void {
	S.handoff = false;
	redraw();
}
function inspect(x: number, y: number): void {
	const i = idx(x, y);
	S.look = S.look === i ? null : i;
	redraw();
}
export function onTile(x: number, y: number): void {
	if (S.phase !== "act" || S.toss) return;
	const p = cur();
	if (S.imode) {
		inspect(x, y);
		return;
	}
	if (S.mode === "place") {
		doPlace(x, y);
		return;
	}
	if (S.mode === "jump") {
		doJump(x, y);
		return;
	}
	if (S.mode === "dash") {
		doDash(x, y);
		return;
	}
	if (S.mode === "leap") {
		doLeap(x, y);
		return;
	}
	if (S.mode === "light") {
		doLight(x, y);
		return;
	}
	if (S.mode === "mark") {
		doMark(x, y);
		return;
	}
	if (S.mode === "swap") {
		doSwap(x, y);
		return;
	}
	if (S.mode === "theft") {
		doTheft(x, y);
		return;
	}
	if (S.mode === "warp") {
		doWarp(x, y);
		return;
	}
	if (S.mode === "spread") {
		doSpread(x, y);
		return;
	}
	if (S.mode === "attack") {
		const c = held(p);
		if (c && attackTiles(p, c).some(([a, b]) => a === x && b === y)) doAttack(x, y);
		return;
	}
	if (!S.sel && cheb(p.x, p.y, x, y) === 1) tryStep(x, y);
}
/** Reads a square without moving, which the topbar and the I key both ask for. */
export function toggleInspect(): void {
	S.imode = !S.imode;
	if (!S.imode) S.look = null;
	redraw();
}
const typing = (e: Event): boolean => {
	const el: GameEl | null = e.target as GameEl | null;
	if (!el) return false;
	const tag = (el.tagName || "").toUpperCase();
	return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
};
addEventListener("keydown", (e) => {
	if (typing(e)) return; // let people write without moving their fighter
	if (e.key === "Escape" && replayStore.get() !== null) {
		closeReplay();
		return;
	}
	if (e.key === "Escape" && simStore.get() !== null) {
		closeSim();
		return;
	}
	if (e.key === "Escape" && tableStore.get() !== null) {
		closeTable();
		return;
	}
	if (S.screen !== "game") return;
	if (S.handoff) {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			dropCurtain();
		}
		return;
	}
	const k = e.key.toLowerCase(),
		p = cur();
	if (k === "z" && (e.ctrlKey || e.metaKey)) {
		e.preventDefault();
		undo();
		return;
	}
	if (k === "escape") {
		S.sel = null;
		S.mode = null;
		S.imode = false;
		S.look = null;
		S.tossPick = null;
		redraw();
		return;
	}
	if (k === "e") {
		endTurn();
		return;
	}
	if (k === "f") {
		startAttack();
		return;
	}
	if (k === "q") {
		doSpin();
		return;
	}
	if (k === "u" && !e.ctrlKey && !e.metaKey && !e.altKey) {
		undo();
		return;
	}
	if (k === "z") {
		doWipe();
		return;
	}
	if (k === "c") {
		doUltra();
		return;
	}
	if (k === "h") {
		doSmash();
		return;
	}
	if (k === "t") {
		doTrail();
		return;
	}
	if (k === "v") {
		if (p.mv & 256 && p.used.spread < S.mvUses) {
			S.mode = S.mode === "spread" ? null : "spread";
			S.sel = null;
			redraw();
		}
		return;
	}
	if (k === "x") {
		if (p.mv & 64 && p.used.warp < S.mvUses) {
			S.mode = S.mode === "warp" ? null : "warp";
			S.sel = null;
			redraw();
		}
		return;
	}
	if (k === "g") {
		if (p.mv & 4096 && p.used.theft < S.mvUses) {
			S.mode = S.mode === "theft" ? null : "theft";
			S.sel = null;
			redraw();
		}
		return;
	}
	if (k === "b") {
		if (p.mv & 8192 && p.used.swap < S.mvUses) {
			S.mode = S.mode === "swap" ? null : "swap";
			S.sel = null;
			redraw();
		}
		return;
	}
	if (k === "m") {
		if (p.mv & 16384 && p.used.mark < S.mvUses) {
			S.mode = S.mode === "mark" ? null : "mark";
			S.sel = null;
			redraw();
		}
		return;
	}
	if (k === "n") {
		if (p.mv & 32768 && p.used.light < S.mvUses) {
			S.mode = S.mode === "light" ? null : "light";
			S.sel = null;
			redraw();
		}
		return;
	}
	if (k === "i") {
		toggleInspect();
		return;
	}
	if (k === "j") {
		if (p.mv & 1 && p.used.jump < S.mvUses) {
			S.mode = S.mode === "jump" ? null : "jump";
			S.sel = null;
			redraw();
		}
		return;
	}
	if (k === "k") {
		if (p.mv & 2 && p.used.dash < S.mvUses) {
			S.mode = S.mode === "dash" ? null : "dash";
			S.sel = null;
			redraw();
		}
		return;
	}
	if (k === "l") {
		if (p.mv & 4 && p.used.leap < S.mvUses) {
			S.mode = S.mode === "leap" ? null : "leap";
			S.sel = null;
			redraw();
		}
		return;
	}
	if (k === ";") {
		doFloat();
		return;
	}
	if (k >= "1" && k <= "9") {
		const c = p.hand[+k - 1];
		if (c) clickCard(c.uid);
		return;
	}
	const mv = {
		arrowup: [0, -1],
		w: [0, -1],
		arrowdown: [0, 1],
		s: [0, 1],
		arrowleft: [-1, 0],
		a: [-1, 0],
		arrowright: [1, 0],
		d: [1, 0],
	}[k];
	if (mv && !S.mode) {
		e.preventDefault();
		tryStep(p.x + mv[0]!, p.y + mv[1]!);
	}
});
