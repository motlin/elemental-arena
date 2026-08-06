import {useSyncExternalStore, type ReactElement} from "react";
import {matchStore, type MatchView} from "../game/bridge.js";
import {ActionBar} from "./ActionBar.js";
import {BoardGrid} from "./BoardGrid.js";
import {FootworkRail} from "./FootworkRail.js";
import {Hand} from "./Hand.js";
import {MatchTopBar} from "./MatchTopBar.js";
import {Roster} from "./Roster.js";
import {TableTalk} from "./TableTalk.js";
import {TileInspector} from "./TileInspector.js";
import {WeaponPanel} from "./WeaponPanel.js";

/**
 * The match screen itself, posed from plain props so Storybook and tests can look at it without a
 * match running. The arena keeps its `#game` and `#board` ids because the stylesheet reaches for
 * them by name.
 */
export function MatchScreenView({view}: {readonly view: MatchView}): ReactElement {
	return (
		<div id="game" className="on">
			<MatchTopBar view={view.topbar} />
			<div className="arena">
				<div className="side left">
					<div className="box">
						<h3>Table talk</h3>
						<TableTalk view={view.chat} />
					</div>
					<div className="box">
						<h3>Combatants</h3>
						<Roster cards={view.roster} />
					</div>
				</div>
				<div className="boardcol">
					<BoardGrid view={view.board} />
					<WeaponPanel view={view.weapon} />
					<ActionBar view={view.actions} />
					<Hand view={view.hand} />
				</div>
				<div className="side right">
					<FootworkRail view={view.footwork} />
					<div className="box">
						<h3>Tile</h3>
						<TileInspector view={view.inspect} />
					</div>
					<div className="box">
						<h3>Fusion codex</h3>
						<div className="codexline">{view.codex}</div>
						<button type="button" className="ghost" style={{width: "100%"}} onClick={view.topbar.openTable}>
							Mixing table
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

/**
 * The board a match is played on and every panel around it. It is up only while a match is, so the
 * whole screen comes down the moment the game publishes nothing.
 */
export function MatchScreen(): ReactElement | null {
	const view = useSyncExternalStore(matchStore.subscribe, matchStore.get, matchStore.get);

	return view === null ? null : <MatchScreenView view={view} />;
}
