import {type CSSProperties, type ReactElement} from "react";
import type {LoadoutChip, LoadoutSetup, ScopeChip} from "../game/bridge.js";
import {Chip} from "./SetupFields.js";

/** React types `style` as CSSProperties, which leaves no room for the custom properties the game's CSS reads. */
type ChipStyle = CSSProperties & {"--cc": string};

/** How the panel words whose loadout the chips below belong to. */
function scopeName(scopes: readonly ScopeChip[], who: number | "all"): string {
	if (who === "all") return "for everyone";
	return `for ${scopes.find((scope) => scope.who === who)?.label ?? ""} only`;
}

interface ChipRowProps {
	readonly heading: string;
	readonly scope: string;
	readonly chips: readonly LoadoutChip[];
	readonly onPick: (key: string) => void;
	/** Anything that goes after the chips, which is where the footwork row keeps All and None. */
	readonly children?: ReactElement | false;
}

/** One kind of card, with the fighter it is being set for named beside it. */
function ChipRow({heading, scope, chips, onPick, children}: ChipRowProps): ReactElement {
	return (
		<div className="field">
			<label>
				<span className="lname">
					{heading} <span className="forwho">{scope}</span>
				</span>
			</label>
			<div className="chips">
				{chips.map((chip) => (
					<Chip key={chip.key} chip={chip} onPick={onPick} />
				))}
				{children}
			</div>
		</div>
	);
}

/**
 * The this-match panel: everything switched off here is never drawn and never fused, for whoever
 * the chips above are being set for. It sells nothing back; the arsenal keeps what it bought.
 */
export function LoadoutPanel({
	who,
	scopes,
	elements,
	weapons,
	footwork,
	allFootwork,
	noFootwork,
	anyFootwork,
	setWho,
	toggleElement,
	toggleWeapon,
	toggleFootwork,
	setAllFootwork,
	share,
}: LoadoutSetup): ReactElement {
	const scope = scopeName(scopes, who);

	return (
		<div className="card-panel">
			<h2>This match</h2>
			<p className="loadhint">
				Switch off anything you would rather not see this game. Greyed out cards never get drawn, and their
				fusions cannot come up. This does not sell anything back.
			</p>
			<div className="field">
				<label>
					<span className="lname">Setting this for</span>
				</label>
				<div className="chips">
					{scopes.map((chip) => {
						const style: ChipStyle = {"--cc": chip.colour};

						return (
							<button
								key={String(chip.who)}
								type="button"
								className="chip whoc"
								style={style}
								aria-pressed={chip.who === who}
								onClick={() => {
									setWho(chip.who);
								}}
							>
								{chip.own ? `${chip.label} *` : chip.label}
							</button>
						);
					})}
				</div>
				<p className="loadhint whonote">
					{who === "all" && "Editing what everyone draws and the footwork they all carry."}
					{who !== "all" && share === null && (
						<>Editing the shared list. Change anything here and this fighter gets their own.</>
					)}
					{who !== "all" && share !== null && (
						<>
							{`Editing ${scopes.find((chip) => chip.who === who)?.label ?? ""} only, marked with a star. `}
							<button type="button" className="linkish" onClick={share}>
								Put them back on the shared list
							</button>
						</>
					)}
				</p>
			</div>
			<ChipRow heading="Elements" scope={scope} chips={elements} onPick={toggleElement} />
			<ChipRow heading="Weapons" scope={scope} chips={weapons} onPick={toggleWeapon} />
			<ChipRow heading="Footwork" scope={scope} chips={footwork} onPick={toggleFootwork}>
				{anyFootwork && (
					<>
						<button
							type="button"
							className="chip mvall"
							disabled={allFootwork}
							onClick={() => {
								setAllFootwork(true);
							}}
						>
							All
						</button>
						<button
							type="button"
							className="chip mvall"
							disabled={noFootwork}
							onClick={() => {
								setAllFootwork(false);
							}}
						>
							None
						</button>
					</>
				)}
			</ChipRow>
		</div>
	);
}
