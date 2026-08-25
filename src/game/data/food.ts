/** What can be eaten: one plate each, a shot of energy for the turn it is eaten on and nothing after. */
export interface FoodDef {
	n: string;
	c: string;
	d: string;
	/** Energy a fresh plate gives. */
	nrg: number;
	/** Rounds it stays fresh from the round it was dealt. */
	keep: number;
	/** Life eating it costs once it has spoiled. */
	rot: number;
}

export const FOOD: Record<string, FoodDef> = {
	apple: {n: "Apple", c: "#e84a5f", d: "Crisp, and gone quickly.", nrg: 2, keep: 3, rot: 2},
	bread: {n: "Bread", c: "#d9a45b", d: "Filling.", nrg: 3, keep: 4, rot: 3},
	jerky: {n: "Jerky", c: "#a0522d", d: "Keeps a long while.", nrg: 4, keep: 6, rot: 4},
};

/** A plate is dealt on every round this divides. */
export const FOOD_EVERY = 3;
