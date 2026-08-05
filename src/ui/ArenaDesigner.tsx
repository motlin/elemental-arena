import {useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactElement} from "react";
import {designStore, type DesignView, type SpawnSpot} from "../game/bridge.js";
import type {TerrainDef} from "../game/data/index.js";
import {elColor, elName, terrOf} from "../game/lookups.js";
import {rgba} from "../game/state.js";

/** React types `style` as CSSProperties, which leaves no room for the custom properties the game's CSS reads. */
type TileStyle = CSSProperties & {"--tc"?: string; "--tcs"?: string};
type GlyphStyle = CSSProperties & {"--pc": string};
type BoardStyle = CSSProperties & {"--cell": string};

/** The two entries in the tool row: a hole opened now, and the eraser. */
const BREAK = "collapsed";
const ERASE = "erase";

/** Every table size the arena can be drawn for. */
const SEATS = [2, 3, 4, 5, 6, 7, 8];

/* Board geometry. The designer has the screen to itself, so the board takes the whole width
   inside the overlay's padding, capped so a small grid does not sprawl and clamped so tiles
   stay big enough to hit with a finger. */
const OVERLAY_PAD = 70;
const BOARD_MAX = 720;
const CELL_MIN = 12;
const CELL_MAX = 40;

/** Largest tile size the board can be drawn at in the room this viewport leaves it. */
function cellSize(dim: number): number {
	const avail = Math.min(window.innerWidth - OVERLAY_PAD, BOARD_MAX);
	return Math.max(CELL_MIN, Math.min(CELL_MAX, Math.floor(avail / dim) - 2));
}

/** What a material is called in the palette: the two tools read as what they do to the ground. */
function toolName(key: string): string {
	if (key === BREAK) return "Break";
	if (key === ERASE) return "Erase";
	return elName(key);
}

/** The ground one painted square lays, or nothing at all where the square is still bare. */
function groundAt(key: string | null | undefined): TerrainDef | undefined {
	return key === null || key === undefined ? undefined : terrOf(key);
}

/** Whether ground walls a square off or opens a hole in it. Terrain flags are set or absent, never
    zero, so a flag is on whenever it is there at all. */
function seals(terrain: TerrainDef | undefined): boolean {
	return terrain?.solid !== undefined || terrain?.gone !== undefined;
}

/** The colour dot every material wears beside its name; the eraser lays nothing, so it wears grey. */
function Swatch({tool}: {readonly tool: string}): ReactElement {
	const style: CSSProperties = {background: tool === ERASE ? "var(--muted)" : elColor(tool)};

	return <span className="d" style={style} />;
}

interface PaletteProps {
	readonly heading: string;
	readonly tools: readonly string[];
	/** What to say when the save has nothing of this kind yet. */
	readonly bare?: string;
	/** The material the next square gets painted with. */
	readonly picked: string;
	readonly pick: (tool: string) => void;
}

/** One row of materials to paint with, or a line saying there are none. */
function Palette({heading, tools, bare, picked, pick}: PaletteProps): ReactElement {
	return (
		<>
			<div className="bhead">{heading}</div>
			<div className="bpal">
				{tools.length === 0 ? (
					<span className="hint">{bare}</span>
				) : (
					tools.map((tool) => (
						<button
							key={tool}
							type="button"
							className="bp mat"
							aria-pressed={picked === tool}
							onClick={() => {
								pick(tool);
							}}
						>
							<Swatch tool={tool} />
							{toolName(tool)}
						</button>
					))
				)}
			</div>
		</>
	);
}

interface SquareProps {
	readonly ground: string | null;
	/** The seat that starts here, if this is one of the spawn squares. */
	readonly spawn: SpawnSpot | undefined;
	/** Which seat that is, which picks the glyph's `p0`..`p7` class. */
	readonly seat: number;
	readonly press: () => void;
	readonly sweep: () => void;
}

/** What a square says when the pointer rests on it: who starts there, or what is underfoot. */
function squareTitle(spawn: SpawnSpot | undefined, terrain: TerrainDef | undefined): string {
	if (spawn !== undefined) return `${spawn.name} starts here`;
	if (terrain === undefined) return "";
	return `${terrain.n}: ${terrain.d}`;
}

/** One square of the arena: the ground painted on it, and the fighter who starts there. */
function Square({ground, spawn, seat, press, sweep}: SquareProps): ReactElement {
	const terrain = groundAt(ground);
	// a spawn square is left exactly as it was painted, so it says what that will cost its seat
	const sealed = spawn !== undefined && seals(terrain);
	const classes = ["tile"];
	if (terrain !== undefined) classes.push("terr");
	if (terrain?.solid !== undefined) classes.push("solid");
	if (terrain?.dead !== undefined) classes.push("gonezone");
	if (sealed) classes.push("willclear");
	const style: TileStyle = terrain === undefined ? {} : {"--tc": terrain.c, "--tcs": rgba(terrain.c, 0.44)};
	const glyph: GlyphStyle | undefined = spawn === undefined ? undefined : {"--pc": spawn.colour};
	const title = squareTitle(spawn, terrain);

	return (
		<div
			className={classes.join(" ")}
			style={style}
			title={title}
			onPointerDown={(e) => {
				e.preventDefault();
				press();
			}}
			onPointerEnter={sweep}
		>
			{spawn !== undefined && <i className={`mage p${seat}`} style={glyph} />}
		</div>
	);
}

