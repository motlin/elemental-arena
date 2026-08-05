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

The game began as a single-file Claude artifact and still lives that way: `index.html` holds
roughly 410 lines of CSS and 2,700 lines of vanilla JavaScript in one inline `<script>`.
One global `S` object holds all state, one `render()` redraws everything, and actions mutate
`S` then call `render()`. There is no framework and no virtual DOM.

Content is five data tables near the top of the script. Almost every feature is driven off
flags in these, so new content is usually a table entry rather than new logic.

| Table  | What it is                                              | Size |
| ------ | ------------------------------------------------------- | ---- |
| `EL`   | base elements, each with a terrain key and a shop price | 13   |
| `T`    | every terrain, base and fused, with behaviour flags     | 105  |
| `FUSE` | which pair of elements makes which terrain              | 91   |
| `W`    | weapons: damage, energy, attack pattern, price          | 15   |
| `MV`   | footwork, each with a unique power-of-two `bit`         | 16   |

Terrain flags are the vocabulary: `end` (damage for ending your turn there), `bite` (damage for
entering), `aura`/`rad` (damage at a distance), `heal`, `gain`, `los` (blinds the occupant),
`hide` (conceals the occupant), `reveal` (defeats nearby `hide`), `anchor`, `ward`, `root`,
`gone` (lethal), `solid`, `flow`, `spread`, `melts`, `dead`.

Attack shapes live in `PAT`, a map of pattern name to offset list. Adding a weapon shape means
adding one entry there. `'any'` is special-cased in `attackTiles` to mean the whole board.

Persistence goes through `window.storage` under key `arena:v3`: coins, unlocked items,
discovered fusions, loadout preferences, theme, cheat attempts. Match state is never persisted.
`window.storage` was supplied by the Claude artifact host; `public/storage-shim.js` reimplements
it on `localStorage` so the page runs in a plain browser.

`src/` holds the React and TypeScript scaffolding the game is migrating into. `src/main.tsx`
mounts an empty root on `#app`; nothing has moved across yet.

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

**Anything worth logging goes through `logit()`,** which also snapshots a full replay frame.
Skip it and the event is missing from both the match log and the replay.

## Tasks

Open work is tracked in `.llm/todo.md`.
