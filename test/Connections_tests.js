const libChai = require('chai');
const libExpect = libChai.expect;

const libMoodboardView = require('../source/views/PictView-Moodboard.js');

// A card's connection points have three states (setConnectMode): 'off' (no anchors), 'edit' (twelve
// anchors, shown while editing -- the default on-state) and 'always' (anchors shown to viewers too,
// via the node's NodeClass). When on, twelve output anchors are placed three to a side (the flow's
// twelve side-names), so a line can attach where it should; undirected connections let any anchor link
// to any other. These are harness-free unit tests of that data change (prototype method on a stub).
const _EXPECTED_SIDES = [ 'left-top', 'left', 'left-bottom', 'right-top', 'right', 'right-bottom', 'top-left', 'top', 'top-right', 'bottom-left', 'bottom', 'bottom-right' ];

function makeStub(pNode, pConnections)
{
	return {
		fable: { getUUID: (function () { let i = 0; return function () { i += 1; return 'uuid' + i; }; })() },
		_FlowView:
		{
			getNode: function () { return pNode; },
			renderFlow: function () {},
			marshalFromView: function () {},
			flowData: { Connections: pConnections || [] }
		},
		_emitChange: function () {},
		_updateConnectButton: function () {}
	};
}

suite('Moodboard card connection points (setConnectMode)',
function ()
{
	test("'edit' places twelve output anchors, three to a side, and marks the card editing-only",
	function ()
	{
		let tmpNode = { Hash: 'n1', Data: {}, Ports: [] };
		libMoodboardView.prototype.setConnectMode.call(makeStub(tmpNode), 'n1', 'edit');
		libExpect(tmpNode.Ports.length).to.equal(12);
		libExpect(tmpNode.Ports.map((pPort) => pPort.Side)).to.deep.equal(_EXPECTED_SIDES);
		libExpect(tmpNode.Ports.every((pPort) => pPort.Direction === 'output')).to.equal(true);
		libExpect(tmpNode.Ports.every((pPort) => typeof pPort.Hash === 'string' && pPort.Hash.length > 0)).to.equal(true);
		libExpect(tmpNode.Data.ConnectMode).to.equal('edit');
		libExpect(tmpNode.NodeClass).to.equal('');
		libExpect(tmpNode.Data.ConnectEditSel).to.equal('selected');
		libExpect(tmpNode.Data.ConnectOffSel).to.equal('');
		libExpect(tmpNode.Data.ConnectAlwaysSel).to.equal('');
	});

	test("'always' also stamps the node class that keeps dots visible to viewers",
	function ()
	{
		let tmpNode = { Hash: 'n1', Data: {}, Ports: [] };
		libMoodboardView.prototype.setConnectMode.call(makeStub(tmpNode), 'n1', 'always');
		libExpect(tmpNode.Ports.length).to.equal(12);
		libExpect(tmpNode.NodeClass).to.equal('mb-conn-always');
		libExpect(tmpNode.Data.ConnectMode).to.equal('always');
		libExpect(tmpNode.Data.ConnectAlwaysSel).to.equal('selected');
	});

	test("'off' clears the anchors + class and drops links touching the card",
	function ()
	{
		let tmpNode = { Hash: 'n1', Data: { ConnectMode: 'edit' }, Ports: [ { Hash: 'p', Side: 'top', Direction: 'output' } ], NodeClass: 'mb-conn-always' };
		let tmpConnections =
		[
			{ Hash: 'c1', SourceNodeHash: 'n1', TargetNodeHash: 'n2' },
			{ Hash: 'c2', SourceNodeHash: 'n3', TargetNodeHash: 'n1' },
			{ Hash: 'c3', SourceNodeHash: 'n3', TargetNodeHash: 'n4' }
		];
		let tmpStub = makeStub(tmpNode, tmpConnections);
		libMoodboardView.prototype.setConnectMode.call(tmpStub, 'n1', 'off');
		libExpect(tmpNode.Ports.length).to.equal(0);
		libExpect(tmpNode.NodeClass).to.equal('');
		libExpect(tmpNode.Data.ConnectMode).to.equal('off');
		libExpect(tmpNode.Data.ConnectOffSel).to.equal('selected');
		libExpect(tmpStub._FlowView.flowData.Connections.map((pConn) => pConn.Hash)).to.deep.equal([ 'c3' ]);
	});

	test('an unknown mode falls back to the default on-state (edit)',
	function ()
	{
		let tmpNode = { Hash: 'n1', Data: {}, Ports: [] };
		libMoodboardView.prototype.setConnectMode.call(makeStub(tmpNode), 'n1', 'nonsense');
		libExpect(tmpNode.Ports.length).to.equal(12);
		libExpect(tmpNode.Data.ConnectMode).to.equal('edit');
	});
});
