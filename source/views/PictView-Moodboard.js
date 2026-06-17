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
// A custom-color input and a "no background" option sit beside them in the gear Appearance section.
const _BACKGROUND_COLORS = ['#ffffff', '#faf7f2', '#f1f5f9', '#eef2ff', '#ecfdf5', '#fef2f2', '#fdf4ff', '#111827'];

// The display modes, shown in the toolbar's display-mode dropdown (one button whose icon is the current
// mode; the menu lists these with an icon + label). Add a mode here and it appears in the menu -- the
// toolbar stays one button, not one-per-mode. Each Icon is a flow icon key.
const _DISPLAY_MODES =
[
	{ Key: 'canvas', Label: 'Canvas', Hint: 'Plain free-form board', Icon: 'display-canvas' },
	{ Key: 'jumbotron', Label: 'Jumbotron', Hint: 'Hero band at the top', Icon: 'display-jumbotron' },
	{ Key: 'background', Label: 'Background', Hint: 'Full-width backdrop', Icon: 'display-background' }
];
function _displayMode(pKey) { return _DISPLAY_MODES.find((pMode) => pMode.Key === pKey) || _DISPLAY_MODES[0]; }

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
	<label class="mbp-label">Curve</label>
	<select class="mbp-input" onchange="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].setConnectionCurve('{~D:Record.Hash~}', this.value)">
		<option value="Bezier" {~D:Record.Data.CurveBezierSel~}>Curved</option>
		<option value="Orthogonal" {~D:Record.Data.CurveElbowSel~}>Elbow</option>
		<option value="Straight" {~D:Record.Data.CurveStraightSel~}>Straight</option>
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
		/* The gear (settings) popup holds the moodboard's Appearance section (board color + backdrop margin)
		   in edit mode; hide it only on a read-only board (a viewer changes nothing). */
		.mb-readonly [data-flow-action="settings-popup"] { display: none; }
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
		/* The dashed view-area frame is an editing guide (the box jumbotron / background fit the width
		   of); hide it on any read-only board so a viewer never sees the guide. The frame DATA still
		   drives the width-fit -- only the rect is hidden. */
		.mb-readonly .pict-flow-frame { display: none; }
		/* A selected card keeps its selection glow + stroke in the flow's chrome; on a read-only board a
		   viewer should not see that editing affordance (e.g. a card that was selected when the board was
		   saved). Suppress the selection chrome so the display reads as finished content. */
		.mb-readonly .pict-flow-node.selected { filter: none; }
		.mb-readonly .pict-flow-node.selected .pict-flow-node-body { stroke: none; stroke-width: 0; }

		/* Presentation display styles (jumbotron / background): a read-only, width-fit hero band or
		   full-width backdrop. The host owns the chrome (a style picker outside the board), so hide the
		   flow's own toolbar entirely, and present a plain (non-grab) cursor since the surface is fixed
		   width-fit, not freely pannable -- a tall background scrolls the page. */
		.mb-presentation .pict-flow-toolbar,
		.mb-presentation .pict-flow-floating-toolbar,
		.mb-presentation .pict-flow-toolbar-collapsed { display: none; }
		/* ...but once expanded to full screen, bring the docked toolbar back so its fullscreen button is
		   the way back OUT (a presentation board has no other chrome; the host Expand control is behind the
		   fullscreen overlay). The .pict-flow-fullscreen wrapper class is an ancestor of the toolbar, so
		   this more-specific rule wins over the hide above. */
		.mb-presentation .pict-flow-fullscreen .pict-flow-toolbar { display: flex; }
		.mb-presentation .mb-canvas { cursor: default; }
		/* A jumbotron clips to its band height; a background fills its host container. The host sizes the
		   .mb-canvas (the band / backdrop height) -- the board fits the frame WIDTH inside it. */

		/* Appearance controls (board color + backdrop margin) live in the flow toolbar's own gear popup via
		   the SettingsSections hook -- no bespoke box. These tune the controls inside that native popup. */
		.mb-gear-field { display: flex; flex-direction: column; gap: 5px; margin: 2px 0; }
		.mb-gear-sub { font-size: 11px; color: var(--theme-color-text-secondary, #5b6376); }
		.mb-gear-swatches { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
		.mb-gear-swatch { width: 20px; height: 20px; border-radius: 5px; border: 1px solid rgba(0,0,0,0.15); cursor: pointer; padding: 0; }
		.mb-gear-swatch:hover { transform: scale(1.1); }
		.mb-gear-color { width: 22px; height: 22px; padding: 0; border: 1px solid rgba(0,0,0,0.15); border-radius: 5px; background: none; cursor: pointer; }
		.mb-gear-none { position: relative; background: var(--theme-color-background-panel, #fff); }
		.mb-gear-none::after { content: ""; position: absolute; left: 2px; right: 2px; top: 50%; height: 2px; margin-top: -1px; background: #e23b4b; transform: rotate(-45deg); }
		.mb-gear-margin { width: 70px; padding: 4px 6px; border: 1px solid var(--theme-color-border-default, #d8dde6); border-radius: 5px; font-size: 12px; background: var(--theme-color-background-panel, #fff); color: var(--theme-color-text-primary, #2c3140); }

		/* Display-mode dropdown: one toolbar button opens this list of modes. Reuses the flow toolbar's own
		   popup + list-item classes (so it matches the Cards / Layout menus); these just add the per-row
		   hint line and the current-mode mark. */
		.mb-display-menu { min-width: 234px; }
		.mb-display-menu .pict-flow-popup-list-item-label { display: flex; flex-direction: column; line-height: 1.25; font-weight: 600; }
		.mb-display-menu-hint { font-size: 11px; font-weight: 400; color: var(--theme-color-text-secondary, #8a93a5); }
		.mb-display-menu-current { background: var(--theme-color-background-secondary, #eef2f7); }
		.mb-display-menu-current .pict-flow-popup-list-item-icon { color: var(--theme-color-brand-primary, #2880a6); }

		/* A moodboard has a flat, light canvas (no dark flow grid). */
		/* canvas background is native to pict-section-flow now (moodboard profile + setBackground) */
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
		.mb-note:empty::before { content: attr(data-ph); color: rgba(0,0,0,0.35); }
		.mb-text:empty::before { content: attr(data-ph); color: var(--theme-color-text-secondary, rgba(0,0,0,0.35)); }

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
		.mbp-input { width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid var(--theme-color-border-default, #d8dde6); border-radius: 6px; font-size: 13px; font-family: inherit; background: var(--theme-color-background-panel, #fff); color: var(--theme-color-text-primary, #2c3140); }
		.mbp-textarea { min-height: 72px; resize: vertical; line-height: 1.3; }
		.mbp-range { width: 100%; box-sizing: border-box; margin: 2px 0; }
		.mbp-swatches { display: flex; gap: 6px; flex-wrap: wrap; }
		.mbp-swatch { width: 22px; height: 22px; border-radius: 50%; border: 1px solid rgba(0,0,0,0.15); cursor: pointer; padding: 0; }
		.mbp-swatch:hover { transform: scale(1.12); }
		.mbp-textcolor { width: 24px; height: 24px; padding: 0; border: 1px solid rgba(0,0,0,0.15); border-radius: 50%; background: none; cursor: pointer; }
		.mbp-color { width: 100%; height: 30px; padding: 2px; border: 1px solid var(--theme-color-border-default, #d8dde6); border-radius: 6px; background: var(--theme-color-background-panel, #fff); cursor: pointer; box-sizing: border-box; }
		/* Sticker color overrides: the whole row is hidden until a recolorable library shape is placed; the
		   second swatch shows only for a duotone (phosphor) shape. Driven by Data._ColorShow/_SecColorShow. */
		.mbp-stickercolors { display: none; flex-direction: column; gap: 6px; }
		.mbp-stickercolors.mbp-show { display: flex; }
		.mbp-colorset { display: flex; gap: 8px; align-items: center; }
		.mbp-colorset .mbp-color { width: auto; flex: 1; }
		.mbp-colorset .mbp-sec { display: none; }
		.mbp-colorset .mbp-sec.mbp-show { display: block; }
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
		.mb-gallery-search { min-width: 200px; flex: 1; padding: 0.4em 0.6em; border: 1px solid var(--theme-color-border-default, #ccc); border-radius: 6px; font-size: 0.9em; background: var(--theme-color-background-panel, #fff); color: var(--theme-color-text-primary, #2c3140); }
		.mb-gallery-filter, .mb-gallery-sortlbl { font-size: 12px; color: var(--theme-color-text-secondary, #5b6376); display: inline-flex; gap: 5px; align-items: center; }
		.mb-gallery-filter select, .mb-gallery-sort { padding: 5px 6px; border: 1px solid var(--theme-color-border-default, #ccc); border-radius: 6px; font-size: 13px; background: var(--theme-color-background-panel, #fff); color: var(--theme-color-text-primary, #2c3140); }
		.mb-gallery-btn { padding: 0.25em 0.6em; border: 1px solid var(--theme-color-border-default, #ccc); border-radius: 6px; background: var(--theme-color-background-panel, #fff); color: var(--theme-color-text-primary, #222); cursor: pointer; font-size: 0.85em; }
		.mb-gallery-btn:hover { background: var(--theme-color-background-hover, #f2f2f2); }
		.mb-gallery-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; padding: 16px; overflow: auto; }
		.mb-gallery-item { display: flex; flex-direction: column; padding: 0; border: 1px solid var(--theme-color-border-default, #e4e8ef); border-radius: 8px; background: var(--theme-color-background-secondary, #f7f8fb); cursor: pointer; overflow: hidden; text-align: left; }
		.mb-gallery-item:hover { border-color: var(--theme-color-brand-primary, #2880a6); }
		.mb-gallery-item img { width: 100%; height: 92px; object-fit: cover; display: block; background: var(--theme-color-background-secondary, #e9edf2); }
		.mb-gallery-item-name { font-size: 11px; color: var(--theme-color-text-secondary, #5b6376); padding: 4px 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
		/* Sticker mode: compact, square tiles with the cutout shrunk to fit (not a stretched
		   thumbnail). box-sizing keeps the padding inside the tile width so the image never overflows. */
		.mb-gallery-mode-sticker .mb-gallery-grid { grid-template-columns: repeat(auto-fill, minmax(86px, 1fr)); }
		.mb-gallery-mode-sticker .mb-gallery-item { align-items: center; }
		.mb-gallery-mode-sticker .mb-gallery-item img { width: 100%; aspect-ratio: 1 / 1; height: auto; box-sizing: border-box; padding: 14px; object-fit: contain; background: transparent; }
		.mb-gallery-mode-sticker .mb-gallery-item-name { width: 100%; text-align: center; padding: 4px 6px 6px; white-space: normal; line-height: 1.25; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
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
</div>`
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
		// Whether the "set view area" frame drag-handles are currently on (edit mode).
		this._FrameEditing = false;
		// A display style set before the flow sub-view exists (mirrors _PendingBoard) — applied once the
		// flow is ready. { Style, TopMargin }.
		this._PendingDisplayStyle = null;
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
				NoteColors: _NOTE_COLORS.map((pColor) => ({ Color: pColor }))
			};
		}
		this.pict.AppData.Moodboard.ViewID = this.options.ViewIdentifier;
	}

	// Claim the shared AppData.Moodboard.ViewID BEFORE the container template parses, so this instance's
	// template IDs (MB-Root- / MB-Flow- / MB-Canvas-<ViewID>) and inline handlers resolve to THIS instance.
	// Several moodboards can be registered on one Pict (a profile banner + a vision board); whichever is
	// rendering must own the ID at parse time -- doing it only in onAfterRender is too late (the template
	// already rendered with whatever instance set the shared ViewID last, painting the wrong container).
	onBeforeRender(pRenderable)
	{
		this._initState();
		return super.onBeforeRender(pRenderable);
	}

	onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent)
	{
		// The active (on-screen) board owns the shared AppData.Moodboard.ViewID, so its card panels and
		// background popover (which reference it) target this instance when several moodboards are
		// registered on one Pict (the Moodboard section plus per-user profile boards).
		if (this.pict.AppData.Moodboard) { this.pict.AppData.Moodboard.ViewID = this.options.ViewIdentifier; }
		this._ensureFlowView();
		// Establish the flow's presentation behavior for the current display style (canvas / jumbotron /
		// background) BEFORE the editable-vs-read-only chrome below: a presentation style reports as
		// non-editable (see _isEditable), so this must run first for the mb-readonly class + toolbar mode
		// to match.
		this._applyDisplayStyle();
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
				this._boundOnResize = this._boundOnResize || (() =>
				{
					if (this._isEditable()) { return; }
					// A framed read-only board (presentation chrome, or a plain canvas with a view-area
					// frame) is width-fit, and the flow's own ResizeObserver owns re-fitting it, so the
					// moodboard does NOT contain-fit on resize (that would fight the width-fit). Only an
					// unframed read-only canvas re-fits here.
					if (this._isPresentationStyle() || this._hasViewAreaFrame()) { return; }
					this.fitBoard();
				});
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

	// Fit the board into view. A read-only board whose author framed a view area fits that frame's WIDTH
	// to the container -- the configured visible area, content bleeding past the edges -- regardless of the
	// chosen chrome (a presentation style always carries a frame; a plain canvas only if one was drawn). A
	// board with no view-area frame contains every card with a little padding instead (zoomToFit pads 50px).
	// Used on load (both modes) and when a read-only board's window resizes.
	fitBoard()
	{
		if (!this._FlowView) { return; }
		if (!this._isEditable() && this._hasViewAreaFrame())
		{
			if (typeof this._FlowView.fitToWidth === 'function') { this._FlowView.fitToWidth(); }
			return;
		}
		if (typeof this._FlowView.zoomToFit === 'function') { this._FlowView.zoomToFit(); }
	}

	// ── flow toolbar custom buttons (background + the host's Edit / Done) ──────
	// The moodboard contributes its editing controls (the display-style toggle, set-view-area, connections)
	// to the flow toolbar (editable only). The host can supply more (an Edit / Done button) via
	// options.ToolbarButtons. The board color + backdrop margin live in the flow gear (SettingsSections).
	_buildToolbarButtons(pEditable)
	{
		let tmpButtons = [];
		if (pEditable)
		{
			// One display-mode button: its icon is the CURRENT mode and it opens a dropdown of the modes
			// (icon + label). Picking one stores that style; the board itself stays the editable canvas
			// while you work, and the chosen mode shows when you view. One button scales to any number of
			// modes (the menu grows, the bar does not). The view-area frame + backdrop margin (gear) tune it.
			let tmpMode = _displayMode(this._displayStyle());
			tmpButtons.push({ Hash: 'mb-display', Icon: tmpMode.Icon, Tooltip: 'Display mode: ' + tmpMode.Label });
			// Toggles the "set view area" frame handles — the box a jumbotron / background display fits the
			// width of. Active mirrors _FrameEditing.
			tmpButtons.push({ Hash: 'mb-frame', Icon: 'frame', Toggle: true, Tooltip: 'Set the view area (the box a jumbotron / background fits)', Active: !!this._FrameEditing });
			// Toggles connection points on the selected card(s); Active is kept in sync with the selection
			// by _updateConnectButton so it reads like a checkbox for the current card.
			tmpButtons.push({ Hash: 'mb-connect', Icon: 'connect', Toggle: true, Tooltip: 'Connection points on the selected card (C)' });
		}
		else
		{
			// Read-only display: a Photoshop-style "hand" toggle. Off (default) the canvas is static and
			// the wheel scrolls the page; on, you drag to pan and wheel to zoom. Active mirrors the flow's
			// read-only navigation state.
			tmpButtons.push({ Hash: 'mb-navigate', Icon: 'pan', Toggle: true, Tooltip: 'Pan and zoom (drag to move, wheel to zoom)', Active: !!(this._FlowView && typeof this._FlowView.isReadOnlyNavigation === 'function' && this._FlowView.isReadOnlyNavigation()) });
		}
		let tmpHostButtons = Array.isArray(this.options.ToolbarButtons) ? this.options.ToolbarButtons : [];
		return tmpButtons.concat(tmpHostButtons);
	}

	// Routed from the flow's onToolbarButton hook. The style toggles set the display style, Connections
	// toggles the selection's points, Set-view-area flips the frame handles; everything else is a host
	// button, forwarded to options.onToolbarButton.
	onToolbarButton(pHash, pElement)
	{
		if (pHash === 'mb-display') { this.openDisplayMenu(pElement); return; }
		if (pHash === 'mb-connect') { this.toggleConnectPoints(); return; }
		if (pHash === 'mb-frame') { this.toggleFrameEditing(); return; }
		if (pHash === 'mb-navigate') { this.toggleNavigate(); return; }
		if (typeof this.options.onToolbarButton === 'function') { this.options.onToolbarButton(pHash, pElement); }
	}

	// The read-only "hand" toggle: flips the flow's native read-only navigation (pan + wheel-zoom). Off,
	// the wheel scrolls the page and the board is static; on, drag pans and the wheel zooms.
	toggleNavigate()
	{
		if (!this._FlowView || typeof this._FlowView.setReadOnlyNavigation !== 'function') { return; }
		this._FlowView.setReadOnlyNavigation(!this._FlowView.isReadOnlyNavigation());
		this._updateNavigateButton();
	}

	_updateNavigateButton()
	{
		if (!this._FlowView || !this._FlowView._ToolbarView) { return; }
		let tmpButtons = this._FlowView.options.ToolbarExtraButtons || [];
		let tmpButton = tmpButtons.find((pButton) => pButton.Hash === 'mb-navigate');
		if (!tmpButton) { return; }
		let tmpActive = !!(typeof this._FlowView.isReadOnlyNavigation === 'function' && this._FlowView.isReadOnlyNavigation());
		if (tmpButton.Active === tmpActive) { return; }
		tmpButton.Active = tmpActive;
		if (typeof this._FlowView._ToolbarView.render === 'function') { this._FlowView._ToolbarView.render(); }
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
				// Read-only shows a minimal docked toolbar so the pan/zoom (hand) toggle is always visible.
				if (tmpToolbar._ToolbarMode !== 'docked') { tmpToolbar._setToolbarMode('docked'); }
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
		let tmpVS = (this._FlowView && this._FlowView._FlowData) ? this._FlowView._FlowData.ViewState : null;
		if (tmpVS && tmpVS.Background && tmpVS.Background.Color) { return tmpVS.Background.Color; }
		// Legacy boards stored a flat ViewState.BackgroundColor.
		if (tmpVS && tmpVS.BackgroundColor) { return tmpVS.BackgroundColor; }
		if (this._PendingBoard && this._PendingBoard.ViewState)
		{
			if (this._PendingBoard.ViewState.Background && this._PendingBoard.ViewState.Background.Color) { return this._PendingBoard.ViewState.Background.Color; }
			if (this._PendingBoard.ViewState.BackgroundColor) { return this._PendingBoard.ViewState.BackgroundColor; }
		}
		return '';
	}

	// Resolve a host THEME color token to a CONCRETE value. The flow paints the board background as an SVG
	// <rect> fill, and SVG presentation attributes do NOT resolve var(), so the board default cannot be a raw
	// var() -- it has to be read off the cascade with getComputedStyle and handed over as a literal color.
	// Reads from the board's own element so a theme scoped to a wrapper (not :root) still resolves; returns
	// the first token that has a value, else the fallback.
	_resolveThemeColor(pVars, pFallback)
	{
		if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') { return pFallback; }
		let tmpEl = (this._FlowView && this._FlowView._SVGElement) ? this._FlowView._SVGElement : null;
		if (!tmpEl && typeof document !== 'undefined') { tmpEl = document.getElementById('MB-Root-' + this.options.ViewIdentifier) || document.body; }
		if (!tmpEl) { return pFallback; }
		let tmpStyle = window.getComputedStyle(tmpEl);
		let tmpVars = Array.isArray(pVars) ? pVars : [pVars];
		for (let i = 0; i < tmpVars.length; i++)
		{
			let tmpValue = (tmpStyle.getPropertyValue(tmpVars[i]) || '').trim();
			if (tmpValue) { return tmpValue; }
		}
		return pFallback;
	}

	// The board canvas color when the author has not picked one: the host theme's surface color, so a board
	// follows a light / dark theme by default instead of a baked light gray.
	_defaultBoardBackground()
	{
		return this._resolveThemeColor([ '--theme-color-background-secondary', '--theme-color-background-primary' ], '#f4f6f9');
	}

	// The board background is now native to pict-section-flow (setBackground / ViewState.Background).
	// Migrate any legacy ViewState.BackgroundColor onto the native shape, point the flow's DEFAULT (the
	// fallback when nothing is on ViewState) at the resolved theme color, then ask the flow to repaint.
	// resolveBackground prefers ViewState.Background, so an author's pick still wins; refreshed every apply,
	// so a theme switch recolors an unpainted board.
	_applyBackground()
	{
		if (!this._FlowView) { return; }
		let tmpVS = this._FlowView._FlowData ? this._FlowView._FlowData.ViewState : null;
		if (tmpVS && tmpVS.BackgroundColor && !tmpVS.Background) { tmpVS.Background = { Style: 'solid', Color: tmpVS.BackgroundColor }; }
		this._FlowView.options.Background = { Style: 'solid', Color: this._defaultBoardBackground() };
		if (typeof this._FlowView._applyBackground === 'function') { this._FlowView._applyBackground(); }
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

	// The gear Appearance control. A real color is stored on ViewState.Background (it wins over the theme
	// default); an empty string ("No background") CLEARS the stored color so the board falls back to the
	// host theme surface, rather than baking a fixed gray.
	setBackgroundColor(pColor)
	{
		if (!this._FlowView) { return; }
		let tmpVS = this._FlowView._FlowData ? this._FlowView._FlowData.ViewState : null;
		if (typeof pColor === 'string' && pColor)
		{
			if (typeof this._FlowView.setBackground === 'function') { this._FlowView.setBackground({ Style: 'solid', Color: pColor }); }
		}
		else
		{
			if (tmpVS) { delete tmpVS.Background; delete tmpVS.BackgroundColor; }
			this._applyBackground();
		}
		this._emitChange();
	}

	// A board is editable unless the host opts out with Editable:false (a read-only display: a teammate's
	// profile, a hub thumbnail). Editability is INDEPENDENT of the display style: while editing you always
	// get the free canvas (see _effectiveStyle), and the chosen jumbotron / background only takes visual
	// effect in view mode.
	_isEditable() { return this.options.Editable !== false; }

	// Toggle edit vs view (read-only) mode at runtime. Editable boards drag/resize/rotate/connect cards on
	// the free canvas; view boards render the stored display style read-only. Keeps the edit-only flow
	// flags in sync and re-renders; _applyDisplayStyle (run from onAfterRender) drives the flow ReadOnly +
	// FitMode for the resulting effective style.
	setEditable(pEditable)
	{
		this.options.Editable = (pEditable !== false);
		this.closeDisplayMenu();
		if (this._FlowView)
		{
			// Flip the flow's read-only + edit flags up front (a canvas board follows Editable;
			// _applyDisplayStyle re-confirms read-only for a presentation effective style after render).
			if (typeof this._FlowView.setReadOnly === 'function') { this._FlowView.setReadOnly(!this.options.Editable); }
			this._FlowView.options.EnableCardPalette = this.options.Editable;
			this._FlowView.options.EnableConnectionCreation = this.options.Editable;
			this._FlowView.options.EnableNodeDragging = this.options.Editable;
			this._FlowView.options.EnableNodeResizing = this.options.Editable;
			this._FlowView.options.EnableGridSnap = this.options.Editable;
			this._FlowView.options.EnableAlignmentGuides = this.options.Editable;
			// Swap the toolbar's extra buttons to this mode's set authoritatively, so a flow re-render does
			// not paint the previous mode's buttons before the deferred toolbar sync catches up (the
			// view -> edit transition otherwise kept showing the read-only navigate button).
			let tmpButtons = this._buildToolbarButtons(this.options.Editable);
			this._FlowView.options.ToolbarExtraButtons = tmpButtons;
			if (this._FlowView._ToolbarView)
			{
				this._FlowView._ToolbarView.options.ToolbarExtraButtons = tmpButtons;
				if (this._FlowView._ToolbarView._FloatingToolbarView) { this._FlowView._ToolbarView._FloatingToolbarView.options.ToolbarExtraButtons = tmpButtons; }
			}
		}
		this.render();
		return this.options.Editable;
	}

	// ── display style (canvas / jumbotron / background) ─────────────────────────
	// How the board presents WHEN VIEWED. 'canvas' (default) is the plain board; 'jumbotron' and
	// 'background' are width-fit presentation surfaces that fit the WIDTH of the defined view-area frame
	// to the container (content bleeds past) — a jumbotron is a hero band whose height is the frame's
	// scaled height, a background is a full-width backdrop honoring a top margin. The style + its margin
	// ride on the flow ViewState so they persist (getFlowData deep-clones ViewState; setFlowData preserves
	// extra keys, exactly like the native Frame). Editing is decoupled: while editable the board is always
	// the free canvas (you arrange + set the view area), so the style is authored, not entered.

	// The stored display style, defaulting to 'canvas'. Reads the flow ViewState, then a board / style
	// stashed before the flow existed. This is what the style toggle reflects and what view mode renders.
	_displayStyle()
	{
		let tmpVS = (this._FlowView && this._FlowView._FlowData) ? this._FlowView._FlowData.ViewState : null;
		let tmpStyle = (tmpVS && tmpVS.DisplayStyle) ? tmpVS.DisplayStyle : null;
		if (!tmpStyle && this._PendingBoard && this._PendingBoard.ViewState && this._PendingBoard.ViewState.DisplayStyle) { tmpStyle = this._PendingBoard.ViewState.DisplayStyle; }
		if (!tmpStyle && this._PendingDisplayStyle && this._PendingDisplayStyle.Style) { tmpStyle = this._PendingDisplayStyle.Style; }
		return (tmpStyle === 'jumbotron' || tmpStyle === 'background') ? tmpStyle : 'canvas';
	}

	// The style the board actually PRESENTS as: the free canvas while editing (so you can drag + frame),
	// the stored style when viewing. The stored style is left untouched while editing.
	_effectiveStyle() { return this._isEditable() ? 'canvas' : this._displayStyle(); }

	// True when the board is presenting as a width-fit surface right now (only in view mode).
	_isPresentationStyle() { let tmpStyle = this._effectiveStyle(); return tmpStyle === 'jumbotron' || tmpStyle === 'background'; }

	// True when the board carries a usable view-area frame -- the box the author framed as the visible area.
	// A read-only board with one is fit to that frame's width (the configured visible area) no matter the
	// display chrome, so "view mode respects the visible area" holds for a plain canvas too, not just a
	// jumbotron / background. Matches the existence check _ensureFrame uses (a frame needs Width + Height).
	_hasViewAreaFrame()
	{
		let tmpFrame = (this._FlowView && typeof this._FlowView.getFrame === 'function') ? this._FlowView.getFrame() : null;
		return !!(tmpFrame && tmpFrame.Width > 0 && tmpFrame.Height > 0);
	}

	// Public read of the stored display style + background top margin, for a host that sizes the board's
	// container (a jumbotron band, a background backdrop) and reacts to onDisplayStyleChanged.
	getDisplayStyle() { return this._displayStyle(); }
	getDisplayTopMargin() { return this._displayTopMargin(); }
	getEffectiveDisplayStyle() { return this._effectiveStyle(); }

	// The presentation top margin (background only): where a host's overlaying content begins. Same lookup
	// order as the style so it rides ViewState through getBoard / setBoard.
	_displayTopMargin()
	{
		let tmpVS = (this._FlowView && this._FlowView._FlowData) ? this._FlowView._FlowData.ViewState : null;
		if (tmpVS && typeof tmpVS.DisplayStyleTopMargin === 'number') { return tmpVS.DisplayStyleTopMargin; }
		if (this._PendingBoard && this._PendingBoard.ViewState && typeof this._PendingBoard.ViewState.DisplayStyleTopMargin === 'number') { return this._PendingBoard.ViewState.DisplayStyleTopMargin; }
		if (this._PendingDisplayStyle && typeof this._PendingDisplayStyle.TopMargin === 'number') { return this._PendingDisplayStyle.TopMargin; }
		return 0;
	}

	// The jumbotron band height OVERRIDE (jumbotron only; 0 = auto, i.e. the scaled view-area frame height).
	// Same lookup order as the margin so it rides ViewState through getBoard / setBoard.
	_displayHeight()
	{
		let tmpVS = (this._FlowView && this._FlowView._FlowData) ? this._FlowView._FlowData.ViewState : null;
		if (tmpVS && typeof tmpVS.DisplayStyleHeight === 'number') { return tmpVS.DisplayStyleHeight; }
		if (this._PendingBoard && this._PendingBoard.ViewState && typeof this._PendingBoard.ViewState.DisplayStyleHeight === 'number') { return this._PendingBoard.ViewState.DisplayStyleHeight; }
		return 0;
	}

	// Set (and persist) the stored display style. pOptions.TopMargin (number) sets the background margin.
	// Stores on the flow ViewState, re-applies the effective presentation, refreshes the toolbar's style
	// toggle, and emits a change so a host autosaves. While editing this just records the choice (the board
	// stays the canvas); it takes visual effect in view mode.
	setDisplayStyle(pStyle, pOptions)
	{
		let tmpStyle = (pStyle === 'jumbotron' || pStyle === 'background') ? pStyle : 'canvas';
		let tmpOptions = pOptions || {};
		if (!this._FlowView || !this._FlowView._FlowData)
		{
			// Flow not ready yet: stash and apply once it exists (see _applyDisplayStyle).
			this._PendingDisplayStyle = { Style: tmpStyle, TopMargin: (typeof tmpOptions.TopMargin === 'number') ? tmpOptions.TopMargin : undefined };
			return tmpStyle;
		}
		let tmpVS = this._FlowView._FlowData.ViewState;
		tmpVS.DisplayStyle = tmpStyle;
		if (typeof tmpOptions.TopMargin === 'number') { tmpVS.DisplayStyleTopMargin = tmpOptions.TopMargin; }
		else if (typeof tmpVS.DisplayStyleTopMargin !== 'number') { tmpVS.DisplayStyleTopMargin = 0; }
		this._PendingDisplayStyle = null;
		this._applyDisplayStyle();
		this._updateDisplayButton();
		this._emitChange();
		return tmpStyle;
	}

	// Set just the background top margin -- where overlaying content begins (the gear control). Re-applies
	// + persists.
	setDisplayMargin(pValue)
	{
		let tmpNum = parseInt(pValue, 10);
		let tmpMargin = isNaN(tmpNum) ? 0 : Math.max(0, tmpNum);
		if (this._FlowView && this._FlowView._FlowData) { this._FlowView._FlowData.ViewState.DisplayStyleTopMargin = tmpMargin; }
		else if (this._PendingDisplayStyle) { this._PendingDisplayStyle.TopMargin = tmpMargin; }
		this._applyDisplayStyle();
		this._emitChange();
		return tmpMargin;
	}

	// Set the jumbotron band height override (the gear control; 0 / blank = auto = scaled frame height).
	// Re-applies + persists, then re-emits the display style so the host re-sizes the band.
	setDisplayHeight(pValue)
	{
		let tmpNum = parseInt(pValue, 10);
		let tmpHeight = isNaN(tmpNum) ? 0 : Math.max(0, tmpNum);
		if (this._FlowView && this._FlowView._FlowData) { this._FlowView._FlowData.ViewState.DisplayStyleHeight = tmpHeight; }
		this._applyDisplayStyle();
		this._emitChange();
		return tmpHeight;
	}

	// Establish the flow sub-view's behavior for the current EFFECTIVE style. Idempotent and cheap — run
	// from onAfterRender on every render, from setDisplayStyle / setDisplayMargin, and after a board loads.
	// A presentation effective style goes read-only + width-fit (anchored at the top margin) over a view-
	// area frame with the flow's width-fit ResizeObserver; the canvas effective style restores contain-fit,
	// drops the observer, and follows Editable for read-only.
	_applyDisplayStyle()
	{
		if (!this._FlowView || !this._FlowView._FlowData) { return; }
		// Land a style stashed before the flow existed onto the (now present) ViewState.
		if (this._PendingDisplayStyle)
		{
			let tmpVSPending = this._FlowView._FlowData.ViewState;
			tmpVSPending.DisplayStyle = this._PendingDisplayStyle.Style;
			if (typeof this._PendingDisplayStyle.TopMargin === 'number') { tmpVSPending.DisplayStyleTopMargin = this._PendingDisplayStyle.TopMargin; }
			this._PendingDisplayStyle = null;
		}

		let tmpEffective = this._effectiveStyle();
		let tmpRoot = document.getElementById('MB-Root-' + this.options.ViewIdentifier);

		// The "set view area" handles are an edit-mode affordance; off whenever the board is not editable.
		if (!this._isEditable() && this._FrameEditing && typeof this._FlowView.setFrameEditing === 'function') { this._FrameEditing = false; this._FlowView.setFrameEditing(false); }

		// A presentation style (jumbotron / background) always fits a view-area frame, seeding one from the
		// content bounds if the author drew none. A plain canvas honors only a frame actually drawn. Either
		// way, a READ-ONLY board with a view-area frame becomes a width-fit presentation surface -- the
		// configured visible area -- so view mode respects it regardless of the chosen chrome.
		let tmpPresentation = (tmpEffective === 'jumbotron' || tmpEffective === 'background');
		if (tmpPresentation) { this._ensureFrame(); }
		let tmpWidthFit = !this._isEditable() && this._hasViewAreaFrame();

		if (tmpWidthFit)
		{
			// The board art is width-fit FLUSH at the top of its surface (FitTopMargin 0). The display
			// margin is NOT a board offset -- a host that overlays content on a backdrop applies it as the
			// content's top inset (where the overlaying content starts), read from onDisplayStyleChanged.
			this._FlowView.options.FitMode = 'width';
			this._FlowView.options.FitTopMargin = 0;
			if (typeof this._FlowView.setReadOnly === 'function' && !this._FlowView.isReadOnly()) { this._FlowView.setReadOnly(true); }
			if (typeof this._FlowView._setupFitObserver === 'function') { this._FlowView._setupFitObserver(); }
		}
		else
		{
			this._FlowView.options.FitMode = 'contain';
			if (typeof this._FlowView._teardownFitObserver === 'function') { this._FlowView._teardownFitObserver(); }
			let tmpReadOnly = !this._isEditable();
			if (typeof this._FlowView.setReadOnly === 'function' && this._FlowView.isReadOnly() !== tmpReadOnly) { this._FlowView.setReadOnly(tmpReadOnly); }
		}

		// Root classes reflect how the board actually displays: a width-fit framed view (presentation chrome
		// or a plain canvas honoring its view area) hides the editing chrome + the dashed guide; an editable
		// or unframed canvas keeps them. The chrome-specific classes still track the explicit style.
		if (tmpRoot)
		{
			tmpRoot.classList.toggle('mb-presentation', tmpWidthFit);
			tmpRoot.classList.toggle('mb-style-jumbotron', tmpEffective === 'jumbotron');
			tmpRoot.classList.toggle('mb-style-background', tmpEffective === 'background');
		}
		this._emitDisplayStyleChanged();
	}

	// Notify a host (options.onDisplayStyleChanged) when the effective presentation changes, so it can size
	// the board's container (a jumbotron band, a background backdrop, the plain box). Fired from
	// _applyDisplayStyle but de-duplicated, so it only fires on a real change, not every render.
	_emitDisplayStyleChanged()
	{
		let tmpEffective = this._effectiveStyle();
		let tmpMargin = this._displayTopMargin();
		// Report the RESOLVED board color (author pick, else the theme surface) so a host that paints the
		// board's own element for a behind-content backdrop can match it -- the flow's internal SVG fill does
		// not composite reliably when the board is an absolute full-bleed layer.
		let tmpBackground = this._boardBackground() || this._defaultBoardBackground();
		let tmpKey = tmpEffective + ':' + tmpMargin + ':' + tmpBackground;
		if (tmpKey === this._LastDisplayStyleKey) { return; }
		this._LastDisplayStyleKey = tmpKey;
		if (typeof this.options.onDisplayStyleChanged === 'function')
		{
			this.options.onDisplayStyleChanged(
				{
					style: this._displayStyle(),
					effectiveStyle: tmpEffective,
					editable: this._isEditable(),
					topMargin: tmpMargin,
					backgroundColor: tmpBackground,
					jumbotronHeight: this.jumbotronHeight()
				});
		}
	}

	// Point the single display-mode toolbar button's icon + tooltip at the current stored mode, and
	// re-render the toolbar only when it actually changed.
	_updateDisplayButton()
	{
		if (!this._FlowView || !this._FlowView._ToolbarView) { return; }
		let tmpButton = (this._FlowView.options.ToolbarExtraButtons || []).find((b) => b.Hash === 'mb-display');
		if (!tmpButton) { return; }
		let tmpMode = _displayMode(this._displayStyle());
		if (tmpButton.Icon === tmpMode.Icon) { return; }
		tmpButton.Icon = tmpMode.Icon;
		tmpButton.Tooltip = 'Display mode: ' + tmpMode.Label;
		if (typeof this._FlowView._ToolbarView.render === 'function')
		{
			this._FlowView._ToolbarView.render();
			if (this._FlowView._ToolbarView._FloatingToolbarView && typeof this._FlowView._ToolbarView._FloatingToolbarView.render === 'function') { this._FlowView._ToolbarView._FloatingToolbarView.render(); }
		}
	}

	// ── display-mode dropdown (one toolbar button -> a popout list of modes) ─────
	// A flow-styled dropdown (reuses the flow toolbar's own popup + list-item classes, so it matches the
	// Cards / Layout menus) anchored under the display-mode button. Each row is the mode's icon + label;
	// the current mode is marked. Picking one sets the style and closes. Scales to any number of modes.
	openDisplayMenu(pAnchor)
	{
		if (this._DisplayMenuEl) { this.closeDisplayMenu(); return; }
		if (typeof document === 'undefined') { return; }
		let tmpIcons = (this._FlowView && this._FlowView._IconProvider) ? this._FlowView._IconProvider : null;
		let tmpCurrent = this._displayStyle();
		let tmpMenu = document.createElement('div');
		tmpMenu.className = 'pict-flow-toolbar-popup mb-display-menu';
		let tmpHTML = '';
		for (let i = 0; i < _DISPLAY_MODES.length; i++)
		{
			let tmpMode = _DISPLAY_MODES[i];
			let tmpIconHTML = tmpIcons ? tmpIcons.getIconSVGMarkup(tmpMode.Icon, 16) : '';
			let tmpCurrentClass = (tmpMode.Key === tmpCurrent) ? ' mb-display-menu-current' : '';
			tmpHTML += '<div class="pict-flow-popup-list-item mb-display-menu-item' + tmpCurrentClass + '" onclick="_Pict.views[\'' + this.options.ViewIdentifier + '\'].pickDisplayStyle(\'' + tmpMode.Key + '\')">'
				+ '<span class="pict-flow-popup-list-item-icon">' + tmpIconHTML + '</span>'
				+ '<span class="pict-flow-popup-list-item-label">' + tmpMode.Label + '<span class="mb-display-menu-hint">' + tmpMode.Hint + '</span></span>'
				+ '</div>';
		}
		tmpMenu.innerHTML = tmpHTML;
		document.body.appendChild(tmpMenu);
		this._DisplayMenuEl = tmpMenu;
		// Anchor it under the button (position:fixed; the popup CSS default is absolute, overridden inline).
		tmpMenu.style.position = 'fixed';
		if (pAnchor && typeof pAnchor.getBoundingClientRect === 'function')
		{
			let tmpRect = pAnchor.getBoundingClientRect();
			let tmpViewportWidth = (typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth : 1024;
			let tmpLeft = Math.max(8, Math.min(tmpRect.left, tmpViewportWidth - 252));
			tmpMenu.style.left = tmpLeft + 'px';
			tmpMenu.style.top = (tmpRect.bottom + 4) + 'px';
		}
		this._wireDisplayMenuDismiss(pAnchor);
	}

	pickDisplayStyle(pStyle)
	{
		this.closeDisplayMenu();
		this.setDisplayStyle(pStyle);
	}

	closeDisplayMenu()
	{
		if (this._DisplayMenuEl && this._DisplayMenuEl.parentNode) { this._DisplayMenuEl.parentNode.removeChild(this._DisplayMenuEl); }
		this._DisplayMenuEl = null;
		this._unwireDisplayMenuDismiss();
	}

	// Outside-click + Escape dismissal for the display-mode dropdown (window-level events with no inline
	// equivalent; torn down on close). Ignores clicks on the trigger button (its onclick toggles).
	_wireDisplayMenuDismiss(pAnchor)
	{
		if (this._DisplayMenuDismissWired) { return; }
		let tmpSelf = this;
		this._boundDisplayMenuOutside = function (pEvent)
		{
			if (tmpSelf._DisplayMenuEl && tmpSelf._DisplayMenuEl.contains(pEvent.target)) { return; }
			if (pAnchor && pEvent.target && pAnchor.contains && pAnchor.contains(pEvent.target)) { return; }
			if (pEvent.target && pEvent.target.closest && pEvent.target.closest('[data-extra-hash="mb-display"]')) { return; }
			tmpSelf.closeDisplayMenu();
		};
		this._boundDisplayMenuEsc = function (pEvent) { if (pEvent.key === 'Escape') { tmpSelf.closeDisplayMenu(); } };
		if (typeof setTimeout === 'function') { setTimeout(function () { if (tmpSelf._DisplayMenuDismissWired) { document.addEventListener('mousedown', tmpSelf._boundDisplayMenuOutside); } }, 0); }
		document.addEventListener('keydown', this._boundDisplayMenuEsc);
		this._DisplayMenuDismissWired = true;
	}

	_unwireDisplayMenuDismiss()
	{
		if (!this._DisplayMenuDismissWired) { return; }
		if (this._boundDisplayMenuOutside) { document.removeEventListener('mousedown', this._boundDisplayMenuOutside); }
		if (this._boundDisplayMenuEsc) { document.removeEventListener('keydown', this._boundDisplayMenuEsc); }
		this._DisplayMenuDismissWired = false;
	}

	// The gear "Appearance" section (rendered into the flow toolbar's native settings popup via the flow's
	// SettingsSections hook): the board canvas color, plus the backdrop top margin when the background style
	// is chosen. Built at open time so it reflects live state. No bespoke popover -- it reuses the flow's
	// own gear popup styling.
	_buildAppearanceSection()
	{
		let tmpViewID = this.options.ViewIdentifier;
		let tmpColor = this._boardBackground() || '';
		let tmpSwatches = _BACKGROUND_COLORS.map((pColor) =>
			'<button class="mb-gear-swatch" style="background:' + pColor + '" title="Board color ' + pColor + '" onclick="_Pict.views[\'' + tmpViewID + '\'].setBackgroundColor(\'' + pColor + '\')"></button>').join('');
		let tmpHTML = '<div class="mb-gear-field"><span class="mb-gear-sub">Board color</span><div class="mb-gear-swatches">'
			+ tmpSwatches
			+ '<input type="color" class="mb-gear-color" title="Pick a color" value="' + (tmpColor || this._defaultBoardBackground()) + '" onchange="_Pict.views[\'' + tmpViewID + '\'].setBackgroundColor(this.value)">'
			+ '<button class="mb-gear-swatch mb-gear-none" title="No background" onclick="_Pict.views[\'' + tmpViewID + '\'].setBackgroundColor(\'\')"></button>'
			+ '</div></div>';
		// Background: the margin sets WHERE THE OVERLAYING CONTENT BEGINS (the board art shows above it),
		// not an offset of the board art itself.
		if (this._displayStyle() === 'background')
		{
			tmpHTML += '<div class="mb-gear-field"><span class="mb-gear-sub">Content starts at (px)</span>'
				+ '<input type="number" class="mb-gear-margin" min="0" max="900" step="8" value="' + this._displayTopMargin() + '" onchange="_Pict.views[\'' + tmpViewID + '\'].setDisplayMargin(this.value)"></div>';
		}
		// Jumbotron: an explicit band height; blank / 0 = auto (the scaled view-area frame height).
		if (this._displayStyle() === 'jumbotron')
		{
			tmpHTML += '<div class="mb-gear-field"><span class="mb-gear-sub">Band height (blank = auto)</span>'
				+ '<input type="number" class="mb-gear-margin" min="0" max="900" step="10" placeholder="auto" value="' + (this._displayHeight() || '') + '" onchange="_Pict.views[\'' + tmpViewID + '\'].setDisplayHeight(this.value)"></div>';
		}
		return tmpHTML;
	}

	// ── view-area frame (the box jumbotron / background fit the WIDTH of) ─────────
	// The frame is native to pict-section-flow (ViewState.Frame); these delegate to the flow and persist
	// (the frame rides ViewState through getBoard / setBoard, and a frame drag also fires the flow's
	// onFlowChanged which the moodboard re-emits for autosave).
	setFrame(pFrame)
	{
		if (!this._FlowView || typeof this._FlowView.setFrame !== 'function') { return null; }
		let tmpFrame = this._FlowView.setFrame(pFrame);
		// A read-only framed board (presentation or a plain canvas with a view area) re-fits immediately.
		if (!this._isEditable() && this._hasViewAreaFrame()) { this.fitBoard(); }
		this._emitChange();
		return tmpFrame;
	}

	getFrame() { return (this._FlowView && typeof this._FlowView.getFrame === 'function') ? this._FlowView.getFrame() : null; }

	setFrameEditing(pEnabled)
	{
		if (!this._FlowView || typeof this._FlowView.setFrameEditing !== 'function') { return false; }
		this._FrameEditing = !!pEnabled;
		return this._FlowView.setFrameEditing(this._FrameEditing);
	}

	// Ensure a view-area frame exists, seeding one from the content bounds when the board has none. The
	// seeded frame is what a presentation style fits to (and what the "set view area" handles edit).
	_ensureFrame()
	{
		if (!this._FlowView) { return null; }
		let tmpFrame = (typeof this._FlowView.getFrame === 'function') ? this._FlowView.getFrame() : null;
		if (tmpFrame && tmpFrame.Width && tmpFrame.Height) { return tmpFrame; }
		let tmpNodes = (this._FlowView._FlowData && Array.isArray(this._FlowView._FlowData.Nodes)) ? this._FlowView._FlowData.Nodes : [];
		let tmpSeed = PictViewMoodboard.computeContentFrame(tmpNodes, 40);
		if (typeof this._FlowView.setFrame === 'function') { this._FlowView.setFrame(tmpSeed); }
		return tmpSeed;
	}

	// The "set view area" toolbar toggle (edit mode): seed a frame from the content if none exists, then
	// turn the flow's frame drag-handles on / off so the author can size the box jumbotron / background
	// fit to. The handles + the dashed frame guide only show on an editable canvas board.
	toggleFrameEditing()
	{
		if (!this._FlowView || !this._isEditable()) { return; }
		let tmpOn = !this._FrameEditing;
		if (tmpOn) { this._ensureFrame(); }
		this.setFrameEditing(tmpOn);
		this._updateFrameButton();
	}

	_updateFrameButton()
	{
		if (!this._FlowView || !this._FlowView._ToolbarView) { return; }
		let tmpButtons = this._FlowView.options.ToolbarExtraButtons || [];
		let tmpButton = tmpButtons.find((pButton) => pButton.Hash === 'mb-frame');
		if (!tmpButton) { return; }
		if (tmpButton.Active === this._FrameEditing) { return; }
		tmpButton.Active = this._FrameEditing;
		if (typeof this._FlowView._ToolbarView.render === 'function') { this._FlowView._ToolbarView.render(); }
		if (this._FlowView._ToolbarView._FloatingToolbarView && typeof this._FlowView._ToolbarView._FloatingToolbarView.render === 'function') { this._FlowView._ToolbarView._FloatingToolbarView.render(); }
	}

	// Pure: a view-area frame enclosing every node box plus a uniform padding (a sensible default box for
	// an empty board). No DOM, so it is unit tested.
	static computeContentFrame(pNodes, pPadding)
	{
		let tmpPadding = (typeof pPadding === 'number') ? pPadding : 40;
		let tmpNodes = Array.isArray(pNodes) ? pNodes : [];
		if (tmpNodes.length === 0)
		{
			return { X: 0, Y: 0, Width: 960, Height: 540, Enabled: true };
		}
		let tmpMinX = Infinity, tmpMinY = Infinity, tmpMaxX = -Infinity, tmpMaxY = -Infinity;
		for (let i = 0; i < tmpNodes.length; i++)
		{
			let tmpNode = tmpNodes[i] || {};
			let tmpX = (typeof tmpNode.X === 'number') ? tmpNode.X : 0;
			let tmpY = (typeof tmpNode.Y === 'number') ? tmpNode.Y : 0;
			let tmpW = (typeof tmpNode.Width === 'number') ? tmpNode.Width : 0;
			let tmpH = (typeof tmpNode.Height === 'number') ? tmpNode.Height : 0;
			tmpMinX = Math.min(tmpMinX, tmpX);
			tmpMinY = Math.min(tmpMinY, tmpY);
			tmpMaxX = Math.max(tmpMaxX, tmpX + tmpW);
			tmpMaxY = Math.max(tmpMaxY, tmpY + tmpH);
		}
		return {
			X: Math.round(tmpMinX - tmpPadding),
			Y: Math.round(tmpMinY - tmpPadding),
			Width: Math.round((tmpMaxX - tmpMinX) + tmpPadding * 2),
			Height: Math.round((tmpMaxY - tmpMinY) + tmpPadding * 2),
			Enabled: true
		};
	}

	// Pure: the on-screen height of a width-fit frame at a given container width (frame.Height scaled by
	// container / frame width). A host sizes a jumbotron band to this. No DOM, so it is unit tested.
	static computeScaledFrameHeight(pFrame, pContainerWidth)
	{
		if (!pFrame || !pFrame.Width || !pFrame.Height || !pContainerWidth) { return 0; }
		return Math.round(pFrame.Height * (pContainerWidth / pFrame.Width));
	}

	// The current jumbotron band height for this board's container width. An explicit override (the gear
	// "Band height" control) wins; otherwise it is the scaled view-area frame height. A host reads this to
	// size a hero band; returns 0 when there is no override and no frame / canvas yet.
	jumbotronHeight()
	{
		let tmpOverride = this._displayHeight();
		if (tmpOverride > 0) { return tmpOverride; }
		let tmpFrame = this.getFrame();
		let tmpWidth = 0;
		if (this._FlowView && this._FlowView._SVGElement && typeof this._FlowView._SVGElement.getBoundingClientRect === 'function')
		{
			tmpWidth = this._FlowView._SVGElement.getBoundingClientRect().width;
		}
		return PictViewMoodboard.computeScaledFrameHeight(tmpFrame, tmpWidth);
	}

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
					// Flow 2.0 moodboard profile: undirected links, edge-to-edge cards (no title
					// bar), wheel pans / ctrl+wheel zooms (the scroll-too-fast fix), and a flat
					// canvas background. ReadOnly drives the flow's native non-editable mode
					// (interaction gating + chrome hiding) for display boards, replacing the old
					// mb-readonly CSS reliance.
					Profile: 'moodboard',
					ReadOnly: !tmpEditable,
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
					// Host-facing toolbar buttons: the moodboard's editing controls (display-style toggle,
					// set-view-area, connections; editable only) plus whatever the host supplies (Edit /
					// Done). Clicks route through onToolbarButton below.
					ToolbarExtraButtons: this._buildToolbarButtons(tmpEditable),
					onToolbarButton: (pHash, pElement) => this.onToolbarButton(pHash, pElement),
					// The board color + backdrop margin live in the flow toolbar's own gear popup (no bespoke
					// box) via the flow's SettingsSections hook; built at open time so it reflects live state.
					SettingsSections: [ { Label: 'Appearance', Build: () => this._buildAppearanceSection() } ],
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
			// The inline rotate handle writes node.Rotation + re-renders the card, but an already-open
			// properties panel keeps its once-rendered body, so its Rotation slider goes stale. Push the new
			// angle back into the open panel's slider so the handle and the panel stay in two-way sync.
			this._FlowView._EventHandlerProvider.registerHandler('onNodeRotated', (pNode) => this._syncPanelRotation(pNode));
			this._PanelHandlerWired = true;
		}
	}

	// Push a node's current rotation into its open properties panel slider. The flow renders a panel's body
	// once, so a rotate-handle drag (which writes node.Rotation + re-renders the card) would otherwise leave
	// the slider showing the old angle. Only one moodboard panel is open at a time (_keepOnlyPanel), so the
	// single .mbp-range is the right one.
	_syncPanelRotation(pNode)
	{
		if (typeof document === 'undefined' || !this._FlowView) { return; }
		let tmpNode = (pNode && typeof pNode === 'object') ? pNode : (typeof this._FlowView.getNode === 'function' ? this._FlowView.getNode(pNode) : null);
		if (!tmpNode) { return; }
		let tmpRoot = document.getElementById('MB-Root-' + this.options.ViewIdentifier);
		let tmpRange = tmpRoot ? tmpRoot.querySelector('.mbp-range') : null;
		if (tmpRange) { tmpRange.value = (typeof tmpNode.Rotation === 'number') ? tmpNode.Rotation : 0; }
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
		// A sticker card is empty art until you pick one, and from the palette you always then want to
		// pick -- so open the picker straight away (targeting this card) instead of making the panel and
		// its "Pick a sticker" button a second and third step. Skip it when the card already carries art:
		// the gallery's own placement path (_addStickerCard) adds the node with a StickerUrl, so picking
		// from the gallery must not reopen the gallery.
		if (pNode.Type === 'MoodSticker' && pNode.Hash && !(pNode.Data && pNode.Data.StickerUrl))
		{
			this.openPickerForCard(pNode.Hash, 'sticker');
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

	setStickerUrl(pNodeHash, pUrl, pMeta)
	{
		if (!this._FlowView) { return; }
		let tmpNode = this._FlowView.getNode(pNodeHash);
		if (!tmpNode) { return; }
		if (!tmpNode.Data) { tmpNode.Data = {}; }
		tmpNode.Data.StickerUrl = pUrl;
		// Picking a library shape carries its identity + colors so the panel can offer color overrides.
		if (pMeta) { this._stampStickerMeta(tmpNode, pMeta); }
		let tmpImg = this._cardElement(pNodeHash, '.mb-sticker');
		if (tmpImg) { tmpImg.setAttribute('src', pUrl || ''); }
		this._FlowView.marshalFromView();
		this._emitChange();
	}

	// Carry a picked shape's identity + colors onto the node so its panel can offer color overrides. A
	// non-shape sticker (upload / built-in) gets no shape fields, so its color controls stay hidden.
	_stampStickerMeta(pNode, pMeta)
	{
		if (pNode && pNode.Data && pMeta && typeof pMeta.ShapeCollection === 'string' && pMeta.ShapeCollection)
		{
			pNode.Data.ShapeCollection = pMeta.ShapeCollection;
			pNode.Data.ShapeName = pMeta.ShapeName || '';
			pNode.Data.Duotone = !!pMeta.Duotone;
			if (typeof pNode.Data.ColorPrimary !== 'string' || !pNode.Data.ColorPrimary) { pNode.Data.ColorPrimary = pMeta.ColorPrimary || '#1f3a52'; }
			if (typeof pNode.Data.ColorSecondary !== 'string' || !pNode.Data.ColorSecondary) { pNode.Data.ColorSecondary = pMeta.ColorSecondary || '#9cc0e0'; }
		}
		this._stampStickerColorFlags(pNode);
	}

	// The panel reads these as show-classes (default hidden, so a non-shape or legacy sticker shows no
	// color controls): the whole color row appears only for a library shape; the second (silhouette) color
	// only for a duotone shape.
	_stampStickerColorFlags(pNode)
	{
		if (!pNode || !pNode.Data) { return; }
		pNode.Data._ColorShow = pNode.Data.ShapeCollection ? 'mbp-show' : '';
		pNode.Data._SecColorShow = (pNode.Data.ShapeCollection && pNode.Data.Duotone) ? 'mbp-show' : '';
	}

	// Override a placed library-shape sticker's color(s). Rebuilds the recolored URL through the sticker
	// source (which owns the shape-library URL convention) and swaps the card image in place.
	setStickerColor(pNodeHash, pSlot, pColor)
	{
		if (!this._FlowView) { return; }
		let tmpNode = this._FlowView.getNode(pNodeHash);
		if (!tmpNode || !tmpNode.Data || !tmpNode.Data.ShapeCollection) { return; }
		if (pSlot === 'sec') { tmpNode.Data.ColorSecondary = pColor; }
		else { tmpNode.Data.ColorPrimary = pColor; }
		let tmpUrl = (this._StickerSource && typeof this._StickerSource.recolorURL === 'function')
			? this._StickerSource.recolorURL(tmpNode.Data.ShapeCollection, tmpNode.Data.ShapeName, { pri: tmpNode.Data.ColorPrimary, sec: tmpNode.Data.ColorSecondary })
			: tmpNode.Data.StickerUrl;
		if (tmpUrl) { tmpNode.Data.StickerUrl = tmpUrl; }
		let tmpImg = this._cardElement(pNodeHash, '.mb-sticker');
		if (tmpImg) { tmpImg.setAttribute('src', tmpNode.Data.StickerUrl || ''); }
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
		let tmpDefaults = this._connectionDefaults();
		pConnection.Data.StrokeColor = tmpDefaults.StrokeColor;
		pConnection.Data.StrokeWidth = tmpDefaults.StrokeWidth;
		pConnection.Data.StrokeStyle = tmpDefaults.StrokeStyle;
		pConnection.Data.SourceMarker = tmpDefaults.SourceMarker;
		pConnection.Data.TargetMarker = tmpDefaults.TargetMarker;
		pConnection.Data.Label = '';
		if (tmpDefaults.EdgeTheme) { pConnection.Data.EdgeTheme = tmpDefaults.EdgeTheme; }
		this._stampConnectionSelects(pConnection.Data);
		this._FlowView.renderFlow();
		this._FlowView.marshalFromView();
		this._emitChange();
	}

	// The default style for a NEWLY drawn link. A host (plansheet) can push a per-Drafting-Kit style via the
	// ConnectionDefaults option or setConnectionDefaults(); missing keys fall back to the built-in neutral link.
	_connectionDefaults()
	{
		let tmpKit = (this.options && this.options.ConnectionDefaults) ? this.options.ConnectionDefaults : {};
		return {
			StrokeColor: tmpKit.StrokeColor || '#5b6376',
			StrokeWidth: (typeof tmpKit.StrokeWidth === 'number') ? tmpKit.StrokeWidth : 2,
			StrokeStyle: tmpKit.StrokeStyle || 'solid',
			SourceMarker: tmpKit.SourceMarker || 'none',
			TargetMarker: tmpKit.TargetMarker || 'arrow',
			EdgeTheme: tmpKit.EdgeTheme || ''
		};
	}

	// Push a per-kit default connection style at runtime (after the view exists). The curve (EdgeTheme) is set
	// flow-level so it applies to every link; stroke + markers apply to each newly drawn link (a per-link
	// override on a saved link still wins). A host calls this when a kit-scoped board opens.
	setConnectionDefaults(pDefaults)
	{
		this.options.ConnectionDefaults = pDefaults || {};
		let tmpCurve = this.options.ConnectionDefaults.EdgeTheme;
		if (tmpCurve && this._FlowView && typeof this._FlowView.setEdgeTheme === 'function') { this._FlowView.setEdgeTheme(tmpCurve); }
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
		// Curve type rides Data.EdgeTheme (the flow's per-connection edge-theme override); default Bezier.
		let tmpCurve = pData.EdgeTheme || 'Bezier';
		pData.CurveBezierSel = (tmpCurve === 'Bezier') ? 'selected' : '';
		pData.CurveElbowSel = (tmpCurve === 'Orthogonal') ? 'selected' : '';
		pData.CurveStraightSel = (tmpCurve === 'Straight') ? 'selected' : '';
	}

	setConnectionColor(pConnectionHash, pColor) { this._updateConnection(pConnectionHash, (pData) => { pData.StrokeColor = pColor; }); }
	setConnectionWidth(pConnectionHash, pWidth) { this._updateConnection(pConnectionHash, (pData) => { let tmpNum = parseInt(pWidth, 10); pData.StrokeWidth = (!isNaN(tmpNum) && tmpNum > 0) ? tmpNum : 2; }); }
	setConnectionLineStyle(pConnectionHash, pStyle) { this._updateConnection(pConnectionHash, (pData) => { pData.StrokeStyle = (pStyle === 'dashed' || pStyle === 'dotted') ? pStyle : 'solid'; }); }
	setConnectionSourceMarker(pConnectionHash, pMarker) { this._updateConnection(pConnectionHash, (pData) => { pData.SourceMarker = pMarker; }); }
	setConnectionTargetMarker(pConnectionHash, pMarker) { this._updateConnection(pConnectionHash, (pData) => { pData.TargetMarker = pMarker; }); }
	setConnectionCurve(pConnectionHash, pCurve) { this._updateConnection(pConnectionHash, (pData) => { pData.EdgeTheme = (pCurve === 'Orthogonal' || pCurve === 'Straight') ? pCurve : 'Bezier'; }); }

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
			if (tmpGallery.Mode === 'sticker') { this.setStickerUrl(this._PickerTargetHash, tmpItem.Url, tmpItem.Metadata); }
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
			this._stampStickerMeta(tmpNode, tmpMeta);
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
		// A board still waiting to apply (the flow's data-manager service has not wired up yet) means the live
		// flow is empty. Report the PENDING board instead, so a host autosave that fires during the load
		// window persists the real content rather than overwriting it with an empty board (the content-loss
		// race). Once it applies, _PendingBoard is cleared and the live flow is authoritative.
		if (this._PendingBoard) { return JSON.parse(JSON.stringify(this._PendingBoard)); }
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
			this._afterBoardApplied();
			return;
		}
		if (this._FlowView) { this._applyPendingBoard(); }
	}

	// Shared tail for both board-load paths: re-establish the display style (a loaded presentation board
	// flips to read-only width-fit, so rebuild the chrome; a canvas board just re-applies cheaply), paint
	// the background, and fit. setFlowData does not fire onFlowChanged, so loading stays save-silent.
	_afterBoardApplied()
	{
		if (this._isPresentationStyle())
		{
			// Rebuild the moodboard chrome for the read-only presentation mode; onAfterRender's
			// _applyDisplayStyle establishes the flow FitMode / frame / observer + paints the background.
			this.render();
		}
		else
		{
			this._applyDisplayStyle();
			this._applyBackgroundSoon();
		}
		this._fitSoon();
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
				try { tmpSelf._FlowView.setFlowData(tmpBoard); tmpSelf._FlowView.renderFlow(); tmpSelf._afterBoardApplied(); }
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
		// Drop the flow's width-fit ResizeObserver (a presentation board installs one) so it does not
		// outlive the view.
		if (this._FlowView && typeof this._FlowView._teardownFitObserver === 'function') { this._FlowView._teardownFitObserver(); }
		this.closeDisplayMenu();
	}
}

module.exports = PictViewMoodboard;
module.exports.default_configuration = _ViewConfiguration;
module.exports.NOTE_COLORS = _NOTE_COLORS;
