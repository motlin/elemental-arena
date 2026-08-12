import {useSyncExternalStore, type ReactElement} from "react";
import {onlineStore, type NetStatus, type OnlineView} from "../game/bridge.js";

/** What each state of the socket is called on screen. */
const SAYS: Record<NetStatus, string> = {
	joining: "Joining",
	playing: "Connected",
	gone: "Disconnected",
};

/** Seats read out the way a person would say them: "2", or "2 and 3", or "2, 3 and 4". */
function listed(names: readonly number[]): string {
	if (names.length <= 1) return names.join("");
	return `${names.slice(0, -1).join(", ")} and ${names.slice(-1).join("")}`;
}

/** Who is missing, counted from one the way the seats are named everywhere a player can see. */
function quiet(away: readonly number[]): string {
	const named = listed(away.map((seat) => seat + 1));
	return away.length === 1 ? `Seat ${named} has gone quiet` : `Seats ${named} have gone quiet`;
}

/**
 * The strip over an online match, posed from plain props. It carries the two things the arena
 * itself cannot say: whether the arena on screen is still being kept up to date and who else is
 * still watching it, and what the room said about the last move it would not take.
 */
export function OnlineStripView({code, seat, status, notice, away, dismiss}: OnlineView): ReactElement {
	return (
		<div className={`netstrip ${status}`} role="status">
			<span className="netwho">
				Match {code} · seat {seat + 1}
			</span>
			<span className="netstate">{SAYS[status]}</span>
			{away.length > 0 && <span className="netaway">{quiet(away)}</span>}
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
