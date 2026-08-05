import {useState, useSyncExternalStore, type CSSProperties, type ReactElement} from "react";
import {simStore, type SimView} from "../game/bridge.js";
import {elColor, elName, forgeOf, wCost, wDesc, wHits, wReach, wepDmg, wepName, wepOf} from "../game/lookups.js";
import type {WeaponSpec} from "../game/types.js";

/** Which half of the card a part belongs to: a weapon it is built from, or an element forged on. */
type Kind = "w" | "el";

interface FigureProps {
	readonly value: number | string;
	readonly label: string;
	/** Set on the one figure the whole screen is really asked for. */
	readonly hot?: boolean;
}

/** How the game reads a number back: long ones step down a size rather than break the tile. */
function Figure({value, label, hot = false}: FigureProps): ReactElement {
	const text = typeof value === "number" ? value.toLocaleString() : value;
	const size = text.length > 9 ? "vlong" : text.length > 6 ? "long" : "";

	return (
		<div className={hot ? "sn hot" : "sn"}>
			<b className={size} title={text}>
				{text}
			</b>
			<span>{label}</span>
		</div>
	);
}

/** The colour dot every weapon and element wears beside its name. */
function Swatch({colour}: {readonly colour: string}): ReactElement {
	const style: CSSProperties = {background: colour};

	return <span className="d" style={style} />;
}

interface ShelfProps {
	readonly heading: string;
	readonly keys: readonly string[];
	/** What to say when the save has nothing of this kind yet. */
	readonly bare: string;
	readonly label: (key: string) => string;
	readonly colour: (key: string) => string;
	readonly add: (key: string) => void;
}

/** One row of things that can be stacked onto the card, or a line saying there are none. */
function Shelf({heading, keys, bare, label, colour, add}: ShelfProps): ReactElement {
	return (
		<>
			<div className="bhead">{heading}</div>
			<div className="bpal">
				{keys.length === 0 ? (
					<span className="hint">{bare}</span>
				) : (
					keys.map((k) => (
						<button
							key={k}
							type="button"
							className="bp"
							onClick={() => {
								add(k);
							}}
						>
							<Swatch colour={colour(k)} />
							{label(k)}
						</button>
					))
				)}
			</div>
		</>
	);
}

/** Duplicates collapse into one tag with a count; the cross takes one copy off at a time. */
function tally(list: readonly string[]): [string, number][] {
	const counts = new Map<string, number>();
	for (const k of list) counts.set(k, (counts.get(k) ?? 0) + 1);
	return [...counts];
}

interface PartsProps {
	readonly card: WeaponSpec;
	readonly drop: (kind: Kind, key: string) => void;
	readonly clear: () => void;
}

/** Everything stacked onto the card so far, and the one way to take it all back off. */
function Parts({card, drop, clear}: PartsProps): ReactElement | null {
	if (card.ids.length === 0 && card.els.length === 0) return null;

	const tag = (kind: Kind, key: string, count: number, colour: string, label: string): ReactElement => (
		<span className="pt" key={`${kind}:${key}`}>
			<Swatch colour={colour} />
			{label}
			{count > 1 && (
				<>
					{" "}
					<b className="ptn">{`x${count}`}</b>
				</>
			)}
			<button
				type="button"
				className="ptdrop"
				title="Remove one"
				onClick={() => {
					drop(kind, key);
				}}
			>
				&times;
			</button>
		</span>
	);

	return (
		<div className="simparts">
			{tally(card.ids).map(([k, c]) => tag("w", k, c, wepOf(k).c, wepOf(k).n))}
			{tally(card.els).map(([k, c]) => tag("el", k, c, elColor(k), elName(k)))}
			<button type="button" className="bp simclear" onClick={clear}>
				Clear
			</button>
		</div>
	);
}

interface ReadoutProps {
	/** A card with at least one weapon on it: an element on its own cannot be swung. */
	readonly card: WeaponSpec;
	readonly hp: number;
}

