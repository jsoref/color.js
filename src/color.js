import * as util from "./util.js";
import hooks from "./hooks.js";
import defaults from "./defaults.js";
import ColorSpace from "./space.js";
import {WHITES} from "./adapt.js";
import {
	getColor,
	parse,
	to,
	serialize,
	inGamut,
	toGamut,
	distance,
	equals,
	get,
	getAll,
	set,
	setAll,
} from "./index-fn.js";

import xyz_d65 from "./spaces/xyz-d65.js";
import "./spaces/xyz-d50.js";
import "./spaces/srgb.js";

/**
 * Class that represents a color
 */
export default class Color {
	/**
	 * Creates an instance of Color.
	 * Signatures:
	 * - `new Color(stringToParse)`
	 * - `new Color(otherColor)`
	 * - `new Color({space, coords, alpha})`
	 * - `new Color(space, coords, alpha)`
	 * - `new Color(spaceId, coords, alpha)`
	 */
	constructor (...args) {
		let color;

		if (args.length === 1) {
			color = getColor(args[0]);
		}

		let space, coords, alpha;

		if (color) {
			space = color.space || color.spaceId;
			coords = color.coords;
			alpha = color.alpha;
		}
		else {
			// default signature new Color(ColorSpace, array [, alpha])
			[space, coords, alpha] = args;
		}

		this.#space = ColorSpace.get(space);
		this.coords = coords? coords.slice() : [0, 0, 0];
		this.alpha = alpha < 1? alpha : 1; // this also deals with NaN etc

		// Convert "NaN" to NaN
		for (let i = 0; i < this.coords.length; i++) {
			if (this.coords[i] === "NaN") {
				this.coords[i] = NaN;
			}
		}

		// Define getters and setters for each coordinate
		for (let id in this.#space.coords) {
			Object.defineProperty(this, id, {
				get: () => this.get(id),
				set: value => this.set(id, value)
			});
		}
	}

	#space

	get space() {
		return this.#space;
	}

	get spaceId() {
		return this.#space.id;
	}

	clone () {
		return new Color(this.space, this.coords, this.alpha);
	}

	toJSON () {
		return {
			spaceId: this.spaceId,
			coords: this.coords,
			alpha: this.alpha
		};
	}

	toString (...args) {
		let ret = serialize(this, ...args);

		if (ret.color) {
			// Convert color object to Color instance
			ret.color = new Color(ret.color);
		}

		return ret;
	}

	/**
	 * Get a color from the argument passed
	 * Basically gets us the same result as new Color(color) but doesn't clone an existing color object
	 */
	static get (color, ...args) {
		if (color instanceof Color) {
			return color;
		}

		return new Color(color, ...args);
	}

	static defineFunction (name, code, {instance = true, returns} = {}) {
		let func = function (...args) {
			let ret = code(...args);

			if (returns === "color") {
				ret = Color.get(ret);
			}
			else if (returns === "function<color>") {
				let f = ret;
				ret = function(...args) {
					let ret = f(...args);
					return Color.get(ret);
				}
				// Copy any function metadata
				Object.assign(ret, f);
			}
			else if (returns === "array<color>") {
				ret = ret.map(c => Color.get(c));
			}

			return ret;
		}

		if (!(name in Color)) {
			Color[name] = func;
		}

		if (instance) {
			Color.prototype[name] = function (...args) {
				return func(this, ...args);
			}
		}
	}

	static defineFunctions(o) {
		for (let name in o) {
			Color.defineFunction(name, o[name], o[name]);
		}
	}

	static extend (exports) {
		if (exports.register) {
			exports.register(Color);
		}
		else {
			// No register method, just add the module's functions
			for (let name in exports) {
				Color.defineFunction(name, exports[name], exports[name]);
			}
		}
	}
};

Color.defineFunctions({
	get,
	getAll,
	set,
	setAll,
	to,
	equals,
	inGamut,
	toGamut,
	distance,
});

Object.assign(Color, {
	util,
	hooks,
	WHITES,
	Space: ColorSpace,
	spaces: ColorSpace.registry,
	parse,

	// Global defaults one may want to configure
	defaults
});

if (typeof CSS !== "undefined" && CSS.supports) {
	// Find widest supported color space for CSS
	for (let spaceId of ["lab", "rec2020", "p3", "srgb"]) {
		if (spaceId in ColorSpace.registry) {
			let coords = ColorSpace.registry[spaceId].getMinCoords();
			let color = new Color(spaceId, coords);

			if (CSS.supports("color", color)) {
				defaults.css_space = spaceId;
				break;
			}
		}
	}
}
