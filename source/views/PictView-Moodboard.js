'use strict';

/**
 * Moodboard: a free-form canvas of draggable, resizable image tiles, sticky notes, big text, stickers,
 * and connectors.
 *
 * It is a thin layer over pict-section-flow. The flow supplies the whole interface: ONE thin toolbar
 * (with its native docked / draggable / collapsible modes) carries adding (the card palette), delete,
 * zoom, fit, and fullscreen; this view adds two host-facing toolbar buttons through the flow's
 * ToolbarExtraButtons extension -- a board-background button (opens a small popover) and whatever
 * Edit / Done button the host supplies -- plus the per-card properties panels where every setting
 * lives (note color and font, image fit, a library picker, connector label, rotation). There is no
 * hand-rolled chrome: no separate control bar, no viewer bar, no custom fullscreen.
 *
 * A content card (image / note / text / sticker) is chrome-less and port-less; a connector keeps two
 * ports so you can draw lines between connectors. Images are stored on each node as Data.ImageUrl --
 * stand-alone that is a base64 data URL kept in the board JSON (a board is self-contained); a host can
 * pass an ImageSource / StickerSource that serves bytes from its own store. The board serializes
 * through the flow's getFlowData / setFlowData (Nodes + Connections + ViewState).
 *
 * @author Steven Velozo <steven@velozo.com>
 * @license MIT
 */

const libPictView = require('pict-view');
const libPictSectionFlow = require('pict-section-flow');
const libMoodImageCard = require('../cards/MoodImage-Card.js');
const libMoodNoteCard = require('../cards/MoodNote-Card.js');
const libMoodTextCard = require('../cards/MoodText-Card.js');
const libMoodStickerCard = require('../cards/MoodSticker-Card.js');
// The connector card is no longer offered in the palette (edges are drawn between card ports now), but
// it stays registered so boards saved with the older connector nodes still render them correctly.
const libMoodConnectorCard = require('../cards/MoodConnector-Card.js');
const libImageSource = require('../sources/ImageSource-Base.js');
const libStickerSource = require('../sources/StickerSource-Base.js');

// A small, friendly note palette. The first entry is the default for a new note.
const _NOTE_COLORS = ['#ffe08a', '#ffb3c1', '#a8d8ff', '#b7e4c7', '#d8c2ff', '#ffd6a5', '#e6e6e6'];

// Curated board-background swatches: paper neutrals, soft tints, and one near-black for a dark board.
// A custom-color input and a "no background" option sit beside them in the background popover.
const _BACKGROUND_COLORS = ['#ffffff', '#faf7f2', '#f1f5f9', '#eef2ff', '#ecfdf5', '#fef2f2', '#fdf4ff', '#111827'];

// Curated, web-safe font stacks for note + text cards (no web-font loading -- these resolve to fonts
// already on the machine). The panel select passes a key; setFontFamily resolves it to the stack.
// The option keys in the card panels must stay in sync with these.
const _FONT_FAMILIES =
{
	'': '',
	'sans': "'Helvetica Neue', Helvetica, Arial, sans-serif",
	'serif': "Georgia, 'Times New Roman', Times, serif",
	'mono': "'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
	'rounded': "'Trebuchet MS', 'Segoe UI', system-ui, sans-serif",
	'condensed': "'Arial Narrow', 'Helvetica Neue', Arial, sans-serif"
};

// Curated text-color swatches for note + text cards (ink, gray, white, and a few accents). A custom
// color input sits beside them in each card's panel.
const _TEXT_COLORS = ['#1f2430', '#5b6470', '#ffffff', '#2880a6', '#c0392b', '#2e7d32', '#b8860b'];

// Twelve connection anchors: three evenly spaced down each side, none on the corners. These are
// pict-section-flow's built-in twelve port-side names (the flow positions each in its third of the
// edge), so a card's links can attach right where they should. All are output ports; undirected
// connections (EnableUndirectedConnections) let any anchor link to any other.
const _CONNECT_SIDES = ['left-top', 'left', 'left-bottom', 'right-top', 'right', 'right-bottom', 'top-left', 'top', 'top-right', 'bottom-left', 'bottom', 'bottom-right'];

// The properties panel for a connection (double-click a link to open it). Like a card's panel, it is a
// Template panel rendered against the connection record, so its controls bind Record.Data.* and call the
// view's setConnection* methods. Edits the line color, width, style, the marker at each end, and a label.
const _CONNECTION_PANEL =
{
	PanelType: 'Template',
	DefaultWidth: 250,
	DefaultHeight: 360,
	Title: 'Connection',
	Configuration:
	{
		TemplateHash: 'Moodboard-Connection-Panel',
		Templates:
		[
			{
				Hash: 'Moodboard-Connection-Panel',
				Template: /*html*/`
<div class="mbp">
	<label class="mbp-label">Color</label>
	<input type="color" class="mbp-color" value="{~D:Record.Data.StrokeColor~}" onchange="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].setConnectionColor('{~D:Record.Hash~}', this.value)">
	<label class="mbp-label">Width</label>
	<input class="mbp-range" type="range" min="1" max="8" step="1" value="{~D:Record.Data.StrokeWidth~}" onchange="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].setConnectionWidth('{~D:Record.Hash~}', this.value)">
	<label class="mbp-label">Line</label>
	<select class="mbp-input" onchange="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].setConnectionLineStyle('{~D:Record.Hash~}', this.value)">
		<option value="solid" {~D:Record.Data.StyleSolidSel~}>Solid</option>
		<option value="dashed" {~D:Record.Data.StyleDashedSel~}>Dashed</option>
		<option value="dotted" {~D:Record.Data.StyleDottedSel~}>Dotted</option>
	</select>
	<label class="mbp-label">Start end</label>
	<select class="mbp-input" onchange="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].setConnectionSourceMarker('{~D:Record.Hash~}', this.value)">
		<option value="none" {~D:Record.Data.SrcNoneSel~}>None</option>
		<option value="arrow" {~D:Record.Data.SrcArrowSel~}>Arrow</option>
		<option value="dot" {~D:Record.Data.SrcDotSel~}>Dot</option>
		<option value="square" {~D:Record.Data.SrcSquareSel~}>Square</option>
	</select>
	<label class="mbp-label">Finish end</label>
	<select class="mbp-input" onchange="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].setConnectionTargetMarker('{~D:Record.Hash~}', this.value)">
		<option value="none" {~D:Record.Data.TgtNoneSel~}>None</option>
		<option value="arrow" {~D:Record.Data.TgtArrowSel~}>Arrow</option>
		<option value="dot" {~D:Record.Data.TgtDotSel~}>Dot</option>
		<option value="square" {~D:Record.Data.TgtSquareSel~}>Square</option>
	</select>
	<label class="mbp-label">Label</label>
	<input class="mbp-input" value="{~D:Record.Data.Label~}" placeholder="(optional)" oninput="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].setConnectionLabel('{~D:Record.Hash~}', this.value)">
</div>`
			}
		]
	}
};

