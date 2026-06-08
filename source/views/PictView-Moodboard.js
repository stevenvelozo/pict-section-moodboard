'use strict';

/**
 * Moodboard: a free-form canvas of draggable, resizable image tiles and sticky notes.
 *
 * It is a thin layer over pict-section-flow: a flow view configured with no ports and no
 * connections (EnableConnectionCreation off, card types declare no Inputs/Outputs), node resizing
 * on (EnableNodeResizing, the corner grip), pan and zoom on, and a zero-height title bar so image
 * and note cards fill edge to edge. Everything the canvas needs (drag, resize, pan, zoom, select,
 * save and restore) comes from the flow; this view adds the moodboard toolbar, the two card types,
 * and image input (a URL field, a file picker, drag-and-drop, and clipboard paste).
 *
 * Images are stored on each node as Data.ImageUrl. Stand-alone that is a base64 data URL kept right
 * in the board JSON, so a board is fully self-contained. An embedding application can instead pass
 * an ImageSource (options.ImageSource) that serves images from its own store with its own metadata;
 * this view keeps the reference and leaves the bytes to the host.
 *
 * The board serializes through the flow's own getFlowData / setFlowData (Nodes + ViewState); there
 * are no Connections.
 *
 * @author Steven Velozo <steven@velozo.com>
 * @license MIT
 */

const libPictView = require('pict-view');
const libPictSectionFlow = require('pict-section-flow');
const libMoodImageCard = require('../cards/MoodImage-Card.js');
const libMoodNoteCard = require('../cards/MoodNote-Card.js');
const libMoodTextCard = require('../cards/MoodText-Card.js');
const libImageSource = require('../sources/ImageSource-Base.js');

// A small, friendly note palette. The first entry is the default for a new note.
const _NOTE_COLORS = ['#ffe08a', '#ffb3c1', '#a8d8ff', '#b7e4c7', '#d8c2ff', '#ffd6a5', '#e6e6e6'];

