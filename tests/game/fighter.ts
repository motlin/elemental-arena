import type {Player} from "../../src/game/types.js";

/**
 * A whole fighter, so a test that only cares about one or two fields does not have to spell out the
 * rest. The defaults are the ones `startMatch` deals: full health, nothing used, nothing held.
 */
export function fighter(overrides: Partial<Player> = {}): Player {
	return {
		i: 0,
		name: "Tester",
		c: "#ff4d8d",
		team: 0,
		mv: 0,
		used: {
			place: 0,
			merge: 0,
			jump: 0,
			dash: 0,
			leap: 0,
			float: 0,
			spin: 0,
			wipe: 0,
			warp: 0,
			ultra: 0,
			spread: 0,
			trail: 0,
			shift: 0,
			smash: 0,
			theft: 0,
			swap: 0,
			mark: 0,
			light: 0,
		},
		trail: null,
		float: false,
		x: 4,
		y: 4,
		hp: 60,
		max: 60,
		nrg: 9,
		cap: 5,
		drain: 0,
		bank: 0,
		rootTurns: 0,
		darkTurns: 0,
		litTurns: 0,
		hand: [],
		held: null,
		alive: true,
		...overrides,
	};
}
