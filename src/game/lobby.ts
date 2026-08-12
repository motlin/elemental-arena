/**
 * The online panel on the setup screen: opening a match, the invite links it deals, and the way
 * into somebody else's.
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
import {PCN, S} from "./state.js";
import {inviteFrom, inviteLink, newCode, openRoom} from "../net/client.js";
import type {InviteLink} from "./bridge.js";
import type {MatchSetup} from "./intent.js";

/** The match this device opened, or null while it has opened none. */
let code: string | null = null;
/** One token per seat of that match, which is every seat this device could invite somebody to. */
let tokens: readonly string[] = [];
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

/** One link per seat. The colours are the server's own, because it deals a match of its own. */
function links(open: string): InviteLink[] {
	return tokens.map((token, seat) => ({
		seat,
		name: PCN[seat] ?? `Seat ${seat + 1}`,
		url: inviteLink({code: open, seat, token}),
	}));
}

export function drawLobby(): void {
	lobbyStore.set({code, opening, error, links: code === null ? [] : links(code), host, sit, join});
}

function host(): void {
	if (opening) return;
	opening = true;
	error = null;
	code = null;
	tokens = [];
	drawLobby();
	const asked = newCode();
	openRoom(asked, setup())
		.then((dealt) => {
			code = asked;
			tokens = dealt;
		})
		.catch((wrong: unknown) => {
			error = wrong instanceof Error ? wrong.message : "the match server would not open a match";
		})
		.finally(() => {
			opening = false;
			drawLobby();
		});
}

/** Takes one of the seats of the match this device just opened, which is how the host plays. */
function sit(seat: number): void {
	const token = tokens[seat];
	if (code === null || token === undefined) return;
	playOnline({code, seat, token});
}

function join(link: string): void {
	const invite = inviteFrom(link.trim());
	if (invite === null) {
		error = "that does not look like an invite link";
		drawLobby();
		return;
	}
	error = null;
	drawLobby();
	playOnline(invite);
}
