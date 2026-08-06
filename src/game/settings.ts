/**
 * The theme, which is the one setting that outlives a match. Everything else on the setup screen
 * is React's now; this stays here because the arena's own topbar carries the same switch.
 */

import {save} from "./save.js";
import {S} from "./state.js";
import {redraw, redrawMenu} from "./view.js";

/** What the theme button offers, which is whichever theme is not on. */
export function themeLabel(): string {
	return S.theme === "day" ? "Night mode" : "Day mode";
}

export function applyTheme(): void {
	document.documentElement.dataset["theme"] = S.theme;
}

export function flipTheme(): void {
	S.theme = S.theme === "day" ? "night" : "day";
	applyTheme();
	// both screens carry the switch, so both have to be told which way it now points
	redraw();
	redrawMenu();
	void save();
}
