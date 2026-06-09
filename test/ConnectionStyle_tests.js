const libChai = require('chai');
const libExpect = libChai.expect;

const libMoodboardView = require('../source/views/PictView-Moodboard.js');

// The moodboard styles its own links: a new link gets a sensible default look (a thin gray line with an
// arrow at the finish end), and the connection panel's setters change color / width / line style / the
// marker at each end. setConnection* mutate the connection's Data and refresh the 'selected' strings the
// panel <select>s bind to. Harness-free unit tests against light stubs.
function makeStub(pConnections)
{
	return {
		_FlowView: { flowData: { Connections: pConnections || [] }, renderFlow: function () {}, marshalFromView: function () {} },
		_emitChange: function () {},
		_stampConnectionSelects: libMoodboardView.prototype._stampConnectionSelects,
		_updateConnection: libMoodboardView.prototype._updateConnection
	};
}

suite('Moodboard connection appearance',
function ()
{
	test('_onConnectionCreated stamps a sensible default look on a fresh link',
	function ()
	{
		let tmpConnection = { Hash: 'c1', Data: {} };
		libMoodboardView.prototype._onConnectionCreated.call(makeStub([ tmpConnection ]), tmpConnection);
		libExpect(tmpConnection.Data.StrokeColor).to.be.a('string');
		libExpect(tmpConnection.Data.StrokeWidth).to.equal(2);
		libExpect(tmpConnection.Data.StrokeStyle).to.equal('solid');
		libExpect(tmpConnection.Data.SourceMarker).to.equal('none');
		libExpect(tmpConnection.Data.TargetMarker).to.equal('arrow');
		libExpect(tmpConnection.Data.TgtArrowSel).to.equal('selected');
		libExpect(tmpConnection.Data.SrcNoneSel).to.equal('selected');
	});

	test('_onConnectionCreated leaves an already-styled link (e.g. loaded) untouched',
	function ()
	{
		let tmpConnection = { Hash: 'c1', Data: { TargetMarker: 'dot', StrokeColor: '#123456' } };
		libMoodboardView.prototype._onConnectionCreated.call(makeStub([ tmpConnection ]), tmpConnection);
		libExpect(tmpConnection.Data.StrokeColor).to.equal('#123456');
		libExpect(tmpConnection.Data.TargetMarker).to.equal('dot');
	});

	test('setConnectionTargetMarker updates Data + the selected strings',
	function ()
	{
		let tmpConnection = { Hash: 'c1', Data: {} };
		libMoodboardView.prototype.setConnectionTargetMarker.call(makeStub([ tmpConnection ]), 'c1', 'square');
		libExpect(tmpConnection.Data.TargetMarker).to.equal('square');
		libExpect(tmpConnection.Data.TgtSquareSel).to.equal('selected');
		libExpect(tmpConnection.Data.TgtArrowSel).to.equal('');
	});

	test('setConnectionLineStyle accepts solid/dashed/dotted and falls back to solid',
	function ()
	{
		let tmpConnection = { Hash: 'c1', Data: {} };
		let tmpStub = makeStub([ tmpConnection ]);
		libMoodboardView.prototype.setConnectionLineStyle.call(tmpStub, 'c1', 'dotted');
		libExpect(tmpConnection.Data.StrokeStyle).to.equal('dotted');
		libExpect(tmpConnection.Data.StyleDottedSel).to.equal('selected');
		libMoodboardView.prototype.setConnectionLineStyle.call(tmpStub, 'c1', 'nonsense');
		libExpect(tmpConnection.Data.StrokeStyle).to.equal('solid');
	});

	test('setConnectionWidth coerces to a positive integer',
	function ()
	{
		let tmpConnection = { Hash: 'c1', Data: {} };
		libMoodboardView.prototype.setConnectionWidth.call(makeStub([ tmpConnection ]), 'c1', '5');
		libExpect(tmpConnection.Data.StrokeWidth).to.equal(5);
	});
});
