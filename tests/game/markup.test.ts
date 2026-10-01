import {existsSync, readFileSync} from "node:fs";
import path from "node:path";
import {describe, it, expect} from "vitest";

/** The page as it ships, which is the only place stray game markup could come back. */
const html = readFileSync(path.join(import.meta.dirname, "..", "..", "index.html"), "utf8");

describe("static markup", () => {
	/* Every panel a match paints belongs to React now, drawn from the view the game publishes. A
	   panel that quietly reappeared here would be one nothing ever fills in and nothing ever reads,
	   so pin that the page carries no id but the root React mounts on. */
	it("names nothing but the root React mounts on", () => {
		const ids = [...html.matchAll(/\bid="([^"]*)"/g)].map((m) => m[1]);

		expect(ids).toStrictEqual(["app"]);
	});

	it("leaves that root empty for React to fill", () => {
		expect(html).toContain('<div id="app"></div>');
	});

	/* The tab, a bookmark, and a phone's home screen each want an icon, and Vite copies public/ to the
	   site root, so every icon the page names has to be a file in public/. */
	it("links icons that ship with the site", () => {
		const icons = [...html.matchAll(/<link rel="(icon|apple-touch-icon)"[^>]*href="\/([^"]*)"/g)].map((m) => [
			m[1],
			m[2],
			existsSync(path.join(import.meta.dirname, "..", "..", "public", m[2] ?? "")),
		]);

		expect(icons).toStrictEqual([
			["icon", "favicon.svg", true],
			["apple-touch-icon", "apple-touch-icon.png", true],
		]);
	});
});
