const libChai = require('chai');
const libExpect = libChai.expect;

const libMoodboardView = require('../source/views/PictView-Moodboard.js');

// The moodboard contributes its own buttons to pict-section-flow's one toolbar through the flow's
// ToolbarExtraButtons extension: a Background button (editable boards only) plus whatever Edit / Done
// button the host supplies via options.ToolbarButtons. Clicks route through onToolbarButton -- the
// Background button opens the popover, everything else forwards to the host. These are harness-free
// unit tests of that wiring (prototype methods called against light stubs; no DOM / Pict app).
suite('Moodboard flow-toolbar buttons',
function ()
{
	suite('_buildToolbarButtons',
	function ()
	{
		test('an editable board leads with Background + Connections, then the host buttons',
		function ()
		{
			let tmpStub = { options: { ToolbarButtons: [ { Hash: 'done', Icon: 'check', Label: 'Done' } ] } };
			let tmpButtons = libMoodboardView.prototype._buildToolbarButtons.call(tmpStub, true);
			libExpect(tmpButtons.map((pButton) => pButton.Hash)).to.deep.equal([ 'mb-background', 'mb-connect', 'done' ]);
			libExpect(tmpButtons[0].Icon).to.equal('background');
			libExpect(tmpButtons[1].Icon).to.equal('connect');
		});

		test('a read-only board has no Background button, only the host buttons',
		function ()
		{
			let tmpStub = { options: { ToolbarButtons: [ { Hash: 'edit', Icon: 'edit', Label: 'Edit board' } ] } };
			let tmpButtons = libMoodboardView.prototype._buildToolbarButtons.call(tmpStub, false);
			libExpect(tmpButtons.length).to.equal(1);
			libExpect(tmpButtons[0].Hash).to.equal('edit');
		});

		test('no host buttons + read-only yields an empty set (a bare nav toolbar)',
		function ()
		{
			let tmpStub = { options: {} };
			libExpect(libMoodboardView.prototype._buildToolbarButtons.call(tmpStub, false).length).to.equal(0);
		});

		test('no host buttons + editable yields the Background + Connections buttons',
		function ()
		{
			let tmpStub = { options: {} };
			let tmpButtons = libMoodboardView.prototype._buildToolbarButtons.call(tmpStub, true);
			libExpect(tmpButtons.map((pButton) => pButton.Hash)).to.deep.equal([ 'mb-background', 'mb-connect' ]);
		});
	});

	suite('onToolbarButton routing',
	function ()
	{
		test('the Background button opens the popover (handled internally)',
		function ()
		{
			let tmpOpened = [];
			let tmpElement = { id: 'bg-button' };
			let tmpStub =
			{
				options: { onToolbarButton: () => { throw new Error('host hook should not fire for mb-background'); } },
				openBackgroundPopover: (pEl) => { tmpOpened.push(pEl); }
			};
			libMoodboardView.prototype.onToolbarButton.call(tmpStub, 'mb-background', tmpElement);
			libExpect(tmpOpened.length).to.equal(1);
			libExpect(tmpOpened[0]).to.equal(tmpElement);
		});

		test('a host button forwards to options.onToolbarButton with (hash, element)',
		function ()
		{
			let tmpForwarded = [];
			let tmpElement = { id: 'edit-button' };
			let tmpStub = { options: { onToolbarButton: (pHash, pEl) => { tmpForwarded.push({ Hash: pHash, El: pEl }); } } };
			libMoodboardView.prototype.onToolbarButton.call(tmpStub, 'edit', tmpElement);
			libExpect(tmpForwarded.length).to.equal(1);
			libExpect(tmpForwarded[0].Hash).to.equal('edit');
			libExpect(tmpForwarded[0].El).to.equal(tmpElement);
		});

		test('a host button with no hook configured is a no-op (does not throw)',
		function ()
		{
			let tmpStub = { options: {} };
			libExpect(function () { libMoodboardView.prototype.onToolbarButton.call(tmpStub, 'edit', {}); }).to.not.throw();
		});
	});
});
