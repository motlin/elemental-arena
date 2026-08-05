import type {Meta, StoryObj} from "@storybook/react-vite";
import {fn} from "storybook/test";
import {GameOverScreenView} from "./GameOverScreen.js";
import type {LogEntry} from "../game/types.js";
import "../styles/index.css";

const LOG: LogEntry[] = [
	{r: 1, who: "Vermilion", c: "#ff4d8d", t: "laid fire under Cyan", say: false},
	{r: 1, who: "Cyan", c: "#4dd8ff", t: "good luck out there", say: true},
	{r: 2, who: "Cyan", c: "#4dd8ff", t: "struck Vermilion for 14", say: false},
	{r: 2, who: "", c: "var(--muted)", t: "the ground fell away under 4,6", say: false},
	{r: 3, who: "Vermilion", c: "#ff4d8d", t: "took the arena", say: false},
];

const meta = {
	title: "Arena/GameOverScreen",
	component: GameOverScreenView,
	parameters: {layout: "fullscreen"},
	tags: ["autodocs"],
	argTypes: {colour: {control: "color"}},
	args: {openReplay: fn(), back: fn(), toggleLog: fn(), logOpen: false, log: LOG},
} satisfies Meta<typeof GameOverScreenView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OneWinner: Story = {
	args: {seat: 0, colour: "#ff4d8d", headline: "Vermilion holds the arena", earn: "+7 coin banked"},
};

/** Teams share the win, so the earn line names everyone still standing. */
export const ATeamWins: Story = {
	args: {
		seat: 1,
		colour: "#4dd8ff",
		headline: "Sky holds the arena",
		earn: "Cyan and Jade  ·  +7 coin banked",
	},
};

/** Everyone can fall in the same round, and then the glyph wears the arena's own grey. */
export const NobodyWalksOut: Story = {
	args: {seat: 0, colour: "#6f7da8", headline: "Nobody walks out", earn: "+2 coin banked"},
};

export const LogUnrolled: Story = {
	args: {
		seat: 0,
		colour: "#ff4d8d",
		headline: "Vermilion holds the arena",
		earn: "+7 coin banked",
		logOpen: true,
	},
};

/** A match called before anyone moved has nothing to show. */
export const EmptyLog: Story = {
	args: {
		seat: 0,
		colour: "#ff4d8d",
		headline: "Vermilion holds the arena",
		earn: "+0 coin banked",
		log: [],
		logOpen: true,
	},
};
