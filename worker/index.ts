/**
 * The match server: one door in, and one Durable Object behind it per match code.
 *
 * This is the entry point of the one Worker the project deploys as. The site rides along as static
 * assets bound to the same Worker, and only /api/* is routed here ahead of them -- see
 * run_worker_first in wrangler.toml. Everything else never reaches this function.
 *
 * It is shaped this way because a Cloudflare Pages project cannot define a Durable Object class at
 * all, only bind to one another Worker defines, so a preview of the site could never have had a
 * match server behind it.
 */

import {MatchRoom} from "./room.js";

export {MatchRoom};

export interface Env {
	readonly MATCH: DurableObjectNamespace;
}

/** A match code: what a player pastes to their opponent, so it has to be safe in a URL. */
const DOOR = /^\/api\/match\/([A-Za-z0-9_-]{4,64})\/(open|join|socket)$/;

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const code = DOOR.exec(new URL(request.url).pathname)?.[1];
		if (code === undefined) return new Response("no such door", {status: 404});
		const room = env.MATCH.get(env.MATCH.idFromName(code));
		return room.fetch(request);
	},
};
