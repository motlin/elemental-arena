import {useState, type ReactElement} from "react";
import type {LobbyView} from "../game/bridge.js";

/**
 * Puts a link on the clipboard where there is one. A page served over plain http has none, and nor
 * does a test, and a Copy button is not worth throwing over: the link is in a box beside it either
 * way, ready to be picked up by hand.
 */
function copy(url: string): void {
	try {
		void navigator.clipboard.writeText(url).catch(() => undefined);
	} catch {
		/* no clipboard on this page; the link is in the box beside the button either way */
	}
}

/**
 * The online panel, posed from plain props so Storybook and tests can look at it without a match
 * server behind it.
 */
export function OnlinePanel({code, opening, error, link, seats, host, sit, join}: LobbyView): ReactElement {
	const [pasted, setPasted] = useState("");

	return (
		<div className="card-panel">
			<h2>Play online</h2>
			<p className="loadhint">
				Open a match, then send everybody the same link. Whoever follows it is dealt whichever seat is still
				free, so two tabs of one browser hold two different seats.
			</p>
			<button type="button" className="ghost menubtn" disabled={opening} onClick={host}>
				{opening ? "Opening a match..." : "Host a match"}
			</button>
			{code !== null && link !== null && (
				<div className="field">
					<label>
						<span className="lname">Match {code}</span>
						<span className="lval">{seats} seats</span>
					</label>
					<div className="invite">
						<input className="numbox" readOnly value={link} aria-label="Link to this match" />
						<button
							type="button"
							className="buy"
							onClick={() => {
								copy(link);
							}}
						>
							Copy
						</button>
						<button type="button" className="buy" onClick={sit}>
							Sit down
						</button>
					</div>
				</div>
			)}
			<div className="field">
				<label>
					<span className="lname">Join a match</span>
				</label>
				<div className="invite">
					<input
						className="numbox"
						value={pasted}
						placeholder="Paste an invite link"
						aria-label="Invite link to join"
						onChange={(e) => {
							setPasted(e.target.value);
						}}
					/>
					<button
						type="button"
						className="buy"
						disabled={pasted.trim().length === 0}
						onClick={() => {
							join(pasted);
						}}
					>
						Join
					</button>
				</div>
			</div>
			{error !== null && <div className="savewarn">{error}</div>}
		</div>
	);
}