const _ViewConfiguration =
{
	ViewIdentifier: 'Moodboard',
	DefaultRenderable: 'Moodboard-Container',
	DefaultDestinationAddress: '#Moodboard-Container',
	CSS: /*css*/`
		.mb-root { position: relative; display: flex; flex-direction: column; height: 100%; min-height: 0; }
		.mb-canvas { position: relative; flex: 1; min-height: 0; overflow: hidden; }
		.mb-canvas.mb-dropping::after { content: "Drop images here"; position: absolute; inset: 10px; border: 2px dashed var(--theme-color-brand-primary, #2880a6); border-radius: 10px; display: flex; align-items: center; justify-content: center; color: var(--theme-color-brand-primary, #2880a6); font-weight: 600; pointer-events: none; background: rgba(40,128,166,0.06); }
		.mb-flow { position: absolute; inset: 0; }
		/* The flow container defaults to min-height: 400px (it expects to be a full-page editor); inside a
		   short embedded board that overflows the canvas and spills over the content below. Pin it to the
		   canvas so the board stays inside its banner. */
		.mb-root .pict-flow-container { min-height: 0; }
		.mb-sticker { width: 100%; height: 100%; object-fit: contain; pointer-events: none; user-select: none; -webkit-user-drag: none; }
		/* A sticker is a cutout, not a card: drop the flow's default white node body + border so only the
		   transparent image shows (the type class beats the flow's .pict-flow-node-body fill by specificity). */
		.mb-root .pict-flow-node-MoodSticker .pict-flow-node-body { fill: transparent; stroke: none; }
		/* A connector ("edge node"): a small dashed pill with visible ports you drag from to draw lines. */
		.mb-connector { width: 100%; height: 100%; box-sizing: border-box; display: flex; align-items: center; justify-content: center; padding: 0 8px; font-size: 11px; color: var(--theme-color-text-secondary, #5b6376); overflow: hidden; white-space: nowrap; }
		.mb-connector:empty::before { content: attr(data-ph); opacity: 0.5; }
		.mb-root .pict-flow-node-MoodConnector .pict-flow-node-body { fill: var(--theme-color-background-panel, #ffffff); stroke: var(--theme-color-border-default, #c2cad6); stroke-width: 1; stroke-dasharray: 3 2; }
		/* The flow draws a small "has a panel" indicator dot on every node; on a moodboard it reads as a
		   stray handle (and adds a second box next to the resize handle when selected). Drop it -- cards
		   are edited by double-clicking them open. */
		.mb-root .pict-flow-node-panel-indicator { display: none; }

		/* Trim pict-section-flow's one toolbar to what a moodboard needs: hide the layout/auto group and
		   the theme (gear) popup. Cards, delete, zoom, fit, fullscreen, dock/float, and collapse stay. The
		   floating (draggable) toolbar lists its layout buttons individually, so hide those by action too. */
		.mb-root .pict-flow-toolbar-group:has([data-flow-action="layout-popup"]) { display: none; }
		.mb-root [data-flow-action="settings-popup"] { display: none; }
		.mb-root .pict-flow-floating-toolbar [data-flow-action="auto-layout"],
		.mb-root .pict-flow-floating-toolbar [data-flow-action="layout-popup"] { display: none; }

		/* Read-only display (Editable:false): a navigation-only toolbar (no card-delete), live pan + zoom
		   so a viewer can look around, and the toolbar collapsed into a corner that fades in on hover so
		   the board is uncluttered until you reach for it. Editing interactions stay off via the flow's
		   own flags, so the canvas navigates but cannot be changed. */
		.mb-readonly [data-flow-action="delete-selected"] { display: none; }
		/* Connection dots are an editing affordance: hide them on a read-only board -- unless the card was
		   set to "always" (NodeClass mb-conn-always), which keeps them visible to viewers. The connecting
		   lines render in both cases. */
		.mb-readonly .pict-flow-port { display: none; }
		.mb-readonly .mb-conn-always .pict-flow-port { display: block; }
		.mb-readonly .pict-flow-toolbar-collapsed { opacity: 0; transition: opacity 0.15s ease; }
		.mb-readonly:hover .pict-flow-toolbar-collapsed,
		.mb-readonly .pict-flow-toolbar-collapsed:focus-within { opacity: 1; }
		.mb-readonly .mb-canvas { cursor: grab; }
		.mb-readonly .mb-canvas:active { cursor: grabbing; }

		/* Board-background popover (opened from the toolbar Background button). Fixed + above the flow's
		   own fullscreen (z-index 9999) so it shows while editing full screen. */
		.mb-bgpop { display: none; position: fixed; z-index: 10001; min-width: 168px; padding: 10px 11px; border-radius: 10px; background: var(--theme-color-background-panel, #fff); border: 1px solid var(--theme-color-border-default, #dfe3ea); box-shadow: 0 12px 34px rgba(20,30,50,0.20); }
		.mb-bgpop-open .mb-bgpop { display: block; }
		.mb-bgpop-label { font-size: 11px; font-weight: 600; color: var(--theme-color-text-secondary, #5b6376); text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 7px; }
		.mb-bgpop-swatches { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
		.mb-bgpop-swatch { width: 22px; height: 22px; border-radius: 6px; border: 1px solid rgba(0,0,0,0.15); cursor: pointer; padding: 0; }
		.mb-bgpop-swatch:hover { transform: scale(1.1); }
		.mb-bgpop-custom { width: 24px; height: 24px; padding: 0; border: 1px solid rgba(0,0,0,0.15); border-radius: 6px; background: none; cursor: pointer; }
		.mb-bgpop-none { position: relative; background: #fff; }
		.mb-bgpop-none::after { content: ""; position: absolute; left: 2px; right: 2px; top: 50%; height: 2px; margin-top: -1px; background: #e23b4b; transform: rotate(-45deg); }

		/* A moodboard has a flat, light canvas (no dark flow grid). */
		.mb-flow .pict-flow-grid-background { fill: var(--theme-color-background-secondary, #f4f6f9); }
		/* Moodboard cards fill edge to edge: no title text, no ports, transparent note text area. */
		.pict-flow-node-MoodImage .pict-flow-node-title,
		.pict-flow-node-MoodNote .pict-flow-node-title,
		.pict-flow-node-MoodText .pict-flow-node-title,
		.pict-flow-node-MoodSticker .pict-flow-node-title { display: none; }
		/* Connection ports show as small dots only when a card opts in (its panel adds them); the dots are
		   for editing, so hide them on a read-only board (the connecting lines still render). Port labels
		   stay hidden either way -- moodboard ports are unlabeled anchors. */
		.pict-flow-node-MoodImage .pict-flow-port-label, .pict-flow-node-MoodNote .pict-flow-port-label, .pict-flow-node-MoodText .pict-flow-port-label, .pict-flow-node-MoodSticker .pict-flow-port-label { display: none; }
		.mb-readonly .pict-flow-port { display: none; }
		.mb-image { width: 100%; height: 100%; display: block; border-radius: 8px; }
		.mb-image-cover { object-fit: cover; }
		.mb-image-contain { object-fit: contain; }
		.mb-note { width: 100%; height: 100%; box-sizing: border-box; padding: 10px; font-family: inherit; font-size: 13px; line-height: 1.35; color: #3a3320; overflow: hidden; white-space: pre-wrap; word-break: break-word; }
		.mb-note:empty::before, .mb-text:empty::before { content: attr(data-ph); color: rgba(0,0,0,0.28); }

		/* Big-type Text card: bold, transparent (floats), centered; the font scales with the card box
		   (CSS container units) unless a fixed size is set. Make the card bigger and the words grow. */
		.pict-flow-node-MoodText .pict-flow-node-body-content-html { container-type: size; width: 100%; height: 100%; }
		.mb-text { width: 100%; height: 100%; box-sizing: border-box; padding: 4px 10px; display: flex; align-items: center; justify-content: center; text-align: center; font-family: inherit; font-weight: 800; line-height: 1.04; letter-spacing: -0.015em; color: var(--theme-color-text-primary, #1d2230); font-size: min(64cqh, 12cqw); overflow: hidden; white-space: pre-wrap; word-break: break-word; }
		.pict-flow-node-MoodText .pict-flow-node-body { fill: transparent !important; stroke: none !important; }
		.pict-flow-node-MoodText .pict-flow-node-title-bar, .pict-flow-node-MoodText .pict-flow-node-title-bar-bottom { fill: transparent !important; }
		.pict-flow-node-MoodText { filter: none !important; }

		/* Card bodies are display-only so the whole card drags; editing happens in the properties panel. */
		.pict-flow-node-MoodImage .pict-flow-node-body-content-html,
		.pict-flow-node-MoodNote .pict-flow-node-body-content-html,
		.pict-flow-node-MoodText .pict-flow-node-body-content-html,
		.pict-flow-node-MoodSticker .pict-flow-node-body-content-html,
		.pict-flow-node-MoodConnector .pict-flow-node-body-content-html { pointer-events: none; }

		/* Properties panel (double-click a card to open it). */
		.mbp { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; font-size: 13px; max-height: 100%; overflow-y: auto; box-sizing: border-box; }
		.mbp-label { font-size: 11px; font-weight: 600; color: var(--theme-color-text-secondary, #5b6376); text-transform: uppercase; letter-spacing: 0.03em; }
		.mbp-input { width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid var(--theme-color-border-default, #d8dde6); border-radius: 6px; font-size: 13px; font-family: inherit; background: var(--theme-color-background-panel, #fff); }
		.mbp-textarea { min-height: 72px; resize: vertical; line-height: 1.3; }
		.mbp-range { width: 100%; box-sizing: border-box; margin: 2px 0; }
		.mbp-swatches { display: flex; gap: 6px; flex-wrap: wrap; }
		.mbp-swatch { width: 22px; height: 22px; border-radius: 50%; border: 1px solid rgba(0,0,0,0.15); cursor: pointer; padding: 0; }
		.mbp-swatch:hover { transform: scale(1.12); }
		.mbp-textcolor { width: 24px; height: 24px; padding: 0; border: 1px solid rgba(0,0,0,0.15); border-radius: 50%; background: none; cursor: pointer; }
		.mbp-color { width: 100%; height: 30px; padding: 2px; border: 1px solid var(--theme-color-border-default, #d8dde6); border-radius: 6px; background: var(--theme-color-background-panel, #fff); cursor: pointer; box-sizing: border-box; }
		/* A panel action button (e.g. "Pick from library", "Pick a sticker"). */
		.mbp-btn { align-self: flex-start; padding: 5px 10px; border: 1px solid var(--theme-color-border-default, #d8dde6); border-radius: 6px; background: var(--theme-color-background-panel, #fff); color: var(--theme-color-text-primary, #222); cursor: pointer; font-size: 12px; }
		.mbp-btn:hover { background: var(--theme-color-background-hover, #f2f2f2); }
		/* Small helper text under a panel control (e.g. how to use connection points). */
		.mbp-hint { font-size: 11px; color: var(--theme-color-text-secondary, #8a93a5); line-height: 1.35; }

		/* Gallery picker overlay (built from whatever fields the image source declares). Fixed + above the
		   flow fullscreen so picking an image works while editing full screen. */
		.mb-gallery { display: none; position: fixed; inset: 0; z-index: 10001; align-items: center; justify-content: center; }
		.mb-gallery-open .mb-gallery { display: flex; }
		.mb-gallery::before { content: ""; position: absolute; inset: 0; background: rgba(20,28,40,0.35); }
		.mb-gallery-panel { position: relative; width: min(760px, 92%); max-height: 86%; background: var(--theme-color-background-panel, #fff); border: 1px solid var(--theme-color-border-default, #dfe3ea); border-radius: 12px; box-shadow: 0 18px 50px rgba(20,30,50,0.22); display: flex; flex-direction: column; overflow: hidden; }
		.mb-gallery-head { display: flex; align-items: center; justify-content: space-between; padding: 13px 16px; border-bottom: 1px solid var(--theme-color-border-default, #eceff3); }
		.mb-gallery-title { font-weight: 600; font-size: 15px; color: var(--theme-color-text-primary, #222); }
		.mb-gallery-controls { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; padding: 12px 16px; border-bottom: 1px solid var(--theme-color-border-default, #eceff3); }
		.mb-gallery-search { min-width: 200px; flex: 1; padding: 0.4em 0.6em; border: 1px solid var(--theme-color-border-default, #ccc); border-radius: 6px; font-size: 0.9em; }
		.mb-gallery-filter, .mb-gallery-sortlbl { font-size: 12px; color: var(--theme-color-text-secondary, #5b6376); display: inline-flex; gap: 5px; align-items: center; }
		.mb-gallery-filter select, .mb-gallery-sort { padding: 5px 6px; border: 1px solid var(--theme-color-border-default, #ccc); border-radius: 6px; font-size: 13px; background: var(--theme-color-background-panel, #fff); }
		.mb-gallery-btn { padding: 0.25em 0.6em; border: 1px solid var(--theme-color-border-default, #ccc); border-radius: 6px; background: var(--theme-color-background-panel, #fff); color: var(--theme-color-text-primary, #222); cursor: pointer; font-size: 0.85em; }
		.mb-gallery-btn:hover { background: var(--theme-color-background-hover, #f2f2f2); }
		.mb-gallery-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; padding: 16px; overflow: auto; }
		.mb-gallery-item { display: flex; flex-direction: column; padding: 0; border: 1px solid var(--theme-color-border-default, #e4e8ef); border-radius: 8px; background: var(--theme-color-background-secondary, #f7f8fb); cursor: pointer; overflow: hidden; text-align: left; }
		.mb-gallery-item:hover { border-color: var(--theme-color-brand-primary, #2880a6); }
		.mb-gallery-item img { width: 100%; height: 92px; object-fit: cover; display: block; background: #e9edf2; }
		.mb-gallery-item-name { font-size: 11px; color: var(--theme-color-text-secondary, #5b6376); padding: 4px 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
		/* Sticker mode: compact, near-square tiles with the cutout shrunk to fit (not a stretched
		   thumbnail). box-sizing keeps the padding inside the tile width so the image never overflows. */
		.mb-gallery-mode-sticker .mb-gallery-grid { grid-template-columns: repeat(auto-fill, minmax(86px, 1fr)); }
		.mb-gallery-mode-sticker .mb-gallery-item { align-items: center; }
		.mb-gallery-mode-sticker .mb-gallery-item img { width: 100%; height: 82px; box-sizing: border-box; padding: 14px; object-fit: contain; background: transparent; }
		.mb-gallery-mode-sticker .mb-gallery-item-name { width: 100%; text-align: center; padding-bottom: 6px; }
		.mb-gallery-empty { grid-column: 1 / -1; text-align: center; color: var(--theme-color-text-secondary, #8a93a5); padding: 44px 16px; }
	`,
	Templates:
	[
		{
			Hash: 'Moodboard-Container',
			Template: /*html*/`
<div class="mb-root" id="MB-Root-{~D:AppData.Moodboard.ViewID~}">
	<div class="mb-canvas" id="MB-Canvas-{~D:AppData.Moodboard.ViewID~}"
		ondragover="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].onDragOver(event)"
		ondragleave="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].onDragLeave(event)"
		ondrop="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].onDrop(event)">
		<div class="mb-flow" id="MB-Flow-{~D:AppData.Moodboard.ViewID~}"></div>
	</div>
	<div class="mb-gallery" id="MB-Gallery-{~D:AppData.Moodboard.ViewID~}"></div>
	<div class="mb-bgpop" id="MB-BgPopover-{~D:AppData.Moodboard.ViewID~}"></div>
</div>`
		},
		{
			Hash: 'Moodboard-BgPopover',
			Template: /*html*/`
<div class="mb-bgpop-label">Board background</div>
<div class="mb-bgpop-swatches">
	{~TS:Moodboard-BgSwatch:AppData.Moodboard.BackgroundColors~}
	<input type="color" class="mb-bgpop-custom" title="Select a color" onchange="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].setBackgroundColor(this.value)">
	<button class="mb-bgpop-swatch mb-bgpop-none" title="No background" onclick="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].setBackgroundColor('')"></button>
</div>`
		},
		{
			Hash: 'Moodboard-BgSwatch',
			Template: /*html*/`<button class="mb-bgpop-swatch" style="background:{~D:Record.Color~}" title="Background {~D:Record.Color~}" onclick="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].setBackgroundColor('{~D:Record.Color~}')"></button>`
		},
		{
			Hash: 'Moodboard-Gallery',
			Template: /*html*/`
<div class="mb-gallery-panel">
	<div class="mb-gallery-head">
		<span class="mb-gallery-title">{~D:AppData.Moodboard.Gallery.Title~}</span>
		<button class="mb-gallery-btn" onclick="document.getElementById('MB-GalleryUpload-{~D:AppData.Moodboard.ViewID~}').click()">Upload</button>
		<input type="file" id="MB-GalleryUpload-{~D:AppData.Moodboard.ViewID~}" accept="{~D:AppData.Moodboard.Gallery.UploadAccept~}" style="display:none" onchange="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].uploadToGallery(this.files); this.value='';">
		<button class="mb-gallery-btn" onclick="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].closeGallery()">Close</button>
	</div>
	<div class="mb-gallery-controls">
		<input class="mb-gallery-search" placeholder="{~D:AppData.Moodboard.Gallery.SearchPlaceholder~}" oninput="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].onGallerySearch(this.value)">
		{~TS:Moodboard-Gallery-Filter:AppData.Moodboard.Gallery.FilterFields~}
		<label class="mb-gallery-sortlbl">Sort
			<select class="mb-gallery-sort" onchange="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].onGallerySort(this.value)"><option value="">none</option>{~TS:Moodboard-Gallery-Sort-Option:AppData.Moodboard.Gallery.SortFields~}</select>
		</label>
		<button class="mb-gallery-btn mb-gallery-dir" onclick="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].onGallerySortDir()">{~D:AppData.Moodboard.Gallery.SortDirLabel~}</button>
	</div>
	<div class="mb-gallery-grid" id="MB-Gallery-Grid-{~D:AppData.Moodboard.ViewID~}"></div>
</div>`
		},
		{
			Hash: 'Moodboard-Gallery-Filter',
			Template: /*html*/`<label class="mb-gallery-filter">{~D:Record.Label~}<select onchange="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].onGalleryFilter('{~D:Record.Key~}', this.value)"><option value="">All</option>{~TS:Moodboard-Gallery-Filter-Option:Record.Options~}</select></label>`
		},
		{ Hash: 'Moodboard-Gallery-Filter-Option', Template: /*html*/`<option value="{~D:Record.Value~}">{~D:Record.Value~}</option>` },
		{ Hash: 'Moodboard-Gallery-Sort-Option', Template: /*html*/`<option value="{~D:Record.Key~}">{~D:Record.Label~}</option>` },
		{
			Hash: 'Moodboard-Gallery-Grid',
			Template: /*html*/`{~TS:Moodboard-Gallery-Item:AppData.Moodboard.Gallery.Items~}{~TS:Moodboard-Gallery-Empty:AppData.Moodboard.Gallery.EmptySlot~}`
		},
		{
			Hash: 'Moodboard-Gallery-Item',
			Template: /*html*/`<button class="mb-gallery-item" title="{~D:Record.Name~}" onclick="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].pickFromGallery('{~D:Record.Id~}')"><img src="{~D:Record.Thumbnail~}" alt="" draggable="false"><span class="mb-gallery-item-name">{~D:Record.Name~}</span></button>`
		},
		{ Hash: 'Moodboard-Gallery-Empty', Template: /*html*/`<div class="mb-gallery-empty">{~D:AppData.Moodboard.Gallery.EmptyMessage~}</div>` }
	],
	Renderables:
	[
		{ RenderableHash: 'Moodboard-Container', TemplateHash: 'Moodboard-Container', ContentDestinationAddress: '#Moodboard-Container', RenderMethod: 'replace' }
	]
};

