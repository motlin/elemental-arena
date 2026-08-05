import type {Meta, StoryObj} from "@storybook/react-vite";
import {ArsenalPanel} from "./ArsenalPanel.js";
import {EVERYTHING, STARTERS, sampleArsenal, sampleShelves} from "./setupSamples.js";
import "../styles/index.css";

const meta = {
	title: "Arena/ArsenalPanel",
	component: ArsenalPanel,
	tags: ["autodocs"],
	args: sampleArsenal(0, STARTERS),
} satisfies Meta<typeof ArsenalPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A new save: an empty treasury, so every row is a tease nobody can afford. */
export const AnEmptyTreasury: Story = {};

/** Coin enough for anything, which lights up every buy button and every sweep. */
export const AFullTreasury: Story = {
	args: sampleArsenal(25000, STARTERS),
};

/** Every shelf cleared, which leaves the headers with nothing left to sell. */
export const EverythingOwned: Story = {
	args: sampleArsenal(12, EVERYTHING),
};

/** Progress that will not save says so above the code box rather than losing it quietly. */
export const ProgressNotSaving: Story = {
	args: {saveError: "quota exceeded"},
};

/** A guess spent on the code, with the rest counted down. */
export const AGuessSpent: Story = {
	args: {tries: 2},
};

/** Every guess spent, which takes the box away for good. */
export const OutOfGuesses: Story = {
	args: {cheat: "spent", tries: 5},
};

/** The code accepted, which fills the treasury and opens the whole codex. */
export const TheCodeAccepted: Story = {
	args: {cheat: "accepted", coins: 9999999999, shelves: sampleShelves(9999999999, EVERYTHING)},
};
