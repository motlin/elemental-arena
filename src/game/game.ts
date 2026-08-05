/**
 * The game as the page loads it. Everything below this file is arranged one way: the rules know the
 * state and the data tables, the screens know the rules, and nothing points back down. This module
 * closes that loop by handing the rules the drawing they ask for, then reads the saved progress and
 * puts the setup screen up.
 *
 * It also re-exports the rules and the tables the tests drive the game through. The page needs none
 * of that and loads this module for its side effects alone.
 */
import {buildBoard} from "./board.js";
import {drawCheat, drawCodex, drawLoadout, drawSeg, drawShop, openReplay} from "./menu.js";
import {render} from "./render.js";
import {load} from "./save.js";
import {applyTheme, syncSettings} from "./settings.js";
import {setView} from "./view.js";

setView({
	redraw: render,
	redrawBoard: buildBoard,
	redrawCodex: drawCodex,
	redrawShop: drawShop,
	openReplay,
	// coming back to the menu only restates the seats and the shop; the rest of the setup screen
	// is drawn once at boot and kept current by whatever changes it
	redrawMenu: () => {
		drawSeg();
		drawShop();
	},
});

/**
 * The saved progress, then the menu drawn from it. Exported so a test can await the load-time DOM
 * wiring instead of racing it; the page itself just lets it settle.
 */
export const boot = load().then(() => {
	applyTheme();
	syncSettings();
	drawSeg();
	drawShop();
	drawLoadout();
	drawCodex();
	drawCheat();
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
export {elColor, elName, forgeOf, mvOwnedMask, terrOf, wColor, wCost, wDesc, wHits, wStrip} from "./lookups.js";
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
export {startMatch} from "./match.js";
export {attackTiles, leaveFoe, leaveSelf, wepDmg, wepName} from "./combat.js";
export {
	buildTable,
	drawCheat,
	drawCodex,
	drawDetail,
	drawLoadout,
	drawMvChips,
	drawNames,
	drawPalette,
	drawReplay,
	drawSeg,
	drawShop,
	drawSim,
	drawSpawnPicker,
	drawSpawns,
	drawTeams,
	drawWho,
	simAdd,
} from "./menu.js";
export {MODEHINT, drawChat, render} from "./render.js";
