import {readFileSync, readdirSync} from "node:fs";
import path from "node:path";
import {describe, it, expect} from "vitest";

const dir = path.join(import.meta.dirname, "..", "..", "src", "styles");

/** Every stylesheet, with comments stripped so prose about a property never reads as one. */
const sheets = readdirSync(dir)
	.filter((f) => f.endsWith(".css"))
	.map((f) => ({name: f, css: readFileSync(path.join(dir, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")}));

/** The keyframe name each endless animation drives, tagged with where it was declared. */
function endlessKeyframeNames(): {sheet: string; name: string}[] {
	const found: {sheet: string; name: string}[] = [];
	for (const {name: sheet, css} of sheets) {
		for (const match of css.matchAll(/animation:\s*([^;]+);/g)) {
			const value = match[1] ?? "";
			if (!value.includes("infinite")) continue;
			/* Shorthand order is free, so the name is whichever word is not a time, a timing
			   function, a count or a direction. */
			const word = value
				.replace(/cubic-bezier\([^)]*\)|steps\([^)]*\)/g, " ")
				.split(/\s+/)
				.find(
					(w) =>
						/^[a-zA-Z][\w-]*$/.test(w) &&
						!/^(linear|ease|ease-in|ease-out|ease-in-out|infinite|normal|reverse|alternate|alternate-reverse|both|forwards|backwards|none|running|paused)$/.test(
							w,
						),
				);
			if (word !== undefined) found.push({sheet, name: word});
		}
	}
	return found;
}

/** The properties a named @keyframes block sets, across every stylesheet. */
function propertiesAnimatedBy(name: string): string[] {
	const props = new Set<string>();
	for (const {css} of sheets) {
		const block = new RegExp(String.raw`@keyframes\s+${name}\s*\{((?:[^{}]|\{[^{}]*\})*)\}`).exec(css);
		const body = block?.[1];
		if (body === undefined) continue;
		for (const match of body.matchAll(/([a-z-]+)\s*:/g)) {
			const prop = match[1];
			if (prop !== undefined) props.add(prop);
		}
	}
	return [...props];
}

/* An animation that never ends pays its per-frame cost for as long as the screen is up. Opacity and
   transform are the two the compositor can carry on its own; anything else means the browser
   repaints the element every frame, which measured 3-4x more CPU across a board. */
const COMPOSITABLE = new Set(["opacity", "transform"]);

describe("endless animations", () => {
	const endless = endlessKeyframeNames();

	it("exist to be checked", () => {
		expect(endless.length).toBeGreaterThan(0);
	});

	it("only ever move properties the compositor can carry", () => {
		const offenders = endless
			.map(({sheet, name}) => ({
				sheet,
				name,
				bad: propertiesAnimatedBy(name).filter((p) => !COMPOSITABLE.has(p)),
			}))
			.filter((e) => e.bad.length > 0);

		expect(offenders).toStrictEqual([]);
	});
});

/* A drop-shadow is drawn around the whole box and only then clipped to the shape, so on a clipped
   element the halo is thrown away before it ever reaches the screen. Measured: removing these
   changes at most 286 pixels of edge antialiasing by at most 12/255. They only cost frames. */
describe("clipped glyphs", () => {
	it("carry no drop-shadow, which their clip-path would discard", () => {
		const offenders: string[] = [];
		for (const {name: sheet, css} of sheets) {
			for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
				const selector = match[1] ?? "";
				const body = match[2] ?? "";
				if (!/\.(mage|glyph|bigglyph)\b/.test(selector)) continue;
				if (body.includes("drop-shadow")) offenders.push(`${sheet}: ${selector.trim()}`);
			}
		}

		expect(offenders).toStrictEqual([]);
	});
});
