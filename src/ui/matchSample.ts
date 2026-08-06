/**
 * The position the match screen's stories and tests are posed from, described the way
 * src/game/match.ts describes a real one. Every panel is drawn from the same sample, so a story of
 * one panel and a story of the whole screen are looking at the same fight.
 */

import type {
	ActionBarView,
	BoardView,
	ChatView,
	FootworkView,
	HandView,
	InspectView,
	MatchView,
	RosterCard,
	TileFighter,
	TileView,
	TopbarView,
	WeaponView,
} from "../game/bridge.js";

/** Nothing in a sample is wired to a game, so every button on one lands here. */
const noop = (): void => undefined;

/** The grid the sample is played on, which is the size a two-hander is dealt by default. */
export const SAMPLE_DIM = 9;

const VERMILION = "#ff4d8d";
const CYAN = "#4dd8ff";
const AMETHYST = "#c98cff";
const LAVA = "#ff5a2b";
const STONE = "#9aa4b8";
const WHIRL = "#7c6bff";

/** A square with nothing laid on it and nobody standing there, which every sample tile is an edit or two from. */
export function sampleTile(patch: Partial<TileView> = {}): TileView {
	return {
		colour: null,
		shadow: null,
		terrain: false,
		solid: false,
		dead: false,
		gone: false,
		whirl: null,
		aim: null,
		step: false,
		warn: false,
		litsq: false,
		look: false,
		reach: null,
		title: "",
		occupants: [],
		stack: null,
		...patch,
	};
}

/** One fighter standing on a square, alone unless the patch gives them an inset to share it by. */
export function sampleFighter(seat: number, colour: string, patch: Partial<TileFighter> = {}): TileFighter {
	return {seat, colour, active: false, lit: false, inset: null, z: null, ...patch};
}

/**
 * Mid-match: lava and stone laid across the middle, a whirlpool pair, the seat whose turn it is
 * with a weapon aimed, and a square two fighters are sharing.
 */
export function sampleBoard(click: (x: number, y: number) => void = noop): BoardView {
	const tiles: TileView[] = Array.from({length: SAMPLE_DIM * SAMPLE_DIM}, () => sampleTile());

	tiles[30] = sampleTile({
		colour: LAVA,
		shadow: "rgba(255,90,43,0.44)",
		terrain: true,
		title: "Lava: burns anyone who ends their turn on it",
	});
	tiles[31] = sampleTile({
		colour: STONE,
		shadow: "rgba(154,164,184,0.44)",
		terrain: true,
		solid: true,
		title: "Stone: nothing crosses it",
	});
	tiles[22] = sampleTile({
		colour: WHIRL,
		shadow: "rgba(124,107,255,0.44)",
		terrain: true,
		whirl: "A",
		title: "Whirlpool: steps you across to its pair",
	});
	tiles[58] = sampleTile({
		colour: WHIRL,
		shadow: "rgba(124,107,255,0.44)",
		terrain: true,
		whirl: "A",
		title: "Whirlpool: steps you across to its pair",
	});
	tiles[39] = sampleTile({step: true});
	tiles[41] = sampleTile({aim: "aim"});
	tiles[48] = sampleTile({aim: "aim"});
	tiles[38] = sampleTile({look: true, reach: "linear-gradient(rgba(255,77,141,0.34),rgba(255,77,141,0.34))"});
	tiles[40] = sampleTile({title: "Vermilion: 44 HP", occupants: [sampleFighter(0, VERMILION, {active: true})]});
	tiles[42] = sampleTile({
		aim: "aimsure",
		title: "Cyan: 31 HP  ·  Amethyst: 18 HP",
		occupants: [
			sampleFighter(1, CYAN, {inset: "8% 34% 34% 8%", z: 1}),
			sampleFighter(3, AMETHYST, {inset: "34% 8% 8% 34%", z: 2}),
		],
	});

	return {dim: SAMPLE_DIM, tiles, click, fx: []};
}

/** The strip along the top, with Inspect off and the forfeit button unarmed. */
export function sampleTopbar(): TopbarView {
	return {
		seat: 0,
		name: "Vermilion",
		colour: VERMILION,
		round: "ROUND 6  ·  4/9 ENERGY",
		inspecting: false,
		toggleInspect: noop,
		openTable: noop,
		canEndTurn: true,
		endTurn: noop,
		forfeitLabel: "Forfeit",
		forfeitArmed: false,
		forfeit: noop,
		leave: noop,
		themeLabel: "Day",
		toggleTheme: noop,
	};
}

/** Three fighters: the one whose turn it is, one on a side with somebody, and one already down. */
export function sampleRoster(): RosterCard[] {
	return [
		{
			seat: 0,
			name: "Vermilion",
			colour: VERMILION,
			alive: true,
			allies: 0,
			hp: 44,
			health: 44 / 60,
			energy: null,
			pips: {total: 9, filled: 4},
			seen: null,
			line: "Steam Sword · 14 dmg · 5 in hand",
		},
		{
			seat: 1,
			name: "Cyan",
			colour: CYAN,
			alive: true,
			allies: 1,
			hp: 31,
			health: 31 / 60,
			energy: "18 / 24 energy",
			pips: null,
			seen: "Fire, Water",
			line: "3 in hand",
		},
		{
			seat: 3,
			name: "Amethyst",
			colour: AMETHYST,
			alive: false,
			allies: 0,
			hp: 0,
			health: 0,
			energy: null,
			pips: {total: 9, filled: 0},
			seen: null,
			line: "unarmed · 0 in hand",
		},
	];
}

