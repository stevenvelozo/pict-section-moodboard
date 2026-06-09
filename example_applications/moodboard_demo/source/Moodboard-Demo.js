'use strict';

/**
 * Minimal demo application for pict-section-moodboard: boot a Pict app, add the Moodboard view,
 * render it full-screen, and seed a couple of cards so the canvas is not empty on first load.
 */

const libPictApplication = require('pict-application');
const libMoodboard = require('../../../source/Pict-Section-Moodboard.js');
const libMoodboardImageSource = libMoodboard.ImageSource;

// The built-in sticker set ships with the module; the demo seeds a couple to show them off.
const _BUILTIN_STICKERS = libMoodboard.StickerSource.BUILTIN_STICKERS;
function stickerUrl(pId) { let tmpHit = _BUILTIN_STICKERS.find(function (pSticker) { return pSticker.Id === pId; }); return tmpHit ? tmpHit.Url : ''; }

// An inline gradient swatch, so the demo needs no network for its sample images.
function makeSwatch(pColorA, pColorB, pAccent)
{
	return 'data:image/svg+xml;utf8,' + encodeURIComponent(
		'<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180">'
		+ '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
		+ '<stop offset="0" stop-color="' + pColorA + '"/><stop offset="1" stop-color="' + pColorB + '"/></linearGradient></defs>'
		+ '<rect width="240" height="180" fill="url(#g)"/>'
		+ '<circle cx="180" cy="58" r="34" fill="' + pAccent + '"/></svg>');
}

const _SAMPLE_IMAGE = makeSwatch('#2880a6', '#d98b58', 'rgba(255,255,255,0.45)');

// A pre-populated image source standing in for a host library. It declares a custom 'Palette' field,
// so the gallery builds a Palette filter (warm / cool / neutral) on top of search and sort. This is
// the "applications can go haywire providing image sources" path: arbitrary metadata, driven by the
// source rather than hardcoded in the moodboard.
const _SAMPLES =
[
	['Sunset',     'warm',    '#e85d04', '#ffba08', 'rgba(255,255,255,0.5)'],
	['Terracotta', 'warm',    '#bc6c25', '#dda15e', 'rgba(255,255,255,0.45)'],
	['Coral',      'warm',    '#ff5d8f', '#ffc09f', 'rgba(255,255,255,0.5)'],
	['Ocean',      'cool',    '#0077b6', '#48cae4', 'rgba(255,255,255,0.5)'],
	['Twilight',   'cool',    '#3a0ca3', '#4361ee', 'rgba(255,255,255,0.45)'],
	['Sea glass',  'cool',    '#2d6a4f', '#74c69d', 'rgba(255,255,255,0.5)'],
	['Slate',      'neutral', '#495057', '#adb5bd', 'rgba(255,255,255,0.4)'],
	['Linen',      'neutral', '#d6ccc2', '#f5ebe0', 'rgba(0,0,0,0.06)'],
	['Charcoal',   'neutral', '#212529', '#6c757d', 'rgba(255,255,255,0.3)']
];

const _GALLERY = new libMoodboardImageSource(
	{
		Fields:
		[
			{ Key: 'Name',    Label: 'Name',    Type: 'string', Searchable: true, Sortable: true },
			{ Key: 'Palette', Label: 'Palette', Type: 'enum',   Filterable: true, Sortable: true, Searchable: true },
			{ Key: 'AddedAt', Label: 'Added',   Type: 'date',   Sortable: true }
		],
		Items: _SAMPLES.map(function (pSample, pIndex)
		{
			return { Url: makeSwatch(pSample[2], pSample[3], pSample[4]), Name: pSample[0], Metadata: { Palette: pSample[1], AddedAt: 1700000000000 + (pIndex * 86400000) } };
		})
	});

class MoodboardDemoApplication extends libPictApplication
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
		this.pict.addView('Moodboard', Object.assign({}, libMoodboard.default_configuration, { ImageSource: _GALLERY }), libMoodboard);
	}

	onAfterInitializeAsync(fCallback)
	{
		let tmpBoard = this.pict.views['Moodboard'];
		tmpBoard.render();

		// This demo loads its own Pict global alongside the bundle, so the framework's per-instance
		// CSS injection can land in the wrong world. After the flow has registered its styles, drop
		// the fully generated stylesheet (flow + moodboard) straight into the page, then seed a few
		// cards. A normal single-Pict host gets all this through the usual CSS cascade automatically.
		let tmpPict = this.pict;
		setTimeout(function ()
		{
			let tmpStyle = document.getElementById('mb-demo-css') || document.createElement('style');
			tmpStyle.id = 'mb-demo-css';
			tmpStyle.textContent = tmpPict.CSSMap.generateCSS();
			document.head.appendChild(tmpStyle);

			var tmpFlow = tmpBoard._FlowView;
			function seedImage(pUrl, pX, pY, pW, pH) { var n = tmpFlow.addNode('MoodImage', pX, pY, '', { ImageUrl: pUrl, Fit: 'cover' }); if (n) { n.Ports = []; n.Width = pW; n.Height = pH; } }
			function seedNote(pText, pColor, pX, pY, pW, pH) { var n = tmpFlow.addNode('MoodNote', pX, pY, '', { Text: pText, Color: pColor }); if (n) { n.Ports = []; n.Style = { BodyFill: pColor, TitleBarColor: pColor }; n.Width = pW; n.Height = pH; } }
			// The text card carries the curated font controls: a family stack, a weight, and a text color.
			function seedText(pText, pX, pY, pW, pH, pData) { var n = tmpFlow.addNode('MoodText', pX, pY, '', Object.assign({ Text: pText }, pData || {})); if (n) { n.Ports = []; n.Width = pW; n.Height = pH; } }
			function seedSticker(pUrl, pX, pY, pW, pH) { var n = tmpFlow.addNode('MoodSticker', pX, pY, '', { StickerUrl: pUrl }); if (n) { n.Ports = []; n.Width = pW; n.Height = pH; } }
			seedImage(_SAMPLE_IMAGE, 60, 120, 300, 220);
			seedText('live deliberately', 400, 110, 470, 130, { FontFamily: 'serif', FontFamilyCss: "Georgia, 'Times New Roman', Times, serif", FontWeight: 900, TextColor: '#1f2430' });
			seedNote('Coastal palette: teal and warm sand.', '#ffe08a', 400, 260, 220, 150);
			seedNote('Rounded forms, lots of light.', '#a8d8ff', 650, 260, 220, 150);
			seedSticker(stickerUrl('sticker-star'), 30, 40, 90, 90);
			seedSticker(stickerUrl('sticker-sparkle'), 820, 60, 80, 80);
			// A solid board background (one of the curated swatches) tints the whole canvas.
			tmpBoard.setBackgroundColor('#faf7f2');
			tmpFlow.deselectAll();
			tmpFlow.renderFlow();
			tmpBoard._applyBackground();
		}, 100);

		return super.onAfterInitializeAsync(fCallback);
	}
}

module.exports = MoodboardDemoApplication;
