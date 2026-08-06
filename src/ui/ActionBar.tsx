import {Fragment, type CSSProperties, type ReactElement} from "react";
import type {ActionBarView} from "../game/bridge.js";

/** The orange chaos mode shouts in, which is the same one an armed forfeit warns in. */
const ALARM = "#ff8f6b";

/**
 * The bar under the board: what the game is waiting for, what can be done about it, and anything
 * left to add afterwards. Every branch the old bar switched between is now just an empty list.
 */
export function ActionBar({view}: {readonly view: ActionBarView}): ReactElement {
	const said: CSSProperties = view.alarm ? {color: ALARM} : {};

	return (
		<div className="actbar">
			{view.hint.length > 0 && (
				<span className="hint" style={said}>
					{view.hint.map((part, i) => (
						// runs only differ by where they fall in the sentence, so the place names them
						<Fragment key={i}>
							{part.strong ? <b style={{color: "var(--ink)"}}>{part.text}</b> : part.text}
						</Fragment>
					))}
				</span>
			)}
			{view.buttons.map((button) => (
				<button
					key={button.key}
					type="button"
					className={button.facedown ? "act facedown" : "act"}
					disabled={button.disabled}
					onClick={button.click}
				>
					{button.label}
				</button>
			))}
			{view.tail !== null && <span className="hint">{view.tail}</span>}
		</div>
	);
}