class PictViewMoodboard extends libPictView
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
		this._FlowView = null;
		// A board set before the flow sub-view exists (a host can call setBoard right after render(), but
		// the flow is built later in onAfterRender) is stashed here and applied once the flow is ready.
		this._PendingBoard = null;
		this._AddCount = 0;
		// An embedding app can supply an image source (its own gallery + metadata); otherwise the
		// built-in base source keeps a base64 collection so the gallery works stand-alone.
		this._ImageSource = (pOptions && pOptions.ImageSource) ? pOptions.ImageSource : new libImageSource();
		// A host can supply its own sticker library (options.StickerSource); otherwise the built-in source
		// ships a small set of cutout shapes so stickers work stand-alone.
		this._StickerSource = (pOptions && pOptions.StickerSource) ? pOptions.StickerSource : new libStickerSource();
		// When the library picker is opened from a card's properties panel, the chosen image / sticker is
		// applied to THIS node (rather than adding a new card).
		this._PickerTargetHash = null;
		this._boundOnPaste = this._onPaste.bind(this);
	}

	onBeforeInitialize()
	{
		this._initState();
		return super.onBeforeInitialize();
	}

	_initState()
	{
		if (!this.pict.AppData.Moodboard)
		{
			this.pict.AppData.Moodboard =
			{
				ViewID: this.options.ViewIdentifier,
				NoteColors: _NOTE_COLORS.map((pColor) => ({ Color: pColor })),
				BackgroundColors: _BACKGROUND_COLORS.map((pColor) => ({ Color: pColor }))
			};
		}
		this.pict.AppData.Moodboard.ViewID = this.options.ViewIdentifier;
		// AppData.Moodboard is shared across instances; backfill palettes a stale (older-build) object misses.
		if (!this.pict.AppData.Moodboard.BackgroundColors) { this.pict.AppData.Moodboard.BackgroundColors = _BACKGROUND_COLORS.map((pColor) => ({ Color: pColor })); }
	}

	onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent)
	{
		// The active (on-screen) board owns the shared AppData.Moodboard.ViewID, so its card panels and
		// background popover (which reference it) target this instance when several moodboards are
		// registered on one Pict (the Moodboard section plus per-user profile boards).
		if (this.pict.AppData.Moodboard) { this.pict.AppData.Moodboard.ViewID = this.options.ViewIdentifier; }
		this._ensureFlowView();
		// Mark the root read-only so the CSS gives a navigation-only, collapsed-on-hover toolbar and a
		// non-editable canvas.
		let tmpRoot = document.getElementById('MB-Root-' + this.options.ViewIdentifier);
		if (tmpRoot) { if (this._isEditable()) { tmpRoot.classList.remove('mb-readonly'); } else { tmpRoot.classList.add('mb-readonly'); } }
		// Set the host's Edit / Done buttons on the flow toolbar (and, read-only, collapse it into the
		// corner). Deferred until the flow toolbar exists.
		this._setupToolbarSoon();
		if (this._isEditable())
		{
			// Clipboard paste of an image is a window-level event with no inline equivalent; wire once.
			if (!this._PasteWired)
			{
				document.addEventListener('paste', this._boundOnPaste);
				this._PasteWired = true;
			}
			// The "c" hotkey toggles connection points on the selected card(s). Window-level keydown with
			// no inline equivalent; wire once. Ignored while typing in a field or when nothing is selected.
			if (!this._ConnectKeyWired)
			{
				this._boundOnConnectKey = this._boundOnConnectKey || ((pEvent) =>
				{
					if (pEvent.key !== 'c' && pEvent.key !== 'C') { return; }
					if (pEvent.metaKey || pEvent.ctrlKey || pEvent.altKey) { return; }
					if (!this._isEditable() || !document.getElementById('MB-Root-' + this.options.ViewIdentifier)) { return; }
					let tmpFocus = document.activeElement;
					if (tmpFocus && (tmpFocus.tagName === 'INPUT' || tmpFocus.tagName === 'TEXTAREA' || tmpFocus.tagName === 'SELECT' || tmpFocus.isContentEditable)) { return; }
					if (this._selectedHashes().length === 0) { return; }
					this.toggleConnectPoints();
					pEvent.preventDefault();
				});
				document.addEventListener('keydown', this._boundOnConnectKey);
				this._ConnectKeyWired = true;
			}
		}
		else
		{
			// Read-only: re-fit the board when the window resizes so a fitted display stays fitted (window
			// resize has no inline equivalent; wire once).
			if (!this._ResizeWired)
			{
				this._boundOnResize = this._boundOnResize || (() => { if (!this._isEditable()) { this.fitBoard(); } });
				window.addEventListener('resize', this._boundOnResize);
				this._ResizeWired = true;
			}
			// A double-click on a card in read-only mode notifies the host (options.onCardActivate) with
			// the node hash, so an app can act on it (e.g. drop into edit and open that card's panel)
			// without the viewer itself being editable. Re-bound each render (the root is recreated).
			if (typeof this.options.onCardActivate === 'function' && tmpRoot)
			{
				this._boundOnCardActivate = this._boundOnCardActivate || ((pEvent) =>
				{
					let tmpGroup = (pEvent.target && pEvent.target.closest) ? pEvent.target.closest('[data-node-hash]') : null;
					let tmpHash = tmpGroup ? tmpGroup.getAttribute('data-node-hash') : null;
					if (tmpHash) { this.options.onCardActivate(tmpHash); }
				});
				tmpRoot.removeEventListener('dblclick', this._boundOnCardActivate);
				tmpRoot.addEventListener('dblclick', this._boundOnCardActivate);
			}
		}
		// Paint the saved board background (if any) onto the canvas (both modes).
		this._applyBackgroundSoon();
		this.pict.CSSMap.injectCSS();
		return super.onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent);
	}

	// Fit every card into view with a little padding (the flow's zoomToFit pads 50px). Used on load
	// (both modes) and when a read-only board's window resizes.
	fitBoard() { if (this._FlowView && typeof this._FlowView.zoomToFit === 'function') { this._FlowView.zoomToFit(); } }

	// ── flow toolbar custom buttons (background + the host's Edit / Done) ──────
	// The moodboard contributes a Background button (editable only); the host can supply more (an Edit
	// button on a read-only board it owns, a Done button on the editable board) via options.ToolbarButtons.
	_buildToolbarButtons(pEditable)
	{
		let tmpButtons = [];
		if (pEditable)
		{
			tmpButtons.push({ Hash: 'mb-background', Icon: 'background', Tooltip: 'Board background' });
			// Toggles connection points on the selected card(s); Active is kept in sync with the selection
			// by _updateConnectButton so it reads like a checkbox for the current card.
			tmpButtons.push({ Hash: 'mb-connect', Icon: 'connect', Tooltip: 'Connection points on the selected card (C)' });
		}
		let tmpHostButtons = Array.isArray(this.options.ToolbarButtons) ? this.options.ToolbarButtons : [];
		return tmpButtons.concat(tmpHostButtons);
	}

	// Routed from the flow's onToolbarButton hook. Background opens the popover and Connections toggles
	// the selection's points; everything else is a host button, forwarded to options.onToolbarButton.
	onToolbarButton(pHash, pElement)
	{
		if (pHash === 'mb-background') { this.openBackgroundPopover(pElement); return; }
		if (pHash === 'mb-connect') { this.toggleConnectPoints(); return; }
		if (typeof this.options.onToolbarButton === 'function') { this.options.onToolbarButton(pHash, pElement); }
	}

	// Push the current button set onto the flow toolbar and pick its mode for a read-only board. Deferred
	// + polled, since the flow's toolbar sub-view is created asynchronously after the flow renders.
	//
	// Read-only mode: a pure viewer (no host buttons) gets the smallest collapsed toolbar, tucked in the
	// corner and fading in on hover -- out of the way until you reach for it. The owner of the board has
	// an Edit button, so its toolbar stays docked, keeping that one action one click away. An editable
	// board is left in its default (docked) mode so the user can float / collapse it themselves.
	_setupToolbarSoon()
	{
		let tmpSelf = this;
		let tmpTries = 0;
		let fSetup = function ()
		{
			let tmpToolbar = (tmpSelf._FlowView && tmpSelf._FlowView._ToolbarView) ? tmpSelf._FlowView._ToolbarView : null;
			if (!tmpToolbar)
			{
				if (++tmpTries < 90 && typeof requestAnimationFrame === 'function') { requestAnimationFrame(fSetup); }
				return;
			}
			tmpSelf._syncToolbarButtons(tmpToolbar);
			if (!tmpSelf._isEditable() && typeof tmpToolbar._setToolbarMode === 'function')
			{
				let tmpHostButtons = Array.isArray(tmpSelf.options.ToolbarButtons) ? tmpSelf.options.ToolbarButtons : [];
				let tmpDesired = (tmpHostButtons.length === 0) ? 'collapsed' : 'docked';
				if (tmpToolbar._ToolbarMode !== tmpDesired) { tmpToolbar._setToolbarMode(tmpDesired); }
			}
		};
		if (typeof requestAnimationFrame === 'function') { requestAnimationFrame(fSetup); } else { setTimeout(fSetup, 50); }
	}

	// Reconcile the flow toolbar's extra buttons with the current options (the host can change
	// ToolbarButtons per mount -- e.g. an Edit button only on a board the viewer owns). Re-renders the
	// toolbar only when the button set actually changed (by hash), so it does not reset collapsed mode.
	_syncToolbarButtons(pToolbar)
	{
		if (!this._FlowView || !pToolbar) { return; }
		let tmpButtons = this._buildToolbarButtons(this._isEditable());
		let tmpNewKey = tmpButtons.map((pButton) => pButton.Hash).join(',');
		let tmpOldKey = (pToolbar.options.ToolbarExtraButtons || []).map((pButton) => pButton.Hash).join(',');
		if (tmpNewKey === tmpOldKey) { return; }
		this._FlowView.options.ToolbarExtraButtons = tmpButtons;
		pToolbar.options.ToolbarExtraButtons = tmpButtons;
		if (pToolbar._FloatingToolbarView) { pToolbar._FloatingToolbarView.options.ToolbarExtraButtons = tmpButtons; }
		if (typeof pToolbar.render === 'function') { pToolbar.render(); }
	}

	// ── board background ───────────────────────────────────────────────────────
	// Stored on the board's ViewState so it round-trips through the flow's getFlowData / setFlowData
	// (which deep-clones and Object.assign-merges ViewState, preserving extra keys). Painted on the
	// moodboard's own .mb-canvas, so it shows under the cards on both editable and read-only boards.
	_boardBackground()
	{
		if (this._FlowView && this._FlowView.viewState && this._FlowView.viewState.BackgroundColor) { return this._FlowView.viewState.BackgroundColor; }
		if (this._PendingBoard && this._PendingBoard.ViewState && this._PendingBoard.ViewState.BackgroundColor) { return this._PendingBoard.ViewState.BackgroundColor; }
		return '';
	}

	_applyBackground()
	{
		let tmpRoot = document.getElementById('MB-Root-' + this.options.ViewIdentifier);
		if (!tmpRoot) { return; }
		let tmpColor = this._boardBackground() || '';
		// The flow paints an opaque .pict-flow-container (its default canvas gray); the chosen color goes
		// there. Clearing it ('') reverts to that default. .mb-canvas is painted too so the color shows in
		// the brief moment before the flow container mounts.
		let tmpContainer = tmpRoot.querySelector('.pict-flow-container');
		if (tmpContainer) { tmpContainer.style.backgroundColor = tmpColor; }
		let tmpCanvas = tmpRoot.querySelector('.mb-canvas');
		if (tmpCanvas) { tmpCanvas.style.backgroundColor = tmpColor; }
		// The flow's grid-background rect paints over the container; neutralize it so the board color (or
		// the default canvas color) shows. A moodboard is a freeform canvas, not a node graph -- no grid.
		let tmpGrid = tmpRoot.querySelector('.pict-flow-grid-background');
		if (tmpGrid) { tmpGrid.style.fill = 'transparent'; }
	}

	// Paint now and again after the flow settles -- a render can recreate the canvas after the immediate
	// paint, so a deferred second pass makes the background stick regardless of the host's mount timing.
	_applyBackgroundSoon()
	{
		this._applyBackground();
		let tmpSelf = this;
		if (typeof requestAnimationFrame === 'function') { requestAnimationFrame(function () { requestAnimationFrame(function () { tmpSelf._applyBackground(); }); }); }
		else { setTimeout(function () { tmpSelf._applyBackground(); }, 32); }
	}

	// Editable boards only (the toolbar Background button + its popover). An empty string clears it.
	setBackgroundColor(pColor)
	{
		if (!this._FlowView) { return; }
		let tmpColor = (typeof pColor === 'string') ? pColor : '';
		if (this._FlowView.viewState) { this._FlowView.viewState.BackgroundColor = tmpColor; }
		if (this._PendingBoard && this._PendingBoard.ViewState) { this._PendingBoard.ViewState.BackgroundColor = tmpColor; }
		this._applyBackground();
		this._emitChange();
	}

	// The Background toolbar button opens a small popover next to it: the palette swatches, a custom
	// color ("select a color"), and a "no background" option. Click the button again, click outside, or
	// press Escape to dismiss. Positioned with the button's viewport rect (the popover is position:fixed).
	openBackgroundPopover(pAnchor)
	{
		let tmpRoot = document.getElementById('MB-Root-' + this.options.ViewIdentifier);
		let tmpPopover = document.getElementById('MB-BgPopover-' + this.options.ViewIdentifier);
		if (!tmpRoot || !tmpPopover) { return; }
		if (tmpRoot.classList.contains('mb-bgpop-open')) { this.closeBackgroundPopover(); return; }
		tmpPopover.innerHTML = this.pict.parseTemplateByHash('Moodboard-BgPopover', { ViewID: this.options.ViewIdentifier });
		tmpRoot.classList.add('mb-bgpop-open');
		if (pAnchor && typeof pAnchor.getBoundingClientRect === 'function')
		{
			let tmpRect = pAnchor.getBoundingClientRect();
			let tmpViewportWidth = (typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth : 1024;
			let tmpLeft = Math.max(8, Math.min(tmpRect.left, tmpViewportWidth - 184));
			tmpPopover.style.left = tmpLeft + 'px';
			tmpPopover.style.top = (tmpRect.bottom + 6) + 'px';
		}
		this._wireBackgroundDismiss();
	}

	closeBackgroundPopover()
	{
		let tmpRoot = document.getElementById('MB-Root-' + this.options.ViewIdentifier);
		if (tmpRoot) { tmpRoot.classList.remove('mb-bgpop-open'); }
		this._unwireBackgroundDismiss();
	}

	// Outside-click + Escape dismissal for the background popover. Window-level events with no inline
	// equivalent, so addEventListener is the documented exception; torn down on close.
	_wireBackgroundDismiss()
	{
		if (this._BgDismissWired) { return; }
		let tmpSelf = this;
		this._boundBgOutside = this._boundBgOutside || function (pEvent)
		{
			let tmpPopover = document.getElementById('MB-BgPopover-' + tmpSelf.options.ViewIdentifier);
			if (tmpPopover && tmpPopover.contains(pEvent.target)) { return; }
			// The Background toolbar button toggles, so ignore clicks on it here (its onclick closes).
			if (pEvent.target && pEvent.target.closest && pEvent.target.closest('[data-extra-hash="mb-background"]')) { return; }
			tmpSelf.closeBackgroundPopover();
		};
		this._boundBgEsc = this._boundBgEsc || function (pEvent) { if (pEvent.key === 'Escape') { tmpSelf.closeBackgroundPopover(); } };
		// Defer the outside-click wire so the opening click does not immediately dismiss it.
		if (typeof setTimeout === 'function') { setTimeout(function () { if (tmpSelf._BgDismissWired) { document.addEventListener('mousedown', tmpSelf._boundBgOutside); } }, 0); }
		document.addEventListener('keydown', this._boundBgEsc);
		this._BgDismissWired = true;
	}

	_unwireBackgroundDismiss()
	{
		if (!this._BgDismissWired) { return; }
		if (this._boundBgOutside) { document.removeEventListener('mousedown', this._boundBgOutside); }
		if (this._boundBgEsc) { document.removeEventListener('keydown', this._boundBgEsc); }
		this._BgDismissWired = false;
	}

	// A board is editable unless the host opts out with Editable:false (a read-only display: a
	// teammate's profile, a hub thumbnail).
	_isEditable() { return this.options.Editable !== false; }

	_ensureFlowView()
	{
		let tmpID = this.options.ViewIdentifier;
		let tmpContainer = '#MB-Flow-' + tmpID;
		if (!this._FlowView)
		{
			let tmpNodeTypes = {};
			// The connector is registered with Enabled:false: it stays a known node type so older boards
			// with connector nodes still render, but it is hidden from the card palette (edges are drawn
			// between card ports now, opted in from each card's panel).
			[ new libMoodImageCard(this.fable, {}, 'Moodboard-ImageCard'), new libMoodNoteCard(this.fable, {}, 'Moodboard-NoteCard'), new libMoodTextCard(this.fable, {}, 'Moodboard-TextCard'), new libMoodStickerCard(this.fable, {}, 'Moodboard-StickerCard'), new libMoodConnectorCard(this.fable, { Enabled: false }, 'Moodboard-ConnectorCard') ].forEach((pCard) =>
			{
				let tmpConfig = pCard.getNodeTypeConfiguration();
				tmpNodeTypes[tmpConfig.Hash] = tmpConfig;
			});

			// Read-only display (Editable:false) turns off every editing interaction so a board shows as a
			// static picture (a teammate's profile, a hub thumbnail); pan + zoom stay on so a viewer can
			// look around. Editing leaves them all on.
			let tmpEditable = this._isEditable();
			this._FlowView = this.pict.addView('MB-FlowView-' + tmpID,
				{
					ViewIdentifier: 'MB-FlowView-' + tmpID,
					DefaultRenderable: 'Flow-Container',
					DefaultDestinationAddress: tmpContainer,
					AutoRender: false,
					// ONE toolbar -- the flow's own. The card palette ("Cards") is the add path (editable
					// only); delete, zoom, fit, fullscreen, dock/float, and collapse come free. Node-adding
					// (the "Node" button) and layouts stay off; the gear and layout group are hidden in CSS.
					EnableToolbar: true,
					EnableCardPalette: tmpEditable,
					EnableAddNode: false,
					EnableLayoutMenu: false,
					IncludeDefaultNodeTypes: false,
					// A card opts into connection ports from its properties panel; then you drag from one
					// card's port to another's to link them. Links are undirected (any port to any port).
					EnableConnectionCreation: tmpEditable,
					EnableUndirectedConnections: true,
					EnableNodeDragging: tmpEditable,
					EnableNodeResizing: tmpEditable,
					EnablePanning: true,
					EnableZooming: true,
					EnableGridSnap: tmpEditable,
					GridSnapSize: 10,
					// Plain drag pans (a moodboard is a canvas you move around), rather than marquee-select.
					EnableMultiSelect: false,
					EnableAlignmentGuides: tmpEditable,
					NodeTitleBarHeight: 0,
					DefaultNodeType: 'MoodNote',
					NodeTypes: tmpNodeTypes,
					// Double-click a link to style it (color, width, line style, the marker at each end, a label).
					ConnectionPropertiesPanel: _CONNECTION_PANEL,
					// Host-facing toolbar buttons: the moodboard's Background button (editable only) plus
					// whatever the host supplies (Edit / Done). Clicks route through onToolbarButton below.
					ToolbarExtraButtons: this._buildToolbarButtons(tmpEditable),
					onToolbarButton: (pHash, pElement) => this.onToolbarButton(pHash, pElement),
					Renderables: [ { RenderableHash: 'Flow-Container', TemplateHash: 'Flow-Container-Template', DestinationAddress: tmpContainer, RenderMethod: 'replace' } ]
				},
				libPictSectionFlow);
			// addView after the app has booted instantiates the view but does NOT run its initialize
			// lifecycle, so the flow's service managers (_DataManager / _RenderManager) and providers are
			// never wired and the board cannot paint -- it stayed empty until a second, warm visit.
			// Initialize it explicitly (pict-view guards against double-initialize).
			if (typeof this._FlowView.initialize === 'function' && !this._FlowView.initializeTimestamp)
			{
				this._FlowView.initialize();
			}
		}
		this._FlowView.initialRenderComplete = false;
		this._FlowView.render();

		// Apply a board that a host set before the flow existed (see setBoard) -- this is what makes a
		// freshly-mounted board paint its cards on the first render instead of staying empty until a
		// second visit. Deferred until the flow is render-complete.
		if (this._PendingBoard) { this._applyPendingBoard(); }

		// Keep the board to a single open editor (see _keepOnlyPanel) and strip default ports from
		// palette-added content cards (see _onNodeAdded). Wire once, after the flow's services exist.
		if (!this._PanelHandlerWired && this._FlowView._EventHandlerProvider)
		{
			this._FlowView._EventHandlerProvider.registerHandler('onPanelOpened', (pPanelData) => this._keepOnlyPanel(pPanelData ? pPanelData.Hash : null));
			// Structural changes (drag, resize, add, delete) flow through onFlowChanged; re-emit them so a
			// host can autosave. Panel edits that bypass onFlowChanged call _emitChange directly.
			this._FlowView._EventHandlerProvider.registerHandler('onFlowChanged', () => this._emitChange());
			// A card added from the palette gets the flow's default in + out ports; content cards are
			// chrome-less and port-less (only a connector keeps ports), so strip them.
			this._FlowView._EventHandlerProvider.registerHandler('onNodeAdded', (pNode) => this._onNodeAdded(pNode));
			// Keep the toolbar "Connections" button in sync with whichever card is selected.
			this._FlowView._EventHandlerProvider.registerHandler('onNodeSelected', () => this._updateConnectButton());
			// Give a freshly drawn link a sensible default appearance (a thin gray line with an arrow at
			// the finish end) so it looks intentional before anyone opens its panel.
			this._FlowView._EventHandlerProvider.registerHandler('onConnectionCreated', (pConn) => this._onConnectionCreated(pConn));
			this._PanelHandlerWired = true;
		}
	}

	// Strip the flow's default ports from a palette-added content card (a connector keeps its ports).
	_onNodeAdded(pNode)
	{
		if (!pNode || pNode.Type === 'MoodConnector') { return; }
		if (Array.isArray(pNode.Ports) && pNode.Ports.length)
		{
			pNode.Ports = [];
			if (this._FlowView && typeof this._FlowView.renderFlow === 'function') { this._FlowView.renderFlow(); }
		}
	}

	// Notify a host (options.onBoardChanged) that the board changed, handing it the current board so it
	// can persist. Hosts should debounce; this can fire rapidly during a drag.
	_emitChange()
	{
		if (typeof this.options.onBoardChanged === 'function')
		{
			this.options.onBoardChanged(this.getBoard());
		}
	}

	_nextPosition()
	{
		// Cascade new cards from the upper-left of the visible canvas so several adds do not stack.
		let tmpStep = (this._AddCount % 8) * 26;
		this._AddCount++;
		let tmpVS = this._FlowView ? this._FlowView.viewState : { PanX: 0, PanY: 0, Zoom: 1 };
		return { x: (60 - tmpVS.PanX) / tmpVS.Zoom + tmpStep, y: (60 - tmpVS.PanY) / tmpVS.Zoom + tmpStep };
	}

	// A moodboard edits one card at a time. The flow lets several panels stack up (open one per
	// double-click); here we keep only the most recently opened so the board does not fill with
	// editors. Driven by the flow's onPanelOpened event so it covers both adds and double-clicks.
	_keepOnlyPanel(pKeepHash)
	{
		if (this._PanelGuard || !this._FlowView || !this._FlowView.flowData) return;
		this._PanelGuard = true;
		let tmpPanels = (this._FlowView.flowData.OpenPanels || []).slice();
		tmpPanels.forEach((pPanel) => { if (pPanel.Hash !== pKeepHash) { this._FlowView.closePanel(pPanel.Hash); } });
		this._PanelGuard = false;
	}

	setConnectorLabel(pNodeHash, pValue)
	{
		if (!this._FlowView) { return; }
		let tmpNode = this._FlowView.getNode(pNodeHash);
		if (!tmpNode) { return; }
		if (!tmpNode.Data) { tmpNode.Data = {}; }
		tmpNode.Data.Label = pValue;
		let tmpEl = this._cardElement(pNodeHash, '.mb-connector');
		if (tmpEl) { tmpEl.textContent = pValue; }
		this._FlowView.marshalFromView();
		this._emitChange();
	}

	// ---- Adding image cards (drag-and-drop + paste; the palette adds empty cards you fill in a panel) ----

	addImage(pUrl, pMeta)
	{
		if (!this._FlowView || !pUrl) return;
		let tmpMeta = pMeta || {};
		// Register the image with the source so the gallery can show and reuse it (deduped by URL).
		if (this._ImageSource && typeof this._ImageSource.add === 'function')
		{
			this._ImageSource.add(
				{
					Url: pUrl,
					Name: tmpMeta.Name || this._urlName(pUrl),
					Metadata: { Type: tmpMeta.Type || 'image', SizeBytes: tmpMeta.SizeBytes || 0, AddedAt: tmpMeta.AddedAt || Date.now() }
				});
		}
		let tmpPos = this._nextPosition();
		let tmpNode = this._FlowView.addNode('MoodImage', tmpPos.x, tmpPos.y, '', { ImageUrl: pUrl, Fit: 'cover' });
		if (tmpNode)
		{
			tmpNode.Ports = []; // addNode defaults to one In + one Out; a moodboard content card has neither
			this._FlowView.selectNode(tmpNode.Hash);
			this._FlowView.renderFlow();
			this._FlowView.marshalFromView();
		}
		if (this._galleryState().Open) { this._refreshGalleryGrid(); }
	}

	_urlName(pUrl)
	{
		if (!pUrl) return 'image';
		if (pUrl.indexOf('data:') === 0) return 'pasted image';
		let tmpClean = pUrl.split('?')[0].split('#')[0];
		let tmpName = tmpClean.substring(tmpClean.lastIndexOf('/') + 1);
		return tmpName || pUrl;
	}

	addImageFiles(pFileList)
	{
		if (!pFileList) return;
		let tmpFiles = Array.prototype.slice.call(pFileList).filter((pFile) => pFile && pFile.type && pFile.type.indexOf('image/') === 0);
		tmpFiles.forEach((pFile) => this._readFileAsImage(pFile));
	}

	_readFileAsImage(pFile)
	{
		let tmpSelf = this;
		let tmpReader = new FileReader();
		tmpReader.onload = function (pEvent)
		{
			let tmpMeta = { Name: pFile.name, Type: pFile.type || 'image', SizeBytes: pFile.size || 0, AddedAt: Date.now() };
			// A host with an upload hook stores the bytes and hands back a reference; otherwise the
			// base64 data URL goes straight onto the board (and into the built-in source).
			if (tmpSelf._ImageSource && typeof tmpSelf._ImageSource.upload === 'function')
			{
				tmpSelf._ImageSource.upload(pFile, pEvent.target.result, function (pErr, pRef)
				{
					tmpSelf.addImage((pRef && pRef.Url) ? pRef.Url : pEvent.target.result, tmpMeta);
				});
			}
			else
			{
				tmpSelf.addImage(pEvent.target.result, tmpMeta);
			}
		};
		tmpReader.readAsDataURL(pFile);
	}

	// ---- Editing (called from each card's on-graph properties panel) ----
	// The panels carry the real editor (a textarea plus parameters: font size, note color, image fit
	// and URL, a library picker). The card body is a read-only display. These setters write the node
	// data and update the already-rendered card in place. They deliberately do NOT call renderFlow,
	// because a full re-render would also re-render the open panel and drop the textarea's focus
	// mid-keystroke; marshalFromView keeps the persisted board in sync without touching the DOM the user
	// is typing into.

	_cardElement(pNodeHash, pSelector)
	{
		let tmpGroup = document.querySelector('#MB-Flow-' + this.options.ViewIdentifier + ' [data-node-hash="' + pNodeHash + '"]');
		return tmpGroup ? tmpGroup.querySelector(pSelector) : null;
	}

	editText(pNodeHash, pText)
	{
		if (!this._FlowView) return;
		let tmpNode = this._FlowView.getNode(pNodeHash);
		if (!tmpNode) return;
		if (!tmpNode.Data) tmpNode.Data = {};
		tmpNode.Data.Text = pText;
		let tmpField = this._cardElement(pNodeHash, '.mb-note, .mb-text');
		if (tmpField) { tmpField.textContent = pText; }
		this._FlowView.marshalFromView();
		this._emitChange();
	}

	setFontSize(pNodeHash, pValue)
	{
		if (!this._FlowView) return;
		let tmpNode = this._FlowView.getNode(pNodeHash);
		if (!tmpNode) return;
		if (!tmpNode.Data) tmpNode.Data = {};
		let tmpNum = parseInt(pValue, 10);
		if (pValue && !isNaN(tmpNum) && tmpNum > 0)
		{
			tmpNode.Data.FontSize = tmpNum;
			tmpNode.Data.FontSizeCss = tmpNum + 'px';
		}
		else
		{
			// Empty / "Auto" clears the fixed size so the type scales with the card box again.
			tmpNode.Data.FontSize = null;
			tmpNode.Data.FontSizeCss = '';
		}
		let tmpField = this._cardElement(pNodeHash, '.mb-note, .mb-text');
		if (tmpField) { tmpField.style.fontSize = tmpNode.Data.FontSizeCss; }
		this._FlowView.marshalFromView();
		this._emitChange();
	}

	// Curated font controls on note + text cards: family (from _FONT_FAMILIES), weight, and text color.
	// Each stores its value on the node Data and updates the live card element so the change feels
	// immediate, then marshals + emits for autosave (mirrors setNoteColor / setFontSize).
	setFontFamily(pNodeHash, pKey)
	{
		if (!this._FlowView) { return; }
		let tmpNode = this._FlowView.getNode(pNodeHash);
		if (!tmpNode) { return; }
		if (!tmpNode.Data) { tmpNode.Data = {}; }
		let tmpKey = (typeof pKey === 'string') ? pKey : '';
		let tmpStack = _FONT_FAMILIES[tmpKey] || '';
		tmpNode.Data.FontFamily = tmpKey;
		tmpNode.Data.FontFamilyCss = tmpStack;
		let tmpField = this._cardElement(pNodeHash, '.mb-note, .mb-text');
		if (tmpField) { tmpField.style.fontFamily = tmpStack; }
		this._FlowView.marshalFromView();
		this._emitChange();
	}

	setFontWeight(pNodeHash, pValue)
	{
		if (!this._FlowView) { return; }
		let tmpNode = this._FlowView.getNode(pNodeHash);
		if (!tmpNode) { return; }
		if (!tmpNode.Data) { tmpNode.Data = {}; }
		let tmpWeight = parseInt(pValue, 10);
		tmpNode.Data.FontWeight = (pValue && !isNaN(tmpWeight)) ? tmpWeight : '';
		let tmpField = this._cardElement(pNodeHash, '.mb-note, .mb-text');
		if (tmpField) { tmpField.style.fontWeight = tmpNode.Data.FontWeight === '' ? '' : String(tmpNode.Data.FontWeight); }
		this._FlowView.marshalFromView();
		this._emitChange();
	}

	setTextColor(pNodeHash, pColor)
	{
		if (!this._FlowView) { return; }
		let tmpNode = this._FlowView.getNode(pNodeHash);
		if (!tmpNode) { return; }
		if (!tmpNode.Data) { tmpNode.Data = {}; }
		tmpNode.Data.TextColor = (typeof pColor === 'string') ? pColor : '';
		let tmpField = this._cardElement(pNodeHash, '.mb-note, .mb-text');
		if (tmpField) { tmpField.style.color = tmpNode.Data.TextColor; }
		this._FlowView.marshalFromView();
		this._emitChange();
	}

	setNoteColor(pNodeHash, pColor)
	{
		if (!this._FlowView || !pColor) return;
		let tmpNode = this._FlowView.getNode(pNodeHash);
		if (!tmpNode) return;
		if (!tmpNode.Data) tmpNode.Data = {};
		tmpNode.Data.Color = pColor;
		tmpNode.Style = { BodyFill: pColor, TitleBarColor: pColor };
		let tmpBody = this._cardElement(pNodeHash, '.pict-flow-node-body');
		if (tmpBody) { tmpBody.style.fill = pColor; }
		this._FlowView.marshalFromView();
		this._emitChange();
	}

	setFit(pNodeHash, pFit)
	{
		if (!this._FlowView) return;
		let tmpNode = this._FlowView.getNode(pNodeHash);
		if (!tmpNode) return;
		if (!tmpNode.Data) tmpNode.Data = {};
		tmpNode.Data.Fit = (pFit === 'contain') ? 'contain' : 'cover';
		let tmpImg = this._cardElement(pNodeHash, '.mb-image');
		if (tmpImg) { tmpImg.className = 'mb-image mb-image-' + tmpNode.Data.Fit; }
		this._FlowView.marshalFromView();
		this._emitChange();
	}

	setImageUrl(pNodeHash, pUrl)
	{
		if (!this._FlowView) return;
		let tmpNode = this._FlowView.getNode(pNodeHash);
		if (!tmpNode) return;
		if (!tmpNode.Data) tmpNode.Data = {};
		tmpNode.Data.ImageUrl = pUrl;
		let tmpImg = this._cardElement(pNodeHash, '.mb-image');
		if (tmpImg) { tmpImg.setAttribute('src', pUrl || ''); }
		this._FlowView.marshalFromView();
		this._emitChange();
	}

	setStickerUrl(pNodeHash, pUrl)
	{
		if (!this._FlowView) { return; }
		let tmpNode = this._FlowView.getNode(pNodeHash);
		if (!tmpNode) { return; }
		if (!tmpNode.Data) { tmpNode.Data = {}; }
		tmpNode.Data.StickerUrl = pUrl;
		let tmpImg = this._cardElement(pNodeHash, '.mb-sticker');
		if (tmpImg) { tmpImg.setAttribute('src', pUrl || ''); }
		this._FlowView.marshalFromView();
		this._emitChange();
	}

	// Rotation is a node-level property (the flow renderer rotates the whole card group about its
	// center). Update the group's transform in place so the slider feels live without a re-render.
	setRotation(pNodeHash, pValue)
	{
		if (!this._FlowView) return;
		let tmpNode = this._FlowView.getNode(pNodeHash);
		if (!tmpNode) return;
		let tmpDeg = parseInt(pValue, 10);
		tmpNode.Rotation = isNaN(tmpDeg) ? 0 : tmpDeg;
		let tmpGroup = document.querySelector('#MB-Flow-' + this.options.ViewIdentifier + ' [data-node-hash="' + pNodeHash + '"]');
		if (tmpGroup)
		{
			let tmpW = (typeof tmpNode.Width === 'number') ? tmpNode.Width : 200;
			let tmpH = (typeof tmpNode.Height === 'number') ? tmpNode.Height : 160;
			let tmpTransform = 'translate(' + tmpNode.X + ', ' + tmpNode.Y + ')';
			if (tmpNode.Rotation) { tmpTransform += ' rotate(' + tmpNode.Rotation + ' ' + (tmpW / 2) + ' ' + (tmpH / 2) + ')'; }
			tmpGroup.setAttribute('transform', tmpTransform);
		}
		this._FlowView.marshalFromView();
		this._emitChange();
	}

	// A card's connection points have three states (set from its panel or, on/off, from the toolbar
	// button + the "c" hotkey): 'off' (no anchors), 'edit' (twelve anchors shown while editing -- the
	// default), and 'always' (anchors shown to viewers too, via the node's NodeClass). When on, the card
	// shows twelve dots you drag between to link cards. Turning it off drops the anchors and any links
	// that used them. The Data.Connect*Sel strings are what the panel <select> binds its current option
	// to, so reopening the panel reflects the state.
	setConnectMode(pNodeHash, pMode)
	{
		if (!this._FlowView) { return; }
		let tmpNode = this._FlowView.getNode(pNodeHash);
		if (!tmpNode) { return; }
		if (!tmpNode.Data) { tmpNode.Data = {}; }
		let tmpMode = (pMode === 'always') ? 'always' : ((pMode === 'off') ? 'off' : 'edit');
		if (tmpMode === 'off')
		{
			tmpNode.Ports = [];
			tmpNode.NodeClass = '';
			// Drop any links that touched this node (their anchors are gone).
			if (this._FlowView.flowData && Array.isArray(this._FlowView.flowData.Connections))
			{
				this._FlowView.flowData.Connections = this._FlowView.flowData.Connections.filter((pConn) => pConn.SourceNodeHash !== pNodeHash && pConn.TargetNodeHash !== pNodeHash);
			}
		}
		else
		{
			let tmpSelf = this;
			tmpNode.Ports = _CONNECT_SIDES.map((pSide) => ({ Hash: 'mbport-' + pSide + '-' + tmpSelf.fable.getUUID(), Direction: 'output', Side: pSide, Label: '' }));
			// 'always' stamps a class so the dots stay visible on a read-only board (see the CSS).
			tmpNode.NodeClass = (tmpMode === 'always') ? 'mb-conn-always' : '';
		}
		tmpNode.Data.ConnectMode = tmpMode;
		tmpNode.Data.ConnectOffSel = (tmpMode === 'off') ? 'selected' : '';
		tmpNode.Data.ConnectEditSel = (tmpMode === 'edit') ? 'selected' : '';
		tmpNode.Data.ConnectAlwaysSel = (tmpMode === 'always') ? 'selected' : '';
		this._FlowView.renderFlow();
		this._FlowView.marshalFromView();
		this._updateConnectButton();
		this._emitChange();
	}

	// The toolbar "Connections" button + the "c" hotkey flip the selected card(s) between off and the
	// default on-state (edit). 'always' is only reachable from the panel select. Toggling several at once
	// turns them all on if any is off, otherwise all off.
	toggleConnectPoints()
	{
		if (!this._FlowView || !this._isEditable()) { return; }
		let tmpHashes = this._selectedHashes();
		if (tmpHashes.length === 0)
		{
			this._toast('Select a card first to toggle its connection points.');
			return;
		}
		let tmpSelf = this;
		let tmpAnyOff = tmpHashes.some((pHash) =>
		{
			let tmpNode = tmpSelf._FlowView.getNode(pHash);
			return !tmpNode || !tmpNode.Data || !tmpNode.Data.ConnectMode || tmpNode.Data.ConnectMode === 'off';
		});
		let tmpTarget = tmpAnyOff ? 'edit' : 'off';
		tmpHashes.forEach((pHash) => this.setConnectMode(pHash, tmpTarget));
	}

	// The current selection as an array of node hashes (the flow's multi-select set, or the single one).
	_selectedHashes()
	{
		if (this._FlowView && typeof this._FlowView.getSelectedNodeHashes === 'function')
		{
			let tmpSet = this._FlowView.getSelectedNodeHashes();
			if (tmpSet && tmpSet.length) { return tmpSet; }
		}
		let tmpPrimary = (this._FlowView && this._FlowView.viewState) ? this._FlowView.viewState.SelectedNodeHash : null;
		return tmpPrimary ? [tmpPrimary] : [];
	}

	// Reflect the selected card's connection state on the toolbar "Connections" button (pressed when the
	// selection has points on), so the toolbar control reads like a checkbox for the current card.
	_updateConnectButton()
	{
		if (!this._FlowView || !this._FlowView._ToolbarView) { return; }
		let tmpButtons = this._FlowView.options.ToolbarExtraButtons || [];
		let tmpButton = tmpButtons.find((pButton) => pButton.Hash === 'mb-connect');
		if (!tmpButton) { return; }
		let tmpSelf = this;
		let tmpActive = this._selectedHashes().some((pHash) =>
		{
			let tmpNode = tmpSelf._FlowView.getNode(pHash);
			return tmpNode && tmpNode.Data && tmpNode.Data.ConnectMode && tmpNode.Data.ConnectMode !== 'off';
		});
		if (tmpButton.Active === tmpActive) { return; }
		tmpButton.Active = tmpActive;
		if (typeof this._FlowView._ToolbarView.render === 'function') { this._FlowView._ToolbarView.render(); }
		if (this._FlowView._ToolbarView._FloatingToolbarView && typeof this._FlowView._ToolbarView._FloatingToolbarView.render === 'function') { this._FlowView._ToolbarView._FloatingToolbarView.render(); }
	}

	// A non-blocking toast via the host's pict-section-modal, if present (absent in the stand-alone demo).
	_toast(pMessage)
	{
		let tmpModal = this.pict.views['Pict-Section-Modal'];
		if (tmpModal && typeof tmpModal.toast === 'function') { tmpModal.toast(pMessage, { type: 'info' }); }
	}

	// ── connection (link) appearance ────────────────────────────────────────────
	// A new link gets a sensible default look so it reads as intentional; double-clicking it opens the
	// connection panel to change color / width / line style / the marker at each end / a label.

	_onConnectionCreated(pConnection)
	{
		if (!pConnection || typeof pConnection !== 'object' || !this._FlowView) { return; }
		if (!pConnection.Data) { pConnection.Data = {}; }
		// Already styled (e.g. a link loaded from a saved board) -- leave it alone.
		if (typeof pConnection.Data.TargetMarker !== 'undefined') { return; }
		pConnection.Data.StrokeColor = '#5b6376';
		pConnection.Data.StrokeWidth = 2;
		pConnection.Data.StrokeStyle = 'solid';
		pConnection.Data.SourceMarker = 'none';
		pConnection.Data.TargetMarker = 'arrow';
		pConnection.Data.Label = '';
		this._stampConnectionSelects(pConnection.Data);
		this._FlowView.renderFlow();
		this._FlowView.marshalFromView();
		this._emitChange();
	}

	// Find a connection by hash, mutate its Data, refresh its panel-select bindings, and re-render.
	_updateConnection(pConnectionHash, pMutate)
	{
		if (!this._FlowView || !this._FlowView.flowData) { return; }
		let tmpConnection = (this._FlowView.flowData.Connections || []).find((pConn) => pConn.Hash === pConnectionHash);
		if (!tmpConnection) { return; }
		if (!tmpConnection.Data) { tmpConnection.Data = {}; }
		pMutate(tmpConnection.Data);
		this._stampConnectionSelects(tmpConnection.Data);
		this._FlowView.renderFlow();
		this._FlowView.marshalFromView();
		this._emitChange();
	}

	// Keep the 'selected' strings the connection panel <select>s bind to in step with the Data values.
	_stampConnectionSelects(pData)
	{
		pData.StyleSolidSel = (pData.StrokeStyle === 'solid') ? 'selected' : '';
		pData.StyleDashedSel = (pData.StrokeStyle === 'dashed') ? 'selected' : '';
		pData.StyleDottedSel = (pData.StrokeStyle === 'dotted') ? 'selected' : '';
		let fStampMarker = function (pValue, pPrefix)
		{
			pData[pPrefix + 'NoneSel'] = (pValue === 'none') ? 'selected' : '';
			pData[pPrefix + 'ArrowSel'] = (pValue === 'arrow') ? 'selected' : '';
			pData[pPrefix + 'DotSel'] = (pValue === 'dot') ? 'selected' : '';
			pData[pPrefix + 'SquareSel'] = (pValue === 'square') ? 'selected' : '';
		};
		fStampMarker(pData.SourceMarker, 'Src');
		fStampMarker(pData.TargetMarker, 'Tgt');
	}

	setConnectionColor(pConnectionHash, pColor) { this._updateConnection(pConnectionHash, (pData) => { pData.StrokeColor = pColor; }); }
	setConnectionWidth(pConnectionHash, pWidth) { this._updateConnection(pConnectionHash, (pData) => { let tmpNum = parseInt(pWidth, 10); pData.StrokeWidth = (!isNaN(tmpNum) && tmpNum > 0) ? tmpNum : 2; }); }
	setConnectionLineStyle(pConnectionHash, pStyle) { this._updateConnection(pConnectionHash, (pData) => { pData.StrokeStyle = (pStyle === 'dashed' || pStyle === 'dotted') ? pStyle : 'solid'; }); }
	setConnectionSourceMarker(pConnectionHash, pMarker) { this._updateConnection(pConnectionHash, (pData) => { pData.SourceMarker = pMarker; }); }
	setConnectionTargetMarker(pConnectionHash, pMarker) { this._updateConnection(pConnectionHash, (pData) => { pData.TargetMarker = pMarker; }); }

	// The label updates in place (no full re-render) so typing keeps the panel input's focus; the empty
	// label element is always rendered for a styled link, so it exists to update.
	setConnectionLabel(pConnectionHash, pLabel)
	{
		if (!this._FlowView || !this._FlowView.flowData) { return; }
		let tmpConnection = (this._FlowView.flowData.Connections || []).find((pConn) => pConn.Hash === pConnectionHash);
		if (!tmpConnection) { return; }
		if (!tmpConnection.Data) { tmpConnection.Data = {}; }
		tmpConnection.Data.Label = pLabel;
		let tmpLabelEl = document.querySelector('#MB-Flow-' + this.options.ViewIdentifier + ' .pict-flow-connection-label[data-connection-hash="' + pConnectionHash + '"]');
		if (tmpLabelEl) { tmpLabelEl.textContent = pLabel; }
		this._FlowView.marshalFromView();
		this._emitChange();
	}

	// ---- Drag-and-drop + paste (add new image cards) ----

	onDragOver(pEvent)
	{
		if (!this._isEditable()) { return; }
		pEvent.preventDefault();
		let tmpCanvas = document.getElementById('MB-Canvas-' + this.options.ViewIdentifier);
		if (tmpCanvas) tmpCanvas.classList.add('mb-dropping');
	}

	onDragLeave(pEvent)
	{
		let tmpCanvas = document.getElementById('MB-Canvas-' + this.options.ViewIdentifier);
		if (tmpCanvas) tmpCanvas.classList.remove('mb-dropping');
	}

	onDrop(pEvent)
	{
		if (!this._isEditable()) { return; }
		pEvent.preventDefault();
		let tmpCanvas = document.getElementById('MB-Canvas-' + this.options.ViewIdentifier);
		if (tmpCanvas) tmpCanvas.classList.remove('mb-dropping');

		let tmpData = pEvent.dataTransfer;
		if (!tmpData) return;
		if (tmpData.files && tmpData.files.length > 0)
		{
			this.addImageFiles(tmpData.files);
			return;
		}
		// A dragged image or link from another page arrives as a URL.
		let tmpUrl = tmpData.getData('text/uri-list') || tmpData.getData('text/plain');
		if (tmpUrl && /^https?:\/\//i.test(tmpUrl.trim())) { this.addImage(tmpUrl.trim()); }
	}

	_onPaste(pEvent)
	{
		// Only act when this moodboard is on screen and editable.
		if (!this._isEditable()) { return; }
		if (!document.getElementById('MB-Root-' + this.options.ViewIdentifier)) return;
		let tmpItems = (pEvent.clipboardData && pEvent.clipboardData.items) ? pEvent.clipboardData.items : null;
		if (!tmpItems) return;
		for (let i = 0; i < tmpItems.length; i++)
		{
			let tmpItem = tmpItems[i];
			if (tmpItem.type && tmpItem.type.indexOf('image/') === 0)
			{
				let tmpFile = tmpItem.getAsFile();
				if (tmpFile) { this._readFileAsImage(tmpFile); pEvent.preventDefault(); }
			}
		}
	}

	// ---- Library picker (opened from an Image / Sticker card's properties panel) ----
	// The picker builds itself from whatever fields the source declares (getFields), so a host source
	// with custom metadata gets custom filter/sort controls for free. Search is re-applied to the grid
	// only (the controls are not re-rendered) so the search box keeps focus while typing.

	_galleryState()
	{
		let tmpMb = this.pict.AppData.Moodboard;
		if (!tmpMb.Gallery)
		{
			tmpMb.Gallery = { Open: false, Mode: 'image', Title: 'Image gallery', SearchPlaceholder: 'Search images', EmptyMessage: '', UploadAccept: 'image/*', Query: { Search: '', Filters: {}, Sort: { Field: null, Direction: 'asc' } }, SortDirLabel: 'Asc', FilterFields: [], SortFields: [], Items: [], EmptySlot: [{}] };
		}
		return tmpMb.Gallery;
	}

	_activeGallerySource() { return (this._galleryState().Mode === 'sticker') ? this._StickerSource : this._ImageSource; }

	// Open the picker for a specific card: a pick (or an upload) sets the chosen image / sticker onto
	// THIS node, rather than adding a new card. Called from the Image / Sticker properties panels.
	openPickerForCard(pNodeHash, pMode)
	{
		this._PickerTargetHash = pNodeHash;
		this.openGallery(pMode);
	}

	openGallery(pMode)
	{
		let tmpGallery = this._galleryState();
		let tmpMode = (pMode === 'sticker') ? 'sticker' : 'image';
		tmpGallery.Open = true;
		tmpGallery.Mode = tmpMode;
		tmpGallery.Title = (tmpMode === 'sticker') ? 'Stickers' : 'Image gallery';
		tmpGallery.SearchPlaceholder = (tmpMode === 'sticker') ? 'Search stickers' : 'Search images';
		tmpGallery.EmptyMessage = (tmpMode === 'sticker')
			? 'No stickers here yet. Upload a PNG or SVG and it shows up here to reuse.'
			: 'No images here yet. Upload a file (or drop / paste one on the board) and it shows up here to reuse.';
		tmpGallery.UploadAccept = (tmpMode === 'sticker') ? 'image/svg+xml,image/png' : 'image/*';
		// Fresh query each open so a search / filter from the other mode does not leak across.
		tmpGallery.Query = { Search: '', Filters: {}, Sort: { Field: null, Direction: 'asc' } };
		tmpGallery.SortDirLabel = 'Asc';

		let tmpSource = this._activeGallerySource();
		let tmpFields = (tmpSource && tmpSource.getFields) ? tmpSource.getFields() : [];
		tmpGallery.FilterFields = tmpFields.filter((pField) => pField.Filterable).map((pField) =>
			({ Key: pField.Key, Label: pField.Label, Options: (tmpSource.getFilterOptions ? tmpSource.getFilterOptions(pField.Key) : []).map((pValue) => ({ Value: pValue })) }));
		tmpGallery.SortFields = tmpFields.filter((pField) => pField.Sortable).map((pField) => ({ Key: pField.Key, Label: pField.Label }));

		this.pict.ContentAssignment.assignContent('#MB-Gallery-' + this.options.ViewIdentifier, this.pict.parseTemplateByHash('Moodboard-Gallery', { ViewID: this.options.ViewIdentifier }));
		let tmpRoot = document.getElementById('MB-Root-' + this.options.ViewIdentifier);
		if (tmpRoot) { tmpRoot.classList.add('mb-gallery-open'); tmpRoot.classList.toggle('mb-gallery-mode-sticker', tmpMode === 'sticker'); }
		this._refreshGalleryGrid();
	}

	closeGallery()
	{
		this._galleryState().Open = false;
		this._PickerTargetHash = null;
		let tmpRoot = document.getElementById('MB-Root-' + this.options.ViewIdentifier);
		if (tmpRoot) { tmpRoot.classList.remove('mb-gallery-open'); }
	}

	_refreshGalleryGrid()
	{
		let tmpGallery = this._galleryState();
		// list() may return an array (the built-in base source) or a Promise (a host source backed by a
		// remote store); Promise.resolve handles both, so a remote gallery renders the same way.
		let tmpSource = this._activeGallerySource();
		let tmpResult = (tmpSource && tmpSource.list) ? tmpSource.list(tmpGallery.Query) : [];
		Promise.resolve(tmpResult).then((pItems) =>
		{
			let tmpItems = Array.isArray(pItems) ? pItems : [];
			tmpGallery.Items = tmpItems;
			tmpGallery.EmptySlot = tmpItems.length ? [] : [{}];
			this.pict.ContentAssignment.assignContent('#MB-Gallery-Grid-' + this.options.ViewIdentifier, this.pict.parseTemplateByHash('Moodboard-Gallery-Grid', { ViewID: this.options.ViewIdentifier }));
		});
	}

	onGallerySearch(pValue) { this._galleryState().Query.Search = pValue || ''; this._refreshGalleryGrid(); }
	onGalleryFilter(pKey, pValue) { this._galleryState().Query.Filters[pKey] = pValue; this._refreshGalleryGrid(); }
	onGallerySort(pField) { this._galleryState().Query.Sort.Field = pField || null; this._refreshGalleryGrid(); }

	onGallerySortDir()
	{
		let tmpGallery = this._galleryState();
		tmpGallery.Query.Sort.Direction = (tmpGallery.Query.Sort.Direction === 'asc') ? 'desc' : 'asc';
		tmpGallery.SortDirLabel = (tmpGallery.Query.Sort.Direction === 'asc') ? 'Asc' : 'Desc';
		let tmpBtn = document.querySelector('#MB-Gallery-' + this.options.ViewIdentifier + ' .mb-gallery-dir');
		if (tmpBtn) { tmpBtn.textContent = tmpGallery.SortDirLabel; }
		this._refreshGalleryGrid();
	}

	// Pick an item: set it onto the card whose panel opened the picker. (With no target -- the
	// stand-alone demo -- fall back to adding a new card.)
	pickFromGallery(pId)
	{
		let tmpGallery = this._galleryState();
		let tmpItem = (tmpGallery.Items || []).find((pItem) => pItem.Id === pId);
		if (!tmpItem) { return; }
		if (this._PickerTargetHash)
		{
			if (tmpGallery.Mode === 'sticker') { this.setStickerUrl(this._PickerTargetHash, tmpItem.Url); }
			else { this.setImageUrl(this._PickerTargetHash, tmpItem.Url); }
			this.closeGallery();
			return;
		}
		if (tmpGallery.Mode === 'sticker') { this._addStickerCard(tmpItem.Url, Object.assign({ Name: tmpItem.Name }, tmpItem.Metadata)); }
		else { this.addImage(tmpItem.Url, Object.assign({ Name: tmpItem.Name }, tmpItem.Metadata)); }
	}

	// Upload from the picker's own button. With a target card, store the bytes (via the source, if any),
	// register it in the library for reuse, and set it onto the target. With no target, add a new card.
	uploadToGallery(pFileList)
	{
		let tmpMode = this._galleryState().Mode;
		let tmpTarget = this._PickerTargetHash;
		if (!tmpTarget)
		{
			if (tmpMode === 'sticker') { this._addStickerFiles(pFileList); } else { this.addImageFiles(pFileList); }
			return;
		}
		let tmpFile = pFileList && pFileList[0];
		if (!tmpFile) { return; }
		let tmpSelf = this;
		let tmpSource = (tmpMode === 'sticker') ? this._StickerSource : this._ImageSource;
		let tmpReader = new FileReader();
		tmpReader.onload = function (pEvent)
		{
			let tmpMeta = { Name: tmpFile.name, Type: tmpFile.type || tmpMode, SizeBytes: tmpFile.size || 0, AddedAt: Date.now() };
			let fAssign = function (pUrl)
			{
				if (tmpSource && typeof tmpSource.add === 'function') { tmpSource.add({ Url: pUrl, Name: tmpMeta.Name, Metadata: { Type: tmpMeta.Type, SizeBytes: tmpMeta.SizeBytes, AddedAt: tmpMeta.AddedAt } }); }
				if (tmpMode === 'sticker') { tmpSelf.setStickerUrl(tmpTarget, pUrl); } else { tmpSelf.setImageUrl(tmpTarget, pUrl); }
				tmpSelf.closeGallery();
			};
			if (tmpSource && typeof tmpSource.upload === 'function')
			{
				tmpSource.upload(tmpFile, pEvent.target.result, function (pErr, pRef) { if (pErr) { return; } fAssign((pRef && pRef.Url) ? pRef.Url : pEvent.target.result); });
			}
			else { fAssign(pEvent.target.result); }
		};
		tmpReader.readAsDataURL(tmpFile);
	}

	// Stand-alone fallbacks (no host, no target): add a new sticker card from a URL or file. The primary
	// path is the palette (an empty sticker card) + the panel picker; these keep the demo self-contained.
	_addStickerCard(pUrl, pMeta)
	{
		if (!this._FlowView || !pUrl) { return; }
		let tmpMeta = pMeta || {};
		if (this._StickerSource && typeof this._StickerSource.add === 'function')
		{
			this._StickerSource.add({ Url: pUrl, Name: tmpMeta.Name || this._urlName(pUrl), Metadata: { Type: tmpMeta.Type || 'sticker', SizeBytes: tmpMeta.SizeBytes || 0, AddedAt: tmpMeta.AddedAt || Date.now() } });
		}
		let tmpPos = this._nextPosition();
		let tmpNode = this._FlowView.addNode('MoodSticker', tmpPos.x, tmpPos.y, '', { StickerUrl: pUrl });
		if (tmpNode)
		{
			tmpNode.Ports = [];
			this._FlowView.selectNode(tmpNode.Hash);
			this._FlowView.renderFlow();
			this._FlowView.marshalFromView();
		}
		if (this._galleryState().Open) { this._refreshGalleryGrid(); }
	}

	_addStickerFiles(pFileList)
	{
		if (!pFileList) { return; }
		// Stickers are cutouts: PNG (transparency) or SVG. Other image types are ignored.
		let tmpFiles = Array.prototype.slice.call(pFileList).filter((pFile) => pFile && pFile.type && (pFile.type === 'image/png' || pFile.type === 'image/svg+xml'));
		let tmpSelf = this;
		tmpFiles.forEach(function (pFile)
		{
			let tmpReader = new FileReader();
			tmpReader.onload = function (pEvent)
			{
				let tmpMeta = { Name: pFile.name, Type: pFile.type || 'sticker', SizeBytes: pFile.size || 0, AddedAt: Date.now() };
				if (tmpSelf._StickerSource && typeof tmpSelf._StickerSource.upload === 'function')
				{
					tmpSelf._StickerSource.upload(pFile, pEvent.target.result, function (pErr, pRef) { if (pErr) { return; } tmpSelf._addStickerCard((pRef && pRef.Url) ? pRef.Url : pEvent.target.result, tmpMeta); });
				}
				else { tmpSelf._addStickerCard(pEvent.target.result, tmpMeta); }
			};
			tmpReader.readAsDataURL(pFile);
		});
	}

	// ---- Persistence ----

	getBoard()
	{
		if (!this._FlowView) { return { Nodes: [], Connections: [], ViewState: { PanX: 0, PanY: 0, Zoom: 1 } }; }
		let tmpBoard = this._FlowView.getFlowData();
		// A saved board is content (cards + viewport), not transient editor state: drop any open
		// properties panels so reopening a board does not restore a clutter of editors.
		if (tmpBoard && tmpBoard.OpenPanels) { tmpBoard = Object.assign({}, tmpBoard, { OpenPanels: [] }); }
		return tmpBoard;
	}

	setBoard(pBoard)
	{
		if (!pBoard) { return; }
		// The flow sub-view is built in onAfterRender (_ensureFlowView), and its data manager is an
		// injected SERVICE that wires up asynchronously after addView -- so the flow can report
		// initialRenderComplete while _DataManager (what setFlowData needs) is still null. A host
		// typically calls setBoard right after render(), before that service exists, so the board stayed
		// empty until a second, warm visit. Stash the board and apply it the moment _DataManager is ready.
		this._PendingBoard = pBoard;
		if (this._FlowView && this._FlowView._DataManager && this._FlowView.initialRenderComplete)
		{
			this._PendingBoard = null;
			this._FlowView.setFlowData(pBoard);
			this._FlowView.renderFlow();
			this._applyBackgroundSoon();
			this._fitSoon();
			return;
		}
		if (this._FlowView) { this._applyPendingBoard(); }
	}

	// Fit the board's content into view on mount (both modes) so nothing is clipped and you never land
	// zoomed in hard. Deferred a couple of frames so the canvas has its final size.
	_fitSoon()
	{
		let tmpSelf = this;
		let fFit = function () { tmpSelf.fitBoard(); };
		if (typeof requestAnimationFrame === 'function') { requestAnimationFrame(function () { requestAnimationFrame(fFit); }); }
		else { setTimeout(fFit, 32); }
	}

	// Apply a board stashed by setBoard once the flow's data-manager service is wired. Polls a bounded
	// number of animation frames (the service injection lags the flow's render).
	_applyPendingBoard()
	{
		if (!this._PendingBoard || !this._FlowView) { return; }
		let tmpSelf = this;
		let tmpTries = 0;
		let fApply = function ()
		{
			if (!tmpSelf._PendingBoard || !tmpSelf._FlowView) { return; }
			if (tmpSelf._FlowView._DataManager && tmpSelf._FlowView.initialRenderComplete)
			{
				let tmpBoard = tmpSelf._PendingBoard;
				tmpSelf._PendingBoard = null;
				try { tmpSelf._FlowView.setFlowData(tmpBoard); tmpSelf._FlowView.renderFlow(); tmpSelf._applyBackgroundSoon(); tmpSelf._fitSoon(); }
				catch (pErr) { /* flow torn down mid-flight */ }
				return;
			}
			if (++tmpTries < 120)
			{
				if (typeof requestAnimationFrame === 'function') { requestAnimationFrame(fApply); }
				else { setTimeout(fApply, 16); }
			}
		};
		if (typeof requestAnimationFrame === 'function') { requestAnimationFrame(fApply); }
		else { setTimeout(fApply, 16); }
	}

	onBeforeUnload()
	{
		if (this._PasteWired)
		{
			document.removeEventListener('paste', this._boundOnPaste);
			this._PasteWired = false;
		}
		if (this._ConnectKeyWired && this._boundOnConnectKey)
		{
			document.removeEventListener('keydown', this._boundOnConnectKey);
			this._ConnectKeyWired = false;
		}
		this._unwireBackgroundDismiss();
	}
}

module.exports = PictViewMoodboard;
module.exports.default_configuration = _ViewConfiguration;
module.exports.NOTE_COLORS = _NOTE_COLORS;
