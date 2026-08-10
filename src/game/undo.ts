import {saveSoon} from "./save.js";
import {exportMatch, importMatch, type MatchSnapshot} from "./snapshot.js";
import {S} from "./state.js";
import {redraw} from "./view.js";

interface UndoEntry {
	snap: MatchSnapshot;
	coins: number;
	framesLen: number;
}

const stack: UndoEntry[] = [];
const STACK_LIMIT = 20;

export function pushUndo(): void {
	stack.push({snap: exportMatch(), coins: S.coins, framesLen: S.frames.length});
	if (stack.length > STACK_LIMIT) stack.shift();
}

export function canUndo(): boolean {
	return stack.length > 0;
}

export function clearUndo(): void {
	stack.length = 0;
}

export const markIrreversible = clearUndo;

export function undo(): void {
	if (!stack.length || S.phase !== "act" || S.handoff || S.toss) return;
	const entry = stack.pop()!;
	const frames = S.frames;
	const coinsChanged = S.coins !== entry.coins;
	importMatch(entry.snap);
	S.frames = frames.slice(0, entry.framesLen);
	S.coins = entry.coins;
	if (coinsChanged) saveSoon();
	S.sel = null;
	S.mode = null;
	S.mixFrom = null;
	S.steal = null;
	redraw();
}
