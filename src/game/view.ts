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
	/** Republishes the setup screen, which is what coming back to the menu shows. */
	redrawMenu: () => void;
	/** Repaints the fusion count, and the table behind it if it is open. */
	redrawCodex: () => void;
	/** Puts the replay up over whatever is on screen, wound back to the first frame. */
	openReplay: () => void;
}

let view: View = {
	redraw: () => {},
	redrawMenu: () => {},
	redrawCodex: () => {},
	openReplay: () => {},
};

/** Hands the rules the real drawing code. The entry module calls this once, before anything runs. */
export function setView(next: View): void {
	view = next;
}

export const redraw = (): void => {
	view.redraw();
};
export const redrawMenu = (): void => {
	view.redrawMenu();
};
export const redrawCodex = (): void => {
	view.redrawCodex();
};
export const openReplay = (): void => {
	view.openReplay();
};
