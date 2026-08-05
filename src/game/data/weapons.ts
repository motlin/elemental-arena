/** One weapon a card can carry. Several cards fuse into one swing; see `wCost` and friends. */
export interface WeaponDef {
	/** Display name. */
	n: string;
	/** Card colour. */
	c: string;
	/** Energy the swing costs. */
	cost: number;
	/** Base damage per hit. */
	dmg: number;
	/** Hits per swing. */
	hits: number;
	/** Key into `PAT` for the tiles it reaches. */
	pat: string;
	/** One-line description. */
	d: string;
	/** Set when the weapon strikes every reached tile at once. */
	sweep?: number;
	/** Shop price, absent for the three starters. */
	price?: number;
}

/** The weapons a new save starts with. */
export const WBASE = ["dagger", "sword", "crossbow"];

export const W: Record<string, WeaponDef> = {
	dagger: {
		n: "Dagger",
		c: "#9fb4cc",
		cost: 2,
		dmg: 5,
		hits: 2,
		pat: "adj",
		d: "Any tile touching you. Strikes twice.",
	},
	sword: {
		n: "Sword",
		c: "#e6ebf5",
		cost: 2,
		dmg: 10,
		hits: 1,
		pat: "line2",
		d: "One or two tiles away, straight lines only.",
	},
	crossbow: {
		n: "Crossbow",
		c: "#d1544a",
		cost: 2,
		dmg: 12,
		hits: 1,
		pat: "ray2",
		d: "Exactly two tiles out, any straight line. Blind up close.",
	},
	hammer: {
		n: "Hammer",
		c: "#8d8798",
		cost: 3,
		dmg: 7,
		hits: 1,
		pat: "ring",
		sweep: 1,
		price: 150,
		d: "Every tile around you at once.",
	},
	warpick: {
		n: "Warpick",
		c: "#5b6f9e",
		cost: 2,
		dmg: 12,
		hits: 1,
		pat: "diag2",
		price: 120,
		d: "Diagonals only, one or two tiles out.",
	},
	spear: {
		n: "Spear",
		c: "#cf7fd1",
		cost: 3,
		dmg: 11,
		hits: 1,
		pat: "line3",
		price: 180,
		d: "Straight lines, up to three tiles away.",
	},
	sling: {
		n: "Sling",
		c: "#6b8f7a",
		cost: 2,
		dmg: 8,
		hits: 1,
		pat: "ring3",
		price: 200,
		d: "Anything at exactly three tiles, in any direction.",
	},
	javelin: {
		n: "Javelin",
		c: "#5fc9b0",
		cost: 3,
		dmg: 13,
		hits: 1,
		pat: "ray4",
		price: 300,
		d: "Any straight line, one to four tiles out.",
	},
	whip: {
		n: "Whip",
		c: "#d98f5a",
		cost: 3,
		dmg: 8,
		hits: 1,
		pat: "cross",
		price: 450,
		d: "Lashes the whole row and column you stand in, edge to edge.",
	},
	longbow: {
		n: "Longbow",
		c: "#63d19e",
		cost: 3,
		dmg: 15,
		hits: 1,
		pat: "ray63",
		price: 400,
		d: "Any straight line from three to six tiles out. Useless up close.",
	},
	wand: {
		n: "Magic Wand",
		c: "#b98cff",
		cost: 5,
		dmg: 25,
		hits: 1,
		pat: "wand",
		price: 700,
		d: "Every diagonal line to the wall, plus the eight squares a chess knight would reach.",
	},
	gun: {
		n: "Gun",
		c: "#f0c04a",
		cost: 5,
		dmg: 20,
		hits: 1,
		pat: "queen",
		price: 500,
		d: "Fires down any straight or diagonal line, all the way to the wall.",
	},
	cannon: {
		n: "Cannon",
		c: "#e8552a",
		cost: 5,
		dmg: 18,
		hits: 1,
		pat: "any",
		price: 900,
		d: "Fires at any single square on the board, however far.",
	},
	flail: {
		n: "Flail",
		c: "#a0704f",
		cost: 4,
		dmg: 6,
		hits: 1,
		pat: "flail",
		price: 600,
		sweep: 1,
		d: "Whirls through everything within two squares at once.",
	},
	scythe: {
		n: "Scythe",
		c: "#e0538f",
		cost: 3,
		dmg: 9,
		hits: 1,
		pat: "sweep2",
		price: 350,
		sweep: 1,
		d: "Sweeps everything at exactly two tiles, all at once.",
	},
};
