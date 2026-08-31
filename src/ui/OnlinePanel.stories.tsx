import type {Meta, StoryObj} from "@storybook/react-vite";
import {OnlinePanel} from "./OnlinePanel.js";
import {sampleBringing, sampleLobby} from "./setupSamples.js";
import "../styles/index.css";

const meta = {
	title: "Arena/OnlinePanel",
	component: OnlinePanel,
	parameters: {layout: "centered"},
	tags: ["autodocs"],
	args: sampleLobby(),
} satisfies Meta<typeof OnlinePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Before anything has been opened: one button, and a box for somebody else's link. */
export const NothingOpenYet: Story = {};

/** A match dealt and waiting: one link to send round, and a seat to take in it. */
export const AMatchOpened: Story = {args: sampleLobby("quiet-forge")};

/** The host request in flight, which spends the button until the server answers. */
export const Opening: Story = {args: {...sampleLobby(), opening: true}};

/** The server turned the match down, which is the one thing the panel has to say out loud. */
export const TheServerSaidNo: Story = {
	args: {...sampleLobby(), error: "the match server answered 500"},
};

/** A treasury that has outgrown the cap: the rows over it are marked, and the button is spent. */
export const MoreThanTheWireTakes: Story = {
	args: {
		...sampleLobby(),
		loadout: sampleBringing({
			rows: [
				{heading: "Elements", names: ["Fire", "Water", "Earth", "Frost", "Shadow"], over: true},
				{heading: "Weapons", names: ["Dagger", "Sword", "Crossbow"], over: false},
				{heading: "Footwork", names: ["Jump", "Dash", "Leap", "Float"], over: true},
			],
			ready: false,
		}),
	},
};

/** Three of each, footwork included, which is as much as an online match will ever be dealt. */
export const AFullLoadout: Story = {
	args: {
		...sampleLobby(),
		loadout: sampleBringing({
			rows: [
				{heading: "Elements", names: ["Fire", "Frost", "Shadow"], over: false},
				{heading: "Weapons", names: ["Dagger", "Longbow", "Cannon"], over: false},
				{heading: "Footwork", names: ["Jump", "Dash", "Leap"], over: false},
			],
		}),
	},
};
