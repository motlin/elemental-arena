import type {Meta, StoryObj} from "@storybook/react-vite";
import {fn} from "storybook/test";
import {SetupScreenView} from "./SetupScreen.js";
import {EVERYTHING, STARTERS, sampleArena, sampleArsenal, sampleLoadout} from "./setupSamples.js";
import "../styles/index.css";

const meta = {
	title: "Arena/SetupScreen",
	component: SetupScreenView,
	parameters: {layout: "fullscreen"},
	tags: ["autodocs"],
	args: {
		arena: sampleArena(),
		loadout: sampleLoadout(STARTERS),
		arsenal: sampleArsenal(0, STARTERS),
		themeLabel: "Day mode",
		toggleTheme: fn(),
		openSimulator: fn(),
		openDesigner: fn(),
		openTable: fn(),
		start: fn(),
	},
} satisfies Meta<typeof SetupScreenView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The screen the game opens on: two fighters, three elements, and an empty treasury. */
export const ANewSave: Story = {};

/** A save that has bought the lot, with the treasury still deep enough to be worth showing. */
export const EverythingBought: Story = {
	args: {loadout: sampleLoadout(EVERYTHING), arsenal: sampleArsenal(4200, EVERYTHING), themeLabel: "Night mode"},
};
