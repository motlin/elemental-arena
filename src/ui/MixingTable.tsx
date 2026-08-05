import {Fragment, useState, useSyncExternalStore, type CSSProperties, type ReactElement, type ReactNode} from "react";
import {tableStore, type TableView} from "../game/bridge.js";
import {EL, MV} from "../game/data/index.js";
import {
	elColor,
	elCost,
	elName,
	forgeOf,
	fusionOf,
	groundOf,
	isEl,
	madeFrom,
	mixesIntoKeys,
	moveOf,
	mvCost,
	parentsOf,
	wepDmg,
} from "../game/lookups.js";

/** The elements down both edges of the grid, in the order the data table lists them. */
const ELS = Object.keys(EL);

/** What a bare weapon deals, which is the figure the forged one is read against. */
const PLAIN_SWORD = wepDmg({ids: ["sword"], els: []});
const PLAIN_CROSSBOW = wepDmg({ids: ["crossbow"], els: []});

/** The forge line stands as its own sentence; the ground line runs on from "Lays X:". */
const opens = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const runsOn = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

/** The three questions every part of the table asks of the save it was opened from. */
interface Save {
	/** Whether an element has been bought, which is what lets anything made from it be read. */
	readonly bought: (key: string) => boolean;
	/** Whether an entry can be read at all: a bought element, or a fusion discovered in play. */
	readonly readable: (key: string) => boolean;
	/** Whether a piece of footwork is in the arsenal. */
	readonly learnt: (key: string) => boolean;
}

/** The colour dot every element, fusion and piece of footwork wears beside its name. */
function Swatch({colour}: {readonly colour: string}): ReactElement {
	const style: CSSProperties = {background: colour};

	return <span className="d" style={style} />;
}

/** One labelled line of the detail pane. */
function Row({label, children}: {readonly label: string; readonly children: ReactNode}): ReactElement {
	return (
		<div className="drow">
			<span>{label}</span>
			<span>{children}</span>
		</div>
	);
}

interface HeadProps {
	readonly colour: string;
	readonly name: string;
	/** Where it came from, or how it stands in the arsenal; nothing at all for a mystery. */
	readonly made?: string;
	/** Greys the name out for something that cannot be read yet. */
	readonly muted?: boolean;
}

/** The dot, the name, and the aside that top the detail pane. */
function Head({colour, name, made, muted = false}: HeadProps): ReactElement {
	const style: CSSProperties | undefined = muted ? {color: "var(--muted)"} : undefined;

	return (
		<div className="dh">
			<Swatch colour={colour} />
			<b style={style}>{name}</b>
			{made !== undefined && <span className="made">{made}</span>}
		</div>
	);
}

/** Reads a short list out as a sentence: one piece, then the word between, then the next. */
function weave(pieces: readonly ReactNode[], between: string): ReactElement[] {
	return pieces.map((piece, i) => (
		// the pieces are fixed positions in a sentence, so the index is the only name they have
		<Fragment key={i}>
			{i > 0 && between}
			{piece}
		</Fragment>
	));
}

interface DetailProps {
	readonly what: string;
	readonly save: Save;
}

/** A piece of footwork: what it does and what it costs, or what it would take to find out. */
function MoveDetail({what, save}: DetailProps): ReactElement {
	const mv = moveOf(what);

	if (!save.learnt(what)) {
		return (
			<>
				<Head colour="var(--muted)" name={mv.n} made="not bought yet" />
				<Row label="What it does">? ? ?</Row>
				<Row label="Price">
					Buy it for <em>{mv.price}</em> coin to find out.
				</Row>
			</>
		);
	}

	return (
		<>
			<Head colour="var(--accent)" name={mv.n} made="in your arsenal" />
			<Row label="What it does">{mv.d}</Row>
			<Row label="Costs">
				<em>{mvCost(what)}</em> energy a use
			</Row>
			<Row label="Giving it out">
				Hand it to a fighter on the setup screen. Each one only gets what you assign.
			</Row>
		</>
	);
}

