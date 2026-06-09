'use strict';

/**
 * MoodImage: a moodboard image tile.
 *
 * A pict-section-flow card with no ports. Its body is an <img> filling the card edge to edge (the
 * moodboard sets NodeTitleBarHeight 0). The image source lives in Data.ImageUrl (a direct URL or a
 * base64 data URL); object-fit comes from Data.Fit ('cover' default, or 'contain'). You move the
 * tile on the canvas and change its source and fit through the on-graph properties panel.
 *
 * @author Steven Velozo <steven@velozo.com>
 * @license MIT
 */

const libPictFlowCard = require('pict-section-flow').PictFlowCard;

class MoodImageCard extends libPictFlowCard
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, Object.assign(
			{},
			{
				Title: 'Image',
				Name: 'Image',
				Code: 'MoodImage',
				Description: 'An image tile. Move it on the canvas, drag a corner to resize.',
				Category: 'Moodboard',
				Width: 240,
				Height: 200,
				CornerRadius: 8,
				ColorRole: 'none',
				BodyStyle: { fill: 'var(--theme-color-background-tertiary, #eef1f4)' },
				Inputs: [],
				Outputs: [],
				ShowTypeLabel: false,
				BodyContent:
				{
					ContentType: 'html',
					Padding: 0,
					TemplateHash: 'Moodboard-Image-Body',
					Templates:
					[
						{
							Hash: 'Moodboard-Image-Body',
							Template: /*html*/`<img class="mb-image mb-image-{~D:Record.Data.Fit~}" src="{~D:Record.Data.ImageUrl~}" alt="" draggable="false">`
						}
					]
				},
				PropertiesPanel:
				{
					PanelType: 'Template',
					DefaultWidth: 280,
					DefaultHeight: 360,
					Title: 'Image',
					Configuration:
					{
						TemplateHash: 'Moodboard-Image-Panel',
						Templates:
						[
							{
								Hash: 'Moodboard-Image-Panel',
								Template: /*html*/`
<div class="mbp">
	<label class="mbp-label">Image</label>
	<button class="mbp-btn" onclick="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].openPickerForCard('{~D:Record.Hash~}', 'image')">Pick from library</button>
	<label class="mbp-label">Image URL</label>
	<input class="mbp-input" value="{~D:Record.Data.ImageUrl~}" oninput="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].setImageUrl('{~D:Record.Hash~}', this.value)">
	<label class="mbp-label">Fit</label>
	<select class="mbp-input" onchange="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].setFit('{~D:Record.Hash~}', this.value)">
		<option value="cover">Cover (fill the tile)</option>
		<option value="contain">Contain (show all)</option>
	</select>
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

module.exports = MoodImageCard;
