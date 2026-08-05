import {useEffect, useState, useSyncExternalStore, type CSSProperties, type ReactElement} from "react";
import {replayStore, type ReplayView} from "../game/bridge.js";
import {T} from "../game/data/index.js";
import {rgba} from "../game/state.js";
import type {Frame} from "../game/types.js";

/** React types `style` as CSSProperties, which leaves no room for the custom properties the game's CSS reads. */
type TileStyle = CSSProperties & {"--tc"?: string; "--tcs"?: string};
type GlyphStyle = CSSProperties & {"--pc": string};
type BoardStyle = CSSProperties & {"--cell": string};

/** How long the replay rests on a frame before stepping to the next one. */
const STEP = 900;

/* Board geometry, the same shape the arena uses: the replay board takes what the fighter panel
   beside it leaves, capped so a small grid does not sprawl, then clamped so tiles stay legible. */
const SIDE_ROOM = 360;
const BOARD_MAX = 560;
const CELL_MIN = 11;
const CELL_MAX = 34;

/** Largest tile size the frame's board can be drawn at in the room this viewport leaves it. */
function cellSize(dim: number): number {
	const avail = Math.min(window.innerWidth - SIDE_ROOM, BOARD_MAX);
	return Math.max(CELL_MIN, Math.min(CELL_MAX, Math.floor(avail / dim) - 2));
}

/** The board as one frame remembers it: the ground that was down, and who was standing on it. */
function Board({frame, dim}: {readonly frame: Frame; readonly dim: number}): ReactElement {
	const style: BoardStyle = {gridTemplateColumns: `repeat(${dim},var(--cell))`, "--cell": `${cellSize(dim)}px`};

	return (
		<div className="rvboard" style={style}>
			{frame.board.map((key, i) => {
				const ground = key === null ? undefined : T[key];
				const seat = frame.players.findIndex((q) => q.alive && q.y * dim + q.x === i);
				const who = frame.players[seat];
				const classes = ["tile"];
				// terrain flags are set or absent, never zero, so a flag is on whenever it is there
				if (ground !== undefined) classes.push("terr");
				if (ground?.solid !== undefined) classes.push("solid");
				if (ground?.dead !== undefined) classes.push("gonezone");
				const tile: TileStyle = ground === undefined ? {} : {"--tc": ground.c, "--tcs": rgba(ground.c, 0.44)};
				const glyph: GlyphStyle = {"--pc": who ? who.c : ""};

				return (
					// A square is only ever named by where it sits on the board.
					<div key={i} className={classes.join(" ")} style={tile} title={ground?.n ?? ""}>
						{who && <i className={`mage p${seat}`} style={glyph} />}
					</div>
				);
			})}
		</div>
	);
}

/** Everyone in the match as that frame had them: health, and the cards they were holding. */
function Fighters({frame}: {readonly frame: Frame}): ReactElement {
	return (
		<div className="rvside">
			{frame.players.map((q, seat) => {
				const style: GlyphStyle = {"--pc": q.c};

				return (
					// Seats keep their order for the whole match, so the seat is the fighter's name here.
					<div key={seat} className={q.alive ? "rvp" : "rvp out"} style={style}>
						<div className="rvh">
							<span className={`glyph mage p${seat}`} />
							<span className="rvn">{q.name}</span>
							<span className="rvhp">{q.alive ? `${q.hp} hp` : "out"}</span>
						</div>
						<div className="bar">
							<i style={{width: `${(q.hp / q.max) * 100}%`, background: q.c}} />
						</div>
						<div className="rvcards">
							{q.hand.length === 0 ? (
								<span className="rvnone">empty hand</span>
							) : (
								q.hand.map((card, i) => (
									// Two of the same card are two cards, so only the position tells them apart.
									<span key={i} className="rvc">
										{card}
									</span>
								))
							)}
						</div>
					</div>
				);
			})}
		</div>
	);
}