interface BoardProps {
	readonly dim: number;
	readonly preset: readonly (string | null)[];
	readonly spawns: readonly SpawnSpot[];
	readonly paint: (index: number, key: string | null) => void;
	/** The material the next square gets painted with. */
	readonly tool: string;
}

/**
 * The grid itself. A stroke starts where the pointer goes down and paints every square it crosses
 * until the pointer comes up, which it does wherever on the page that happens.
 */
function Board({dim, preset, spawns, paint, tool}: BoardProps): ReactElement {
	const painting = useRef(false);
	const style: BoardStyle = {gridTemplateColumns: `repeat(${dim},var(--cell))`, "--cell": `${cellSize(dim)}px`};

	useEffect(() => {
		const stop = (): void => {
			painting.current = false;
		};
		window.addEventListener("pointerup", stop);
		return () => {
			window.removeEventListener("pointerup", stop);
		};
	}, []);

	const lay = (index: number): void => {
		paint(index, tool === ERASE ? null : tool);
	};

	return (
		<div className="bboard" style={style}>
			{preset.map((ground, i) => {
				const seat = spawns.findIndex((spot) => spot.index === i);

				return (
					// A square is only ever named by where it sits on the board.
					<Square
						key={i}
						ground={ground}
						spawn={spawns[seat]}
						seat={seat}
						press={() => {
							painting.current = true;
							lay(i);
						}}
						sweep={() => {
							if (painting.current) lay(i);
						}}
					/>
				);
			})}
		</div>
	);
}

/** What a spawn square painted over costs the seat that starts on it, or nothing at all. */
function spawnNote(preset: readonly (string | null)[], spawns: readonly SpawnSpot[]): string {
	const sealed = spawns.filter((spot) => seals(groundAt(preset[spot.index]))).length;

	if (sealed === 0) return "";
	return `${sealed} spawn ${sealed === 1 ? "square has" : "squares have"} a wall or a hole on it. That is left exactly as you painted it: a hole there takes that player out on turn one.`;
}

export interface ArenaDesignerViewProps extends DesignView {
	/** The material the next square gets painted with, or `erase` to clear it. */
	readonly tool: string;
	readonly pickTool: (tool: string) => void;
}

/**
 * The designer itself, posed from plain props so Storybook and tests can look at it without a save
 * behind it.
 */
export function ArenaDesignerView({
	dim,
	preset,
	elements,
	fusions,
	spawns,
	seats,
	setSeats,
	paint,
	clear,
	close,
	tool,
	pickTool,
}: ArenaDesignerViewProps): ReactElement {
	const painted = preset.filter((k) => k !== null).length;

	return (
		<div className="builder">
			<div className="tbox">
				<div className="thead">
					<h2>Arena designer</h2>
					<button type="button" className="ghost" onClick={close}>
						Done
					</button>
				</div>
				<p className="thint">
					Paint the ground before anyone steps on it. Pick a material, then click or drag across the grid.
					Break opens a hole now instead of waiting for the collapse. Whatever you paint on a spawn square
					stays there, holes included.
				</p>
				<Palette heading="Materials" tools={elements} picked={tool} pick={pickTool} />
				<Palette
					heading="Discovered fusions"
					tools={fusions}
					bare="Nothing here yet."
					picked={tool}
					pick={pickTool}
				/>
				<Palette heading="Tools" tools={[BREAK, ERASE]} picked={tool} pick={pickTool} />
				<div className="bhead">Show spawns for</div>
				<div className="bpal">
					{SEATS.map((n) => (
						<button
							key={n}
							type="button"
							className="bp spw"
							aria-pressed={seats === n}
							onClick={() => {
								setSeats(n);
							}}
						>
							{n}
						</button>
					))}
					<span className="hint" style={{marginLeft: 8}}>
						players
					</span>
				</div>
				<Board dim={dim} preset={preset} spawns={spawns} paint={paint} tool={tool} />
				<div className="wrow">
					<button type="button" className="ghost" onClick={clear}>
						Clear the board
					</button>
					<span className="hint">{`${painted} of ${dim * dim} squares set`}</span>
				</div>
				<div className="spawnnote">{spawnNote(preset, spawns)}</div>
			</div>
		</div>
	);
}

/**
 * Owns the one thing the designer decides for itself: which material the next square gets. It only
 * exists while the designer is up, so every visit opens on fire the way a new save does.
 */
function DesignBox(view: DesignView): ReactElement {
	const [tool, setTool] = useState("fire");

	return <ArenaDesignerView {...view} tool={tool} pickTool={setTool} />;
}

/**
 * The board builder off the setup screen: paint the ground a match will be fought over, square by
 * square, with every seat's starting spot marked so nobody is walled in before the first turn.
 */
export function ArenaDesigner(): ReactElement | null {
	const view = useSyncExternalStore(designStore.subscribe, designStore.get, designStore.get);

	return view === null ? null : <DesignBox {...view} />;
}
