/**
 * The board grid: how big its tiles are at a given viewport. The sizes mirror the stylesheet, so a
 * test can check the two still agree. Pure geometry, so the React board can import it freely.
 */

/* Board geometry. These mirror the stylesheet: #board draws a BOARD_GAP gap between tiles
   inside 8px of padding and a 1px border, and the arena lays the board column out between
   two .side columns of clamp(SIDE_MIN, SIDE_VW, SIDE_MAX), all inside #game's padding. */
const BOARD_GAP = 2;
const BOARD_CHROME = 18;
export const GAME_PAD = 14;
export const ARENA_GAP = 14;
export const SIDE_MIN = 150;
export const SIDE_MAX = 212;
export const SIDE_VW = 0.17;
export const ARENA_STACK_AT = 560;
export const ARENA_BOARD_MAX = 640;
export const ARENA_CELL_MIN = 15;
export const ARENA_CELL_MAX = 46;

/** Outer width a dim x dim board occupies when drawn at `cell` pixels per tile. */
export function boardWidth(dim: number, cell: number): number {
	return dim * cell + (dim - 1) * BOARD_GAP + BOARD_CHROME;
}
/** Largest tile size whose whole board fits `avail`, clamped so tiles stay legible.
    A board of zero-size tiles is exactly the width that is not tile, so subtracting it
    leaves the room the tiles themselves get. */
export function boardCell(dim: number, avail: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, Math.floor((avail - boardWidth(dim, 0)) / dim)));
}
/** Width the arena leaves the board column at viewport width `w`. Below the stacking
    breakpoint the side panels sit above and below, so the board gets the full width. */
export function arenaBoardRoom(w: number): number {
	if (w <= ARENA_STACK_AT) return w - GAME_PAD * 2;
	const side = Math.max(SIDE_MIN, Math.min(SIDE_MAX, w * SIDE_VW));
	return w - GAME_PAD * 2 - (side * 2 + ARENA_GAP * 2);
}
/** Excludes the scrollbar, matching what the layout actually gets and what media queries see. */
export function viewportWidth(): number {
	return document.documentElement.clientWidth || window.innerWidth;
}
