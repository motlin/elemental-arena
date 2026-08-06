import {type CSSProperties, type ReactElement} from "react";
import type {RosterCard} from "../game/bridge.js";

/** React types `style` as CSSProperties, which leaves no room for the custom properties the game's CSS reads. */
type CardStyle = CSSProperties & {"--pc": string};

/** The colour the energy line reads in, which is the same yellow the pips fill with. */
const ENERGY = "#ffd24a";

/** One fighter: who they are, what is left of them, and what they are holding. */
function Card({card}: {readonly card: RosterCard}): ReactElement {
	const style: CardStyle = {"--pc": card.colour};
	// exactly one of the two is drawn: a cap small enough to count becomes pips, anything bigger a line
	const {pips} = card;

	return (
		<div className={card.alive ? "pcard" : "pcard dead"} style={style}>
			<div className="row1">
				<span className={`glyph mage p${card.seat}`} />
				<span className="nm">
					{card.name}
					{card.allies > 0 && (
						<span style={{color: "var(--muted)", letterSpacing: 0}}>{` +${card.allies} ally`}</span>
					)}
				</span>
				<span className="hpn">{card.hp}</span>
			</div>
			<div className="bar">
				<i
					style={{
						width: `${card.health * 100}%`,
						background: card.colour,
						boxShadow: `0 0 8px ${card.colour}`,
					}}
				/>
			</div>
			{pips === null ? (
				<div className="wp" style={{color: ENERGY}}>
					{card.energy}
				</div>
			) : (
				<div className="nrg">
					{Array.from({length: pips.total}, (_, i) => (
						// Pips are only ever told apart by how far along the row they sit.
						<s key={i} className={i < pips.filled ? "f" : ""} />
					))}
				</div>
			)}
			{card.seen !== null && <div className="wp" style={{color: "var(--accent)"}}>{`seen: ${card.seen}`}</div>}
			<div className="wp">{card.line}</div>
		</div>
	);
}

/**
 * Everyone in the match, down the left. What each card says about a fighter is what this seat is
 * allowed to know about them, which the game has already worked out.
 */
export function Roster({cards}: {readonly cards: readonly RosterCard[]}): ReactElement {
	return (
		<div id="roster">
			{cards.map((card) => (
				// Seats keep their order for the whole match, so the seat is the fighter's name here.
				<Card key={card.seat} card={card} />
			))}
		</div>
	);
}
