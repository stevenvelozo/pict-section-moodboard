'use strict';

/**
 * MoodNote: a moodboard sticky note.
 *
 * A pict-section-flow card with no ports. Its color comes from the per-node Style (BodyFill +
 * TitleBarColor set to the same swatch so the whole card reads as one). The body is a read-only
 * display; you move the note on the canvas and edit it (text + color) through its on-graph
 * properties panel (double-click), which calls back into the moodboard view by node hash.
 *
 * @author Steven Velozo <steven@velozo.com>
 * @license MIT
 */

const libPictFlowCard = require('pict-section-flow').PictFlowCard;

class MoodNoteCard extends libPictFlowCard
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, Object.assign(
			{},
			{
				Title: 'Note',
				Name: 'Note',
				Code: 'MoodNote',
				Description: 'A sticky note. Move it on the canvas; double-click to edit text and color.',
				Category: 'Moodboard',
				Width: 200,
				Height: 160,
				CornerRadius: 8,
				ColorRole: 'none',
				TitleBarColor: '#ffe08a',
				BodyStyle: { fill: '#ffe08a' },
				Inputs: [],
				Outputs: [],
				ShowTypeLabel: false,
				BodyContent:
				{
					ContentType: 'html',
					Padding: 0,
					TemplateHash: 'Moodboard-Note-Body',
					Templates:
					[
						{
							Hash: 'Moodboard-Note-Body',
							Template: /*html*/`<div class="mb-note" data-ph="Write a note" style="font-family:{~D:Record.Data.FontFamilyCss~};font-weight:{~D:Record.Data.FontWeight~};color:{~D:Record.Data.TextColor~};font-size:{~D:Record.Data.FontSizeCss~}">{~D:Record.Data.Text~}</div>`
						}
					]
				},
				PropertiesPanel:
				{
					PanelType: 'Template',
					DefaultWidth: 260,
					DefaultHeight: 400,
					Title: 'Note',
					Configuration:
					{
						TemplateHash: 'Moodboard-Note-Panel',
						Templates:
						[
							{
								Hash: 'Moodboard-Note-Panel',
								Template: /*html*/`
<div class="mbp">
	<label class="mbp-label">Text</label>
	<textarea class="mbp-input mbp-textarea" placeholder="Write a note" oninput="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].editText('{~D:Record.Hash~}', this.value)">{~D:Record.Data.Text~}</textarea>
	<label class="mbp-label">Color</label>
	<div class="mbp-swatches">
		<button class="mbp-swatch" style="background:#ffe08a" onclick="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].setNoteColor('{~D:Record.Hash~}','#ffe08a')"></button>
		<button class="mbp-swatch" style="background:#ffb3c1" onclick="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].setNoteColor('{~D:Record.Hash~}','#ffb3c1')"></button>
		<button class="mbp-swatch" style="background:#a8d8ff" onclick="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].setNoteColor('{~D:Record.Hash~}','#a8d8ff')"></button>
		<button class="mbp-swatch" style="background:#b7e4c7" onclick="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].setNoteColor('{~D:Record.Hash~}','#b7e4c7')"></button>
		<button class="mbp-swatch" style="background:#d8c2ff" onclick="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].setNoteColor('{~D:Record.Hash~}','#d8c2ff')"></button>
		<button class="mbp-swatch" style="background:#ffd6a5" onclick="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].setNoteColor('{~D:Record.Hash~}','#ffd6a5')"></button>
		<button class="mbp-swatch" style="background:#e6e6e6" onclick="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].setNoteColor('{~D:Record.Hash~}','#e6e6e6')"></button>
	</div>
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
	<label class="mbp-label">Size</label>
	<select class="mbp-input" onchange="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].setFontSize('{~D:Record.Hash~}', this.value)">
		<option value="">Default</option>
		<option value="13">Small</option>
		<option value="16">Medium</option>
		<option value="22">Large</option>
		<option value="30">Huge</option>
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

module.exports = MoodNoteCard;
