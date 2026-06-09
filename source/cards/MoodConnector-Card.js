'use strict';

/**
 * MoodConnector: a small "edge node" / anchor you place on the board and link with lines.
 *
 * Unlike the content cards (which are chrome-less and have no ports), a connector keeps a left input
 * and a right output port, so you can drag from one connector's port to another's to draw a
 * connection line. The board's connections (pict-section-flow edges) serialize with the rest of the
 * board, so the lines persist. Move it like any card; double-click for its label + rotation.
 *
 * @author Steven Velozo <steven@velozo.com>
 * @license MIT
 */

const libPictFlowCard = require('pict-section-flow').PictFlowCard;

class MoodConnectorCard extends libPictFlowCard
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, Object.assign(
			{},
			{
				Title: 'Connector',
				Name: 'Connector',
				Code: 'MoodConnector',
				Description: 'A connection point. Drag from its port to another connector to draw a line.',
				Category: 'Moodboard',
				Width: 96,
				Height: 30,
				CornerRadius: 15,
				ColorRole: 'none',
				TitleBarColor: 'transparent',
				BodyStyle: { fill: 'var(--theme-color-background-panel, #ffffff)' },
				// One input (left) + one output (right) so connectors can be chained either direction.
				Inputs: [ { Name: 'In', Side: 'left' } ],
				Outputs: [ { Name: 'Out', Side: 'right' } ],
				ShowTypeLabel: false,
				BodyContent:
				{
					ContentType: 'html',
					Padding: 0,
					TemplateHash: 'Moodboard-Connector-Body',
					Templates:
					[
						{
							Hash: 'Moodboard-Connector-Body',
							Template: /*html*/`<div class="mb-connector" data-ph="link">{~D:Record.Data.Label~}</div>`
						}
					]
				},
				PropertiesPanel:
				{
					PanelType: 'Template',
					DefaultWidth: 250,
					DefaultHeight: 170,
					Title: 'Connector',
					Configuration:
					{
						TemplateHash: 'Moodboard-Connector-Panel',
						Templates:
						[
							{
								Hash: 'Moodboard-Connector-Panel',
								Template: /*html*/`
<div class="mbp">
	<label class="mbp-label">Label</label>
	<input class="mbp-input" value="{~D:Record.Data.Label~}" placeholder="(optional)" oninput="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].setConnectorLabel('{~D:Record.Hash~}', this.value)">
	<label class="mbp-label">Rotation</label>
	<input class="mbp-range" type="range" min="-180" max="180" step="1" value="{~D:Record.Rotation~}" oninput="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].setRotation('{~D:Record.Hash~}', this.value)">
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

module.exports = MoodConnectorCard;
