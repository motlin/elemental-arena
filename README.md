# Elemental Arena

A hot-seat tactical card game. Two to eight fighters on a grid you size from 5x5 to 25x25.
Cards are elements and weapons; elements fuse both on the board and in your hand, weapons
break after one swing, and the ground you build is the ground you fight on.

## Running it

```sh
just install
just dev
```

The game is served from `index.html` at <http://localhost:3000>.

## Shape of the code

The game began as a single-file Claude artifact and has been pulled apart a seam at a time. The
styles, the data tables and the game itself now live under `src/`, and `index.html` is markup only.
One global `S` object holds all state, one `render()` redraws everything, and actions mutate `S`
then call `render()`. There is no framework and no virtual DOM.

| Where            | What                                                       |
| ---------------- | ---------------------------------------------------------- |
| `src/styles/`    | every stylesheet, imported in cascade order by `index.css` |
| `src/game/`      | the game, one module per concern                           |
| `src/game/data/` | the static tables, re-exported by `index.ts`               |
| `src/ui/`        | the screens that have migrated into React                  |
| `src/net/`       | what a client and a match server say to each other         |
| `worker/`        | the match server: one Durable Object per online match      |
| `index.html`     | the static markup                                          |

The modules stack one way. `types.ts` and `state.ts` at the bottom, then `lookups.ts`, `save.ts`
and `settings.ts`, then the rules -- `movement.ts`, `cards.ts`, `combat.ts`, `match.ts` -- and above
them the screens: `menu.ts`, `render.ts`, `input.ts`, `board.ts`. `game.ts` is what the page loads:
it wires the two halves together and re-exports what the tests drive the game through.

The rules never import a screen. They ask for drawing through `view.ts`, which `game.ts` fills in
once every module has loaded; without that seam every rules module would import the renderer and
the renderer would import them all straight back. The four rules modules do call each other, which
is a real cycle and one `just fallow` reports as a warning.

The game came over from that inline script whole, so it is still written the way the script was,
and `vite.config.ts` relaxes a handful of lint rules for `src/game/*.ts`. Everything written fresh
alongside it -- `src/game/bridge.ts` and the data tables -- stays under the full rules.

Content is the data tables. Almost every feature is driven off flags in these, so new content is
usually a table entry rather than new logic.

| Table  | What it is                                              | Size | File                        |
| ------ | ------------------------------------------------------- | ---- | --------------------------- |
| `EL`   | base elements, each with a terrain key and a shop price | 13   | `src/game/data/elements.ts` |
| `T`    | every terrain, base and fused, with behaviour flags     | 105  | `src/game/data/terrain.ts`  |
| `FUSE` | which pair of elements makes which terrain              | 91   | `src/game/data/fusion.ts`   |
| `W`    | weapons: damage, energy, attack pattern, price          | 15   | `src/game/data/weapons.ts`  |
| `MV`   | footwork, each with a unique power-of-two `bit`         | 16   | `src/game/data/footwork.ts` |

`FORGE` holds the forge rider for each base element and `CFORGE` the one derived for each fusion,
both in `src/game/data/forge.ts`; read them through `forgeOf()` rather than indexing either
directly.

Terrain flags are the vocabulary: `end` (damage for ending your turn there), `bite` (damage for
entering), `aura`/`rad` (damage at a distance), `heal`, `gain`, `los` (blinds the occupant),
`hide` (conceals the occupant), `reveal` (defeats nearby `hide`), `anchor`, `ward`, `root`,
`gone` (lethal), `solid`, `flow`, `spread`, `melts`, `dead`.

Attack shapes live in `PAT` in `src/game/data/patterns.ts`, a map of pattern name to offset list.
Adding a weapon shape means adding one entry there. `'any'` is special-cased in `attackTiles` to
mean the whole board.

Persistence goes through `window.storage` under key `arena:v3`: coins, unlocked items,
discovered fusions, loadout preferences, theme, cheat attempts. Match state is never persisted.
`window.storage` was supplied by the Claude artifact host; `public/storage-shim.js` reimplements
it on `localStorage` so the page runs in a plain browser.

`src/main.tsx` mounts the React tree on `#app`, and the handoff curtain is the first screen to
have moved across. A screen migrates by dropping its markup from `index.html` and gaining a store
in `src/game/bridge.ts`, which `src/game/render.ts` publishes to, plus a component in `src/ui/` that
subscribes. Each component splits into a view taking plain props and a container reading the
store, so stories and tests can pose it without a match running. Run `just storybook` to see them.

## Things that will bite you

**Declaration order matters.** `const S = {...}` reads other consts at load time. Anything it
references must be declared above it or you get a temporal dead zone error that still parses fine.

