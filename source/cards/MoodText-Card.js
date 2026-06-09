'use strict';

/**
 * MoodText: a big-type text statement, the kind that dominates a moodboard ("live deliberately"
 * set giant between the photos). Unlike a MoodNote it has no card background, bold centered type,
 * and a font that scales with the card box (CSS container units) unless a fixed size is set.
 *
 * The card body is a read-only display; you move it on the canvas and edit it through its on-graph
 * properties panel (double-click), which carries the text plus parameters (font size). The panel
 * calls back into the moodboard view by node hash through AppData.Moodboard.ViewID.
 *
 * @author Steven Velozo <steven@velozo.com>
 * @license MIT
 */

const libPictFlowCard = require('pict-section-flow').PictFlowCard;

class MoodTextCard extends libPictFlowCard
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, Object.assign(
			{},
			{
				Title: 'Text',
				Name: 'Text',
				Code: 'MoodText',
				Description: 'A big-type statement. Resize the card to scale the words, or set a fixed size.',
				Category: 'Moodboard',
				Width: 360,
				Height: 120,
				CornerRadius: 8,
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
					TemplateHash: 'Moodboard-Text-Body',
					Templates:
					[
						{
							Hash: 'Moodboard-Text-Body',
							Template: /*html*/`<div class="mb-text" data-ph="Big text" style="font-family:{~D:Record.Data.FontFamilyCss~};font-weight:{~D:Record.Data.FontWeight~};color:{~D:Record.Data.TextColor~};font-size:{~D:Record.Data.FontSizeCss~}">{~D:Record.Data.Text~}</div>`
						}
					]
				},
				PropertiesPanel:
				{
					PanelType: 'Template',
					DefaultWidth: 280,
					DefaultHeight: 400,
					Title: 'Text',
					Configuration:
					{
						TemplateHash: 'Moodboard-Text-Panel',
						Templates:
						[
							{
								Hash: 'Moodboard-Text-Panel',
								Template: /*html*/`
<div class="mbp">
	<label class="mbp-label">Text</label>
	<textarea class="mbp-input mbp-textarea" placeholder="Big text" oninput="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].editText('{~D:Record.Hash~}', this.value)">{~D:Record.Data.Text~}</textarea>
	<label class="mbp-label">Font size</label>
	<select class="mbp-input" onchange="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].setFontSize('{~D:Record.Hash~}', this.value)">
		<option value="">Auto (fit the card)</option>
		<option value="28">Small</option>
		<option value="44">Medium</option>
		<option value="68">Large</option>
		<option value="104">Display</option>
	</select>
	<label class="mbp-label">Font</label>
	<select class="mbp-input" onchange="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].setFontFamily('{~D:Record.Hash~}', this.value)">
		<option value="">Default</option>
		<option value="sans">Sans</option>
		<option value="serif">Serif</option>
		<option value="mono">Mono</option>
		<option value="rounded">Rounded</option>
		<option value="condensed">Condensed</option>
	</select>
	<label class="mbp-label">Weight</label>
	<select class="mbp-input" onchange="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].setFontWeight('{~D:Record.Hash~}', this.value)">
		<option value="">Default</option>
		<option value="300">Light</option>
		<option value="400">Regular</option>
		<option value="500">Medium</option>
		<option value="700">Bold</option>
		<option value="900">Black</option>
	</select>
	<label class="mbp-label">Text color</label>
	<div class="mbp-swatches">
		<button class="mbp-swatch" style="background:#1f2430" onclick="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].setTextColor('{~D:Record.Hash~}','#1f2430')"></button>
		<button class="mbp-swatch" style="background:#5b6470" onclick="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].setTextColor('{~D:Record.Hash~}','#5b6470')"></button>
		<button class="mbp-swatch" style="background:#ffffff" onclick="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].setTextColor('{~D:Record.Hash~}','#ffffff')"></button>
		<button class="mbp-swatch" style="background:#2880a6" onclick="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].setTextColor('{~D:Record.Hash~}','#2880a6')"></button>
		<button class="mbp-swatch" style="background:#c0392b" onclick="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].setTextColor('{~D:Record.Hash~}','#c0392b')"></button>
		<button class="mbp-swatch" style="background:#2e7d32" onclick="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].setTextColor('{~D:Record.Hash~}','#2e7d32')"></button>
		<input type="color" class="mbp-textcolor" title="Custom text color" onchange="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].setTextColor('{~D:Record.Hash~}', this.value)">
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

module.exports = MoodTextCard;
