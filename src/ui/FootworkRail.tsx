import {type ReactElement} from "react";
import type {FootworkButton, FootworkView} from "../game/bridge.js";

/**
 * One move: what it is called, what it costs, and how many goes are left in it. A button with no
 * cost is only reporting something already true — "Floating", "Jump · spent" — so it prints its
 * label and nothing else.
 */
function Move({button}: {readonly button: FootworkButton}): ReactElement {
	return (
		<button
			type="button"
			className="act"
			// a move with nothing to explain is one that is only naming a state, so it gets no hover text
			title={button.tip.length > 0 ? button.tip : undefined}
			aria-pressed={button.aiming}
			disabled={button.disabled}
			onClick={button.click ?? undefined}
		>
			{button.cost === null ? button.label : `${button.label} · ${button.cost}`}
			{button.left !== null && (
				<>
					{" "}
					<span style={{opacity: 0.6}}>{`x${button.left}`}</span>
				</>
			)}
		</button>
	);
}

/**
 * The footwork rail: every special move this fighter was given, priced and counted. Which moves
 * appear at all, and whether each is affordable, is the game's call — the rail only lays them out.
 */
export function FootworkRail({view}: {readonly view: FootworkView}): ReactElement {
	if (!view.any) {
		return (
			<div className="wep">
				<div className="wtop">
					<span className="wn" style={{color: "var(--muted)"}}>
						No footwork
					</span>
				</div>
				<div className="wsub">This fighter was given no special movement.</div>
			</div>
		);
	}

	return (
		<div className="wep">
			<div className="wtop">
				<span className="wn">Footwork</span>
				<span className="wd" style={{fontSize: 11}}>
					footwork
				</span>
			</div>
			{view.floating && (
				<div className="wsub">
					<span className="fx">You are in the air.</span>
				</div>
			)}
			<div className="wrow">
				{view.buttons.map((button) => (
					// a fighter is given each move at most once, so the move names its own button
					<Move key={button.key} button={button} />
				))}
				{view.rooted && <span className="hint">Stuck in the mud this turn.</span>}
			</div>
		</div>
	);
}
