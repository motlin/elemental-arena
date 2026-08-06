import type {Meta, StoryObj} from "@storybook/react-vite";
import {MatchScreenView} from "./MatchScreen.js";
import {sampleMatch} from "./matchSample.js";
import "../styles/index.css";

const MATCH = sampleMatch();

const meta = {
	title: "Arena/MatchScreen",
	component: MatchScreenView,
	parameters: {layout: "fullscreen"},
	tags: ["autodocs"],
	args: {view: MATCH},
} satisfies Meta<typeof MatchScreenView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Mid-match from the seat whose turn it is: ground laid, a weapon in hand, and a square being shared. */
export const MidMatch: Story = {};

/** Inspect on, which lights its button up and offers the reach overlay under the readout. */
export const Inspecting: Story = {
	args: {view: {...MATCH, topbar: {...MATCH.topbar, inspecting: true}}},
};

/** One tap into a forfeit, where the button warns rather than asks. */
export const ForfeitArmed: Story = {
	args: {
		view: {...MATCH, topbar: {...MATCH.topbar, forfeitLabel: "Tap again to fall", forfeitArmed: true}},
	},
};

/** Chaos mode is owed a card, so the turn cannot be ended until one is thrown away. */
export const ChaosOwedACard: Story = {
	args: {
		view: {
			...MATCH,
			topbar: {...MATCH.topbar, round: "ROUND 6  ·  4/9 ENERGY  ·  CHAOS MODE", canEndTurn: false},
		},
	},
};
