import {type ReactElement} from "react";
import type {InspectView, ReachChooser, TileReadout} from "../game/bridge.js";

/** One line of the readout: what is being measured, and what it comes to. */
function Fact({label, value}: {readonly label: string; readonly value: string}): ReactElement {
	return (
		<div className="k">
			<span>{label}</span>
			<span>{value}</span>
		</div>
	);
}

/** What the square being read is, what it does, and every number it carries. */
function Readout({tile}: {readonly tile: TileReadout}): ReactElement {
	return (
		<>
			<b style={{color: tile.colour ?? "var(--muted)"}}>{tile.name}</b>
			<div style={{marginTop: 5}}>{tile.blurb}</div>
			{tile.facts.map((fact, i) => (
				// ground that both hurts and feeds writes "Ending here" twice, so only the order is unique
				<Fact key={i} label={fact.label} value={fact.value} />
			))}
		</>
	);
}

/** Who the reach overlay can be drawn for, which is everyone this seat can see. */
function Chooser({chooser}: {readonly chooser: ReachChooser}): ReactElement {
	return (
		<>
			<div className="bhead" style={{margin: "14px 0 7px"}}>
				Show who can reach where
			</div>
			<div className="bpal">
				{chooser.chips.map((chip) => (
					// Seats keep their order for the whole match, so the seat names the chip.
					<button
						key={chip.seat}
						type="button"
						className="bp rch"
						aria-pressed={chip.on}
						onClick={chip.toggle}
					>
						<span className="d" style={{background: chip.colour}} />
						{`${chip.name} · ${chip.budget}`}
					</button>
				))}
			</div>
			{chooser.blinded && <span className="hint">You are blinded, so only your own reach is available.</span>}
		</>
	);
}

/**
 * The tile readout down the right: whatever square Inspect was last pointed at, and the overlay
 * that draws how far each fighter could get on their turn.
 */
export function TileInspector({view}: {readonly view: InspectView}): ReactElement {
	return (
		<div id="tileinfo">
			{view.tile === null ? <span>{view.hint}</span> : <Readout tile={view.tile} />}
			{view.chooser !== null && <Chooser chooser={view.chooser} />}
		</div>
	);
}
