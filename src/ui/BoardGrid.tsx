import {useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactElement} from "react";
import {
	ARENA_BOARD_MAX,
	ARENA_CELL_MAX,
	ARENA_CELL_MIN,
	arenaBoardRoom,
	boardCell,
	viewportWidth,
} from "../game/board.js";
import type {BoardView, TileFighter, TileView} from "../game/bridge.js";

/** React types `style` as CSSProperties, which leaves no room for the custom properties the game's CSS reads. */
type BoardStyle = CSSProperties & {"--cell": string};
type TileStyle = CSSProperties & {"--tc"?: string; "--tcs"?: string};
type GlyphStyle = CSSProperties & {"--pc": string};

/** Largest tile the arena's middle column can draw this board at, clamped so tiles stay legible. */
function cellSize(dim: number): number {
	return boardCell(dim, Math.min(arenaBoardRoom(viewportWidth()), ARENA_BOARD_MAX), ARENA_CELL_MIN, ARENA_CELL_MAX);
}

/** The board is sized against the viewport rather than by CSS, so a resize has to be measured by hand. */
function useCellSize(dim: number): number {
	const [cell, setCell] = useState(() => cellSize(dim));

	useEffect(() => {
		const measure = (): void => {
			setCell(cellSize(dim));
		};
		measure();
		window.addEventListener("resize", measure);
		return () => {
			window.removeEventListener("resize", measure);
		};
	}, [dim]);

	return cell;
}

/** Everything the ground and the move being aimed have to say about one square. */
function tileClasses(tile: TileView): string {
	const classes = ["tile"];
	if (tile.terrain) classes.push("terr");
	if (tile.solid) classes.push("solid");
	if (tile.dead) classes.push("gonezone");
	if (tile.gone) classes.push("void");
	if (tile.aim !== null) classes.push(tile.aim);
	if (tile.step) classes.push("step");
	if (tile.warn) classes.push("warn");
	if (tile.litsq) classes.push("litsq");
	if (tile.look) classes.push("look");
	if (tile.reach !== null) classes.push("reach");
	return classes.join(" ");
}

/** One fighter's glyph, shifted off centre only when somebody else is standing on the same square. */
function Fighter({who}: {readonly who: TileFighter}): ReactElement {
	const style: GlyphStyle = {"--pc": who.colour};
	if (who.inset !== null) style.inset = who.inset;
	if (who.z !== null) style.zIndex = who.z;

	return <i className={`mage p${who.seat}${who.active ? " active" : ""}${who.lit ? " litp" : ""}`} style={style} />;
}

/**
 * The grid a match is played on. Every square is drawn from what the game published, so the board
 * holds no opinion of its own about who can see what -- anything the seat cannot see never arrived.
 */
export function BoardGrid({view}: {readonly view: BoardView}): ReactElement {
	const cell = useCellSize(view.dim);
	const squares = useRef<(HTMLDivElement | null)[]>([]);

	// A keyframe animation only restarts once the browser has seen the class go, so each hit drops
	// its class, forces a reflow by asking for a measurement, and puts the class back.
	useLayoutEffect(() => {
		for (const hit of view.fx) {
			const square = squares.current[hit.index];
			if (square === null || square === undefined) continue;
			square.classList.remove(hit.animation);
			void square.offsetWidth;
			square.classList.add(hit.animation);
		}
	}, [view]);

	const style: BoardStyle = {gridTemplateColumns: `repeat(${view.dim},var(--cell))`, "--cell": `${cell}px`};

	return (
		<div className="boardscroll">
			<div id="board" style={style}>
				{view.tiles.map((tile, i) => {
					const x = i % view.dim;
					const y = (i / view.dim) | 0;
					const square: TileStyle = {};
					if (tile.colour !== null) square["--tc"] = tile.colour;
					if (tile.shadow !== null) square["--tcs"] = tile.shadow;
					if (tile.reach !== null) square.backgroundImage = tile.reach;

					return (
						// A square is only ever named by where it sits on the board.
						<div
							key={i}
							ref={(node) => {
								squares.current[i] = node;
							}}
							className={tileClasses(tile)}
							style={square}
							title={tile.title}
							onClick={() => {
								view.click(x, y);
							}}
						>
							{tile.whirl !== null && <span className="wnum">{tile.whirl}</span>}
							{tile.occupants.map((who) => (
								<Fighter key={who.seat} who={who} />
							))}
							{tile.stack !== null && <span className="stackn">{tile.stack}</span>}
						</div>
					);
				})}
			</div>
		</div>
	);
}
