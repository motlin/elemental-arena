import type {Meta, StoryObj} from "@storybook/react-vite";
import {fn} from "storybook/test";
import {ReplayViewerView} from "./ReplayViewer.js";
import type {Frame} from "../game/types.js";
import "../styles/index.css";

const DIM = 9;

/** The ground a few cards left behind, keyed the way `putTerrain` writes it. */
const GROUND: Record<number, string> = {12: "lava", 13: "lava", 30: "ocean", 40: "stone", 41: "stone", 58: "gale"};

const board = (painted: boolean): (string | null)[] =>
	Array.from({length: DIM * DIM}, (_, i) => (painted ? (GROUND[i] ?? null) : null));

interface Standing {
	readonly x: number;
	readonly y: number;
	readonly hp: number;
	readonly alive?: boolean;
	readonly hand?: string[];
}

const VERMILION = {name: "Vermilion", c: "#ff4d8d", team: 0};
const CYAN = {name: "Cyan", c: "#4dd8ff", team: 1};

const fighter = (who: {name: string; c: string; team: number}, {x, y, hp, alive = true, hand = []}: Standing) => ({
	...who,
	x,
	y,
	hp,
	max: 60,
	alive,
	hand,
	held: null,
});

/** The opening frame: nothing on the ground yet and both fighters on full health. */
const OPENING: Frame = {
	r: 1,
	who: "Vermilion",
	c: "#ff4d8d",
	t: "played Fire",
	say: false,
	turn: 0,
	board: board(false),
	players: [
		fighter(VERMILION, {x: 1, y: 1, hp: 60, hand: ["Fire", "Water", "Dagger"]}),
		fighter(CYAN, {x: 7, y: 7, hp: 60, hand: ["Earth", "Sword"]}),
	],
};

/** Mid-match: ground laid, one fighter hurt, the other holding nothing. */
const MIDDLE: Frame = {
	r: 6,
	who: "Cyan",
	c: "#4dd8ff",
	t: "swung Steam Sword at Vermilion for 34",
	say: false,
	turn: 1,
	board: board(true),
	players: [fighter(VERMILION, {x: 3, y: 4, hp: 12, hand: ["Fire"]}), fighter(CYAN, {x: 4, y: 4, hp: 47, hand: []})],
};

/** Table talk, which the replay leans into rather than reading out flat. */
const CHATTER: Frame = {...MIDDLE, r: 6, who: "Vermilion", c: "#ff4d8d", t: "that was uncalled for", say: true};

/** The closing frame: one fighter down, the other holding the arena. */
const CLOSING: Frame = {
	...MIDDLE,
	r: 7,
	who: "Cyan",
	t: "took the arena",
	players: [
		fighter(VERMILION, {x: 3, y: 4, hp: 0, alive: false, hand: ["Fire"]}),
		fighter(CYAN, {x: 4, y: 4, hp: 47, hand: ["Water", "Crossbow"]}),
	],
};

const FRAMES = [OPENING, MIDDLE, CHATTER, CLOSING];

const meta = {
	title: "Arena/ReplayViewer",
	component: ReplayViewerView,
	parameters: {layout: "fullscreen"},
	tags: ["autodocs"],
	args: {
		frames: FRAMES,
		dim: DIM,
		at: 0,
		playing: false,
		close: fn(),
		go: fn(),
		togglePlay: fn(),
	},
} satisfies Meta<typeof ReplayViewerView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Where the replay opens: the first card of the match, on bare ground. */
export const FirstFrame: Story = {};

/** A blow landing, with the ground both fighters have laid still under them. */
export const MidMatch: Story = {
	args: {at: 1},
};

/** Table talk reads in italics under whoever said it. */
export const SomebodyTalking: Story = {
	args: {at: 2},
};

/** The closing frame, where the fighter who went down greys out. */
export const LastFrame: Story = {
	args: {at: 3},
};

/** Running itself, which is the only time the button offers a pause. */
export const Playing: Story = {
	args: {at: 1, playing: true},
};

/** A match that was called before anybody did anything has nothing to play back. */
export const NothingRecorded: Story = {
	args: {frames: []},
};
