import {type CSSProperties, type ReactElement} from "react";
import type {TopbarView} from "../game/bridge.js";

/** React types `style` as CSSProperties, which leaves no room for the custom properties the game's CSS reads. */
type GlyphStyle = CSSProperties & {"--pc": string};

/** The orange an armed forfeit button warns in, which is the same one chaos mode shouts in. */
const ARMED = "#ff8f6b";

/**
 * The strip along the top: whose turn it is, and every way out of that turn. Inspect is the one
 * button that stays down, so it takes the accent while it is on and hands its keyboard letter the
 * colour that reads against it.
 */
export function MatchTopBar({view}: {readonly view: TopbarView}): ReactElement {
	const glyph: GlyphStyle = {"--pc": view.colour};
	const inspect: CSSProperties = view.inspecting
		? {borderColor: "var(--accent)", background: "var(--accent)", color: "var(--onaccent)"}
		: {};

	return (
		<div className="topbar">
			<div className="turnchip">
				<span className={`glyph mage p${view.seat}`} style={glyph} />
				<b>{view.name}</b>
			</div>
			<span className="roundchip">{view.round}</span>
			<span className="sp" />
			<button type="button" className="ghost" style={inspect} onClick={view.toggleInspect}>
				{view.inspecting ? "Stop inspecting " : "Inspect "}
				<span style={{color: view.inspecting ? "var(--onaccent)" : "var(--muted)"}}>I</span>
			</button>
			<button type="button" className="ghost" onClick={view.openTable}>
				Mixing table
			</button>
			<button type="button" className="ghost" disabled={!view.canEndTurn} onClick={view.endTurn}>
				{"End turn "}
				<span style={{color: "var(--muted)"}}>E</span>
			</button>
			<button
				type="button"
				className="ghost"
				style={view.forfeitArmed ? {borderColor: ARMED, color: ARMED} : {}}
				onClick={view.forfeit}
			>
				{view.forfeitLabel}
			</button>
			<button type="button" className="ghost" onClick={view.leave}>
				Menu
			</button>
			<button type="button" className="ghost" onClick={view.toggleTheme}>
				{view.themeLabel}
			</button>
		</div>
	);
}
