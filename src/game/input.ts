/**
 * Turning keys into moves. The board's own clicks left with the drawing: src/game/render.ts decides
 * what a square means now, because that decision has to be the same one a client makes online. The
 * shortcuts stay here and stay direct, because they are hot-seat's and no client will load them.
 */

import {replayStore, simStore, tableStore} from "./bridge.js";
import {clickCard} from "./cards.js";
import {startAttack} from "./combat.js";
import {endTurn} from "./match.js";
import {closeReplay, closeSim, closeTable} from "./menu.js";
import {doFloat, doSmash, doSpin, doTrail, doUltra, doWipe, tryStep} from "./movement.js";
import {S, cur} from "./state.js";
import type {GameEl} from "./types.js";
import {undo} from "./undo.js";
import {redraw} from "./view.js";

/* One stable reference shared by the curtain's button and the Enter/Space shortcut, so the
   view republished on every redraw compares equal and React stays put. */
export function dropCurtain(): void {
	S.handoff = false;
	redraw();
}
/**
 * Reads a square without moving, which the topbar and the I key both ask for. Turning it off puts
 * down the square it was reading and the reach chips ticked under it: the drawing used to clear
 * those on its way past, and now that it only describes, whoever turns Inspect off has to.
 */
export function toggleInspect(): void {
	S.imode = !S.imode;
	if (!S.imode) {
		S.look = null;
		S.reach = [];
	}
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
		S.reach = [];
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
