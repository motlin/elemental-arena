import {describe, it, expect} from "vitest";
import {CFORGE, EL, W} from "../../src/game/data/index.js";
import {forgeOf, wepDmg} from "../../src/game/lookups.js";

const weaponKeys = Object.keys(W);
const otherElements = Object.keys(EL).filter((e) => e !== "poison");

function dmgOf(ids: string[], els: string[] = []): number {
	return wepDmg({ids, els});
}

/**
 * Poison is the priciest element, so it has to beat every flat forge bonus. It also has to stay on
 * a linear leash: a curve that grows faster than the weapon it sits on eventually swamps the rest
 * of the forge, which is exactly what the old "halve it, then square it" rule did.
 */
describe("poison in the forge", () => {
	it("pays off on every weapon in the table", () => {
		const dead = weaponKeys.filter((w) => dmgOf([w], ["poison"]) <= dmgOf([w]));

		expect(dead).toStrictEqual([]);
	});

	it("beats every other single element on every weapon", () => {
		const beaten = weaponKeys.filter((w) => otherElements.some((e) => dmgOf([w], [e]) >= dmgOf([w], ["poison"])));

		expect(beaten).toStrictEqual([]);
	});

	it("never runs more than half again past the best any other element manages", () => {
		const runaway = weaponKeys.filter(
			(w) => dmgOf([w], ["poison"]) > 1.5 * Math.max(...otherElements.map((e) => dmgOf([w], [e]))),
		);

		expect(runaway).toStrictEqual([]);
	});

	it("does not compound: twice the weapon strength is at most twice the poison damage", () => {
		const compounding = weaponKeys.filter((w) => dmgOf([w, w], ["poison"]) > 2 * dmgOf([w], ["poison"]));

		expect(compounding).toStrictEqual([]);
	});

	it("keeps stacked poison linear too: four doses are at most four times one", () => {
		const stacked = weaponKeys.filter(
			(w) => dmgOf([w], ["poison", "poison", "poison", "poison"]) > 4 * dmgOf([w], ["poison"]),
		);

		expect(stacked).toStrictEqual([]);
	});

	it("runs fused poison down the same linear path", () => {
		// plague is poison mixed with itself, the one element that carries two doses on its own
		const compounding = weaponKeys.filter((w) => dmgOf([w, w], ["plague"]) > 2 * dmgOf([w], ["plague"]));

		expect(CFORGE["plague"]?.pow).toBe(2);
		expect(compounding).toStrictEqual([]);
	});

	it("says in both blurbs what the formula actually does", () => {
		const texts = [forgeOf("poison").fx, EL["poison"]?.blurb];

		expect(texts).toStrictEqual([
			"doubles the weapon strength and adds 6 on top",
			"Hurts to cross and to linger in. In the forge it doubles a weapon and adds 6 on top.",
		]);
	});
});
