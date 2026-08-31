import {useState, type ReactElement} from "react";
import type {LobbyLoadout, LobbyRow, LobbyView} from "../game/bridge.js";

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

/** One row of the loadout: what would be brought, or the word for having brought none of that kind. */
function Row({row, max}: {readonly row: LobbyRow; readonly max: number}): ReactElement {
	return (
		<div className={row.over ? "field bringing over" : "field bringing"}>
			<label>
				<span className="lname">{row.heading}</span>
				<span className="lval">{row.over ? `${row.names.length}, ${max} allowed` : row.names.length}</span>
			</label>
			<span className="bringlist">{row.names.length === 0 ? "none" : row.names.join(", ")}</span>
		</div>
	);
}

/**
 * What a match opened from here would deal everybody. It is the same list for every seat, host
 * included: the other end has its own arsenal and its own switches, and only one of the two can be
 * the one a match is dealt from.
 */
function Loadout({loadout}: {readonly loadout: LobbyLoadout}): ReactElement {
	return (
		<>
			<p className="loadhint">
				{`Everybody is dealt what you bring, so an online match takes ${loadout.max} of each. Switch the rest off in This match above.`}
			</p>
			{loadout.rows.map((row) => (
				<Row key={row.heading} row={row} max={loadout.max} />
			))}
		</>
	);
}

/**
 * The online panel, posed from plain props so Storybook and tests can look at it without a match
 * server behind it.
 */
export function OnlinePanel({code, opening, error, link, seats, loadout, host, sit, join}: LobbyView): ReactElement {
	const [pasted, setPasted] = useState("");

	return (
		<div className="card-panel">
			<h2>Play online</h2>
			<p className="loadhint">
				Open a match, then send everybody the same link. Whoever follows it is dealt whichever seat is still
				free, so two tabs of one browser hold two different seats.
			</p>
			<Loadout loadout={loadout} />
			<button type="button" className="ghost menubtn" disabled={opening || !loadout.ready} onClick={host}>
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
