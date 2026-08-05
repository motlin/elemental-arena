/**
 * Everything the game script imports from `/src/game/data/index.ts`, plus the table shapes the tests
 * share. The rules and the rendering live in index.html for now.
 */
export {EL, BASE, type ElementDef} from "./elements.js";
export {T, type TerrainDef} from "./terrain.js";
export {FUSE, fkey} from "./fusion.js";
export {DIR8, PAT, type Offset} from "./patterns.js";
export {W, WBASE, type WeaponDef} from "./weapons.js";
export {COST} from "./costs.js";
export {MV, type MoveDef} from "./footwork.js";
export {FORGE, CFORGE, ELBYT, boon, type ForgeDef} from "./forge.js";
