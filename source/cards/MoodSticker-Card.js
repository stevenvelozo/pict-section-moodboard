'use strict';

/**
 * MoodSticker: a moodboard sticker.
 *
 * Like MoodImage but with no card chrome: a transparent <img> (a PNG or SVG cutout) that floats on
 * the board, kept to its aspect ratio inside a small, resizable box. Its source lives in
 * Data.StickerUrl (a direct URL or a base64 / data URL). You move it on the canvas, drag a corner to
 * resize, and change its source through the on-graph properties panel. Stickers come from the
 * board's StickerSource (a built-in set plus, in a host app, an uploaded library).
 *
 * @author Steven Velozo <steven@velozo.com>
 * @license MIT
 */

const libPictFlowCard = require('pict-section-flow').PictFlowCard;

class MoodStickerCard extends libPictFlowCard
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, Object.assign(
			{},
			{
				Title: 'Sticker',
				Name: 'Sticker',
				Code: 'MoodSticker',
				Description: 'A sticker cutout. Move it on the canvas, drag a corner to resize.',
				Category: 'Moodboard',
				Width: 120,
				Height: 120,
				CornerRadius: 0,
				ColorRole: 'none',
				TitleBarColor: 'transparent',
				BodyStyle: { fill: 'transparent' },
				Inputs: [],
				Outputs: [],
				ShowTypeLabel: false,
				BodyContent:
				{
					ContentType: 'html',
					Padding: 0,
					TemplateHash: 'Moodboard-Sticker-Body',
					Templates:
					[
						{
							Hash: 'Moodboard-Sticker-Body',
							Template: /*html*/`<img class="mb-sticker" src="{~D:Record.Data.StickerUrl~}" alt="" draggable="false">`
						}
					]
				},
				PropertiesPanel:
				{
					PanelType: 'Template',
					DefaultWidth: 260,
					DefaultHeight: 330,
					Title: 'Sticker',
					Configuration:
					{
						TemplateHash: 'Moodboard-Sticker-Panel',
						Templates:
						[
							{
								Hash: 'Moodboard-Sticker-Panel',
								Template: /*html*/`
<div class="mbp">
	<label class="mbp-label">Sticker</label>
	<button class="mbp-btn" onclick="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].openPickerForCard('{~D:Record.Hash~}', 'sticker')">Pick a sticker</button>
	<label class="mbp-label">Sticker URL</label>
	<input class="mbp-input" value="{~D:Record.Data.StickerUrl~}" oninput="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].setStickerUrl('{~D:Record.Hash~}', this.value)">
	<div class="mbp-stickercolors {~D:Record.Data._ColorShow~}">
		<label class="mbp-label">Colors</label>
		<div class="mbp-colorset">
			<input type="color" class="mbp-color" title="Primary color" value="{~D:Record.Data.ColorPrimary~}" onchange="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].setStickerColor('{~D:Record.Hash~}', 'pri', this.value)">
			<input type="color" class="mbp-color mbp-sec {~D:Record.Data._SecColorShow~}" title="Secondary color" value="{~D:Record.Data.ColorSecondary~}" onchange="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].setStickerColor('{~D:Record.Hash~}', 'sec', this.value)">
		</div>
	</div>
	<label class="mbp-label">Rotation</label>
	<input class="mbp-range" type="range" min="-180" max="180" step="1" value="{~D:Record.Rotation~}" oninput="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].setRotation('{~D:Record.Hash~}', this.value)">
	<label class="mbp-label">Connection points</label>
	<select class="mbp-input" onchange="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].setConnectMode('{~D:Record.Hash~}', this.value)">
		<option value="off" {~D:Record.Data.ConnectOffSel~}>Off</option>
		<option value="edit" {~D:Record.Data.ConnectEditSel~}>While editing</option>
		<option value="always" {~D:Record.Data.ConnectAlwaysSel~}>Always (show to viewers)</option>
	</select>
	<div class="mbp-hint">Drag a dot onto another card to link them. The toolbar button or pressing C toggles the selected card.</div>
</div>`
							}
						]
					}
				}
			},
			pOptions),
			pServiceHash);
	}
}

module.exports = MoodStickerCard;
