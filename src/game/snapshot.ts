/**
 * A whole match as plain data, lifted out of `S` and put back into it.
 *
 * `S` is one module-level object, which is exactly right for a game that only ever plays one match
 * on one device. A Durable Object isolate is not that: Cloudflare is free to run several matches of
 * the same class in one isolate, and they would all be reaching into the same `S`. So the server
 * never leaves a match sitting there. It loads the match the message is about, works it, lifts it
 * back out, and stores it. Nothing is left behind for the next match to find.
 *
 * The split is between what the match is and what the device is. Coins, the fusion codex and the
 * theme belong to whoever is playing, and never reach the server. The unlocked and switched-off
 * lists do come over, because they are what the deal is made from, and the deal is the server's
 * job. What they hold online is not either device's arsenal but the loadout the match was opened
 * on: whoever hosted sent three of each kind at most, and every seat is dealt from those -- see
 * `openMatch` in src/game/intent.ts.
 *
 * The match log and the replay frames stay out of the seat views (src/game/seat.ts) but the log
 * stays in the snapshot, because the game-over screen is written from it. The frames are the log
 * with the whole board stapled to every line, and the server has no use for them at all.
 */

import {S} from "./state.js";
import type {GameState} from "./types.js";

/** The fields of `S` a match is made of. Everything else belongs to the device it is played on. */
const MATCH_KEYS = [
	"dim",
	"np",
	"hp",
	"startNrg",
	"openHand",
	"players",
	"board",
	"turn",
	"round",
	"phase",
	"names",
	"cols",
	"mv",
	"munlocked",
	"mvShared",
	"priv",
	"smash",
	"mvUses",
	"paint",
	"chaos",
	"chaosRound",
	"warn",
	"toss",
	"tossPick",
	"chat",
	"cid",
	"replyTo",
	"log",
	"preset",
	"presetDim",
	"sel",
	"mode",
	"mixFrom",
	"steal",
	"wid",
	"uid",
	"matchCoins",
	"screen",
	"unlocked",
	"wunlocked",
	"elOff",
	"wOff",
	"pOff",
] as const;

type MatchKey = (typeof MATCH_KEYS)[number];

/** A match as it travels: over a socket, into Durable Object storage, and back. */
export type MatchSnapshot = Pick<GameState, MatchKey>;

// both directions go through one key at a time, so the two sides of the copy share a type parameter
// and neither has to be told the field it is carrying is the field it is carrying
function lift<K extends MatchKey>(into: Pick<GameState, K>, key: K): void {
	into[key] = S[key];
}

function drop<K extends MatchKey>(from: Pick<GameState, K>, key: K): void {
	S[key] = from[key];
}

/** The match as it stands, cloned, so nothing the game does next reaches back into the snapshot. */
export function exportMatch(): MatchSnapshot {
	const out = {} as MatchSnapshot;
	for (const key of MATCH_KEYS) lift(out, key);
	return structuredClone(out);
}

/**
 * Makes `S` be this match and no other. The snapshot is cloned on the way in for the same reason it
 * is cloned on the way out, and everything a match leaves behind that a snapshot does not carry is
 * cleared rather than inherited.
 */
export function importMatch(snap: MatchSnapshot): void {
	const fresh = structuredClone(snap);
	for (const key of MATCH_KEYS) drop(fresh, key);
	// what the last match left that this one has no opinion about
	S.frames = [];
	S.fx = [];
	S.look = null;
	S.imode = false;
	S.reach = [];
	S.handoff = false;
}