/** The footwork this fighter was dealt: a jump still in hand, and a dash already spent. */
function sampleFootwork(): FootworkView {
	return {
		any: true,
		floating: false,
		rooted: false,
		buttons: [
			{
				key: "jump",
				label: "Jump",
				cost: 2,
				left: 3,
				tip: "Hop over anything in the way to a square two off.",
				aiming: false,
				disabled: false,
				click: noop,
			},
			{
				key: "dash",
				label: "Dash · spent",
				cost: null,
				left: 0,
				tip: "Run up to four squares in a straight line.",
				aiming: false,
				disabled: true,
				click: null,
			},
		],
	};
}

/** The weapon in hand, aimed at nothing yet. */
function sampleWeapon(): WeaponView {
	return {
		name: "Steam Sword",
		colour: "#9ef0dc",
		damage: "14",
		desc: "A blade that hisses. Reaches one square.",
		onHit: "Leaves scalding fog behind the blow.",
		strip: "linear-gradient(90deg,#4dd8ff,#ff5a2b)",
		rows: [
			{
				label: "Leaves under them:",
				options: [
					{key: "steam", name: "Steam", colour: "#9ef0dc", on: true, choose: noop},
					{key: "fire", name: "Fire", colour: LAVA, on: false, choose: noop},
				],
			},
		],
		cost: 3,
		aiming: false,
		disabled: false,
		swing: noop,
		hint: "Cyan is within reach.",
	};
}

/** The bar under the board, waiting for this fighter to do something. */
function sampleActions(): ActionBarView {
	return {
		hint: [{text: "Pick a card, or step onto a lit square.", strong: false}],
		alarm: false,
		buttons: [
			{key: "place", label: "Lay on a tile · 1", disabled: false, facedown: false, click: noop},
			{key: "merge", label: "Merge · 2", disabled: true, facedown: false, click: noop},
		],
		tail: null,
	};
}

/** A hand of three: two elements and the weapon being held. */
function sampleHand(): HandView {
	return {
		cards: [
			{
				uid: 11,
				kind: "ELEMENT",
				number: 1,
				name: "Fire",
				desc: "Burns anyone who ends their turn on it. Forge: +4 damage.",
				colour: LAVA,
				strip: LAVA,
				on: false,
				mixable: false,
				doomed: false,
			},
			{
				uid: 12,
				kind: "FUSED",
				number: 2,
				name: "Steam",
				desc: "Blinds whoever stands in it. Forge: scalds on a hit.",
				colour: "#9ef0dc",
				strip: "linear-gradient(90deg,#4dd8ff,#ff5a2b)",
				on: true,
				mixable: false,
				doomed: false,
			},
			{
				uid: 13,
				kind: "WEAPON",
				number: 3,
				name: "Steam Sword",
				desc: "A blade that hisses. 14 damage, 3 energy.",
				colour: "#9ef0dc",
				strip: "linear-gradient(90deg,#4dd8ff,#ff5a2b)",
				on: false,
				mixable: false,
				doomed: false,
			},
		],
		click: noop,
		reorder: noop,
		draggable: true,
	};
}

/** Table talk with one line answered, and nothing being replied to yet. */
export function sampleChat(say: (text: string) => void = noop): ChatView {
	return {
		lines: [
			{
				id: 1,
				who: "Vermilion",
				colour: VERMILION,
				round: 4,
				text: "the middle is mine",
				quote: null,
				reply: noop,
			},
			{
				id: 2,
				who: "Cyan",
				colour: CYAN,
				round: 5,
				text: "not for long",
				quote: {who: "Vermilion", colour: VERMILION, text: "the middle is mine"},
				reply: noop,
			},
		],
		replyingTo: null,
		cancelReply: noop,
		say,
	};
}

/** The tile readout with Inspect on and a lava square being read. */
export function sampleInspect(): InspectView {
	return {
		inspecting: true,
		hint: null,
		tile: {
			name: "Lava",
			colour: LAVA,
			blurb: "Burns anyone who ends their turn on it.",
			facts: [
				{label: "Entering", value: "1 energy"},
				{label: "Ending here", value: "9 damage"},
				{label: "Lasts", value: "4 more rounds"},
			],
		},
		chooser: {
			chips: [
				{seat: 0, name: "Vermilion", colour: VERMILION, budget: 4, on: true, toggle: noop},
				{seat: 1, name: "Cyan", colour: CYAN, budget: 6, on: false, toggle: noop},
			],
			blinded: false,
		},
	};
}

/** The whole match screen, mid-fight, from the seat whose turn it is. */
export function sampleMatch(): MatchView {
	return {
		topbar: sampleTopbar(),
		board: sampleBoard(),
		footwork: sampleFootwork(),
		weapon: sampleWeapon(),
		actions: sampleActions(),
		roster: sampleRoster(),
		hand: sampleHand(),
		chat: sampleChat(),
		inspect: sampleInspect(),
		codex: "12 of 45 fusions found",
	};
}
