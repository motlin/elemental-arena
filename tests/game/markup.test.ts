import {existsSync, readFileSync} from "node:fs";
import path from "node:path";
import {describe, it, expect} from "vitest";

/** The page as it ships, which is the only place stray game markup could come back. */
const html = readFileSync(path.join(import.meta.dirname, "..", "..", "index.html"), "utf8");

describe("static markup", () =>
{
	/* Every panel a match paints belongs to React now, drawn from the view the game publishes. A
	   panel that quietly reappeared here would be one nothing ever fills in and nothing ever reads,
	   so pin that the page carries no id but the root React mounts on. */
	it("names nothing but the root React mounts on", () =>
	{
		const ids = [...html.matchAll(/\bid="([^"]*)"/g)].map((m) => m[1]);

		expect(ids).toStrictEqual(["app"]);
	});

	it("leaves that root empty for React to fill", () =>
	{
		expect(html).toContain('<div id="app"></div>');
	});

	/* The tab, a bookmark, and a phone's home screen each want an icon, and Vite copies public/ to the
	   site root, so every icon the page names has to be a file in public/. */
	it("links icons that ship with the site", () =>
	{
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

	/* A link pasted into a chat or a post unfurls from these tags. Crawlers want the image as an
	   absolute URL, and it is served from public/ like the icons, so the file has to be there too. */
	it("describes the link preview with an image that ships with the site", () =>
	{
		const tags = Object.fromEntries(
			[...html.matchAll(/<meta\s+(?:property|name)="((?:og|twitter):[^"]*)"\s+content="([^"]*)"/g)].map((m) => [
				m[1],
				m[2],
			]),
		);
		const image = new URL(tags["og:image"] ?? "https://elemental-arena.motlin.com/missing");

		expect(tags).toStrictEqual(
			{
				"og:type": "website",
				"og:site_name": "Elemental Arena",
				"og:title": "Elemental Arena",
				"og:description":
					"A hot-seat tactical card game played on a grid of fusing elemental terrain. Lay fire, water, earth and lightning, fuse them where they meet, and fight on what you made.",
				"og:url": "https://elemental-arena.motlin.com/",
				"og:image": "https://elemental-arena.motlin.com/og.jpg",
				"og:image:width": "1200",
				"og:image:height": "630",
				"og:image:alt":
					"The title Elemental Arena and its tagline Fight battles with elements over a hand of Fire, Air and Sword cards, beside a nine by nine arena of glowing fire, water, earth and lightning squares fused into new ground where they meet, with a pink triangle and a cyan diamond fighter in opposite corners",
				"twitter:card": "summary_large_image",
				"twitter:title": "Elemental Arena",
				"twitter:description":
					"A hot-seat tactical card game played on a grid of fusing elemental terrain. Lay fire, water, earth and lightning, fuse them where they meet, and fight on what you made.",
				"twitter:image": "https://elemental-arena.motlin.com/og.jpg",
			},
		);
		expect(existsSync(path.join(import.meta.dirname, "..", "..", "public", image.pathname))).toBe(true);
	});
});
