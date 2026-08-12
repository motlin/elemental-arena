/**
 * The game as the page loads it. Everything below this file is arranged one way: the rules know the
 * state and the data tables, the screens know the rules, and nothing points back down. This module
 * closes that loop by handing the rules the drawing they ask for, then reads the saved progress and
 * puts the setup screen up.
 *
 * It also re-exports the rules and the tables the tests drive the game through. The page needs none
 * of that and loads this module for its side effects alone.
 */
import {drawCodex, drawMenu, openReplay} from "./menu.js";
import {render} from "./hotseat.js";
import {drawLobby} from "./lobby.js";
import {playOnline} from "./online.js";
import {load} from "./save.js";
import {applyTheme} from "./settings.js";
import {setView} from "./view.js";
import {inviteFrom} from "../net/client.js";

setView({
	redraw: render,
	redrawCodex: drawCodex,
	openReplay,
	redrawMenu: drawMenu,
});

/**
 * The saved progress, then the menu drawn from it. Exported so a test can await the load-time DOM
 * wiring instead of racing it; the page itself just lets it settle.
 */
export const boot = load().then(() => {
	applyTheme();
	drawMenu();
	drawCodex();
	drawLobby();
	// a tab opened on an invite link sits straight down in the seat the link names
	const invite = inviteFrom(globalThis.location.href);
	if (invite !== null) playOnline(invite);
});

export type {
	Card,
	Cell,
	ChatMsg,
	ElCard,
	Frame,
	GameState,
	LogEntry,
	Offs,
	Player,
	WeaponSpec,
	WepCard,
} from "./types.js";
export {BASE, CFORGE, EL, FUSE, MV, PAT, T, W, WBASE} from "./data/index.js";
export {S, cur} from "./state.js";
export {
	elColor,
	elName,
	forgeOf,
	leaveFoe,
	leaveSelf,
	mvOwnedMask,
	terrOf,
	wColor,
	wCost,
	wDesc,
	wHits,
	wReach,
	wStrip,
	wepDmg,
	wepName,
	wepOf,
} from "./lookups.js";
export {
	ARENA_BOARD_MAX,
	ARENA_CELL_MAX,
	ARENA_CELL_MIN,
	ARENA_GAP,
	ARENA_STACK_AT,
	GAME_PAD,
	SIDE_MAX,
	SIDE_MIN,
	SIDE_VW,
	arenaBoardRoom,
	boardCell,
	boardWidth,
} from "./board.js";
export {forfeit, leaveMatch, startMatch} from "./match.js";
export {attackTiles} from "./combat.js";
export {codexLine, drawCodex, drawMenu, openTable} from "./menu.js";
export {say} from "./chat.js";
export {MODEHINT} from "./render.js";
export {render} from "./hotseat.js";
export {toggleInspect} from "./input.js";
