import type {Meta, StoryObj} from "@storybook/react-vite";
import {fn} from "storybook/test";
import {MixingTableView} from "./MixingTable.js";
import {EL, FUSE, MV} from "../game/data/index.js";
import "../styles/index.css";

/** A save that has turned up everything, which is the grid at its most readable. */
const EVERY_ELEMENT = Object.keys(EL);
const EVERY_FUSION = [...new Set(Object.values(FUSE))];
const EVERY_MOVE = Object.keys(MV);

const meta = {
	title: "Arena/MixingTable",
	component: MixingTableView,
	parameters: {layout: "fullscreen"},
	tags: ["autodocs"],
	args: {
		owned: ["fire", "water", "earth"],
		found: [],
		footwork: [],
		picked: "fire",
		close: fn(),
		pick: fn(),
	},
} satisfies Meta<typeof MixingTableView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A new save: three elements bought, nothing mixed yet, and fire read out underneath. */
export const NewSave: Story = {};

/** The first fusion turned up in play, with the pair that makes it lit along both edges. */
export const AFusionDiscovered: Story = {
	args: {found: ["steam"], picked: "steam"},
};

/** An element nobody has bought reads as a price rather than as ground. */
export const AnElementNotBought: Story = {
	args: {picked: "air"},
};

/** A pair both bought but never mixed says what to do about it. */
export const AFusionNotYetMixed: Story = {
	args: {owned: EVERY_ELEMENT, picked: "steam"},
};

/** Footwork in the arsenal reads out what it does and what a use costs. */
export const FootworkOwned: Story = {
	args: {footwork: EVERY_MOVE, picked: "mv:jump"},
};

/** Footwork nobody has bought keeps its trick to itself. */
export const FootworkNotBought: Story = {
	args: {picked: "mv:jump"},
};

/** Everything bought and every fusion turned up. */
export const EverythingDiscovered: Story = {
	args: {owned: EVERY_ELEMENT, found: EVERY_FUSION, footwork: EVERY_MOVE},
};

/** Nothing picked at all, which only happens before the first click. */
export const NothingPicked: Story = {
	args: {picked: null},
};
