/**
 * Two ordinary tabs of one browser, playing each other through the local match server.
 *
 * scripts/multiplayer-smoke.mjs proves the server half: that a room refuses what it should and
 * tells two seats different things. This proves the half that only exists in a browser -- that a
 * click becomes a move, that the arena a tab draws is the one the room sent it and never one the
 * tab worked out for itself, and that a move the room turns down leaves the tab where it was
 * instead of quietly out of step.
 *
 *   just online-check
 *
 * The two tabs share one browser profile on purpose, because that is the case the design is built
 * around: same-profile tabs share local storage, so a seat kept there would have the second tab
 * take the first tab's seat. The seat rides in the URL instead, and this is what says so.
 *
 * It reads dist/, so `just online-check` builds first.
 */

import {spawn} from "node:child_process";
import {createServer} from "node:net";
import {setTimeout as sleep} from "node:timers/promises";
import {chromium} from "playwright";

/** Ports nothing else is on, both held open at once so they cannot be handed the same one. */
async function freePorts(count) {
	const probes = await Promise.all(
		Array.from({length: count}, () => {
			const probe = createServer();
			return new Promise((resolve, reject) => {
				probe.on("error", reject);
				probe.listen(0, "127.0.0.1", () => resolve(probe));
			});
		}),
	);
	const ports = probes.map((probe) => probe.address().port);
	await Promise.all(probes.map((probe) => new Promise((done) => probe.close(done))));
	return ports;
}

const [freeServe, freeInspect] = await freePorts(2);
const PORT = Number(process.env.MULTIPLAYER_PORT ?? freeServe);
const INSPECTOR_PORT = Number(process.env.MULTIPLAYER_INSPECTOR_PORT ?? freeInspect);
const BASE = `http://127.0.0.1:${PORT}`;

const results = [];
const check = (what, ok = true, detail = "") => results.push({what, ok, detail});

/**
 * The modulepreload of the unbuilt entry that the build inlines as a data URI, which the browser
 * declines and the page does not need. It predates online play and is not what this is watching.
 */
const KNOWN_NOISE = /Failed to load module script/;

/** Waits for the match server, not merely for something to answer on the port. */
async function waitForServer(tries = 60) {
	for (let i = 0; i < tries; i++) {
		try {
			const answer = await fetch(`${BASE}/api/match/not-a-door`);
			if ((await answer.text()) === "no such door") return true;
		} catch {
			// Nothing is listening yet.
		}
		await sleep(500);
	}
	return false;
}

async function run() {
	const browser = await chromium.launch();
	// one context is one profile, which is the case the URL-borne seat exists to survive
	const context = await browser.newContext();
	const errors = [];

	async function tab() {
		const page = await context.newPage();
		page.on("pageerror", (e) => errors.push(String(e)));
		page.on("console", (m) => {
			if (m.type() === "error" && !KNOWN_NOISE.test(m.text())) errors.push(m.text());
		});
		return page;
	}

	try {
		const host = await tab();
		await host.goto(BASE, {waitUntil: "networkidle"});
		await host.getByRole("button", {name: "Host a match"}).click();
		await host.getByLabel("Invite link for Rose").waitFor({timeout: 15000});
		const first = await host.getByLabel("Invite link for Rose").inputValue();
		const second = await host.getByLabel("Invite link for Sky").inputValue();
		check("hosting deals one invite link per seat", first.includes("seat=0") && second.includes("seat=1"), first);

		await host.getByRole("button", {name: "Sit here"}).first().click();
		await host.locator("#game").waitFor({timeout: 15000});
		check("the host sits down and the arena comes up");

		const guest = await tab();
		await guest.goto(second.replace(/^https?:\/\/[^/]+/, BASE), {waitUntil: "networkidle"});
		await guest.locator("#game").waitFor({timeout: 15000});
		check("a second tab follows its own link straight into the arena");

		const whose = async (page) => (await page.locator(".netstrip .netwho").textContent()) ?? "";
		check(
			"two tabs of one profile hold two different seats",
			(await whose(host)).includes("seat 1") && (await whose(guest)).includes("seat 2"),
			`${await whose(host)} / ${await whose(guest)}`,
		);
		const state = async (page) => page.locator(".netstrip .netstate").textContent();
		check(
			"both tabs say they are connected",
			(await state(host)) === "Connected" && (await state(guest)) === "Connected",
		);

		const hand = async (page) => page.locator("#hand button .cn").allTextContents();
		const mine = await hand(host);
		const theirs = await hand(guest);
		check("each tab was dealt a hand of its own", mine.length > 0 && theirs.length > 0);

		await guest.getByRole("button", {name: /End turn/i}).click();
		await guest.locator(".netnotice").waitFor({timeout: 10000});
		const refusal = (await guest.locator(".netnotice").textContent()) ?? "";
		check("a move out of turn is refused, and the tab says so", refusal.includes("not your turn"), refusal);

		const steps = await host.locator(".tile.step").count();
		check("the seat to move is offered somewhere to walk", steps > 0, `${steps} highlighted squares`);
		const purse = await host.locator(".roundchip").textContent();
		await host.locator(".tile.step").first().click();
		await host.waitForFunction((was) => document.querySelector(".roundchip")?.textContent !== was, purse, {
			timeout: 10000,
		});
		check("walking is taken by the room and comes back as a new arena", true, purse ?? "");

		await host.getByRole("button", {name: /End turn/i}).click();
		await guest.waitForFunction(() => document.querySelectorAll(".tile.step").length > 0, undefined, {
			timeout: 10000,
		});
		check("the turn passing reaches the other tab, which may now move");

		check("neither tab logged an error", errors.length === 0, errors.slice(0, 3).join(" | "));
	} finally {
		await browser.close();
	}
}

const wrangler = spawn(
	"node_modules/.bin/wrangler",
	["dev", "--port", String(PORT), "--inspector-port", String(INSPECTOR_PORT)],
	{stdio: ["ignore", "pipe", "pipe"]},
);
let log = "";
wrangler.stdout.on("data", (chunk) => (log += chunk));
wrangler.stderr.on("data", (chunk) => (log += chunk));

let failed = false;
try {
	if (!(await waitForServer())) throw new Error(`wrangler dev never came up on ${PORT}\n${log}`);
	await run();
} catch (error) {
	check("the check ran to the end", false, String(error));
} finally {
	wrangler.kill("SIGTERM");
}

for (const {what, ok, detail} of results) {
	if (!ok) failed = true;
	console.log(`${ok ? "ok  " : "FAIL"}  ${what}${detail ? `  --  ${detail}` : ""}`);
}
if (failed) console.log(`\nwrangler said:\n${log}`);
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
