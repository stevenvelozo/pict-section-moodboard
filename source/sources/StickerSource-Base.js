'use strict';

/**
 * MoodboardStickerSource: the sticker gallery's pluggable backend.
 *
 * Stickers are media just like gallery images (a Url, a Name, a Metadata bag), so this reuses the
 * ImageSource base wholesale (getFields / list / add / upload / getFilterOptions) and only changes
 * what a sticker source seeds: a small built-in set of cutout shapes, so the sticker gallery is
 * useful the moment a board mounts with no host source.
 *
 * An embedding application replaces it (options.StickerSource) with one that serves its own sticker
 * library (for plansheet, the Sticker entity blobs) and can merge those on top of, or instead of,
 * these built-ins. A host source only has to implement getFields(), list(query, callback), and
 * (optionally) add() and upload() -- the same contract as ImageSource.
 *
 * @author Steven Velozo <steven@velozo.com>
 * @license MIT
 */

const libImageSource = require('./ImageSource-Base.js');

// Inline SVG cutouts as data URLs, so the module ships a usable starter set with no network or asset
// files. encodeURIComponent keeps the markup safe inside a data URI (handles #, spaces, quotes).
function _svgDataUrl(pSvg)
{
	return 'data:image/svg+xml,' + encodeURIComponent(pSvg);
}

const _BUILTIN_STICKERS =
[
	{
		Id: 'sticker-star', Name: 'Star',
		Url: _svgDataUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#f5b301"><path d="M12 2l2.9 6.1 6.7.7-5 4.5 1.4 6.6L12 17.9 6 20.4l1.4-6.6-5-4.5 6.7-.7z"/></svg>'),
		Metadata: { Type: 'sticker' }
	},
	{
		Id: 'sticker-heart', Name: 'Heart',
		Url: _svgDataUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#e84d6a"><path d="M12 21s-7.5-4.9-10-9.3C.4 8.8 1.8 5 5.2 5c2.1 0 3.4 1.3 4.3 2.6h0C10.4 6.3 11.7 5 13.8 5c3.4 0 4.8 3.8 3.2 6.7C19.5 16.1 12 21 12 21z"/></svg>'),
		Metadata: { Type: 'sticker' }
	},
	{
		Id: 'sticker-sparkle', Name: 'Sparkle',
		Url: _svgDataUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#8e5cff"><path d="M12 2c.6 4.3 3.7 7.4 8 8-4.3.6-7.4 3.7-8 8-.6-4.3-3.7-7.4-8-8 4.3-.6 7.4-3.7 8-8z"/></svg>'),
		Metadata: { Type: 'sticker' }
	},
	{
		Id: 'sticker-arrow', Name: 'Arrow',
		Url: _svgDataUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#2c3340"><path d="M4 11h11.2l-4.6-4.6L12 5l7 7-7 7-1.4-1.4 4.6-4.6H4z"/></svg>'),
		Metadata: { Type: 'sticker' }
	},
	{
		Id: 'sticker-check', Name: 'Check',
		Url: _svgDataUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#2e9e5b"><circle cx="12" cy="12" r="10"/><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'),
		Metadata: { Type: 'sticker' }
	},
	{
		Id: 'sticker-bubble', Name: 'Speech bubble',
		Url: _svgDataUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#2880a6"><path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>'),
		Metadata: { Type: 'sticker' }
	}
];

class MoodboardStickerSource extends libImageSource
{
	constructor(pOptions)
	{
		let tmpOptions = pOptions || {};
		// Seed the built-in stickers unless the host supplies its own Items.
		if (!Array.isArray(tmpOptions.Items))
		{
			tmpOptions = Object.assign({}, tmpOptions, { Items: _BUILTIN_STICKERS });
		}
		super(tmpOptions);
	}
}

module.exports = MoodboardStickerSource;
module.exports.BUILTIN_STICKERS = _BUILTIN_STICKERS;
