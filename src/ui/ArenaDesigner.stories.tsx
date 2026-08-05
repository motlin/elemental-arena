import type {Meta, StoryObj} from "@storybook/react-vite";
import {fn} from "storybook/test";
import {ArenaDesignerView} from "./ArenaDesigner.js";
import {EL} from "../game/data/index.js";
import "../styles/index.css";

const DIM = 9;

/** A save that has bought everything, which is the palette at its widest. */
const EVERY_ELEMENT = Object.keys(EL);

const bare = (): (string | null)[] => Array<string | null>(DIM * DIM).fill(null);

/** A painted arena: a lake through the middle, a wall across it, and a hole at one end. */
function painted(): (string | null)[] {
	const board = bare();
	for (let x = 2; x < 7; x++) board[4 * DIM + x] = "water";
	for (let y = 2; y < 6; y++) board[y * DIM + 6] = "earth";
	board[3 * DIM + 2] = "fire";
	board[3 * DIM + 3] = "fire";
	board[7 * DIM + 7] = "collapsed";
	return board;
}

/** The ring a two-hander opens on, which is where the spawn marks go. */
const TWO_SEATS = [
	{index: 1 * DIM + 1, name: "Vermilion", colour: "#ff4d8d"},
	{index: 7 * DIM + 7, name: "Cyan", colour: "#4dd8ff"},
];

/** Four seats spread around the same ring. */
const FOUR_SEATS = [
	{index: 1 * DIM + 1, name: "Vermilion", colour: "#ff4d8d"},
	{index: 1 * DIM + 7, name: "Cyan", colour: "#4dd8ff"},
	{index: 7 * DIM + 7, name: "Verdant", colour: "#b8ff4d"},
	{index: 7 * DIM + 1, name: "Amethyst", colour: "#c98cff"},
];

const meta = {
	title: "Arena/ArenaDesigner",
	component: ArenaDesignerView,
	parameters: {layout: "fullscreen"},
	tags: ["autodocs"],
	args: {
		dim: DIM,
		preset: bare(),
		elements: ["fire", "water", "earth"],
		fusions: [],
		spawns: TWO_SEATS,
		seats: 2,
		tool: "fire",
		setSeats: fn(),
		paint: fn(),
		clear: fn(),
		close: fn(),
		pickTool: fn(),
	},
} satisfies Meta<typeof ArenaDesignerView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A new save: three materials, nothing fused, and a board nobody has touched. */
export const BareBoard: Story = {};

/** Ground laid down, with the count underneath keeping score. */
export const PaintedBoard: Story = {
	args: {preset: painted()},
};

/** A hole painted on a spawn square, which the designer leaves alone but warns about. */
export const ASpawnSealedOff: Story = {
	args: {preset: painted(), spawns: TWO_SEATS, tool: "collapsed"},
};

/** More seats means more of the ring marked out. */
export const FourSeats: Story = {
	args: {preset: painted(), spawns: FOUR_SEATS, seats: 4},
};

/** Everything bought and a fusion turned up, which is the widest the palette gets. */
export const EverythingUnlocked: Story = {
	args: {elements: EVERY_ELEMENT, fusions: ["steam", "glass"], preset: painted()},
};

/** The eraser picked, which paints squares back to bare ground. */
export const Erasing: Story = {
	args: {preset: painted(), tool: "erase"},
};
