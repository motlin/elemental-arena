/**
 * The setup screen's numbers and the theme: read out of the inputs into `S`, written back out of
 * `S` into the inputs, and saved alongside the rest of the progress.
 */

import {save} from "./save.js";
import {$, CHAOS, MVUSES, S} from "./state.js";

export function readMvUses(): number {
	const v = parseInt($("mvuses").value, 10);
	S.mvUses = Number.isFinite(v) ? Math.max(0, Math.min(99, v)) : MVUSES;
	return S.mvUses;
}
$("mvuses").oninput = readMvUses;
$("mvuses").onblur = () => {
	$("mvuses").value = String(readMvUses());
};
export function readChaosRound(): number {
	const v = parseInt($("chaosr").value, 10);
	S.chaosRound = Number.isFinite(v) ? Math.max(1, Math.min(99, v)) : CHAOS;
	return S.chaosRound;
}
$("chaosr").oninput = readChaosRound;
$("chaosr").onblur = () => {
	$("chaosr").value = String(readChaosRound());
};
export function readStartNrg(): number {
	const v = parseInt($("nrg0").value, 10);
	S.startNrg = Number.isFinite(v) ? Math.max(0, Math.min(99, v)) : 2;
	return S.startNrg;
}
$("nrg0").oninput = readStartNrg;
$("nrg0").onblur = () => {
	$("nrg0").value = String(readStartNrg());
};
export function readOpenHand(): number {
	const v = parseInt($("hand0").value, 10);
	S.openHand = Number.isFinite(v) ? Math.max(0, Math.min(30, v)) : 3;
	return S.openHand;
}
$("hand0").oninput = readOpenHand;
$("hand0").onblur = () => {
	$("hand0").value = String(readOpenHand());
};
export function applyTheme(): void {
	document.documentElement.dataset["theme"] = S.theme;
	const label = S.theme === "day" ? "Night mode" : "Day mode";
	["theme", "theme2"].forEach((id) => {
		const b = $(id);
		if (b) b.textContent = label;
	});
}
function flipTheme(): void {
	S.theme = S.theme === "day" ? "night" : "day";
	applyTheme();
	void save();
}
["theme", "theme2"].forEach((id) => {
	const b = $(id);
	if (b) b.onclick = flipTheme;
});
export function syncSettings(): void {
	// browsers restore form state across reloads, so drive the boxes from our own defaults
	const set = (id: string, v: boolean): void => {
		const el = $(id);
		if (el) el.checked = v;
	};
	set("chaos", S.chaos);
	set("paint", S.paint);
	set("priv", S.priv);
	const num = (id: string, v: number): void => {
		const el = $(id);
		if (el) el.value = String(v);
	};
	num("chaosr", S.chaosRound);
	num("nrg0", S.startNrg);
	num("hand0", S.openHand);
	num("hp", S.hp);
	num("dim", S.dim);
	num("np", S.np);
	const hv = $("hpval"),
		dv = $("dimval"),
		nv = $("npval");
	if (hv) hv.textContent = String(S.hp);
	if (dv) dv.textContent = `${S.dim} x ${S.dim}`;
	if (nv) nv.textContent = String(S.np);
}
