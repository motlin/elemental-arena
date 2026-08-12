import {useSyncExternalStore, type ReactElement} from "react";
import {onlineStore, type NetStatus, type OnlineView} from "../game/bridge.js";

/** What each state of the socket is called on screen. */
const SAYS: Record<NetStatus, string> = {
	joining: "Joining",
	playing: "Connected",
	gone: "Disconnected",
};

/**
 * The strip over an online match, posed from plain props. It carries the one thing the arena itself
 * cannot say: whether the arena on screen is still being kept up to date, and what the room said
 * about the last move it would not take.
 */
export function OnlineStripView({code, seat, status, notice, dismiss}: OnlineView): ReactElement {
	return (
		<div className={`netstrip ${status}`} role="status">
			<span className="netwho">
				Match {code} · seat {seat + 1}
			</span>
			<span className="netstate">{SAYS[status]}</span>
			{notice !== null && (
				<span className="netnotice">
					{notice}
					<button type="button" className="ghost" onClick={dismiss}>
						Dismiss
					</button>
				</span>
			)}
		</div>
	);
}

/** Up for as long as this device is sat in an online match, and down the moment it gets up. */
export function OnlineStrip(): ReactElement | null {
	const view = useSyncExternalStore(onlineStore.subscribe, onlineStore.get, onlineStore.get);

	return view === null ? null : <OnlineStripView {...view} />;
}
