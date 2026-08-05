import {EL} from "./elements.js";
import {FUSE} from "./fusion.js";
import {T, type TerrainDef} from "./terrain.js";

/** What an element contributes to a weapon it is forged onto. */
export interface ForgeDef {
	/** Damage added to the swing. */
	dmg: number;
	/** One-line description of the rider. */
	fx: string;
	mult?: number;
	pow?: number;
	hits?: number;
	steal?: number;
	drag?: number;
	dark?: number;
	freeze?: number;
	glow?: number;
}

/** Forge riders for the base elements. Fused elements live in `CFORGE`; read both via `forgeOf`. */
export const FORGE: Record<string, ForgeDef> = {
	fire: {dmg: 5, fx: "leaves fire under the target"},
	water: {dmg: 3, fx: "shoves the target 1 tile"},
	earth: {dmg: 6, fx: "drains 2 energy from the target"},
	air: {dmg: 3, fx: "shoves the target 3 tiles"},
	bolt: {dmg: 7, fx: "arcs to one more enemy nearby"},
	space: {dmg: 0, mult: 2, fx: "doubles the damage of everything else on the weapon"},
	poison: {dmg: 0, pow: 1, fx: "doubles the weapon strength and adds 6 on top"},
	life: {dmg: 4, steal: 1, fx: "heals you for half of what the swing deals"},
	iron: {dmg: 8, drag: 1, fx: "drags the target one tile toward you"},
	echo: {dmg: 2, hits: 1, fx: "makes the weapon strike one extra time"},
	shadow: {dmg: 5, dark: 1, fx: "leaves the target blind on their next turn"},
	frost: {dmg: 4, freeze: 1, fx: "freezes the target so they cannot move next turn"},
	light: {dmg: 6, glow: 1, fx: "strips the target of any cover on their next turn"},
};

/** An absent amount counts as none. */
const amount = (v: number | undefined): number => v ?? 0;

/** An absent or zero power counts as off; anything else is worth one point either way. */
const power = (v: number | undefined): number => (v === undefined || v === 0 ? 0 : 1);

/** How much good a tile does whoever stands on it. */
const tHelp = (t: TerrainDef): number =>
	amount(t.heal) + amount(t.auraHeal) + amount(t.gain) + power(t.hide) + power(t.ward) + power(t.anchor);

/** How much harm a tile does whoever stands on it. */
const tHarm = (t: TerrainDef): number =>
	amount(t.end) + amount(t.bite) + amount(t.aura) + power(t.root) + power(t.gone) + power(t.los);

/** A tile is a gift when it does its occupant more good than harm. */
export const boon = (k: string): boolean => {
	const t = T[k];
	return !!t && tHelp(t) > tHarm(t);
};

/** Forge riders for the fused elements, summed from the pair that makes each one. */
export const CFORGE: Record<string, ForgeDef> = {};
for (const [pair, fused] of Object.entries(FUSE)) {
	const [a, b] = pair.split("|");
	const fa = a === undefined ? undefined : FORGE[a];
	const fb = b === undefined ? undefined : FORGE[b];
	const t = T[fused];
	if (fa === undefined || fb === undefined || t === undefined) continue;
	CFORGE[fused] = {
		dmg: fa.dmg + fb.dmg + 4,
		mult: (fa.mult ?? 1) * (fb.mult ?? 1),
		pow: amount(fa.pow) + amount(fb.pow),
		hits: amount(fa.hits) + amount(fb.hits),
		fx:
			tHelp(t) > tHarm(t)
				? `lays ${t.n.toLowerCase()} under your own feet`
				: `leaves ${t.n.toLowerCase()} under the target`,
	};
}

/** Which element card lays each terrain, the reverse of `EL[k].t`. */
export const ELBYT: Record<string, string> = {};
for (const [k, v] of Object.entries(EL)) {
	ELBYT[v.t] = k;
}
