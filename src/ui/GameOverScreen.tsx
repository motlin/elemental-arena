import {Fragment, useState, useSyncExternalStore, type CSSProperties, type ReactElement} from "react";
import {overStore, type OverView} from "../game/bridge.js";
import type {LogEntry} from "../game/types.js";

/** React types `style` as CSSProperties, which leaves no room for the custom properties the game's CSS reads. */
type GlyphStyle = CSSProperties & {"--pc": string};

interface MatchLogProps {
	readonly log: readonly LogEntry[];
}

/** The match from the first card to the last blow, with each round called out as it starts. */
function MatchLog({log}: MatchLogProps): ReactElement {
	if (log.length === 0) {
		return (
			<div className="lg">
				<span className="txt">Nothing happened.</span>
			</div>
		);
	}

	return (
		<>
			{log.map((entry, i) => (
				// Nothing on a log line identifies it, and the log only ever grows at the end, so the
				// position in it is the one stable name a line has.
				<Fragment key={i}>
					{entry.r !== log[i - 1]?.r && <div className="lgnew">{`Round ${entry.r}`}</div>}
					<div className={entry.say ? "lg lgsay" : "lg"}>
						<span className="rd">{entry.r}</span>
						<span>
							<span className="who" style={{color: entry.c}}>
								{entry.who || "The arena"}
							</span>
							<span className="txt">{` ${entry.say ? "says " : ""}${entry.t}`}</span>
						</span>
					</div>
				</Fragment>
			))}
		</>
	);
}

export interface GameOverScreenViewProps extends OverView {
	/** Whether the match log is unrolled under the buttons. */
	readonly logOpen: boolean;
	readonly toggleLog: () => void;
}

/**
 * The screen itself, posed from plain props so Storybook and tests can look at it without playing a
 * match to the end.
 */
export function GameOverScreenView({
	seat,
	colour,
	headline,
	earn,
	log,
	openReplay,
	back,
	logOpen,
	toggleLog,
}: GameOverScreenViewProps): ReactElement {
	const glyphStyle: GlyphStyle = {"--pc": colour};

	return (
		<div className="over">
			<div className="overbox">
				<div className={`bigglyph mage p${seat}`} style={glyphStyle} />
				<div className="who">{headline}</div>
				<div className="earn">{earn}</div>
				<button type="button" className="ghost" onClick={openReplay}>
					Watch the replay
				</button>
				<button type="button" className="ghost logbtn" onClick={toggleLog}>
					{logOpen ? "Hide the match log" : "Show the match log"}
				</button>
				{logOpen && (
					<div className="matchlog">
						<MatchLog log={log} />
					</div>
				)}
				<button type="button" className="start" onClick={back}>
					Back to the arena
				</button>
			</div>
		</div>
	);
}

/**
 * Owns the one thing the screen decides for itself: whether the log is unrolled. It only exists
 * while the screen is up, so the next match starts with the log rolled away again.
 */
function GameOverBox(view: OverView): ReactElement {
	const [logOpen, setLogOpen] = useState(false);

	return (
		<GameOverScreenView
			{...view}
			logOpen={logOpen}
			toggleLog={() => {
				setLogOpen((open) => !open);
			}}
		/>
	);
}

/**
 * What is left when the last team standing is the only team standing: who won, what they banked,
 * the log of how it went, and the two ways off the screen.
 */
export function GameOverScreen(): ReactElement | null {
	const view = useSyncExternalStore(overStore.subscribe, overStore.get, overStore.get);

	return view === null ? null : <GameOverBox {...view} />;
}
