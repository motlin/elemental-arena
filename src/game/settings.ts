/**
 * The theme, which is the one setting that outlives a match. Everything else on the setup screen
 * is React's now; this stays here because the arena's own topbar carries the same switch.
 */

import {save} from "./save.js";
import {$, S} from "./state.js";
import {redrawMenu} from "./view.js";

/** What the theme button offers, which is whichever theme is not on. */
export function themeLabel(): string {
	return S.theme === "day" ? "Night mode" : "Day mode";
}

export function applyTheme(): void {
	document.documentElement.dataset["theme"] = S.theme;
	const b = $("theme");
	if (b) b.textContent = themeLabel();
}

export function flipTheme(): void {
	S.theme = S.theme === "day" ? "night" : "day";
	applyTheme();
	redrawMenu();
	void save();
}

const themeButton = $("theme");
if (themeButton) themeButton.onclick = flipTheme;
