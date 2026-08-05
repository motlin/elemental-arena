import {useId, useState, type CSSProperties, type ReactElement} from "react";
import type {LoadoutChip} from "../game/bridge.js";

/** React types `style` as CSSProperties, which leaves no room for the custom properties the game's CSS reads. */
type ChipStyle = CSSProperties & {"--cc": string};

interface SliderProps {
	readonly name: string;
	/** What the number reads as beside the name. */
	readonly reading: string;
	readonly min: number;
	readonly max: number;
	/** How far one notch of the slider moves it; one step unless said otherwise. */
	readonly step?: number;
	readonly value: number;
	readonly onChange: (value: number) => void;
}

/** A number dragged rather than typed, which is how the setup screen sets its ranges. */
export function Slider({name, reading, min, max, step, value, onChange}: SliderProps): ReactElement {
	const id = useId();

	return (
		<div className="field">
			<label htmlFor={id}>
				<span className="lname">{name}</span>
				<span className="lval">{reading}</span>
			</label>
			<input
				id={id}
				type="range"
				min={min}
				max={max}
				step={step ?? 1}
				value={value}
				onChange={(e) => {
					onChange(Number(e.target.value));
				}}
			/>
		</div>
	);
}

interface NumberBoxProps {
	readonly name: string;
	/** The note beside the name, which says what the number does rather than what it is. */
	readonly hint: string;
	readonly min: number;
	readonly max: number;
	readonly value: number;
	readonly onChange: (value: number) => void;
	/** True for a box that sits under the toggle above it rather than in its own row. */
	readonly tucked?: boolean;
}

/**
 * A number typed rather than dragged. The box keeps whatever has been typed into it, empty
 * included, while the game only hears the number that comes out: clearing the field to type
 * another value would otherwise snap straight back to the default under your fingers. Leaving the
 * box puts back whatever the game settled on.
 */
export function NumberBox({name, hint, min, max, value, onChange, tucked}: NumberBoxProps): ReactElement {
	const id = useId();
	const [typed, setTyped] = useState(String(value));

	return (
		<div className={tucked === true ? "field tucked" : "field"}>
			<label htmlFor={id}>
				<span className="lname">{name}</span>
				<span className="lval lhint">{hint}</span>
			</label>
			<input
				id={id}
				className="numbox"
				type="number"
				min={min}
				max={max}
				step={1}
				inputMode="numeric"
				value={typed}
				onChange={(e) => {
					setTyped(e.target.value);
					onChange(Number.parseInt(e.target.value, 10));
				}}
				onBlur={() => {
					setTyped(String(value));
				}}
			/>
		</div>
	);
}

interface ToggleProps {
	readonly name: string;
	/** What turning it on does to a match, spelled out under the name. */
	readonly blurb: string;
	readonly on: boolean;
	readonly onChange: (on: boolean) => void;
}

/** One of the switches that change how a match is played. */
export function Toggle({name, blurb, on, onChange}: ToggleProps): ReactElement {
	return (
		<label className="toggle">
			<span>
				<span className="lname">{name}</span>
				<small>{blurb}</small>
			</span>
			<input
				type="checkbox"
				checked={on}
				onChange={(e) => {
					onChange(e.target.checked);
				}}
			/>
		</label>
	);
}

interface ChipProps {
	readonly chip: LoadoutChip;
	/** Marks the chip as one of a kind the panel handles together, e.g. `mvc` for footwork. */
	readonly kind?: string;
	readonly onPick: (key: string) => void;
}

/**
 * One thing a fighter can be dealt. A chip still in the shop says what it costs and cannot be
 * pressed, so the panel reads as the whole game rather than only the part of it bought so far.
 */
export function Chip({chip, kind, onPick}: ChipProps): ReactElement {
	if (!chip.owned) {
		return (
			<button
				type="button"
				className="chip locked"
				disabled
				title={`Not bought yet. ${chip.price} coin in the shop below.`}
			>
				{`${chip.name} · ${chip.price}`}
			</button>
		);
	}
	const style: ChipStyle = {"--cc": chip.colour};

	return (
		<button
			type="button"
			className={kind === undefined ? "chip" : `chip ${kind}`}
			style={style}
			aria-pressed={chip.on}
			onClick={() => {
				onPick(chip.key);
			}}
		>
			{chip.name}
		</button>
	);
}
