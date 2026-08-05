import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import {Agentation} from "agentation";
import {GameOverScreen} from "./ui/GameOverScreen.js";
import {HandoffCurtain} from "./ui/HandoffCurtain.js";

const root = document.getElementById("app");

if (!root) {
	throw new Error("Root element not found");
}

// The game itself runs from the modules under src/game, which publish each migrated screen to
// src/game/bridge.ts. Screens move here one at a time.
createRoot(root).render(
	<StrictMode>
		{import.meta.env.DEV && <Agentation />}
		<HandoffCurtain />
		<GameOverScreen />
	</StrictMode>,
);
