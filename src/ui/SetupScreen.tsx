import {useSyncExternalStore, type ReactElement} from "react";
import {lobbyStore, menuStore, type LobbyView, type MenuView} from "../game/bridge.js";
import {ArenaPanel} from "./ArenaPanel.js";
import {ArsenalPanel} from "./ArsenalPanel.js";
import {LoadoutPanel} from "./LoadoutPanel.js";
import {OnlinePanel} from "./OnlinePanel.js";

/** The mark over the title: two triangles turning against each other. */
function Sigil(): ReactElement {
	return (
		<div className="sigil">
			<i />
			<i />
		</div>
	);
}

/**
 * The setup screen and the online panel beside it. The two come from stores of their own -- one is
 * the save, the other is a match server -- and meet here rather than in either module.
 */
type SetupProps = MenuView & {readonly online: LobbyView | null};

/**
 * The setup screen itself, posed from plain props so Storybook and tests can look at it without a
 * save behind it.
 */
export function SetupScreenView({
	arena,
	loadout,
	arsenal,
	online,
	themeLabel,
	toggleTheme,
	openSimulator,
	openDesigner,
	openTable,
	start,
}: SetupProps): ReactElement {
	return (
		<div className="menu">
			<div className="menuwrap">
				<div className="titlerow">
					<Sigil />
					<h1>
						Elemental
						<br />
						Arena
						<span>Fight battles with elements</span>
					</h1>
				</div>
				<ArenaPanel {...arena} />
				<LoadoutPanel {...loadout} />
				<ArsenalPanel {...arsenal} />
				{online !== null && <OnlinePanel {...online} />}
				<button type="button" className="ghost menubtn" onClick={openSimulator}>
					Power simulator
				</button>
				<button type="button" className="ghost menubtn" onClick={openDesigner}>
					Design the arena
				</button>
				<button type="button" className="ghost menubtn" onClick={toggleTheme}>
					{themeLabel}
				</button>
				<button type="button" className="ghost menubtn last" onClick={openTable}>
					Open the mixing table
				</button>
				<button type="button" className="start" onClick={start}>
					Enter the arena
				</button>
			</div>
		</div>
	);
}

/**
 * Everything between matches: who is playing, what they are dealt, what the treasury has bought,
 * and the door into the arena. It is up whenever a match is not.
 */
export function SetupScreen(): ReactElement | null {
	const view = useSyncExternalStore(menuStore.subscribe, menuStore.get, menuStore.get);
	const online = useSyncExternalStore(lobbyStore.subscribe, lobbyStore.get, lobbyStore.get);

	return view === null ? null : <SetupScreenView {...view} online={online} />;
}
