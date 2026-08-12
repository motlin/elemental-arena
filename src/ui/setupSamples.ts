/**
 * The save the setup screen's stories are posed from, described the way src/game/menu.ts describes
 * the real one. The four panels are drawn from the same sample, so a story of one of them and a
 * story of the whole screen are looking at the same game.
 */

import {fn} from "storybook/test";
import type {
	ArenaSetup,
	ArsenalSetup,
	LoadoutChip,
	LoadoutSetup,
	LobbyView,
	SeatRow,
	ShopShelf,
	Swatch,
	TeamTally,
} from "../game/bridge.js";
import {BASE, EL, MV, W, WBASE} from "../game/data/index.js";
import {mvCost} from "../game/lookups.js";
import {PC, PCN, PN} from "../game/state.js";

/** As much of an element, a weapon or a piece of footwork as the setup screen ever reads out. */
interface Sold {
	readonly n: string;
	readonly c?: string;
	readonly d?: string;
	readonly dmg?: number;
	readonly cost?: number;
	readonly price?: number;
	readonly blurb?: string;
}

/** What a save owns before it has bought anything. */
export const STARTERS: readonly string[] = [...BASE, ...WBASE];

/** Every key the game has, which is what a save owns once it has bought the lot. */
export const EVERYTHING: readonly string[] = [...Object.keys(EL), ...Object.keys(W), ...Object.keys(MV)];

/** The colours a seat can be switched to, which is every colour the game has. */
const SWATCHES: readonly Swatch[] = PC.map((colour, i) => ({colour, name: PCN[i] ?? ""}));

/** Seats playing the colours given, which is one colour each unless a side is being made. */
export function seatRows(colours: readonly number[]): SeatRow[] {
	return colours.map((swatch, seat) => ({seat, name: "", placeholder: PN[swatch] ?? "", swatch}));
}

/** The colours in play, counted up the way the note under the seats reads them. */
export function teamTallies(rows: readonly SeatRow[]): TeamTally[] {
	const counts = new Map<number, number>();
	for (const row of rows) counts.set(row.swatch, (counts.get(row.swatch) ?? 0) + 1);
	return [...counts].map(([swatch, seats]) => ({name: PN[swatch] ?? "", colour: PC[swatch] ?? "", seats}));
}

/** A two-hander on default settings, which is the screen a new save opens on. */
export function sampleArena(colours: readonly number[] = [0, 1]): ArenaSetup {
	const seats = seatRows(colours);

	return {
		seats,
		swatches: SWATCHES,
		teams: teamTallies(seats),
		footworkUses: 3,
		smash: false,
		paintball: false,
		chaos: false,
		chaosRound: 1,
		hideHands: true,
		dim: 9,
		hp: 60,
		startNrg: 2,
		openHand: 3,
		setSeatCount: fn(),
		rename: fn(),
		recolour: fn(),
		setFootworkUses: fn(),
		setSmash: fn(),
		setPaintball: fn(),
		setChaos: fn(),
		setChaosRound: fn(),
		setHideHands: fn(),
		setDim: fn(),
		setHp: fn(),
		setStartNrg: fn(),
		setOpenHand: fn(),
	};
}

/** Chips for one kind of card, cheapest first, with anything in `off` switched out of the match. */
export function sampleChips(
	table: Record<string, Sold>,
	bought: readonly string[],
	off: readonly string[] = [],
): LoadoutChip[] {
	return Object.entries(table)
		.map(([key, item]) => ({key, item, price: item.cost ?? item.price ?? 0}))
		.sort((a, b) => a.price - b.price)
		.map(({key, item, price}) => ({
			key,
			name: item.n,
			colour: item.c ?? "var(--accent)",
			owned: bought.includes(key),
			price,
			on: !off.includes(key),
		}));
}

