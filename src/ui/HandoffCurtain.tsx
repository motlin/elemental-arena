import {useSyncExternalStore, type CSSProperties, type ReactElement} from "react";
import {handoffStore, type HandoffView} from "../game/bridge.js";

/** React types `style` as CSSProperties, which leaves no room for the custom properties the game's CSS reads. */
type GlyphStyle = CSSProperties & {"--pc": string};

/**
 * The curtain itself, posed from plain props so Storybook and tests can look at it without a match
 * running.
 */
export function HandoffCurtainView({seat, name, colour, dismiss}: HandoffView): ReactElement {
	const glyphStyle: GlyphStyle = {"--pc": colour};

	return (
		<div className="handoff">
			<div className="overbox">
				<div className={`bigglyph mage p${seat}`} style={glyphStyle} />
				<div className="who">{name} is up</div>
				<div className="earn">Everything is hidden. Hand the device over.</div>
				<button type="button" className="start" onClick={dismiss}>
					{`I'm ${name}`}
				</button>
			</div>
		</div>
	);
}

/**
 * The blackout between turns in a hot-seat match. It covers the board so the seat handing the
 * device over cannot read the next player's cards, and the next player confirms by name before
 * anything is revealed.
 */
export function HandoffCurtain(): ReactElement | null {
	const view = useSyncExternalStore(handoffStore.subscribe, handoffStore.get, handoffStore.get);

	return view === null ? null : <HandoffCurtainView {...view} />;
}
