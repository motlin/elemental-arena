/** The thirteen base elements every card and forged weapon is built from. */
export interface ElementDef {
	/** Display name. */
	n: string;
	/** Card colour. */
	c: string;
	/** Key into the terrain table for the ground this element lays. */
	t: string;
	/** Shop price, absent for the three starters. */
	cost?: number;
	/** Shop blurb, absent for the three starters. */
	blurb?: string;
}

export const EL: Record<string, ElementDef> = {
	fire: {n: "Fire", c: "#ff5a1e", t: "lava"},
	water: {n: "Water", c: "#2f9dff", t: "ocean"},
	earth: {n: "Earth", c: "#9c7a4d", t: "stone"},
	air: {
		n: "Air",
		c: "#9ef0dc",
		t: "gale",
		cost: 100,
		blurb: "Whirlpools, dust, and the fastest ground in the arena.",
	},
	bolt: {
		n: "Lightning",
		c: "#ffd24a",
		t: "charge",
		cost: 200,
		blurb: "Hardest hitting forge element. Makes surge and magnetite.",
	},
	space: {
		n: "Space",
		c: "#c9a6ff",
		t: "space",
		cost: 500,
		blurb: "Ground that erases whoever touches it. Doubles a weapon in the forge.",
	},
	poison: {
		n: "Poison",
		c: "#7ed321",
		t: "venom",
		cost: 800,
		blurb: "Hurts to cross and to linger in. In the forge it doubles a weapon and adds 6 on top.",
	},
	life: {
		n: "Life",
		c: "#f2f6ff",
		t: "grove",
		cost: 450,
		blurb: "The only ground that heals. In the forge it drinks back half of what you deal.",
	},
	iron: {
		n: "Iron",
		c: "#9aa7b8",
		t: "ironground",
		cost: 250,
		blurb: "Ground nobody can shove you off. In the forge it drags your target toward you.",
	},
	light: {
		n: "Light",
		c: "#fff3b0",
		t: "light",
		cost: 600,
		blurb: "Ground that shines. Nobody within two squares of it can stay concealed.",
	},
	frost: {
		n: "Frost",
		c: "#8fd8f0",
		t: "frost",
		cost: 550,
		blurb: "Ground that freezes anyone who steps in. In the forge it stops the target moving next turn.",
	},
	shadow: {
		n: "Shadow",
		c: "#6b5f8f",
		t: "shadow",
		cost: 700,
		blurb: "Ground that hides whoever stands on it. In the forge it leaves the target blind next turn.",
	},
	echo: {
		n: "Echo",
		c: "#d98fe0",
		t: "resonance",
		cost: 600,
		blurb: "The only ground that reaches past its own tile. In the forge the weapon strikes an extra time.",
	},
};

/** The elements a new save starts with. */
export const BASE = ["fire", "water", "earth"];