export interface ReplayViewerViewProps extends ReplayView {
	/** Which frame is on screen, as an index into `frames`. */
	readonly at: number;
	/** Winds to another frame, which also stops the replay playing itself. */
	readonly go: (at: number) => void;
	readonly playing: boolean;
	readonly togglePlay: () => void;
}

/**
 * The replay itself, posed from plain props so Storybook and tests can look at it without playing a
 * match to the end.
 */
export function ReplayViewerView({
	frames,
	dim,
	close,
	at,
	go,
	playing,
	togglePlay,
}: ReplayViewerViewProps): ReactElement {
	const frame = frames[at];

	return (
		<div className="replay">
			<div className="tbox">
				<div className="thead">
					<h2>Replay</h2>
					<button type="button" className="ghost" onClick={close}>
						Close
					</button>
				</div>
				<div className="rvtop">
					<button
						type="button"
						className="ghost"
						aria-label="Previous frame"
						onClick={() => {
							go(at - 1);
						}}
					>
						&#8249;
					</button>
					<button type="button" className="ghost" onClick={togglePlay}>
						{playing ? "Pause" : "Play"}
					</button>
					<button
						type="button"
						className="ghost"
						aria-label="Next frame"
						onClick={() => {
							go(at + 1);
						}}
					>
						&#8250;
					</button>
					<input
						type="range"
						min={0}
						max={Math.max(0, frames.length - 1)}
						value={at}
						aria-label="Replay position"
						onChange={(e) => {
							go(+e.target.value);
						}}
					/>
					<span className="rvcount">{`${frames.length === 0 ? 0 : at + 1} / ${frames.length}`}</span>
				</div>
				{frame === undefined ? (
					<p className="rvnote">Nothing was recorded.</p>
				) : (
					<>
						<p className="rvnote">
							<b style={{color: frame.c}}>{frame.who || "The arena"}</b>
							<span style={{color: "var(--muted)"}}>{` · round ${frame.r}`}</span>
							<br />
							<span style={frame.say ? {fontStyle: "italic"} : undefined}>
								{`${frame.say ? "says " : ""}${frame.t}`}
							</span>
						</p>
						<div className="rvwrap">
							<Board frame={frame} dim={dim} />
							<Fighters frame={frame} />
						</div>
					</>
				)}
			</div>
		</div>
	);
}

/**
 * Owns where in the match the replay is parked and whether it is running itself. Both only exist
 * while the replay is up, so every visit opens on the first frame, stopped.
 */
function ReplayBox(view: ReplayView): ReactElement {
	const [at, setAt] = useState(0);
	const [playing, setPlaying] = useState(false);
	const last = view.frames.length - 1;

	// One timer per frame rather than one for the whole run: the effect re-arms it after each step,
	// and simply stops arming it once the last frame is up.
	useEffect(() => {
		if (!playing) return undefined;
		if (at >= last) {
			setPlaying(false);
			return undefined;
		}
		const timer = setTimeout(() => {
			setAt(at + 1);
		}, STEP);
		return () => {
			clearTimeout(timer);
		};
	}, [playing, at, last]);

	return (
		<ReplayViewerView
			{...view}
			at={at}
			playing={playing}
			go={(next) => {
				setPlaying(false);
				setAt(Math.max(0, Math.min(last, next)));
			}}
			togglePlay={() => {
				if (playing) {
					setPlaying(false);
					return;
				}
				// pressing play on the closing frame starts the match over rather than doing nothing
				if (at >= last) setAt(0);
				setPlaying(true);
			}}
		/>
	);
}

/**
 * The match played back a log line at a time: the board as it stood, who was where, and what each
 * fighter was holding. Nothing here can be acted on -- the frames are a record, not a position.
 */
export function ReplayViewer(): ReactElement | null {
	const view = useSyncExternalStore(replayStore.subscribe, replayStore.get, replayStore.get);

	return view === null ? null : <ReplayBox {...view} />;
}
