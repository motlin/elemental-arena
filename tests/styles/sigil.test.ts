import {readFileSync} from "node:fs";
import path from "node:path";
import {describe, it, expect} from "vitest";

const styles = (name: string): string =>
	readFileSync(path.join(import.meta.dirname, "..", "..", "src", "styles", name), "utf8");

const menu = styles("menu.css");
const tokens = styles("tokens.css");

/** Every declaration block whose selector mentions the sigil, across both stylesheets. */
function sigilRules(css: string): string[] {
	/* Comments go first: the sigil block explains which properties it avoids and why, and that prose
	   would otherwise read as part of the selector that follows it. */
	const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");

	return [...bare.matchAll(/([^{}]*\.sigil[^{}]*)\{([^}]*)\}/g)].map((m) => `${m[1]}{${m[2]}}`);
}

const rules = [...sigilRules(menu), ...sigilRules(tokens)];

/* The mark turns forever, so whatever it costs to draw one frame is paid ~60 times a second for as
   long as the setup screen is open. These pin the two properties that stop the browser from handing
   that turn to the GPU. */
describe("the setup screen sigil", () => {
	it("still turns", () => {
		const spins = rules.some((r) => /animation:[^;]*\bspin\b[^;]*\binfinite\b/.test(r));

		expect(spins).toBe(true);
	});

	/* A clip-path is re-evaluated every frame and keeps the layer off the compositor, which measured
	   at roughly twice the CPU of the same picture drawn as a texture. */
	it("draws its triangles without clipping them", () => {
		const clipped = rules.filter((r) => r.includes("clip-path"));

		expect(clipped).toStrictEqual([]);
	});

	/* A filter under a clip-path paints nothing at all: the glow is drawn around the whole box and
	   then clipped away with everything outside the triangle. It only ever cost frames. */
	it("carries no filter, which a clip would have thrown away anyway", () => {
		const filtered = rules.filter((r) => r.includes("filter:"));

		expect(filtered).toStrictEqual([]);
	});

	it("hands the turn to its own compositor layer", () => {
		const promoted = rules.some((r) => /will-change:\s*transform/.test(r));

		expect(promoted).toBe(true);
	});

	/* will-change alone promotes the layer. Pairing it with translateZ(0) would leave the element's
	   underlying transform mismatched against the rotate() keyframe, so the two interpolate as
	   matrices -- and rotate(360deg) as a matrix is the identity, which reads as no motion at all. */
	it("does not pin a transform that would cancel the rotation", () => {
		const pinned = rules.filter((r) => /transform:\s*translateZ/.test(r));

		expect(pinned).toStrictEqual([]);
	});

	/* The warm triangle takes its colour from --hot, which the day theme redefines. A baked texture
	   cannot read a custom property, so each theme has to carry its own copy. */
	it("gives the day theme its own warm triangle", () => {
		const dayTriangle = sigilRules(tokens).some(
			(r) => r.includes('data-theme="day"') && r.includes("background-image"),
		);

		expect(dayTriangle).toBe(true);
	});
});
