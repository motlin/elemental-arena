/**
 * Proves the match server does what the design note says it does, on a machine with no Cloudflare
 * account attached to it. It starts `wrangler dev` -- miniflare, local, no credentials -- opens a
 * two-seat match on it, sits a socket in each seat and checks that what the two of them are told is
 * not the same thing.
 *
 * It also checks the one deployable serves both halves: the built site on the paths the site owns,
 * and the match server on /api/*. That is what `run_worker_first` in wrangler.toml buys, and the
 * way it breaks is quiet -- either deep links get the match server's 404, or /api/... is answered
 * with the game and a 200.
 *
 *   just multiplayer-check
 *
 * The concealment rules themselves are pinned by tests/game/seat.test.ts. What this adds is that
 * the filtering actually happens on the far side of a socket rather than on the way into a screen.
 *
 * It reads dist/, so `just multiplayer-check` builds first.
 */

import {spawn} from "node:child_process";
import {createServer} from "node:net";
import {setTimeout as sleep} from "node:timers/promises";

/**
 * Ports nothing else is on. A fixed default collides with whatever else the machine happens to be
 * running, and deriving the second port by arithmetic can walk off the end of the port range. Both
 * probes are held open at once so they cannot be handed the same port.
 */
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
const CODE = `smoke-${Math.random().toString(36).slice(2, 10)}`;
const PROTOCOL_VERSION = 1;

const results = [];
const check = (what, ok, detail = "") => results.push({what, ok, detail});

/**
 * Waits for the match server, not merely for something to answer. The assets half of the Worker
 * starts serving before the Worker itself will take a socket, so waiting on `/` returns too early
 * and the first WebSocket is refused.
 */
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

/** One player: a socket in a seat, and everything the server has said to it. */
async function sit(seat, token) {
	const ws = new WebSocket(`ws://127.0.0.1:${PORT}/api/match/${CODE}/socket`);
	const inbox = [];
	const raw = [];
	ws.addEventListener("message", (event) => {
		raw.push(event.data);
		inbox.push(JSON.parse(event.data));
	});
	await new Promise((resolve, reject) => {
		ws.addEventListener("open", resolve, {once: true});
		ws.addEventListener("error", reject, {once: true});
	});
	ws.send(JSON.stringify({k: "hello", v: PROTOCOL_VERSION, seat, token}));
	await sleep(400);
	return {
		ws,
		inbox,
		raw,
		said: (kind) => inbox.filter((m) => m.k === kind),
		latest: (kind) => inbox.filter((m) => m.k === kind).at(-1),
		move: async (intent) => {
			ws.send(JSON.stringify({k: "move", intent}));
			await sleep(400);
		},
	};
}

async function run() {
	const page = await fetch(`${BASE}/`);
	const html = await page.text();
	check(
		"the built site is served from the same origin as the match server",
		page.status === 200 && html.includes('<div id="app">'),
		`${page.status} ${html.slice(0, 60)}`,
	);

	const deep = await fetch(`${BASE}/no/such/route`);
	check(
		"a path the site owns is answered with the app, not a 404",
		deep.status === 200 && (await deep.text()).includes('<div id="app">'),
		String(deep.status),
	);

	const door = await fetch(`${BASE}/api/match/not-a-door`);
	check(
		"a path under /api reaches the match server rather than the page",
		door.status === 404 && (await door.text()) === "no such door",
		String(door.status),
	);

	const opened = await fetch(`${BASE}/api/match/${CODE}/open`, {
		method: "POST",
		headers: {"content-type": "application/json"},
		body: JSON.stringify({seats: 2, dim: 9}),
	});
	const {tokens} = await opened.json();
	check("a match opens and deals one token per seat", opened.status === 200 && tokens?.length === 2);

	const again = await fetch(`${BASE}/api/match/${CODE}/open`, {method: "POST", body: "{}"});
	check("the same match cannot be opened twice", again.status === 409);

	const first = await sit(0, tokens[0]);
	const second = await sit(1, tokens[1]);

	const mine = first.latest("state")?.state;
	const theirs = second.latest("state")?.state;
	check(
		"each socket is seated where it asked",
		first.latest("seated")?.seat === 0 && second.latest("seated")?.seat === 1,
	);
	check("each socket is sent the arena from its own seat", mine?.seat === 0 && theirs?.seat === 1);

	const myUids = mine.you.hand.map((c) => c.uid);
	const theirUids = theirs.you.hand.map((c) => c.uid);
	check("both seats were dealt a hand", myUids.length > 0 && theirUids.length > 0);
	check(
		"neither seat's cards appear in the other's messages",
		!first.raw.some((line) => theirUids.some((uid) => line.includes(`"uid":${uid}`))) &&
			!second.raw.some((line) => myUids.some((uid) => line.includes(`"uid":${uid}`))),
		`seat 0 holds ${myUids.join(",")}; seat 1 holds ${theirUids.join(",")}`,
	);
	check(
		"each seat is told only how many cards the other is holding",
		mine.fighters[1].cards === theirUids.length && mine.fighters[1].seen.length === 0,
	);
	check("no seat is sent the match log", !("log" in mine));

	await second.move({k: "step", x: theirs.you.x - 1, y: theirs.you.y});
	check(
		"a move out of turn is refused",
		second.latest("refused")?.why === "not your turn",
		second.latest("refused")?.why ?? "",
	);

	const before = first.said("state").length;
	await first.move({k: "end"});
	check(
		"ending a turn reaches both sockets",
		first.said("state").length > before && second.latest("state")?.state.turn === 1,
	);

	const intruder = await sit(0, "not-the-token");
	check(
		"a socket without the seat's token is turned away",
		intruder.latest("closed")?.why === "that seat is not yours",
	);

	for (const player of [first, second, intruder]) player.ws.close();
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
