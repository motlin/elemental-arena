/** One piece of footwork a fighter can buy. */
export interface MoveDef {
	/** Display name. */
	n: string;
	/** Ownership bit. Every bit must stay a distinct power of two; the next free one is 65536. */
	bit: number;
	/** Shop price. */
	price: number;
	/** One-line description. */
	d: string;
}

export const MV: Record<string, MoveDef> = {
	jump: {
		n: "Jump",
		bit: 1,
		price: 150,
		d: "Land exactly two squares away, sailing over whatever sits between.",
	},
	dash: {
		n: "Dash",
		bit: 2,
		price: 150,
		d: "Two or three squares in a straight line through open ground.",
	},
	leap: {
		n: "Leap",
		bit: 4,
		price: 300,
		d: "Land exactly four squares away, sailing over whatever sits between.",
	},
	float: {n: "Float", bit: 8, price: 450, d: "Ignore the ground entirely until your turn ends."},
	spin: {n: "Spin", bit: 16, price: 250, d: "Sweep every square around you clean of whatever is on it."},
	wipe: {
		n: "Wipe",
		bit: 32,
		price: 500,
		d: "Strip the ground bare out to three squares in every direction.",
	},
	warp: {
		n: "Warp",
		bit: 64,
		price: 600,
		d: "Vanish and reappear on any bare, empty square anywhere on the board.",
	},
	trail: {
		n: "Trail",
		bit: 512,
		price: 800,
		d: "Whatever you are standing on gets left behind on every square you walk off for the rest of the turn.",
	},
	ultra: {
		n: "Ultraclear",
		bit: 128,
		price: 900,
		d: "Strip the entire arena back to bare ground. Even broken squares come back.",
	},
	spread: {
		n: "Spread",
		bit: 256,
		price: 700,
		d: "Pick a square with something on it and grow it into a 5x5 of the same.",
	},
	shift: {
		n: "Shift",
		bit: 1024,
		price: 550,
		d: "Pick a direction and every fighter slides that way until something stops them, keeping their order.",
	},
	light: {
		n: "Spotlight",
		bit: 32768,
		price: 500,
		d: "Fix a glare on one fighter for the rest of the match. They can never conceal themselves again.",
	},
	mark: {
		n: "Mark",
		bit: 16384,
		price: 350,
		d: "Look at one card in another fighter's hand. Whatever you see stays visible to you for the rest of the match.",
	},
	swap: {n: "Swap", bit: 8192, price: 400, d: "Trade places with any other fighter on the board."},
	theft: {n: "Theft", bit: 4096, price: 650, d: "Take one card at random from another fighter's hand."},
	smash: {
		n: "Handsmash",
		bit: 2048,
		price: 500,
		d: "Crush every card in your hand into a single weapon that carries all of them at once.",
	},
};