**Two tables both key on element ids.** `FORGE` holds base elements, `CFORGE` holds fused ones.
Always go through `forgeOf()`, `elName()`, `elColor()`, `isComp()`. Reaching into `FORGE[k]`
directly breaks the moment someone forges a fused card.

**Terrain remembers two things.** `c.t` is what it looks like, `c.el` is which element card made
it, and fusion works off `c.el`. Any code that writes terrain must go through `putTerrain()` or it
silently forgets and stops fusing.

**`hidden()` and `seesTile()` are the privacy layer.** Concealed fighters do not block movement,
cannot be targeted, and their ground reads as bare to everyone else. Any new UI that reads player
positions should ask these first.

**Footwork bits must stay unique.** Next free bit is 65536.

**The match log narrates concealed moves.** `logit` writes "moved from 4,4 to 5,4" whoever is
moving, so the log is a leak with a plot. Hot-seat gets away with it because the log is only shown
once the match is over. Nothing that goes over a socket mid-match may carry it -- see
`src/game/seat.ts`.

**Anything worth logging goes through `logit()`,** which also snapshots a full replay frame.
Skip it and the event is missing from both the match log and the replay.

## Online play

Playable. One Durable Object per match, WebSockets, server-authoritative: a client sends the move
it would like to make and is sent back only the arena its own seat is allowed to see.

Host a match from the setup screen and you get one link to send round. It names the match and no
seat of it: whoever follows it is dealt the next free seat by the room, which is then written into
their address bar -- deliberately there rather than in storage, because two tabs of one browser
share local storage and would otherwise fight over a single seat. So two plain tabs can play each
other with no incognito window involved, and a reload sits back down rather than asking for another
seat.

**An online match takes three elements, three weapons and three pieces of footwork, and no more.**
Hot-seat deals from whatever the save has bought, because one save is playing itself. Online there
are two arsenals and only one of them can be the one a match is dealt from, so it is the host's --
the cards the This match panel has switched on for everybody -- and the cap is what keeps that fair
on the other end. Three of each is the game as it comes out of the box, so a save that has bought
nothing can already host. A treasury that has outgrown the cap is told which row to cut rather than
having three of its cards picked for it: `LOADOUT_MAX` in `src/game/intent.ts` is the number, the
online panel spends its own Host button until the rows fit, and `parseSetup` in
`src/net/protocol.ts` refuses an over-cap loadout at the room, because the panel is not the only
thing that can post to `/open`. Everybody at the table is dealt the same list, host included, and
anything switched off for one seat alone stays on the device that switched it off.

```sh
just multiplayer         # the site and the match server on miniflare, no Cloudflare account involved
just multiplayer-check   # opens a match on it and proves the two seats are told different things
just online-check        # plays a two-tab match in a real browser against that server
```

`src/net/client.ts` is the whole of the client half: it holds the socket, sends intents, and
publishes the seat views it is sent. It applies nothing itself, so a move the room turns down leaves
the screen exactly where it was. `src/game/online.ts` draws that seat view through the same
`src/game/render.ts` hot-seat uses, which is why a leak would show up in the mode sitting on the
desk rather than only over a socket.

The match log is the one thing the room holds back for the whole match and then sends whole:
`logit()` narrates concealed moves by name and square, so it only goes over once the match is
decided, and the online game-over screen is written from it. The replay cannot wait for that, so
each client keeps its own out of the arenas it was sent (`src/game/record.ts`) -- a replay of what
that seat could actually see while it was deciding.

`src/game/seat.ts` is the boundary that matters. It builds everything one seat may be told, asking
the same `hidden()`/`seesTile()`/`blind()` the match screen asks, and it is the only thing the room
is allowed to send. `src/game/snapshot.ts` lifts a match in and out of `S` around every message,
because a Durable Object isolate may hold more than one match and `S` is one object.

The site and the match server are one Worker, configured by `wrangler.toml`: the built assets are
bound to it, and `/api/*` is routed to the match server ahead of them. A Cloudflare Pages project
cannot define a Durable Object class, which is why this is not a Pages project any more. The
reasoning and the open questions are in `.llm/plans/2026-08-05-online-multiplayer.md` and
`.llm/plans/2026-08-12-online-multiplayer-finish.md`.

Pull requests get the whole thing at `https://elemental-arena-pr-<number>.cmotlin.workers.dev`,
published by `.github/workflows/preview.yml` and deleted again on close.

Each one is a Worker of its own rather than a preview alias on this one, because [Cloudflare does
not generate preview URLs for a Worker that implements a Durable
Object](https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/#limitations)
and the match server is one. A Worker of its own also gets a Durable Object namespace of its own,
so a match opened on one pull request cannot be joined from another.

## Tasks

Open work is tracked in `.llm/todo.md`.
