const libChai = require('chai');
const libExpect = libChai.expect;

const libStickerSource = require('../source/sources/StickerSource-Base.js');
const libMoodboard = require('../source/Pict-Section-Moodboard.js');

suite('MoodboardStickerSource',
function ()
{
	suite('built-in set',
	function ()
	{
		test('seeds the built-in stickers when no Items are supplied', function ()
		{
			let tmpSource = new libStickerSource();
			libExpect(tmpSource.list({}).length).to.equal(libStickerSource.BUILTIN_STICKERS.length);
			libExpect(tmpSource.list({}).length).to.be.greaterThan(0);
		});

		test('every built-in sticker has an Id, a Name, and an image data URL', function ()
		{
			libStickerSource.BUILTIN_STICKERS.forEach(function (pSticker)
			{
				libExpect(pSticker.Id).to.be.a('string').and.not.equal('');
				libExpect(pSticker.Name).to.be.a('string').and.not.equal('');
				libExpect(pSticker.Url.indexOf('data:image/')).to.equal(0);
			});
		});

		test('a host can supply its own Items instead of the built-ins', function ()
		{
			let tmpSource = new libStickerSource({ Items: [ { Url: 'x', Name: 'Custom' } ] });
			libExpect(tmpSource.list({}).length).to.equal(1);
			libExpect(tmpSource.list({})[0].Name).to.equal('Custom');
		});
	});

	suite('inherited media behavior',
	function ()
	{
		test('search matches the sticker Name, case-insensitively', function ()
		{
			let tmpSource = new libStickerSource();
			let tmpStar = libStickerSource.BUILTIN_STICKERS[0];
			let tmpResults = tmpSource.list({ Search: tmpStar.Name.toLowerCase() });
			libExpect(tmpResults.map((pItem) => pItem.Id)).to.include(tmpStar.Id);
		});

		test('add() appends a sticker and dedupes by Url', function ()
		{
			let tmpSource = new libStickerSource();
			let tmpBefore = tmpSource.list({}).length;
			tmpSource.add({ Url: 'data:image/png;base64,AAAA', Name: 'Added' });
			libExpect(tmpSource.list({}).length).to.equal(tmpBefore + 1);
			tmpSource.add({ Url: 'data:image/png;base64,AAAA', Name: 'Added again' });
			libExpect(tmpSource.list({}).length).to.equal(tmpBefore + 1);
		});

		test('upload() stores a file and returns a record with a Url', function ()
		{
			let tmpSource = new libStickerSource();
			let tmpRecord = tmpSource.upload({ name: 'badge.svg', type: 'image/svg+xml', size: 10 }, 'data:image/svg+xml,<svg/>', null);
			libExpect(tmpRecord).to.be.an('object');
			libExpect(tmpRecord.Url).to.equal('data:image/svg+xml,<svg/>');
		});
	});

	suite('module exports',
	function ()
	{
		test('the module entry exports the sticker card and source', function ()
		{
			libExpect(libMoodboard.MoodStickerCard).to.be.a('function');
			libExpect(libMoodboard.StickerSource).to.be.a('function');
		});
	});
});
