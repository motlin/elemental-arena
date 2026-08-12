import type {Meta, StoryObj} from "@storybook/react-vite";
import {OnlinePanel} from "./OnlinePanel.js";
import {sampleLobby} from "./setupSamples.js";
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

/** A match dealt and waiting: one link per seat, either to copy or to sit down in. */
export const AMatchOpened: Story = {args: sampleLobby("quiet-forge")};

/** The host request in flight, which spends the button until the server answers. */
export const Opening: Story = {args: {...sampleLobby(), opening: true}};

/** The server turned the match down, which is the one thing the panel has to say out loud. */
export const TheServerSaidNo: Story = {
	args: {...sampleLobby(), error: "the match server answered 500"},
};
