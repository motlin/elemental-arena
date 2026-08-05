import type {Meta, StoryObj} from "@storybook/react-vite";
import {fn} from "storybook/test";
import {LoadoutPanel} from "./LoadoutPanel.js";
import {EVERYTHING, STARTERS, sampleChips, sampleLoadout} from "./setupSamples.js";
import {EL, MV, W} from "../game/data/index.js";
import "../styles/index.css";

const meta = {
	title: "Arena/LoadoutPanel",
	component: LoadoutPanel,
	tags: ["autodocs"],
	args: sampleLoadout(STARTERS),
} satisfies Meta<typeof LoadoutPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A new save: the three starting elements and the starting weapons, everything else priced up. */
export const ANewSave: Story = {};

/** Everything bought, so every chip can be switched on and off. */
export const EverythingBought: Story = {
	args: sampleLoadout(EVERYTHING),
};

/** A few cards switched off for this match, which greys them out without selling them back. */
export const SomethingSwitchedOff: Story = {
	args: {
		...sampleLoadout(EVERYTHING),
		elements: sampleChips(EL, EVERYTHING, ["water", "air"]),
		weapons: sampleChips(W, EVERYTHING, ["dagger"]),
	},
};

/** One seat being edited, still drawing from the list everybody else does. */
export const OneSeatOnTheSharedList: Story = {
	args: {...sampleLoadout(EVERYTHING), who: 0},
};

/** One seat given a list of its own, marked with a star and offered a way back. */
export const OneSeatWithTheirOwnList: Story = {
	args: (() => {
		const shared = sampleLoadout(EVERYTHING);
		return {
			...shared,
			who: 0,
			scopes: shared.scopes.map((scope) => (scope.who === 0 ? {...scope, own: true} : scope)),
			elements: sampleChips(EL, EVERYTHING, ["fire"]),
			footwork: sampleChips(MV, EVERYTHING, ["jump"]),
			allFootwork: false,
			share: fn(),
		};
	})(),
};
