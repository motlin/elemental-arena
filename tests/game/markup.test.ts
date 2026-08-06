import {readFileSync} from "node:fs";
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
});
