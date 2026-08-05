/** A step away from a tile, as `[dx, dy]`. */
export type Offset = [number, number];

const DIR4: Offset[] = [
	[1, 0],
	[-1, 0],
	[0, 1],
	[0, -1],
];

const DIAG: Offset[] = [
	[1, 1],
	[1, -1],
	[-1, 1],
	[-1, -1],
];

export const DIR8: Offset[] = [...DIR4, ...DIAG];

/** Every offset exactly `d` king-moves away, i.e. the hollow square at that radius. */
const shell = (d: number): Offset[] => {
	const o: Offset[] = [];
	for (let y = -d; y <= d; y++)
		for (let x = -d; x <= d; x++) if (Math.max(Math.abs(x), Math.abs(y)) === d) o.push([x, y]);
	return o;
};

/** Straight lines out from the centre along each direction, from `min` steps out to `max`. */
const rays = (dirs: readonly Offset[], max: number, min = 1): Offset[] =>
	dirs.flatMap(([x, y]) => {
		const o: Offset[] = [];
		for (let r = min; r <= max; r++) o.push([x * r, y * r]);
		return o;
	});

const KNIGHT: Offset[] = [
	[1, 2],
	[2, 1],
	[-1, 2],
	[-2, 1],
	[1, -2],
	[2, -1],
	[-1, -2],
	[-2, -1],
];

/** The shape each weapon reaches over, named by the `pat` field in ./weapons.ts. */
export const PAT: Record<string, () => Offset[]> = {
	adj: () => shell(1),
	ring: () => shell(1),
	line2: () => rays(DIR4, 2),
	line3: () => rays(DIR4, 3),
	ray2: () => rays(DIR8, 2, 2),
	ray4: () => rays(DIR8, 4),
	diag2: () => rays(DIAG, 2),
	ring3: () => shell(3),
	sweep2: () => shell(2),
	cross: () => rays(DIR4, 25),
	flail: () => shell(1).concat(shell(2)),
	any: () => [],
	queen: () => rays(DIR8, 25),
	knight: () => [...KNIGHT],
	wand: () => rays(DIAG, 25).concat(KNIGHT),
	ray63: () => rays(DIR8, 6, 3),
};
