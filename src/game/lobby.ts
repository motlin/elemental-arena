/**
 * The online panel on the setup screen: opening a match, the link it deals, and the way into
 * somebody else's.
 *
 * It sits beside src/game/menu.ts rather than inside it because the two point opposite ways. The
 * menu describes the save and hands the numbers to the arena; this takes those numbers to a server,
 * gets a room back, and then hands the screen over to src/game/online.ts. Keeping it here is what
 * lets the online panel reach the match screen without the setup screen and the match screen
 * importing each other.
 *
 * A match opened here is dealt from the base arsenal, whatever this save has unlocked. Two devices
 * have two sets of unlocks and there is no rule yet for whose to use, so the server deals from
 * neither -- see src/game/intent.ts and the design note.
 */

import {lobbyStore} from "./bridge.js";
import {SETUP_LIMITS} from "./intent.js";
import {playOnline} from "./online.js";
import {S} from "./state.js";
import {claimSeat, codeFrom, inviteFrom, matchLink, newCode, openRoom} from "../net/client.js";
import type {MatchSetup} from "./intent.js";

/** The match this device opened, or null while it has opened none. */
let code: string | null = null;
/** How many seats that match was dealt, which is how many people its link is good for. */
let seats = 0;
let opening = false;
let error: string | null = null;

function clamp(value: number, [low, high]: readonly [number, number]): number {
	return Math.max(low, Math.min(high, Math.round(value)));
}

/**
 * The numbers the setup screen is showing, held to what the wire will take. The server refuses
 * anything out of range rather than pulling it into range, so a board the arena would deal locally
 * but the wire will not is worth clamping here rather than turning into a mystery error.
 */
function setup(): MatchSetup {
	return {
		seats: clamp(S.np, SETUP_LIMITS.seats),
		dim: clamp(S.dim, SETUP_LIMITS.dim),
		hp: clamp(S.hp, SETUP_LIMITS.hp),
		priv: S.priv,
	};
}

export function drawLobby(): void {
	lobbyStore.set({code, seats, opening, error, link: code === null ? null : matchLink(code), host, sit, join});
}

function host(): void {
	if (opening) return;
	opening = true;
	error = null;
	code = null;
	seats = 0;
	drawLobby();
	const asked = newCode();
	openRoom(asked, setup())
		.then((dealt) => {
			code = asked;
			seats = dealt;
		})
		.catch((wrong: unknown) => {
			error = wrong instanceof Error ? wrong.message : "the match server would not open a match";
		})
		.finally(() => {
			opening = false;
			drawLobby();
		});
}

/** Takes a seat in the match this device opened, which is how whoever opened one plays in it. */
function sit(): void {
	if (code !== null) claim(code);
}

/** Asks a match for a seat and sits down in whichever one it deals. */
function claim(open: string): void {
	claimSeat(open)
		.then(playOnline)
		.catch((wrong: unknown) => {
			error = wrong instanceof Error ? wrong.message : "the match server would not seat you";
			drawLobby();
		});
}

/**
 * Follows a link into a match. One carrying a seat and a token is this tab sitting back down in a
 * seat it already holds; one carrying only a match is somebody arriving, and the room decides which
 * seat they get. `loud` is whether a link that is neither is worth complaining about, which it is
 * when somebody pasted it and is not when it is merely the address the tab was opened on.
 */
function follow(text: string, loud: boolean): void {
	const link = text.trim();
	const invite = inviteFrom(link);
	const open = invite === null ? codeFrom(link) : null;
	if (invite === null && open === null) {
		if (!loud) return;
		error = "that does not look like an invite link";
		drawLobby();
		return;
	}
	error = null;
	drawLobby();
	if (invite !== null) playOnline(invite);
	else if (open !== null) claim(open);
}

function join(link: string): void {
	follow(link, true);
}

/** A tab opened on a link goes where the link says; one opened on the bare page stays where it is. */
export function followHere(): void {
	follow(globalThis.location.href, false);
}