/** Something not yet readable: either the parts have not been bought, or nobody has mixed it. */
function MysteryDetail({what, save}: DetailProps): ReactElement {
	const base = isEl(what);
	const unbought = (base ? [what] : parentsOf(what)).filter((k) => !save.bought(k));

	return (
		<>
			<Head colour="var(--muted)" name={base ? elName(what) : "? ? ?"} muted />
			{unbought.length > 0 ? (
				<>
					<Row label="Underfoot">? ? ?</Row>
					<Row label="In the forge">? ? ?</Row>
					<Row label="Not bought">
						Buy{" "}
						{weave(
							unbought.map((k) => (
								<>
									<em>{elName(k)}</em> for {elCost(k)} coin
								</>
							)),
							" and ",
						)}{" "}
						to read this.
					</Row>
				</>
			) : (
				<Row label="Undiscovered">
					Mix{" "}
					{weave(
						madeFrom(what).map((pair) => <em>{pair}</em>),
						" or ",
					)}{" "}
					in a match to find out what it makes.
				</Row>
			)}
		</>
	);
}

/** An element or fusion the save can read: the ground it lays and what it does to a weapon. */
function ElementDetail({what, save}: DetailProps): ReactElement {
	const ground = groundOf(what);
	const {fx} = forgeOf(what);
	const from = madeFrom(what);
	const into = mixesIntoKeys(what);

	return (
		<>
			<Head colour={ground.c} name={elName(what)} made={from.length > 0 ? from.join("  or  ") : "base element"} />
			<Row label="Underfoot">
				Lays <em>{ground.n}</em>: {runsOn(ground.d)}.
			</Row>
			<Row label="In the forge">{opens(fx)}.</Row>
			<Row label="Sword">
				<em>{PLAIN_SWORD}</em> becomes <em>{wepDmg({ids: ["sword"], els: [what]})}</em>
			</Row>
			<Row label="Crossbow">
				<em>{PLAIN_CROSSBOW}</em> becomes <em>{wepDmg({ids: ["crossbow"], els: [what]})}</em>
			</Row>
			{into.length > 0 && (
				<Row label="Mixes into">{into.map((k) => (save.readable(k) ? elName(k) : "? ? ?")).join(", ")}</Row>
			)}
		</>
	);
}

/** The pane under the grid, which always has something to say about whatever is picked. */
function Detail({what, save}: {readonly what: string | null; readonly save: Save}): ReactElement {
	if (what === null) {
		return (
			<p className="thint" style={{margin: 0}}>
				Pick any cell above, or a piece of footwork.
			</p>
		);
	}
	if (what.startsWith("mv:")) return <MoveDetail what={what.slice(3)} save={save} />;
	if (!save.readable(what)) return <MysteryDetail what={what} save={save} />;
	return <ElementDetail what={what} save={save} />;
}

interface HeaderProps {
	readonly el: string;
	/** The left edge reads right-aligned into the grid rather than centred over it. */
	readonly leftEdge: boolean;
	/** Set while this element is one of the parents of whatever is picked. */
	readonly lit: boolean;
	readonly save: Save;
	readonly pick: (key: string) => void;
}

/** An element name along an edge of the grid, which reads out the element itself when clicked. */
function Header({el, leftEdge, lit, save, pick}: HeaderProps): ReactElement {
	const style: CSSProperties = {color: save.bought(el) ? elColor(el) : "var(--muted)"};
	if (leftEdge) {
		style.alignItems = "flex-end";
		style.textAlign = "right";
	}

	return (
		<button
			type="button"
			className={lit ? "mc hdr parent" : "mc hdr"}
			style={style}
			onClick={() => {
				pick(el);
			}}
		>
			{elName(el)}
		</button>
	);
}

interface CellProps {
	readonly row: string;
	readonly col: string;
	/** The elements the picked entry is made from, which this cell may be the meeting point of. */
	readonly parents: readonly string[];
	readonly picked: string | null;
	readonly save: Save;
	readonly pick: (key: string) => void;
}

/** What one pair of elements makes, named once the save has turned it up. */
function Cell({row, col, parents, picked, save, pick}: CellProps): ReactElement {
	const made = fusionOf(row, col);
	const readable = save.readable(made);
	// the two squares where the picked entry's parents cross are where it gets made
	const madeHere =
		parents.length === 2
			? (row === parents[0] && col === parents[1]) || (row === parents[1] && col === parents[0])
			: parents.length === 1 && row === parents[0] && col === parents[0];
	const classes = ["mc", readable ? "found" : "unknown"];
	if (row === col) classes.push("self");
	if (madeHere) classes.push("parent");

	return (
		<button
			type="button"
			className={classes.join(" ")}
			aria-pressed={picked === made}
			onClick={() => {
				pick(made);
			}}
		>
			<Swatch colour={readable ? elColor(made) : "var(--muted)"} />
			<span>{readable ? elName(made) : "? ? ?"}</span>
		</button>
	);
}

