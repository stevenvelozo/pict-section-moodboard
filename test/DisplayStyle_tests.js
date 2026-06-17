const libChai = require('chai');
const libExpect = libChai.expect;

const libMoodboardView = require('../source/views/PictView-Moodboard.js');

// A view-shaped stub whose prototype IS the moodboard view, so a method under test can call its sibling
// prototype methods (e.g. _isPresentationStyle -> _displayStyle) without a full Pict app.
function makeStub(pProps) { return Object.assign(Object.create(libMoodboardView.prototype), pProps); }

// The display style (canvas / jumbotron / background) governs how a board presents: canvas is the free
// editable board; jumbotron + background are read-only width-fit presentation surfaces that fit the
// WIDTH of a view-area frame. The style + margin ride on the flow ViewState so they persist. These are
// harness-free unit tests of the pure framing math and the style resolution (prototype methods called
// against light stubs; no DOM / Pict app).
suite('Moodboard display style + view-area frame',
function ()
{
	suite('computeContentFrame (pure)',
	function ()
	{
		test('an empty board returns a sensible default box',
		function ()
		{
			let tmpFrame = libMoodboardView.computeContentFrame([], 40);
			libExpect(tmpFrame).to.deep.equal({ X: 0, Y: 0, Width: 960, Height: 540, Enabled: true });
		});

		test('a single node is enclosed with uniform padding on every side',
		function ()
		{
			// One 200x160 card at (100,100) padded 40 -> origin (60,60), size 280x240.
			let tmpFrame = libMoodboardView.computeContentFrame([ { X: 100, Y: 100, Width: 200, Height: 160 } ], 40);
			libExpect(tmpFrame).to.deep.equal({ X: 60, Y: 60, Width: 280, Height: 240, Enabled: true });
		});

		test('several nodes are enclosed by the union of their boxes plus padding',
		function ()
		{
			let tmpNodes =
			[
				{ X: 0, Y: 0, Width: 100, Height: 100 },
				{ X: 300, Y: 50, Width: 200, Height: 400 }
			];
			// union (0,0)-(500,450); padded 20 -> origin (-20,-20), size 540x490.
			let tmpFrame = libMoodboardView.computeContentFrame(tmpNodes, 20);
			libExpect(tmpFrame).to.deep.equal({ X: -20, Y: -20, Width: 540, Height: 490, Enabled: true });
		});

		test('defaults to 40px padding and tolerates missing geometry',
		function ()
		{
			let tmpFrame = libMoodboardView.computeContentFrame([ {} ]);
			// A node with no geometry is a 0x0 box at (0,0); padded 40 -> origin (-40,-40), size 80x80.
			libExpect(tmpFrame).to.deep.equal({ X: -40, Y: -40, Width: 80, Height: 80, Enabled: true });
		});
	});

	suite('computeScaledFrameHeight (pure)',
	function ()
	{
		test('scales the frame height by container / frame width',
		function ()
		{
			// A 1000x500 frame fit into a 250-wide container scales by 0.25 -> 125 tall.
			libExpect(libMoodboardView.computeScaledFrameHeight({ Width: 1000, Height: 500 }, 250)).to.equal(125);
		});

		test('a wider container enlarges the band height',
		function ()
		{
			libExpect(libMoodboardView.computeScaledFrameHeight({ Width: 500, Height: 200 }, 1000)).to.equal(400);
		});

		test('a degenerate or missing frame / width yields 0',
		function ()
		{
			libExpect(libMoodboardView.computeScaledFrameHeight(null, 500)).to.equal(0);
			libExpect(libMoodboardView.computeScaledFrameHeight({ Width: 0, Height: 100 }, 500)).to.equal(0);
			libExpect(libMoodboardView.computeScaledFrameHeight({ Width: 100, Height: 100 }, 0)).to.equal(0);
		});
	});

	suite('_displayStyle resolution (the stored style)',
	function ()
	{
		test('defaults to canvas when nothing is set',
		function ()
		{
			libExpect(makeStub({ _FlowView: null, _PendingBoard: null, _PendingDisplayStyle: null })._displayStyle()).to.equal('canvas');
		});

		test('reads the flow ViewState style first',
		function ()
		{
			libExpect(makeStub({ _FlowView: { _FlowData: { ViewState: { DisplayStyle: 'jumbotron' } } } })._displayStyle()).to.equal('jumbotron');
		});

		test('falls back to a board stashed before the flow existed',
		function ()
		{
			libExpect(makeStub({ _FlowView: null, _PendingBoard: { ViewState: { DisplayStyle: 'background' } } })._displayStyle()).to.equal('background');
		});

		test('falls back to a style stashed before the flow existed',
		function ()
		{
			libExpect(makeStub({ _FlowView: null, _PendingBoard: null, _PendingDisplayStyle: { Style: 'jumbotron' } })._displayStyle()).to.equal('jumbotron');
		});

		test('an unknown style resolves to canvas',
		function ()
		{
			libExpect(makeStub({ _FlowView: { _FlowData: { ViewState: { DisplayStyle: 'wat' } } } })._displayStyle()).to.equal('canvas');
		});
	});

	suite('_effectiveStyle + _isPresentationStyle (editing is decoupled from the style)',
	function ()
	{
		test('while editable the board always presents as the canvas, whatever the stored style',
		function ()
		{
			let tmpStub = makeStub({ options: {}, _FlowView: { _FlowData: { ViewState: { DisplayStyle: 'jumbotron' } } } });
			libExpect(tmpStub._effectiveStyle()).to.equal('canvas');
			libExpect(tmpStub._isPresentationStyle()).to.equal(false);
		});

		test('in view mode (Editable:false) it presents as the stored style',
		function ()
		{
			let tmpStub = makeStub({ options: { Editable: false }, _FlowView: { _FlowData: { ViewState: { DisplayStyle: 'jumbotron' } } } });
			libExpect(tmpStub._effectiveStyle()).to.equal('jumbotron');
			libExpect(tmpStub._isPresentationStyle()).to.equal(true);
		});

		test('a stored-canvas view board is not a presentation surface',
		function ()
		{
			let tmpStub = makeStub({ options: { Editable: false }, _FlowView: { _FlowData: { ViewState: { DisplayStyle: 'canvas' } } } });
			libExpect(tmpStub._effectiveStyle()).to.equal('canvas');
			libExpect(tmpStub._isPresentationStyle()).to.equal(false);
		});
	});

	suite('_displayTopMargin resolution',
	function ()
	{
		test('reads the flow ViewState margin first, else 0',
		function ()
		{
			libExpect(makeStub({ _FlowView: { _FlowData: { ViewState: { DisplayStyleTopMargin: 64 } } } })._displayTopMargin()).to.equal(64);
			libExpect(makeStub({ _FlowView: null, _PendingBoard: null, _PendingDisplayStyle: null })._displayTopMargin()).to.equal(0);
		});

		test('falls back to a pending board / pending style margin',
		function ()
		{
			libExpect(makeStub({ _FlowView: null, _PendingBoard: { ViewState: { DisplayStyleTopMargin: 12 } } })._displayTopMargin()).to.equal(12);
			libExpect(makeStub({ _FlowView: null, _PendingBoard: null, _PendingDisplayStyle: { TopMargin: 20 } })._displayTopMargin()).to.equal(20);
		});
	});

	suite('_isEditable follows the Editable option (independent of the display style)',
	function ()
	{
		test('editable by default, off when Editable:false',
		function ()
		{
			let tmpStub = makeStub({ options: {}, _FlowView: { _FlowData: { ViewState: { DisplayStyle: 'canvas' } } } });
			libExpect(tmpStub._isEditable()).to.equal(true);
			tmpStub.options.Editable = false;
			libExpect(tmpStub._isEditable()).to.equal(false);
		});

		test('a board with a stored jumbotron style is still editable (the style is authored, not entered)',
		function ()
		{
			let tmpStub = makeStub({ options: {}, _FlowView: { _FlowData: { ViewState: { DisplayStyle: 'jumbotron' } } } });
			libExpect(tmpStub._isEditable()).to.equal(true);
		});
	});

	suite('_hasViewAreaFrame (the box the author framed as the visible area)',
	function ()
	{
		test('true when the flow reports a frame with a real width + height',
		function ()
		{
			libExpect(makeStub({ _FlowView: { getFrame: () => ({ X: 0, Y: 0, Width: 1200, Height: 400 }) } })._hasViewAreaFrame()).to.equal(true);
		});

		test('false with no flow, no frame, or a degenerate (zero-size) frame',
		function ()
		{
			libExpect(makeStub({ _FlowView: null })._hasViewAreaFrame()).to.equal(false);
			libExpect(makeStub({ _FlowView: { getFrame: () => null } })._hasViewAreaFrame()).to.equal(false);
			libExpect(makeStub({ _FlowView: { getFrame: () => ({ Width: 0, Height: 400 }) } })._hasViewAreaFrame()).to.equal(false);
		});
	});

	// fitBoard picks the fit: a read-only board whose author framed a view area fits that frame's WIDTH (the
	// configured visible area), everything else contains every card (zoomToFit). This is the "view mode
	// respects the configured visible area" rule -- it holds for a plain canvas, not just a jumbotron /
	// background, which is the whole point of letting people frame a view area on any board.
	suite('fitBoard honors a view-area frame in view mode, whatever the display style',
	function ()
	{
		function makeFitStub(pEditable, pFrame)
		{
			let tmpCalls = [];
			let tmpStub = makeStub(
			{
				options: { Editable: pEditable },
				_FlowView:
				{
					getFrame: () => pFrame,
					fitToWidth: () => tmpCalls.push('fitToWidth'),
					zoomToFit: () => tmpCalls.push('zoomToFit')
				}
			});
			tmpStub._fitCalls = tmpCalls;
			return tmpStub;
		}

		test('a read-only canvas board with a view-area frame fits the frame WIDTH (not a centered zoomToFit)',
		function ()
		{
			let tmpStub = makeFitStub(false, { Width: 1200, Height: 400 });
			tmpStub.fitBoard();
			libExpect(tmpStub._fitCalls).to.deep.equal([ 'fitToWidth' ]);
		});

		test('a read-only board with no view-area frame contains every card (zoomToFit)',
		function ()
		{
			let tmpStub = makeFitStub(false, null);
			tmpStub.fitBoard();
			libExpect(tmpStub._fitCalls).to.deep.equal([ 'zoomToFit' ]);
		});

		test('an editable board contains every card even with a frame (you edit on the full canvas)',
		function ()
		{
			let tmpStub = makeFitStub(true, { Width: 1200, Height: 400 });
			tmpStub.fitBoard();
			libExpect(tmpStub._fitCalls).to.deep.equal([ 'zoomToFit' ]);
		});
	});
});
