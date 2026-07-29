'use strict';

// `brace-expansion` <= 5.0.7 is vulnerable to GHSA-mh99-v99m-4gvg (unbounded expansion length -> OOM).
// The fix ships only on the 5.x line; the 1.x line that `minimatch@3` depends on has no patched release.
//
// The two lines differ only in module shape: 1.x exports the function itself (`module.exports = expand`),
// while 5.x exports a namespace (`exports.expand = expand`). The expansion behavior is identical, so this
// wrapper re-exports the patched 5.x implementation in the legacy callable shape.
//
// Wired in via the `brace-expansion` `overrides` entry in the repo's package.json. The patched
// implementation is installed under the `brace-expansion-upstream` alias, because the override points the
// real name at this wrapper.

const upstream = require('brace-expansion-upstream');

module.exports = upstream.expand;
module.exports.expand = upstream.expand;
module.exports.EXPANSION_MAX = upstream.EXPANSION_MAX;
module.exports.EXPANSION_MAX_LENGTH = upstream.EXPANSION_MAX_LENGTH;