/** What the card would do if it were real, from the swing itself out to how long a fight lasts. */
function Readout({card, hp}: ReadoutProps): ReactElement {
	const dmg = wepDmg(card),
		hits = wHits(card),
		cost = wCost(card),
		total = dmg * hits;
	const fx = [...new Set(card.els.map((x) => forgeOf(x).fx))];

	return (
		<>
			<div className="simname">{wepName(card)}</div>
			<div className="simempty">{wDesc(card)}</div>
			<div className="simnums">
				<Figure value={dmg} label="per strike" />
				<Figure value={hits} label="strikes" />
				<Figure value={total} label="total damage" hot />
				<Figure value={cost} label="energy" />
				<Figure value={(total / cost).toFixed(1)} label="per energy" />
				<Figure value={wReach(card)} label="squares hit" />
				<Figure value={Math.ceil(hp / total)} label={`swings to drop ${hp} hp`} />
				<Figure value={Math.max(1, cost - 1)} label="earliest turn" />
			</div>
			{fx.length > 0 && <div className="simfx">{`On hit: ${fx.join(". ")}.`}</div>}
		</>
	);
}

export interface PowerSimulatorViewProps extends SimView {
	/** The card as it stands: the weapons it is built from and the elements forged onto them. */
	readonly card: WeaponSpec;
	readonly add: (kind: Kind, key: string) => void;
	readonly drop: (kind: Kind, key: string) => void;
	readonly clear: () => void;
}

/**
 * The simulator itself, posed from plain props so Storybook and tests can look at it without a save
 * behind it.
 */
export function PowerSimulatorView({
	weapons,
	elements,
	fusions,
	hp,
	close,
	card,
	add,
	drop,
	clear,
}: PowerSimulatorViewProps): ReactElement {
	return (
		<div className="sim">
			<div className="tbox">
				<div className="thead">
					<h2>Power simulator</h2>
					<button type="button" className="ghost" onClick={close}>
						Close
					</button>
				</div>
				<p className="thint">
					Stack anything together and watch the numbers. Nothing here touches a match, and nothing is spent.
					Fused elements show up once you have discovered them in play.
				</p>
				<div className="simbuild">
					{card.ids.length === 0 ? (
						<div className="simempty">Add a weapon to begin. Elements on their own cannot be swung.</div>
					) : (
						<Readout card={card} hp={hp} />
					)}
					<Parts card={card} drop={drop} clear={clear} />
				</div>
				<Shelf
					heading="Weapons"
					keys={weapons}
					bare="No weapons yet."
					label={(k) => `${wepOf(k).n} · ${wepOf(k).dmg}`}
					colour={(k) => wepOf(k).c}
					add={(k) => {
						add("w", k);
					}}
				/>
				<Shelf
					heading="Elements"
					keys={elements}
					bare="No elements yet."
					label={elName}
					colour={elColor}
					add={(k) => {
						add("el", k);
					}}
				/>
				<Shelf
					heading="Fused elements"
					keys={fusions}
					bare="None discovered yet. Mix some in a match."
					label={elName}
					colour={elColor}
					add={(k) => {
						add("el", k);
					}}
				/>
			</div>
		</div>
	);
}

/**
 * Owns the card being built. It only exists while the simulator is up, so every visit starts from
 * an empty card and nothing the player stacks here can reach a match.
 */
function SimBox(view: SimView): ReactElement {
	const [card, setCard] = useState<WeaponSpec>({ids: [], els: []});
	const listOf = (kind: Kind): "ids" | "els" => (kind === "w" ? "ids" : "els");

	return (
		<PowerSimulatorView
			{...view}
			card={card}
			add={(kind, key) => {
				setCard((c) => ({...c, [listOf(kind)]: [...c[listOf(kind)], key]}));
			}}
			drop={(kind, key) => {
				setCard((c) => {
					const list = [...c[listOf(kind)]];
					const at = list.lastIndexOf(key);
					if (at >= 0) list.splice(at, 1);
					return {...c, [listOf(kind)]: list};
				});
			}}
			clear={() => {
				setCard({ids: [], els: []});
			}}
		/>
	);
}

/**
 * The workbench off the setup screen: stack weapons and elements into a card that will never be
 * dealt, and read off what it would do if it were. Nothing here touches a match or the treasury.
 */
export function PowerSimulator(): ReactElement | null {
	const view = useSyncExternalStore(simStore.subscribe, simStore.get, simStore.get);

	return view === null ? null : <SimBox {...view} />;
}
