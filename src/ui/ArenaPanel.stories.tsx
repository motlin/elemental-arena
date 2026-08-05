import type {Meta, StoryObj} from "@storybook/react-vite";
import {ArenaPanel} from "./ArenaPanel.js";
import {sampleArena, seatRows, teamTallies} from "./setupSamples.js";
import {PC} from "../game/state.js";
import "../styles/index.css";

/** Every colour seated at once, which is the biggest table the game deals. */
const FULL_TABLE = seatRows([0, 1, 2, 3, 4, 5, 6, 7]);

const meta = {
	title: "Arena/ArenaPanel",
	component: ArenaPanel,
	tags: ["autodocs"],
	args: sampleArena(),
} satisfies Meta<typeof ArenaPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A fresh setup screen: two fighters, each on their own. */
export const TwoOnTheirOwn: Story = {};

/** Two seats given the same colour, which puts them on a side together. */
export const ASideOfTwo: Story = {
	args: {
		seats: seatRows([0, 0]).map((row) => ({...row, name: "The Twins"})),
		teams: [{name: "The Twins", colour: PC[0] ?? "", seats: 2}],
	},
};

/** A full table, which is as many seats as there are colours. */
export const AFullTable: Story = {
	args: {seats: FULL_TABLE, teams: teamTallies(FULL_TABLE)},
};

/** Every switch thrown, with chaos held back until the match has warmed up. */
export const EverySwitchOn: Story = {
	args: {smash: true, paintball: true, chaos: true, chaosRound: 5, hideHands: false},
};

/** The widest board the game deals, fought over by fighters who take some killing. */
export const AGreatBigArena: Story = {
	args: {dim: 25, hp: 1000, startNrg: 9, openHand: 12, footworkUses: 99},
};