const _ViewConfiguration =
{
	ViewIdentifier: 'Moodboard',
	DefaultRenderable: 'Moodboard-Container',
	DefaultDestinationAddress: '#Moodboard-Container',
	CSS: /*css*/`
		.mb-root { display: flex; flex-direction: column; height: 100%; min-height: 420px; }
		.mb-toolbar { display: flex; align-items: center; gap: 0.4em; flex-wrap: wrap; padding: 8px 10px; border-bottom: 1px solid var(--theme-color-border-default, #dfe3ea); background: var(--theme-color-background-panel, #fff); }
		.mb-btn { padding: 0.4em 0.7em; border: 1px solid var(--theme-color-border-default, #ccc); border-radius: 6px; background: var(--theme-color-background-panel, #fff); color: var(--theme-color-text-primary, #222); cursor: pointer; font-size: 0.9em; }
		.mb-btn:hover { background: var(--theme-color-background-hover, #f2f2f2); }
		.mb-btn-primary { background: var(--theme-color-brand-primary, #2880a6); border-color: var(--theme-color-brand-primary, #2880a6); color: #fff; }
		.mb-url { padding: 0.4em 0.6em; border: 1px solid var(--theme-color-border-default, #ccc); border-radius: 6px; font-size: 0.9em; min-width: 180px; }
		.mb-swatches { display: inline-flex; gap: 4px; align-items: center; }
		.mb-swatch { width: 18px; height: 18px; border-radius: 50%; border: 1px solid rgba(0,0,0,0.15); cursor: pointer; padding: 0; }
		.mb-swatch:hover { transform: scale(1.12); }
		.mb-sep { width: 1px; align-self: stretch; background: var(--theme-color-border-default, #e2e6ec); margin: 2px 4px; }
		.mb-hint { font-size: 0.8em; color: var(--theme-color-text-secondary, #8a93a5); margin-left: auto; }
		.mb-canvas { position: relative; flex: 1; min-height: 0; }
		.mb-canvas.mb-dropping::after { content: "Drop images here"; position: absolute; inset: 10px; border: 2px dashed var(--theme-color-brand-primary, #2880a6); border-radius: 10px; display: flex; align-items: center; justify-content: center; color: var(--theme-color-brand-primary, #2880a6); font-weight: 600; pointer-events: none; background: rgba(40,128,166,0.06); }
		.mb-flow { position: absolute; inset: 0; }

		/* A moodboard has a flat, light canvas (no dark flow grid). */
		.mb-flow .pict-flow-grid-background { fill: var(--theme-color-background-secondary, #f4f6f9); }
		/* Moodboard cards fill edge to edge: no title text, no ports, transparent note text area. */
		.pict-flow-node-MoodImage .pict-flow-node-title,
		.pict-flow-node-MoodNote .pict-flow-node-title,
		.pict-flow-node-MoodText .pict-flow-node-title { display: none; }
		.pict-flow-node-MoodImage .pict-flow-port, .pict-flow-node-MoodNote .pict-flow-port, .pict-flow-node-MoodText .pict-flow-port,
		.pict-flow-node-MoodImage .pict-flow-port-label, .pict-flow-node-MoodNote .pict-flow-port-label, .pict-flow-node-MoodText .pict-flow-port-label { display: none; }
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
		.pict-flow-node-MoodText .pict-flow-node-body-content-html { pointer-events: none; }

		/* Properties panel (double-click a card to open it). */
		.mbp { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; font-size: 13px; }
		.mbp-label { font-size: 11px; font-weight: 600; color: var(--theme-color-text-secondary, #5b6376); text-transform: uppercase; letter-spacing: 0.03em; }
		.mbp-input { width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid var(--theme-color-border-default, #d8dde6); border-radius: 6px; font-size: 13px; font-family: inherit; background: var(--theme-color-background-panel, #fff); }
		.mbp-textarea { min-height: 72px; resize: vertical; line-height: 1.3; }
		.mbp-range { width: 100%; box-sizing: border-box; margin: 2px 0; }
		.mbp-swatches { display: flex; gap: 6px; flex-wrap: wrap; }
		.mbp-swatch { width: 22px; height: 22px; border-radius: 50%; border: 1px solid rgba(0,0,0,0.15); cursor: pointer; padding: 0; }
		.mbp-swatch:hover { transform: scale(1.12); }

		/* Gallery picker overlay (built from whatever fields the image source declares). */
		.mb-gallery { display: none; position: absolute; inset: 0; z-index: 20; align-items: center; justify-content: center; }
		.mb-gallery-open .mb-gallery { display: flex; }
		.mb-gallery::before { content: ""; position: absolute; inset: 0; background: rgba(20,28,40,0.35); }
		.mb-gallery-panel { position: relative; width: min(760px, 92%); max-height: 86%; background: var(--theme-color-background-panel, #fff); border: 1px solid var(--theme-color-border-default, #dfe3ea); border-radius: 12px; box-shadow: 0 18px 50px rgba(20,30,50,0.22); display: flex; flex-direction: column; overflow: hidden; }
		.mb-gallery-head { display: flex; align-items: center; justify-content: space-between; padding: 13px 16px; border-bottom: 1px solid var(--theme-color-border-default, #eceff3); }
		.mb-gallery-title { font-weight: 600; font-size: 15px; color: var(--theme-color-text-primary, #222); }
		.mb-gallery-controls { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; padding: 12px 16px; border-bottom: 1px solid var(--theme-color-border-default, #eceff3); }
		.mb-gallery-search { min-width: 200px; flex: 1; }
		.mb-gallery-filter, .mb-gallery-sortlbl { font-size: 12px; color: var(--theme-color-text-secondary, #5b6376); display: inline-flex; gap: 5px; align-items: center; }
		.mb-gallery-filter select, .mb-gallery-sort { padding: 5px 6px; border: 1px solid var(--theme-color-border-default, #ccc); border-radius: 6px; font-size: 13px; background: var(--theme-color-background-panel, #fff); }
		.mb-gallery-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; padding: 16px; overflow: auto; }
		.mb-gallery-item { display: flex; flex-direction: column; padding: 0; border: 1px solid var(--theme-color-border-default, #e4e8ef); border-radius: 8px; background: var(--theme-color-background-secondary, #f7f8fb); cursor: pointer; overflow: hidden; text-align: left; }
		.mb-gallery-item:hover { border-color: var(--theme-color-brand-primary, #2880a6); }
		.mb-gallery-item img { width: 100%; height: 92px; object-fit: cover; display: block; background: #e9edf2; }
		.mb-gallery-item-name { font-size: 11px; color: var(--theme-color-text-secondary, #5b6376); padding: 4px 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
		.mb-gallery-empty { grid-column: 1 / -1; text-align: center; color: var(--theme-color-text-secondary, #8a93a5); padding: 44px 16px; }
	`,
	Templates:
	[
		{
			Hash: 'Moodboard-Container',
			Template: /*html*/`
<div class="mb-root" id="MB-Root-{~D:AppData.Moodboard.ViewID~}">
	<div class="mb-toolbar" id="MB-Toolbar-{~D:AppData.Moodboard.ViewID~}"></div>
	<div class="mb-canvas" id="MB-Canvas-{~D:AppData.Moodboard.ViewID~}"
		ondblclick="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].onCanvasDoubleClick(event)"
		ondragover="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].onDragOver(event)"
		ondragleave="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].onDragLeave(event)"
		ondrop="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].onDrop(event)">
		<div class="mb-flow" id="MB-Flow-{~D:AppData.Moodboard.ViewID~}"></div>
	</div>
	<input type="file" accept="image/*" multiple style="display:none" id="MB-FileInput-{~D:AppData.Moodboard.ViewID~}"
		onchange="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].addImageFiles(this.files); this.value='';">
	<div class="mb-gallery" id="MB-Gallery-{~D:AppData.Moodboard.ViewID~}"></div>
</div>`
		},
		{
			Hash: 'Moodboard-Toolbar',
			Template: /*html*/`
<button class="mb-btn mb-btn-primary" onclick="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].addNote()">Add note</button>
<button class="mb-btn" onclick="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].addText()">Add text</button>
<div class="mb-swatches">{~TS:Moodboard-Swatch:AppData.Moodboard.NoteColors~}</div>
<div class="mb-sep"></div>
<button class="mb-btn" onclick="document.getElementById('MB-FileInput-{~D:AppData.Moodboard.ViewID~}').click()">Add image</button>
<input class="mb-url" placeholder="Paste image URL, press Enter" onkeydown="if(event.key==='Enter'){event.preventDefault(); _Pict.views['{~D:AppData.Moodboard.ViewID~}'].addImageFromInput(this);}">
<button class="mb-btn" onclick="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].openGallery()">Gallery</button>
<div class="mb-sep"></div>
<button class="mb-btn" onclick="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].duplicateSelected()">Duplicate</button>
<button class="mb-btn" onclick="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].toggleFit()">Fit</button>
<button class="mb-btn" onclick="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].bringToFront()">Bring to front</button>
<button class="mb-btn" onclick="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].deleteSelected()">Delete</button>
<span class="mb-hint">Double-click a card to edit. Drag the canvas to select (shift-click adds, shift-drag pans). Drop or paste images.</span>`
		},
		{
			Hash: 'Moodboard-Swatch',
			Template: /*html*/`<button class="mb-swatch" style="background:{~D:Record.Color~}" title="Add a {~D:Record.Color~} note" onclick="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].addNote('{~D:Record.Color~}')"></button>`
		},
		{
			Hash: 'Moodboard-Gallery',
			Template: /*html*/`
<div class="mb-gallery-panel">
	<div class="mb-gallery-head">
		<span class="mb-gallery-title">Image gallery</span>
		<button class="mb-btn" onclick="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].closeGallery()">Close</button>
	</div>
	<div class="mb-gallery-controls">
		<input class="mb-url mb-gallery-search" placeholder="Search images" oninput="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].onGallerySearch(this.value)">
		{~TS:Moodboard-Gallery-Filter:AppData.Moodboard.Gallery.FilterFields~}
		<label class="mb-gallery-sortlbl">Sort
			<select class="mb-gallery-sort" onchange="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].onGallerySort(this.value)"><option value="">none</option>{~TS:Moodboard-Gallery-Sort-Option:AppData.Moodboard.Gallery.SortFields~}</select>
		</label>
		<button class="mb-btn mb-gallery-dir" onclick="_Pict.views['{~D:AppData.Moodboard.ViewID~}'].onGallerySortDir()">{~D:AppData.Moodboard.Gallery.SortDirLabel~}</button>
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
		{ Hash: 'Moodboard-Gallery-Empty', Template: /*html*/`<div class="mb-gallery-empty">No images here yet. Add some with the toolbar (URL, file, drop, or paste) and they show up in the gallery to reuse.</div>` }
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
		this._AddCount = 0;
		// An embedding app can supply an image source (its own gallery + metadata); otherwise the
		// built-in base source keeps a base64 collection so the gallery works stand-alone.
		this._ImageSource = (pOptions && pOptions.ImageSource) ? pOptions.ImageSource : new libImageSource();
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

	onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent)
	{
		this._ensureFlowView();
		this._renderToolbar();
		// Clipboard paste of an image is a window-level event with no inline equivalent; wire once.
		if (!this._PasteWired)
		{
			document.addEventListener('paste', this._boundOnPaste);
			this._PasteWired = true;
		}
		this.pict.CSSMap.injectCSS();
		return super.onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent);
	}

	_renderToolbar() { this.pict.ContentAssignment.assignContent('#MB-Toolbar-' + this.options.ViewIdentifier, this.pict.parseTemplateByHash('Moodboard-Toolbar', { ViewID: this.options.ViewIdentifier })); }

	_ensureFlowView()
	{
		let tmpID = this.options.ViewIdentifier;
		let tmpContainer = '#MB-Flow-' + tmpID;
		if (!this._FlowView)
		{
			let tmpNodeTypes = {};
			[ new libMoodImageCard(this.fable, {}, 'Moodboard-ImageCard'), new libMoodNoteCard(this.fable, {}, 'Moodboard-NoteCard'), new libMoodTextCard(this.fable, {}, 'Moodboard-TextCard') ].forEach((pCard) =>
			{
				let tmpConfig = pCard.getNodeTypeConfiguration();
				tmpNodeTypes[tmpConfig.Hash] = tmpConfig;
			});

			this._FlowView = this.pict.addView('MB-FlowView-' + tmpID,
				{
					ViewIdentifier: 'MB-FlowView-' + tmpID,
					DefaultRenderable: 'Flow-Container',
					DefaultDestinationAddress: tmpContainer,
					AutoRender: false,
					EnableToolbar: false,
					EnableCardPalette: false,
					EnableAddNode: false,
					EnableLayoutMenu: false,
					IncludeDefaultNodeTypes: false,
					EnableConnectionCreation: false,
					EnableNodeDragging: true,
					EnableNodeResizing: true,
					EnablePanning: true,
					EnableZooming: true,
					EnableGridSnap: true,
					GridSnapSize: 10,
					EnableMultiSelect: true,
					EnableAlignmentGuides: true,
					NodeTitleBarHeight: 0,
					DefaultNodeType: 'MoodNote',
					NodeTypes: tmpNodeTypes,
					Renderables: [ { RenderableHash: 'Flow-Container', TemplateHash: 'Flow-Container-Template', DestinationAddress: tmpContainer, RenderMethod: 'replace' } ]
				},
				libPictSectionFlow);
		}
		this._FlowView.initialRenderComplete = false;
		this._FlowView.render();

		// Keep the board to a single open editor (see _keepOnlyPanel). Wire once, after the flow's
		// services exist.
		if (!this._PanelHandlerWired && this._FlowView._EventHandlerProvider)
		{
			this._FlowView._EventHandlerProvider.registerHandler('onPanelOpened', (pPanelData) => this._keepOnlyPanel(pPanelData ? pPanelData.Hash : null));
			// Structural changes (drag, resize, add, delete) flow through onFlowChanged; re-emit them so a
			// host can autosave. Panel/toolbar edits that bypass onFlowChanged call _emitChange directly.
			this._FlowView._EventHandlerProvider.registerHandler('onFlowChanged', () => this._emitChange());
			this._PanelHandlerWired = true;
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

	// ---- Adding cards ----

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

	addNote(pColor)
	{
		let tmpPos = this._nextPosition();
		this._addNoteAt(tmpPos.x, tmpPos.y, pColor);
	}

	_addNoteAt(pX, pY, pColor)
	{
		if (!this._FlowView) return;
		let tmpColor = (typeof pColor === 'string' && pColor) ? pColor : _NOTE_COLORS[0];
		let tmpNode = this._FlowView.addNode('MoodNote', pX, pY, '', { Text: '', Color: tmpColor });
		if (tmpNode)
		{
			tmpNode.Ports = []; // addNode defaults to one In + one Out; a moodboard card has neither
			tmpNode.Data.Color = tmpColor;
			tmpNode.Style = { BodyFill: tmpColor, TitleBarColor: tmpColor };
			this._FlowView.selectNode(tmpNode.Hash);
			this._FlowView.renderFlow();
			this._FlowView.marshalFromView();
			this._FlowView.openPanel(tmpNode.Hash); // drop straight into the editor so the user can type
		}
	}

	addText()
	{
		let tmpPos = this._nextPosition();
		this._addTextAt(tmpPos.x, tmpPos.y);
	}

	_addTextAt(pX, pY)
	{
		if (!this._FlowView) return;
		let tmpNode = this._FlowView.addNode('MoodText', pX, pY, '', { Text: '' });
		if (tmpNode)
		{
			tmpNode.Ports = [];
			this._FlowView.selectNode(tmpNode.Hash);
			this._FlowView.renderFlow();
			this._FlowView.marshalFromView();
			this._FlowView.openPanel(tmpNode.Hash); // drop straight into the editor so the user can type
		}
	}

	onCanvasDoubleClick(pEvent)
	{
		// A double-click on a card is handled by the flow itself (it opens that card's properties
		// panel). Here we only handle the empty canvas: drop a note right where the user clicked.
		let tmpCard = (pEvent.target && pEvent.target.closest) ? pEvent.target.closest('.pict-flow-node') : null;
		if (tmpCard) { return; }
		if (!this._FlowView || typeof this._FlowView.screenToSVGCoords !== 'function') { return; }
		let tmpCoords = this._FlowView.screenToSVGCoords(pEvent.clientX, pEvent.clientY);
		this._addNoteAt(tmpCoords.x - 100, tmpCoords.y - 70, _NOTE_COLORS[0]);
	}

	duplicateSelected()
	{
		if (!this._FlowView) return;
		let tmpHashes = this._selectedHashes();
		if (tmpHashes.length === 0) return;
		let tmpClones = [];
		tmpHashes.forEach((pHash) =>
		{
			let tmpNode = this._FlowView.getNode(pHash);
			if (!tmpNode) return;
			let tmpClone = JSON.parse(JSON.stringify(tmpNode));
			tmpClone.Hash = 'node-' + this.fable.getUUID();
			tmpClone.X = (tmpNode.X || 0) + 24;
			tmpClone.Y = (tmpNode.Y || 0) + 24;
			tmpClone.Ports = [];
			this._FlowView.flowData.Nodes.push(tmpClone);
			tmpClones.push(tmpClone.Hash);
		});
		// Select the fresh copies so the next drag moves them, not the originals.
		this._FlowView.selectNodes(tmpClones);
		this._FlowView.renderFlow();
		this._FlowView.marshalFromView();
		this._emitChange();
	}

	// The current selection as an array of node hashes (the flow's set, or the single primary).
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

	toggleFit()
	{
		if (!this._FlowView) return;
		let tmpHash = this._FlowView.viewState ? this._FlowView.viewState.SelectedNodeHash : null;
		if (!tmpHash) return;
		let tmpNode = this._FlowView.getNode(tmpHash);
		if (!tmpNode || tmpNode.Type !== 'MoodImage') return;
		if (!tmpNode.Data) tmpNode.Data = {};
		tmpNode.Data.Fit = (tmpNode.Data.Fit === 'contain') ? 'cover' : 'contain';
		this._FlowView.renderFlow();
		this._FlowView.marshalFromView();
		this._emitChange();
	}

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
			tmpNode.Ports = []; // addNode defaults to one In + one Out; a moodboard card has neither
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

	addImageFromInput(pInputEl)
	{
		if (!pInputEl) return;
		let tmpUrl = (pInputEl.value || '').trim();
		if (!tmpUrl) return;
		this.addImage(tmpUrl);
		pInputEl.value = '';
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
	// and URL). The card body is a read-only display. These setters write the node data and update the
	// already-rendered card in place. They deliberately do NOT call renderFlow, because a full re-render
	// would also re-render the open panel and drop the textarea's focus mid-keystroke; marshalFromView
	// keeps the persisted board in sync without touching the DOM the user is typing into.

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
		let tmpField = this._cardElement(pNodeHash, '.mb-text');
		if (tmpField) { tmpField.style.fontSize = tmpNode.Data.FontSizeCss; }
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

	deleteSelected()
	{
		if (this._FlowView) { this._FlowView.deleteSelected(); }
	}

	bringToFront()
	{
		if (!this._FlowView) return;
		let tmpHashes = this._selectedHashes();
		if (tmpHashes.length === 0) return;
		let tmpNodes = this._FlowView.flowData.Nodes || [];
		// Pull the selected nodes out (keeping their relative order) and re-append them on top.
		let tmpMoved = [];
		for (let i = tmpNodes.length - 1; i >= 0; i--)
		{
			if (tmpHashes.indexOf(tmpNodes[i].Hash) >= 0) { tmpMoved.unshift(tmpNodes.splice(i, 1)[0]); }
		}
		if (tmpMoved.length === 0) return;
		tmpMoved.forEach((pNode) => tmpNodes.push(pNode));
		this._FlowView.renderFlow();
		this._FlowView.marshalFromView();
		this._emitChange();
	}

	// ---- Drag-and-drop + paste ----

	onDragOver(pEvent)
	{
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
		// Only act when this moodboard is on screen.
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

	// ---- Gallery ----
	// The picker builds itself from whatever fields the image source declares (getFields), so a host
	// source with custom metadata gets custom filter/sort controls for free. Search is re-applied to
	// the grid only (the controls are not re-rendered) so the search box keeps focus while typing.

	_galleryState()
	{
		let tmpMb = this.pict.AppData.Moodboard;
		if (!tmpMb.Gallery)
		{
			tmpMb.Gallery = { Open: false, Query: { Search: '', Filters: {}, Sort: { Field: null, Direction: 'asc' } }, SortDirLabel: 'Asc', FilterFields: [], SortFields: [], Items: [], EmptySlot: [{}] };
		}
		return tmpMb.Gallery;
	}

	openGallery()
	{
		let tmpGallery = this._galleryState();
		tmpGallery.Open = true;

		let tmpSource = this._ImageSource;
		let tmpFields = (tmpSource && tmpSource.getFields) ? tmpSource.getFields() : [];
		tmpGallery.FilterFields = tmpFields.filter((pField) => pField.Filterable).map((pField) =>
			({ Key: pField.Key, Label: pField.Label, Options: (tmpSource.getFilterOptions ? tmpSource.getFilterOptions(pField.Key) : []).map((pValue) => ({ Value: pValue })) }));
		tmpGallery.SortFields = tmpFields.filter((pField) => pField.Sortable).map((pField) => ({ Key: pField.Key, Label: pField.Label }));

		this.pict.ContentAssignment.assignContent('#MB-Gallery-' + this.options.ViewIdentifier, this.pict.parseTemplateByHash('Moodboard-Gallery', { ViewID: this.options.ViewIdentifier }));
		let tmpRoot = document.getElementById('MB-Root-' + this.options.ViewIdentifier);
		if (tmpRoot) { tmpRoot.classList.add('mb-gallery-open'); }
		this._refreshGalleryGrid();
	}

	closeGallery()
	{
		this._galleryState().Open = false;
		let tmpRoot = document.getElementById('MB-Root-' + this.options.ViewIdentifier);
		if (tmpRoot) { tmpRoot.classList.remove('mb-gallery-open'); }
	}

	_refreshGalleryGrid()
	{
		let tmpGallery = this._galleryState();
		// list() may return an array (the built-in base source) or a Promise (a host source backed by a
		// remote store); Promise.resolve handles both, so a remote gallery renders the same way.
		let tmpResult = (this._ImageSource && this._ImageSource.list) ? this._ImageSource.list(tmpGallery.Query) : [];
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

	pickFromGallery(pId)
	{
		let tmpItems = this._galleryState().Items || [];
		let tmpItem = tmpItems.find((pItem) => pItem.Id === pId);
		if (tmpItem) { this.addImage(tmpItem.Url, Object.assign({ Name: tmpItem.Name }, tmpItem.Metadata)); }
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
		if (!this._FlowView || !pBoard) return;
		this._FlowView.setFlowData(pBoard);
		this._FlowView.renderFlow();
	}

	onBeforeUnload()
	{
		if (this._PasteWired)
		{
			document.removeEventListener('paste', this._boundOnPaste);
			this._PasteWired = false;
		}
	}
}

module.exports = PictViewMoodboard;
module.exports.default_configuration = _ViewConfiguration;
module.exports.NOTE_COLORS = _NOTE_COLORS;
