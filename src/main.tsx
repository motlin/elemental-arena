import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import {Agentation} from "agentation";

const root = document.getElementById("app");

if (!root) {
	throw new Error("Root element not found");
}

// The game is still vanilla JS inside index.html. This root is the migration target;
// it renders nothing visible until pieces of the game move into React.
createRoot(root).render(<StrictMode>{import.meta.env.DEV && <Agentation />}</StrictMode>);
