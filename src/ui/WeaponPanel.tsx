import {type CSSProperties, type ReactElement} from "react";
import type {LeaveRow, WeaponView} from "../game/bridge.js";

/** React types `style` as CSSProperties, which leaves no room for the custom properties the game's CSS reads. */
type ChoiceStyle = CSSProperties & {"--lc": string};

/** One row of leavings: the question, and every element that can answer it. */
function Leaves({row}: {readonly row: LeaveRow}): ReactElement {
	return (
		<div className="wsub" style={{marginTop: 8}}>
			{row.label}{" "}
			{row.options.map((option) => {
				const style: ChoiceStyle = {"--lc": option.colour};

				return (
					// an element can only be offered once per row, so it names its own button
					<button
						key={option.key}
						type="button"
						className={option.on ? "lv on" : "lv"}
						style={style}
						onClick={option.choose}
					>
						{option.name}
					</button>
				);
			})}
		</div>
	);
}

/**
 * The weapon in hand: what it is, what it does on a hit, what it leaves behind, and the swing
 * itself. Whether the swing is worth making is the hint's job to say, and the game works that out.
 */
export function WeaponPanel({view}: {readonly view: WeaponView | null}): ReactElement {
	if (view === null) {
		return (
			<div className="wep">
				<div className="wtop">
					<span className="wn" style={{color: "var(--muted)"}}>
						Empty hands
					</span>
				</div>
				<div className="wsub">
					Pick a weapon card from your hand. Holding one is free, and you can put it back.
				</div>
			</div>
		);
	}

	return (
		<div className="wep">
			<div className="wtop">
				<span className="wn" style={{color: view.colour}}>
					{view.name}
				</span>
				<span className="wd">{`${view.damage} damage`}</span>
			</div>
			<div className="wsub">
				{view.desc}
				{view.onHit !== null && (
					<>
						{" "}
						<span className="fx">{`On hit: ${view.onHit}.`}</span>
					</>
				)}
			</div>
			<div className="wstrip" style={{background: view.strip}} />
			{view.rows.map((row) => (
				// the two rows ask different questions, so the question names the row
				<Leaves key={row.label} row={row} />
			))}
			<div className="wrow">
				<button
					type="button"
					className="atk"
					aria-pressed={view.aiming}
					disabled={view.disabled}
					onClick={view.swing}
				>
					{`Swing · ${view.cost} energy `}
					<span style={{opacity: 0.6}}>F</span>
				</button>
				<span className="hint">{view.hint}</span>
			</div>
		</div>
	);
}
