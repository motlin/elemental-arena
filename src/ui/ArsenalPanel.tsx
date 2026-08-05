import {useEffect, useRef, useState, type ReactElement} from "react";
import type {ArsenalSetup, CheatState, ShopRow, ShopShelf} from "../game/bridge.js";

/** What the shop says about something nobody has bought yet. */
const TEASE = "? ? ? Buy it to find out what it does.";

/** How long the wipe stays armed after the first press before it forgets it was asked. */
const ARMED_FOR = 3500;

/** The dot beside a row: the thing's own colour, or the accent for footwork, which has none. */
function dotStyle(row: ShopRow): {background: string; boxShadow: string} {
	const colour = row.colour ?? (row.owned ? "var(--accent)" : "var(--muted)");
	const lit = row.colour !== null || row.owned;

	return {background: colour, boxShadow: lit ? `0 0 10px ${colour}` : "none"};
}

/** One row of the shop: what it is, what it does once bought, and what it costs until then. */
function Row({row, buy}: {readonly row: ShopRow; readonly buy: (key: string) => void}): ReactElement {
	return (
		<div className="shoprow">
			<div className="shopname">
				<span className="dot" style={dotStyle(row)} />
				<span>
					<b>{row.name}</b>
					<small>{row.owned ? row.blurb : TEASE}</small>
				</span>
			</div>
			{row.owned ? (
				<span className="owned">IN ARSENAL</span>
			) : (
				<button
					type="button"
					className="buy"
					disabled={!row.affordable}
					onClick={() => {
						buy(row.key);
					}}
				>
					{`${row.price} coin`}
				</button>
			)}
		</div>
	);
}

/** One shelf, headed by the button that sweeps up everything still on it. */
function Shelf({shelf}: {readonly shelf: ShopShelf}): ReactElement {
	return (
		<>
			<div className="shophead">
				{shelf.heading}
				{shelf.due === null ? (
					<span className="bulkdone">all owned</span>
				) : (
					<button
						type="button"
						className="bulk"
						disabled={!shelf.affordable}
						title={`${shelf.left} left`}
						onClick={shelf.buyAll}
					>
						{`Buy all · ${shelf.due} coin`}
					</button>
				)}
			</div>
			{shelf.rows.map((row) => (
				<Row key={row.key} row={row} buy={shelf.buy} />
			))}
		</>
	);
}

/** What the cheat box says about where the guessing stands. */
function cheatNote(state: CheatState, tries: number, allowed: number): string {
	if (state === "accepted") return "Code accepted. Treasury filled and the whole codex revealed.";
	if (state === "spent") return `Out of guesses. All ${allowed} were wrong.`;
	if (tries === 0) return `You get ${allowed} guesses. Spend them carefully.`;
	const left = allowed - tries;
	return `Wrong. ${left} guess${left === 1 ? "" : "es"} left.`;
}

/** The tone the note is said in: banked, spent, or still just counting down. */
function cheatTone(state: CheatState, tries: number): string {
	if (state === "accepted") return "good";
	return state === "spent" || tries > 0 ? "bad" : "";
}

interface CheatBoxProps {
	readonly state: CheatState;
	readonly tries: number;
	readonly allowed: number;
	readonly submit: (code: string) => void;
}

/** The code box, which empties itself after every guess so the next one starts clean. */
function CheatBox({state, tries, allowed, submit}: CheatBoxProps): ReactElement {
	const [code, setCode] = useState("");
	const guess = (): void => {
		submit(code);
		setCode("");
	};

	return (
		<>
			{state === "open" && (
				<div className="cheatrow">
					<input
						className="cheatin"
						maxLength={24}
						placeholder="Enter code"
						aria-label="Cheat code"
						value={code}
						onChange={(e) => {
							setCode(e.target.value);
						}}
						onKeyDown={(e) => {
							if (e.key !== "Enter") return;
							e.preventDefault();
							guess();
						}}
					/>
					<button type="button" className="buy" onClick={guess}>
						Enter
					</button>
				</div>
			)}
			<div className={`cheatmsg ${cheatTone(state, tries)}`.trimEnd()}>{cheatNote(state, tries, allowed)}</div>
		</>
	);
}

/** Wipes the treasury, but only on the second press: the first one only says what it is about to do. */
function WipeButton({wipe}: {readonly wipe: () => void}): ReactElement {
	const [armed, setArmed] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(
		() => () => {
			if (timer.current !== null) clearTimeout(timer.current);
		},
		[],
	);

	return (
		<button
			type="button"
			className={armed ? "ghost wipe armed" : "ghost wipe"}
			onClick={() => {
				if (timer.current !== null) clearTimeout(timer.current);
				if (!armed) {
					setArmed(true);
					timer.current = setTimeout(() => {
						setArmed(false);
					}, ARMED_FOR);
					return;
				}
				setArmed(false);
				wipe();
			}}
		>
			{armed ? "Tap again to wipe the treasury" : "Reset all progress"}
		</button>
	);
}

/** The arsenal panel: what the treasury holds, what it can still buy, and how to throw it all away. */
export function ArsenalPanel({
	coins,
	saveError,
	shelves,
	cheat,
	tries,
	triesAllowed,
	submitCode,
	resetProgress,
}: ArsenalSetup): ReactElement {
	return (
		<div className="card-panel">
			<h2>Arsenal</h2>
			<div className="treasury">
				<span className="eyebrow">Treasury</span>
				<b>{coins.toLocaleString()}</b>
			</div>
			<div>
				{shelves.map((shelf) => (
					<Shelf key={shelf.heading} shelf={shelf} />
				))}
			</div>
			{saveError !== null && <div className="savewarn">{`Progress is not saving: ${saveError}`}</div>}
			<CheatBox state={cheat} tries={tries} allowed={triesAllowed} submit={submitCode} />
			<WipeButton wipe={resetProgress} />
		</div>
	);
}
