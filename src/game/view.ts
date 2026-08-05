/**
 * What the rules ask the screen to do. The rules never reach up into the drawing code themselves:
 * they call these, and src/game/game.ts wires the real functions in once every module has loaded.
 * Without that seam each rules module would import the renderer, which imports the rules straight
 * back, and the cycle would decide for itself which half of the game exists first.
 */

/** The drawing the rules call for. `setView` fills it in; until then the calls do nothing. */
export interface View {
	/** Repaints the whole match screen. */
	redraw: () => void;
	/** Rebuilds the board grid, which a new match and a new tile size both need. */
	redrawBoard: () => void;
	/** Repaints the setup screen, which is what coming back to the menu shows. */
	redrawMenu: () => void;
	/** Repaints the shop, which is where a save that went wrong says so. */
	redrawShop: () => void;
	/** Repaints the fusion count, and the table behind it if it is open. */
	redrawCodex: () => void;
}

let view: View = {
	redraw: () => {},
	redrawBoard: () => {},
	redrawMenu: () => {},
	redrawShop: () => {},
	redrawCodex: () => {},
};

/** Hands the rules the real drawing code. The entry module calls this once, before anything runs. */
export function setView(next: View): void {
	view = next;
}

export const redraw = (): void => {
	view.redraw();
};
export const redrawBoard = (): void => {
	view.redrawBoard();
};
export const redrawMenu = (): void => {
	view.redrawMenu();
};
export const redrawShop = (): void => {
	view.redrawShop();
};
export const redrawCodex = (): void => {
	view.redrawCodex();
};