interface MatrixProps {
	readonly picked: string | null;
	readonly save: Save;
	readonly pick: (key: string) => void;
}

/** Every element crossed with every other, the diagonal included. */
function Matrix({picked, save, pick}: MatrixProps): ReactElement {
	const style: CSSProperties = {gridTemplateColumns: `68px repeat(${ELS.length},minmax(62px,1fr))`};
	// an element points at itself, a fusion points back at the pair that makes it
	const parents = picked === null ? [] : isEl(picked) ? [picked] : save.readable(picked) ? parentsOf(picked) : [];
	const lit = (el: string): boolean => parents.includes(el);

	return (
		<div className="matrix" style={style}>
			<div className="mc hdr" />
			{ELS.map((el) => (
				<Header key={el} el={el} leftEdge={false} lit={lit(el)} save={save} pick={pick} />
			))}
			{ELS.map((row) => (
				<Fragment key={row}>
					<Header el={row} leftEdge lit={lit(row)} save={save} pick={pick} />
					{ELS.map((col) => (
						<Cell key={col} row={row} col={col} parents={parents} picked={picked} save={save} pick={pick} />
					))}
				</Fragment>
			))}
		</div>
	);
}

export interface MixingTableViewProps extends TableView {
	/** The cell, element or piece of footwork the detail pane is reading out. */
	readonly picked: string | null;
	readonly pick: (key: string) => void;
}

/**
 * The table itself, posed from plain props so Storybook and tests can look at it without a save
 * behind it.
 */
export function MixingTableView({owned, found, footwork, close, picked, pick}: MixingTableViewProps): ReactElement {
	const save: Save = {
		bought: (k) => owned.includes(k),
		readable: (k) => (isEl(k) ? owned.includes(k) : found.includes(k)),
		learnt: (k) => footwork.includes(k),
	};

	return (
		<div className="table">
			<div className="tbox">
				<div className="thead">
					<h2>Mixing table</h2>
					<button type="button" className="ghost" onClick={close}>
						Close
					</button>
				</div>
				<p className="thint">
					Every pair combines to the same result whether you mix the two cards in your hand or lay one element
					onto the other on the board. The diagonal is a real mix too: two of the same element make something
					new. Click any cell for what it does underfoot and in the forge, an element name along the edge to
					read the element itself, or a piece of footwork below the grid.
				</p>
				<div className="matrixwrap">
					<Matrix picked={picked} save={save} pick={pick} />
				</div>
				<div className="bhead" style={{marginTop: 4}}>
					Footwork
				</div>
				<div className="bpal">
					{Object.entries(MV)
						.sort(([, a], [, b]) => a.price - b.price)
						.map(([k, v]) => (
							<button
								key={k}
								type="button"
								className="bp"
								aria-pressed={picked === `mv:${k}`}
								onClick={() => {
									pick(`mv:${k}`);
								}}
							>
								<Swatch colour={save.learnt(k) ? "var(--accent)" : "var(--muted)"} />
								{v.n}
							</button>
						))}
				</div>
				<div className="tdetail">
					<Detail what={picked} save={save} />
				</div>
			</div>
		</div>
	);
}

/**
 * Owns the one thing the table decides for itself: which entry the detail pane is reading. It only
 * exists while the table is up, so every visit opens on fire the way a new save does.
 */
function TableBox(view: TableView): ReactElement {
	const [picked, setPicked] = useState<string | null>("fire");

	return <MixingTableView {...view} picked={picked} pick={setPicked} />;
}

/**
 * The fusion matrix, reachable from the setup screen and from either side of a match. Every pair of
 * elements meets in a cell, named once the save has bought both halves and mixed them in play, and
 * whatever is picked is read out underneath alongside the footwork palette.
 */
export function MixingTable(): ReactElement | null {
	const view = useSyncExternalStore(tableStore.subscribe, tableStore.get, tableStore.get);

	return view === null ? null : <TableBox {...view} />;
}
