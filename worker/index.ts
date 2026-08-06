/**
 * The match server: one door in, and one Durable Object behind it per match code.
 *
 * This is a Worker of its own rather than part of the site. A Pages project cannot define a Durable
 * Object class at all -- it can only bind to one another Worker defines -- and the single-player
 * game deploys to Pages today, so the two stay apart until the site itself moves to Workers. The
 * design note under .llm/plans has the migration written out.
 */

import {MatchRoom} from "./room.js";

export {MatchRoom};

export interface Env {
	readonly MATCH: DurableObjectNamespace;
}

/** A match code: what a player pastes to their opponent, so it has to be safe in a URL. */
const DOOR = /^\/api\/match\/([A-Za-z0-9_-]{4,64})\/(open|socket)$/;

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const code = DOOR.exec(new URL(request.url).pathname)?.[1];
		if (code === undefined) return new Response("no such door", {status: 404});
		const room = env.MATCH.get(env.MATCH.idFromName(code));
		return room.fetch(request);
	},
};
