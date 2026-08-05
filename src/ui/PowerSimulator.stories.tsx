import type {Meta, StoryObj} from "@storybook/react-vite";
import {fn} from "storybook/test";
import {PowerSimulatorView} from "./PowerSimulator.js";
import {EL, FUSE, W} from "../game/data/index.js";
import "../styles/index.css";

/** A save that has bought the lot, which is what the shelves look like at their fullest. */
const EVERY_WEAPON = Object.keys(W);
const EVERY_ELEMENT = Object.keys(EL);
const EVERY_FUSION = [...new Set(Object.values(FUSE))];

const meta = {
	title: "Arena/PowerSimulator",
	component: PowerSimulatorView,
	parameters: {layout: "fullscreen"},
	tags: ["autodocs"],
	args: {
		weapons: ["dagger", "sword", "crossbow"],
		elements: ["fire", "water", "earth"],
		fusions: [],
		hp: 60,
		card: {ids: [], els: []},
		close: fn(),
		add: fn(),
		drop: fn(),
		clear: fn(),
	},
} satisfies Meta<typeof PowerSimulatorView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A new save: three weapons, three elements, nothing mixed yet, and nothing on the card. */
export const NewSave: Story = {};

export const OneWeapon: Story = {
	args: {card: {ids: ["dagger"], els: []}},
};

/** Elements forged on rename the card and add their rider to it. */
export const AForgedCard: Story = {
	args: {card: {ids: ["sword"], els: ["fire", "bolt"]}, elements: EVERY_ELEMENT},
};

/** Doubles collapse into one tag with a count, on the card's name as well as under it. */
export const StackedDoubles: Story = {
	args: {card: {ids: ["dagger", "dagger", "sword"], els: ["fire", "fire"]}},
};

/** Poison doubles the weapon and space doubles it again, which is where the tiles run long. */
export const NumbersOffTheScale: Story = {
	args: {
		card: {ids: ["cannon", "cannon"], els: ["poison", "poison", "space", "space"]},
		weapons: EVERY_WEAPON,
		elements: EVERY_ELEMENT,
		hp: 1000,
	},
};

/** Everything bought and every fusion discovered. */
export const EverythingUnlocked: Story = {
	args: {weapons: EVERY_WEAPON, elements: EVERY_ELEMENT, fusions: EVERY_FUSION},
};

/** Every shelf has an answer for having nothing on it, even a save always keeps its starters. */
export const NothingUnlocked: Story = {
	args: {weapons: [], elements: [], fusions: []},
};