/** The loadout as it stands for everyone, with nothing switched off. */
export function sampleLoadout(bought: readonly string[]): LoadoutSetup {
	const anyFootwork = Object.keys(MV).some((key) => bought.includes(key));

	return {
		who: "all",
		scopes: [
			{who: "all", label: "Everyone", colour: "var(--accent)", own: false},
			{who: 0, label: PN[0] ?? "", colour: PC[0] ?? "", own: false},
			{who: 1, label: PN[1] ?? "", colour: PC[1] ?? "", own: false},
		],
		elements: sampleChips(EL, bought),
		weapons: sampleChips(W, bought),
		footwork: sampleChips(MV, bought),
		allFootwork: anyFootwork,
		noFootwork: !anyFootwork,
		anyFootwork,
		setWho: fn(),
		toggleElement: fn(),
		toggleWeapon: fn(),
		toggleFootwork: fn(),
		setAllFootwork: fn(),
		share: null,
	};
}

interface ShelfSpec {
	readonly heading: string;
	readonly table: Record<string, Sold>;
	/** What one of them costs in coin, which is zero for anything never sold. */
	readonly price: (item: Sold) => number;
	readonly blurb: (key: string, item: Sold) => string;
	/** The dot beside the name, or null for footwork, which wears the accent instead. */
	readonly colour: (item: Sold) => string | null;
}

const SHELVES: readonly ShelfSpec[] = [
	{
		heading: "Elements",
		table: EL,
		price: (item) => item.cost ?? 0,
		blurb: (_, item) => item.blurb ?? "",
		colour: (item) => item.c ?? null,
	},
	{
		heading: "Weapons",
		table: W,
		price: (item) => item.price ?? 0,
		blurb: (_, item) => `${item.d ?? ""} ${item.dmg ?? 0} damage, ${item.cost ?? 0} energy.`,
		colour: (item) => item.c ?? null,
	},
	{
		heading: "Footwork",
		table: MV,
		price: (item) => item.price ?? 0,
		blurb: (key, item) => `${item.d ?? ""} ${mvCost(key)} energy each.`,
		colour: () => null,
	},
];

function shelf(spec: ShelfSpec, coins: number, bought: readonly string[]): ShopShelf {
	const rows = Object.entries(spec.table)
		.map(([key, item]) => ({key, item, price: spec.price(item)}))
		.filter((row) => row.price > 0)
		.sort((a, b) => a.price - b.price)
		.map(({key, item, price}) => ({
			key,
			name: item.n,
			blurb: spec.blurb(key, item),
			colour: spec.colour(item),
			owned: bought.includes(key),
			price,
			affordable: coins >= price,
		}));
	const left = rows.filter((row) => !row.owned);
	const due = left.reduce((a, row) => a + row.price, 0);

	return {
		heading: spec.heading,
		rows,
		due: left.length === 0 ? null : due,
		left: left.length,
		affordable: coins >= due,
		buy: fn(),
		buyAll: fn(),
	};
}

/** The three shelves as a treasury of `coins` sees them, with `bought` already in the arsenal. */
export function sampleShelves(coins: number, bought: readonly string[]): ShopShelf[] {
	return SHELVES.map((spec) => shelf(spec, coins, bought));
}

/** The arsenal as it stands, with the code box still taking guesses. */
export function sampleArsenal(coins: number, bought: readonly string[]): ArsenalSetup {
	return {
		coins,
		saveError: null,
		shelves: sampleShelves(coins, bought),
		cheat: "open",
		tries: 0,
		triesAllowed: 5,
		submitCode: fn(),
		resetProgress: fn(),
	};
}

/** The online panel, posed either before a match has been opened or with one already dealt. */
export function sampleLobby(code: string | null = null): LobbyView {
	return {
		code,
		opening: false,
		error: null,
		links:
			code === null
				? []
				: [0, 1].map((seat) => ({
						seat,
						name: PCN[seat] ?? "",
						url: `https://elemental.example/?code=${code}&seat=${seat}&token=0000-000${seat}`,
					})),
		host: fn(),
		sit: fn(),
		join: fn(),
	};
}
