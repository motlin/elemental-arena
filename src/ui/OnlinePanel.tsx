import {useState, type ReactElement} from "react";
import type {InviteLink, LobbyView} from "../game/bridge.js";

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

/** One seat of an opened match: the link that claims it, and the button that claims it here. */
function Invite({link, sit}: {readonly link: InviteLink; readonly sit: (seat: number) => void}): ReactElement {
	return (
		<div className="invite">
			<input className="numbox" readOnly value={link.url} aria-label={`Invite link for ${link.name}`} />
			<button
				type="button"
				className="buy"
				onClick={() => {
					copy(link.url);
				}}
			>
				Copy
			</button>
			<button
				type="button"
				className="buy"
				onClick={() => {
					sit(link.seat);
				}}
			>
				Sit here
			</button>
		</div>
	);
}

/**
 * The online panel, posed from plain props so Storybook and tests can look at it without a match
 * server behind it.
 */
export function OnlinePanel({code, opening, error, links, host, sit, join}: LobbyView): ReactElement {
	const [link, setLink] = useState("");

	return (
		<div className="card-panel">
			<h2>Play online</h2>
			<p className="loadhint">
				Open a match, then send each player their own link. A link carries the seat it opens, so two tabs of one
				browser can hold two different seats.
			</p>
			<button type="button" className="ghost menubtn" disabled={opening} onClick={host}>
				{opening ? "Opening a match..." : "Host a match"}
			</button>
			{code !== null && (
				<div className="field">
					<label>
						<span className="lname">Match {code}</span>
						<span className="lval">{links.length} seats</span>
					</label>
					{links.map((invite) => (
						<Invite key={invite.seat} link={invite} sit={sit} />
					))}
				</div>
			)}
			<div className="field">
				<label>
					<span className="lname">Join a match</span>
				</label>
				<div className="invite">
					<input
						className="numbox"
						value={link}
						placeholder="Paste an invite link"
						aria-label="Invite link to join"
						onChange={(e) => {
							setLink(e.target.value);
						}}
					/>
					<button
						type="button"
						className="buy"
						disabled={link.trim().length === 0}
						onClick={() => {
							join(link);
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
