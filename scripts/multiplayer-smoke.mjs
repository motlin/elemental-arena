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
 * The same goes for the room outliving a socket -- presence, sitting back down, and a client told
 * to slow down: tests/net/room.test.ts pins the bookkeeping against fakes, and this runs it on the
 * hibernation API the bookkeeping is kept in. It ends by playing the match out, which is the one
 * moment the room may say anything about the match as a whole: the log, and not one move earlier.
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
const PROTOCOL_VERSION = 2;

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

	/* The loadout cap, held by the room rather than only by the panel that shows it. A host who has
	   bought the whole shop is one fetch away from dealing all of it to somebody who has bought none
	   of it, and this end of the wire is the only one in a position to say no. */
	const greedy = await fetch(`${BASE}/api/match/${CODE}-too-many/open`, {
		method: "POST",
		headers: {"content-type": "application/json"},
		body: JSON.stringify({seats: 2, els: ["fire", "water", "earth", "frost"]}),
	});
	check("a loadout over the cap is turned away", greedy.status === 400, String(greedy.status));

	const opened = await fetch(`${BASE}/api/match/${CODE}/open`, {
		method: "POST",
		headers: {"content-type": "application/json"},
		body: JSON.stringify({seats: 2, dim: 9, els: ["frost"], weps: ["spear"], moves: ["jump"]}),
	});
	const dealt = await opened.json();
	check(
		"a match opens without seating anybody",
		opened.status === 200 && dealt.seats === 2 && !("tokens" in dealt),
		JSON.stringify(dealt),
	);

	const again = await fetch(`${BASE}/api/match/${CODE}/open`, {method: "POST", body: "{}"});
	check("the same match cannot be opened twice", again.status === 409);

	/* A room that is turned down still has to take what was posted at it. Leaving the body of a
	   refused open unread ends the room where it stands, and the player who asks for a seat next is
	   told the connection was lost -- which looked like a flaky test for as long as one refused open
	   per run was all that happened. Ten in a row is not something one unread body survives. */
	let survived = 0;
	for (let round = 0; round < 10; round += 1) {
		const code = `${CODE}-turned-down-${round}`;
		await fetch(`${BASE}/api/match/${code}/open`, {method: "POST", body: JSON.stringify({seats: 2, dim: 9})});
		await fetch(`${BASE}/api/match/${code}/open`, {method: "POST", body: JSON.stringify({seats: 2, dim: 9})});
		const after = await (await fetch(`${BASE}/api/match/${code}/join`, {method: "POST"})).json();
		if (after.seat === 0) survived += 1;
	}
	check("a match outlives an open it turned down", survived === 10, `${survived}/10 rooms still answered`);

	const claim = async () => (await fetch(`${BASE}/api/match/${CODE}/join`, {method: "POST"})).json();
	const seats = [await claim(), await claim()];
	const tokens = seats.map((one) => one.token);
	check(
		"each player who turns up is dealt a seat of their own",
		seats[0].seat === 0 && seats[1].seat === 1 && tokens[0] !== tokens[1],
		JSON.stringify(seats.map((one) => one.seat)),
	);
	check("and the next one is told the match is full", (await claim()).error === "that match is full");

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
	/* Both hands out of the loadout the host opened on, and nothing out of either device's own
	   unlocks: the arsenal a match is dealt from is the one that came over the wire. */
	const dealtCards = [...mine.you.hand, ...theirs.you.hand];
	check(
		"both hands are dealt out of the loadout the match was opened on",
		dealtCards.every((c) => (c.k === "el" ? c.id === "frost" : c.ids.every((w) => w === "spear"))),
		JSON.stringify(dealtCards.map((c) => (c.k === "el" ? c.id : c.ids.join("+")))),
	);
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

	const roll = first.latest("presence");
	check(
		"each seat is told who is in the room",
		roll?.here?.length === 2 && roll.here.every(Boolean),
		JSON.stringify(roll?.here),
	);

	second.ws.close();
	await sleep(400);
	check(
		"the seats still in the room are told when one goes quiet",
		first.latest("presence")?.here?.join() === "true,false",
		JSON.stringify(first.latest("presence")?.here),
	);

	const back = await sit(1, tokens[1]);
	check(
		"the same token sits back down in the seat it left",
		back.latest("seated")?.seat === 1 && back.latest("state")?.state.seat === 1,
	);
	check(
		"and the room says the seat is filled again",
		first.latest("presence")?.here?.join() === "true,true",
		JSON.stringify(first.latest("presence")?.here),
	);

	// far more than a person clicking, and far less than a loop: the allowance is 24 in a burst
	for (let i = 0; i < 30; i++) back.ws.send(JSON.stringify({k: "move", intent: {k: "end"}}));
	await sleep(600);
	check(
		"a socket talking faster than a person could click is told to slow down",
		back.said("refused").some((m) => m.why === "you are talking too fast"),
	);

	const intruder = await sit(0, "not-the-token");
	check(
		"a socket without the seat's token is turned away",
		intruder.latest("closed")?.why === "that seat is not yours",
	);

	// the log narrates concealed moves by name, so it is the last thing over the wire and never earlier
	check(
		"no seat is handed the match log while the match is still being played",
		first.said("over").length === 0 && back.said("over").length === 0,
	);

	await first.move({k: "forfeit"});
	check(
		"every seat is handed the log once the match is over",
		first.latest("over")?.log?.at(-1)?.t?.includes("took the arena") === true &&
			back.latest("over")?.log?.length === first.latest("over")?.log?.length,
		JSON.stringify(first.latest("over")?.log?.at(-1) ?? null),
	);

	for (const player of [first, back, intruder]) player.ws.close();
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
