/**
 * Everything the game imports from `/src/game/data/index.ts`, plus the table shapes the tests share.
 * The rules and the rendering that read them live in the modules alongside this folder.
 */
export {EL, BASE} from "./elements.js";
export {T, type TerrainDef} from "./terrain.js";
export {FUSE, fkey} from "./fusion.js";
export {DIR8, PAT, type Offset} from "./patterns.js";
export {W, WBASE, type WeaponDef} from "./weapons.js";
export {COST, type ActionKey} from "./costs.js";
export {MV} from "./footwork.js";
export {FORGE, CFORGE, ELBYT, boon, type ForgeDef} from "./forge.js";
