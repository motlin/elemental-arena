import {readFile} from "node:fs/promises";
import {extname, join} from "node:path";
import {chromium} from "playwright";

// Renders public/og.jpg, the 1200x630 image link previews show, from the built game itself: the title and sigil off the
// setup screen beside a real match board, painted through the arena designer with fused terrain, and the hand dealt
// for it. The game draws in system fonts and fetches nothing, so this needs no network. Run it with `just og-image`
// after changing how the title, the board or the cards look.
const OUT = "public/og.jpg";
// The terrain glows make a PNG of the card several times larger than this JPEG.
const QUALITY = 85;
// The built page links its assets from the site root, so it loads under the real origin with each request answered from
// dist/ rather than from file://.
const ORIGIN = "https://elemental-arena.motlin.com";
const TYPES: Record<string, string> =
{
	".html": "text/html",
	".js": "text/javascript",
	".css": "text/css",
	".svg": "image/svg+xml",
	".png": "image/png",
};

// A save that has bought air and lightning and turned up the fusions the board below is painted with, so the designer
// offers every one of them.
const SAVE =
{
	v: 2,
	unlocked: ["fire", "water", "earth", "air", "bolt"],
	codex: Object.fromEntries(
		["steam", "glass", "mud", "whirl", "wildfire", "plasma", "surge", "dust", "magnet"].map((k) => [k, 1]),
	),
};

// The arena, one letter per square of the 9x9 grid a two-hander is dealt, named for the designer button that paints it:
// fire, water, earth and lightning in the corners, fused where they meet, around an open middle. The two spawn squares,
// (1,1) and (7,7), stay bare for the fighters.
const MATERIALS: Record<string, string> =
{
	F: "Fire",
	W: "Water",
	E: "Earth",
	A: "Air",
	B: "Lightning",
	S: "Steam",
	G: "Glass",
	M: "Mud",
	H: "Whirlpool",
	L: "Wildfire",
	P: "Plasma",
	U: "Surge",
	D: "Dust",
	N: "Magnetite",
};
const ARENA = [
	"LFFSWWWH.",
	"F.FSWWHH.",
	"FFFSSWWH.",
	"GGG...UUU",
	"EG....UBB",
	"EEM....PB",
	"EMMM.D.PB",
	"EEM.DDN.B",
	"EEEDDNNPB",
];

// Lays the title and the dealt hand on the left and the board on the right, over the page's own background.
const CARD_CSS = `
	html, body { overflow: hidden; }
	#og { position: fixed; inset: 0; z-index: 1000; display: grid; grid-template-columns: 1fr auto; column-gap: 40px;
		align-items: center; padding: 0 56px 0 64px;
		background: radial-gradient(1200px 700px at 30% -12%, var(--glow) 0%, transparent 60%), var(--void); }
	#og .left { display: flex; flex-direction: column; gap: 44px; }
	#og .titlerow { margin: 0; }
	#og h1 span { font-size: 0.28em; letter-spacing: 0.22em; white-space: nowrap; }
	#og .hand { overflow: visible; flex-wrap: nowrap; }
	#og #board { margin: 0; --cell: 54px !important; }
	#og .hand > :nth-child(n + 4) { display: none; }
`;

// Match setup deals random elements, weapons and footwork; a fixed seed deals the same hand on every run. This
// one deals fire, air and a sword.
const SEED = Number(process.env["OG_SEED"] ?? 5);
function seedRandom(seed: number): void
{
	let a = seed;
	Math.random = (): number =>
	{
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const browser = await chromium.launch();
try
{
	const page = await browser.newPage(
		{
			viewport:
			{
				width: 1200,
				height: 630,
			},
		},
	);
	await page.addInitScript(seedRandom, SEED);
	await page.addInitScript((save) =>
	{
		localStorage.setItem("arena:v3", save);
	}, JSON.stringify(SAVE));
	await page.route(`${ORIGIN}/**`, async (route) =>
	{
		const path = new URL(route.request().url()).pathname;
		const file = join("dist", path === "/" ? "index.html" : path);
		await route.fulfill(
			{
				body: await readFile(file),
				contentType: TYPES[extname(file)] ?? "application/octet-stream",
			},
		);
	});
	await page.goto(
		`${ORIGIN}/`,
		{
			waitUntil: "networkidle",
		},
	);
	// The setup screen is gone once the match starts, so keep its title row to put back on the card.
	const title = await page.locator(".menu .titlerow").evaluate((row) => row.outerHTML);

	await page
		.getByRole(
			"button",
			{
				name: "Design the arena",
			},
		)
		.click();
	const squares = page.locator(".bboard > div");
	for (const [letter, material] of Object.entries(MATERIALS))
	{
		await page
			.locator(".bp.mat")
			.filter(
				{
					hasText: new RegExp(`^${material}$`),
				},
			)
			.click();
		// The rows run on into one another in the order the designer lays its squares out.
		const cells = ARENA.join("");
		for (let i = 0; i < cells.length; i++)
		{
			if (cells[i] === letter) await squares.nth(i).click();
		}
	}
	await page
		.getByRole(
			"button",
			{
				name: "Done",
			},
		)
		.click();
	await page
		.getByRole(
			"button",
			{
				name: "Enter the arena",
			},
		)
		.click();
	await page
		.getByRole(
			"button",
			{
				name: /^I'm /,
			},
		)
		.click();
	await page.locator("#board").waitFor();

	await page.addStyleTag(
		{
			content: CARD_CSS,
		},
	);
	await page.evaluate((titleHtml) =>
	{
		const card = document.createElement("div");
		card.id = "og";
		const left = document.createElement("div");
		left.className = "left";
		left.innerHTML = titleHtml;
		const hand = document.querySelector("#hand");
		const board = document.querySelector("#board");
		if (!hand || !board) throw new Error("The match screen has no hand or board to put on the card");
		left.appendChild(hand);
		card.appendChild(left);
		card.appendChild(board);
		document.body.appendChild(card);
	}, title);
	await page.screenshot(
		{
			path: OUT,
			type: "jpeg",
			quality: QUALITY,
		},
	);
	console.log(`wrote ${OUT}`);
}
finally
{
	await browser.close();
}
