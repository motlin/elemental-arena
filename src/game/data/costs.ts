/** Every action `S.mode` can hold, which is also what `COST` prices and `Player.used` counts. */
export type ActionKey =
	| "place"
	| "merge"
	| "jump"
	| "dash"
	| "leap"
	| "float"
	| "spin"
	| "wipe"
	| "warp"
	| "ultra"
	| "spread"
	| "trail"
	| "shift"
	| "smash"
	| "theft"
	| "swap"
	| "mark"
	| "light";

/** Energy each action costs, keyed by the action name used in `S.mode`. */
export const COST: Record<ActionKey, number> = {
	place: 2,
	merge: 2,
	jump: 1,
	dash: 1,
	leap: 1,
	float: 1,
	spin: 1,
	wipe: 1,
	warp: 1,
	ultra: 1,
	spread: 1,
	trail: 1,
	shift: 1,
	smash: 1,
	theft: 1,
	swap: 1,
	mark: 1,
	light: 1,
};
