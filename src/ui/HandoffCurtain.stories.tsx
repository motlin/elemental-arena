import type {Meta, StoryObj} from "@storybook/react-vite";
import {fn} from "storybook/test";
import {HandoffCurtainView} from "./HandoffCurtain.js";
import "../styles/index.css";

const meta = {
	title: "Arena/HandoffCurtain",
	component: HandoffCurtainView,
	parameters: {layout: "fullscreen"},
	tags: ["autodocs"],
	argTypes: {colour: {control: "color"}},
	args: {dismiss: fn()},
} satisfies Meta<typeof HandoffCurtainView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FirstSeat: Story = {
	args: {seat: 0, name: "Vermilion", colour: "#ff4d8d"},
};

export const FourthSeat: Story = {
	args: {seat: 3, name: "Amethyst", colour: "#c98cff"},
};

/** Seats can be renamed in the menu, so the curtain has to cope with whatever it is handed. */
export const RenamedSeat: Story = {
	args: {seat: 5, name: "The Reigning Champion", colour: "#4dffb0"},
};
