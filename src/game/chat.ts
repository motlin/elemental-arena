/**
 * Table talk: what has been said around the board, and the saying of it.
 *
 * This is a rule rather than a screen, which is not where it started. Saying something was part of
 * the match screen while typing into that screen was the only way to do it, but a socket can say
 * something too, and the rules are the only half of the game a server ever loads. So the saying
 * lives here, the screen reads it, and src/game/intent.ts can hand it a message off the wire.
 */

import {logit} from "./cards.js";
import {S, cur} from "./state.js";
import type {ChatMsg} from "./types.js";
import {redraw} from "./view.js";

/** The longest thing anybody may say, which the chat box and the wire both hold their end to. */
export const SAY_MAX = 120;

/** One thing that was said, by the number a reply points at it with. */
export function chatById(id: number): ChatMsg | undefined {
	return S.chat.find((m) => m.id === id);
}

/**
 * Says something at the table, answering whatever the reply bar is pointing at. Angle brackets go
 * because the message is printed, and a message with nothing left in it is not said at all.
 */
export function say(text: string): void {
	const t = text.trim().replace(/[<>]/g, "").slice(0, SAY_MAX);
	if (!t) return;
	const p = cur();
	const par = S.replyTo ? chatById(S.replyTo) : null;
	S.chat.push({
		id: S.cid++,
		who: p ? p.name : "",
		c: p ? p.c : "var(--muted)",
		r: S.round,
		t,
		to: par ? par.id : null,
	});
	logit(par ? `to ${par.who}: “${t}”` : `“${t}”`, undefined, true);
	S.replyTo = null;
	redraw();
}
