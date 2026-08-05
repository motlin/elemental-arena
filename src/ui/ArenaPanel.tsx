import {type CSSProperties, type ReactElement} from "react";
import type {ArenaSetup, SeatRow, Swatch, TeamTally} from "../game/bridge.js";
import {NumberBox, Slider, Toggle} from "./SetupFields.js";

/** React types `style` as CSSProperties, which leaves no room for the custom properties the game's CSS reads. */
type GlyphStyle = CSSProperties & {"--pc": string};

/** The most seats an arena is ever dealt for, which is as many colours as there are. */
const MAX_SEATS = 8;

interface SeatProps {
	readonly row: SeatRow;
	readonly swatches: readonly Swatch[];
	readonly rename: (seat: number, name: string) => void;
	readonly recolour: (seat: number, swatch: number) => void;
}

/** One seat: the name it answers to, and the colours it can play in. */
function Seat({row, swatches, rename, recolour}: SeatProps): ReactElement {
	// a seat always plays one of the swatches offered, so the blank is only there for the types
	const playing = swatches[row.swatch] ?? {colour: "", name: ""};
	const glyph: GlyphStyle = {"--pc": playing.colour};

	return (
		<div className="nrow">
			<span className={`glyph mage p${row.seat}`} style={glyph} />
			<input
				maxLength={14}
				value={row.name}
				placeholder={row.placeholder}
				aria-label={`Name for the ${playing.name} side`}
				onChange={(e) => {
					rename(row.seat, e.target.value);
				}}
			/>
			<span className="swatches">
				{swatches.map((swatch, i) => (
					<button
						key={swatch.colour}
						type="button"
						className="sw"
						style={{background: swatch.colour}}
						aria-pressed={row.swatch === i}
						title={swatch.name}
						onClick={() => {
							recolour(row.seat, i);
						}}
					/>
				))}
			</span>
		</div>
	);
}

/** Who is on whose side, which is a question of colour: one colour is one team. */
function TeamNote({teams, seats}: {readonly teams: readonly TeamTally[]; readonly seats: number}): ReactElement {
	return (
		<div className="loadhint teamnote">
			{teams.map((team) => (
				<span key={team.colour} className="tm">
					<span className="d" style={{background: team.colour}} />
					{team.seats > 1 ? `${team.name} x${team.seats}` : team.name}
				</span>
			))}
			<div className="teamline">
				{teams.length === seats
					? "Everyone is on their own. Give two fighters the same colour to put them on a side together."
					: "A colour is a side. Everyone on it shares the name, cannot be hit by their own, and the match ends when one colour is left."}
			</div>
		</div>
	);
}

/**
 * The arena panel: how many are playing and what they are called, then every number and switch a
 * match is dealt from.
 */
export function ArenaPanel({
	seats,
	swatches,
	teams,
	footworkUses,
	smash,
	paintball,
	chaos,
	chaosRound,
	hideHands,
	dim,
	hp,
	startNrg,
	openHand,
	setSeatCount,
	rename,
	recolour,
	setFootworkUses,
	setSmash,
	setPaintball,
	setChaos,
	setChaosRound,
	setHideHands,
	setDim,
	setHp,
	setStartNrg,
	setOpenHand,
}: ArenaSetup): ReactElement {
	return (
		<div className="card-panel">
			<h2>Arena</h2>
			<div className="field">
				<Slider
					name="Combatants"
					reading={String(seats.length)}
					min={2}
					max={MAX_SEATS}
					value={seats.length}
					onChange={setSeatCount}
				/>
				<div className="names">
					{seats.map((row) => (
						<Seat key={row.seat} row={row} swatches={swatches} rename={rename} recolour={recolour} />
					))}
				</div>
				<TeamNote teams={teams} seats={seats.length} />
			</div>
			<NumberBox
				name="Footwork uses each"
				hint="per footwork, per match"
				min={0}
				max={99}
				value={footworkUses}
				onChange={setFootworkUses}
			/>
			<Toggle
				name="Smash mode"
				blurb="All damage doubles every five rounds. Twice as hard from round five, four times from round ten, and on it climbs."
				on={smash}
				onChange={setSmash}
			/>
			<Toggle
				name="Paintball"
				blurb="Nobody is knocked out. Whoever you drop respawns at full health on your team, and the match ends when one colour has everybody."
				on={paintball}
				onChange={setPaintball}
			/>
			<Toggle
				name="Chaos mode"
				blurb="One square is marked each round and falls away, and every turn opens by throwing a card from your hand."
				on={chaos}
				onChange={setChaos}
			/>
			<NumberBox
				name="Chaos starts on round"
				hint="1 means from the off"
				min={1}
				max={99}
				value={chaosRound}
				onChange={setChaosRound}
				tucked
			/>
			<Toggle
				name="Hide hands between turns"
				blurb="Blanks the screen at each handoff so nobody reads your cards."
				on={hideHands}
				onChange={setHideHands}
			/>
			<Slider name="Grid" reading={`${dim} x ${dim}`} min={5} max={25} value={dim} onChange={setDim} />
			<Slider
				name="Starting health"
				reading={String(hp)}
				min={20}
				max={1000}
				step={10}
				value={hp}
				onChange={setHp}
			/>
			<NumberBox
				name="Energy on turn one"
				hint="+1 each turn after"
				min={0}
				max={99}
				value={startNrg}
				onChange={setStartNrg}
			/>
			<NumberBox
				name="Opening hand"
				hint="+2 drawn each turn"
				min={0}
				max={30}
				value={openHand}
				onChange={setOpenHand}
			/>
		</div>
	);
}
