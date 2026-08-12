/**
 * The replay an online seat keeps for itself.
 *
 * Hot-seat's replay is the match log with the whole board stapled to every line (`snapshot` in
 * src/game/cards.ts), which is exactly why it cannot be sent: it draws concealed fighters standing
 * where they really were. So a client builds its own out of the only thing it is ever given, which
 * is the seat views the room sent it (src/game/seat.ts).
 *
 * What comes out is the match as this seat watched it. Ground it never saw is bare, a fighter it
 * never saw is nowhere at all, and a hand it was never shown is a row of unknowns. That is a
 * different artefact from hot-seat's replay rather than a poorer one: it is a record of what the
 * player could actually see while they were deciding, which is the thing worth going back over.
 *
 * One frame per arena the room sent, and no frame for an arena that says exactly what the last one
 * said -- a seat sitting back down is sent the match again, and watching the same board twice is
 * not something that happened.
 */

import {cardLabel} from "./cards.js";
import type {SeatFighter, SeatState} from "./seat.js";
import type {Frame} from "./types.js";

/** A card this seat was never shown, which is most of everybody else's hand. */
const FACEDOWN = "?";

/** Nobody at all, which is where a fighter this seat cannot see stands: off every square there is. */
const NOWHERE = -1;

let frames: Frame[] = [];
/** The last frame kept, as bytes, which is the only way to tell an arena that has not moved on. */
let last = "";

/**
 * One fighter's hand, as far as this seat can read it: its own in full, and everybody else's as the
 * cards a mark turned over plus a slot for each one it did not.
 */
function handOf(v: SeatState, who: SeatFighter): string[] {
	if (who.seat === v.seat) return v.you.hand.map(cardLabel);
	return [...who.seen, ...Array.from({length: who.cards - who.seen.length}, () => FACEDOWN)];
}

/** One arena, as the replay will draw it back. */
function frameOf(v: SeatState): Frame {
	const mover = v.fighters[v.turn];
	return {
		r: v.round,
		who: mover?.name ?? "",
		c: mover?.colour ?? "var(--muted)",
		t: "was to move",
		say: false,
		turn: v.turn,
		board: v.tiles.map((tile) => tile.t),
		players: v.fighters.map((who) => ({
			name: who.name,
			c: who.colour,
			team: who.team,
			x: who.at?.[0] ?? NOWHERE,
			y: who.at?.[1] ?? NOWHERE,
			hp: who.hp,
			max: who.max,
			alive: who.alive,
			hand: handOf(v, who),
			held: who.seat === v.seat ? v.you.held : null,
		})),
	};
}

/** Puts one more arena in the record, unless it is the one already at the end of it. */
export function keep(v: SeatState): void {
	const frame = frameOf(v);
	const bytes = JSON.stringify(frame);
	if (bytes === last) return;
	last = bytes;
	frames.push(frame);
}

/** The match so far, oldest arena first. A fresh array every time: the replay steps through a copy. */
export function kept(): readonly Frame[] {
	return [...frames];
}

/** Puts the record down, which is what getting up from a match does to it. */
export function forget(): void {
	frames = [];
	last = "";
}
