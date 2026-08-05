/*
 * The game was authored as a Claude artifact, where `window.storage` is provided by the host.
 * This reimplements that API on top of localStorage so the page runs in a plain browser.
 * Must stay a classic script in <head>: the game's inline script calls load() during parse.
 */
(function () {
	if (window.storage) return;

	function read(key) {
		var value = localStorage.getItem(key);
		return value === null ? null : {key: key, value: value};
	}

	window.storage = {
		get: function (key) {
			return Promise.resolve(read(key));
		},
		set: function (key, value) {
			localStorage.setItem(key, value);
			return Promise.resolve();
		},
		delete: function (key) {
			localStorage.removeItem(key);
			return Promise.resolve();
		},
	};
})();
