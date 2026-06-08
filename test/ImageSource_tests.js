const libChai = require('chai');
const libExpect = libChai.expect;

const libImageSource = require('../source/sources/ImageSource-Base.js');

function makeSource()
{
	return new libImageSource(
		{
			Fields:
			[
				{ Key: 'Name',    Label: 'Name',    Type: 'string', Searchable: true, Sortable: true },
				{ Key: 'Palette', Label: 'Palette', Type: 'enum',   Filterable: true, Sortable: true, Searchable: true },
				{ Key: 'AddedAt', Label: 'Added',   Type: 'date',   Sortable: true }
			],
			Items:
			[
				{ Url: 'a', Name: 'Sunset',    Metadata: { Palette: 'warm',    AddedAt: 3 } },
				{ Url: 'b', Name: 'Ocean',     Metadata: { Palette: 'cool',    AddedAt: 1 } },
				{ Url: 'c', Name: 'Sand dune', Metadata: { Palette: 'neutral', AddedAt: 2 } }
			]
		});
}

suite('MoodboardImageSource',
function ()
{
	suite('list / query',
	function ()
	{
		test('returns everything with an empty query', function ()
		{
			libExpect(makeSource().list({}).length).to.equal(3);
		});

		test('search matches Name and searchable metadata, case-insensitively', function ()
		{
			let tmpSource = makeSource();
			libExpect(tmpSource.list({ Search: 'sun' }).map((pItem) => pItem.Name)).to.deep.equal(['Sunset']);
			// 'cool' is a searchable Palette value
			libExpect(tmpSource.list({ Search: 'COOL' }).map((pItem) => pItem.Name)).to.deep.equal(['Ocean']);
		});

		test('filters by an exact field value', function ()
		{
			libExpect(makeSource().list({ Filters: { Palette: 'warm' } }).map((pItem) => pItem.Name)).to.deep.equal(['Sunset']);
		});

		test('an empty filter value is ignored (matches all)', function ()
		{
			libExpect(makeSource().list({ Filters: { Palette: '' } }).length).to.equal(3);
		});

		test('sorts by a field, ascending and descending', function ()
		{
			let tmpSource = makeSource();
			libExpect(tmpSource.list({ Sort: { Field: 'AddedAt', Direction: 'asc' } }).map((pItem) => pItem.Name)).to.deep.equal(['Ocean', 'Sand dune', 'Sunset']);
			libExpect(tmpSource.list({ Sort: { Field: 'AddedAt', Direction: 'desc' } }).map((pItem) => pItem.Name)).to.deep.equal(['Sunset', 'Sand dune', 'Ocean']);
		});

		test('combines search, filter, and sort', function ()
		{
			let tmpSource = makeSource();
			tmpSource.add({ Url: 'd', Name: 'Coral', Metadata: { Palette: 'warm', AddedAt: 5 } });
			let tmpResult = tmpSource.list({ Filters: { Palette: 'warm' }, Sort: { Field: 'Name', Direction: 'asc' } }).map((pItem) => pItem.Name);
			libExpect(tmpResult).to.deep.equal(['Coral', 'Sunset']);
		});
	});

	suite('add / dedup / fields',
	function ()
	{
		test('add assigns an Id and dedupes by Url', function ()
		{
			let tmpSource = makeSource();
			let tmpFirst = tmpSource.add({ Url: 'z', Name: 'New' });
			libExpect(tmpFirst.Id).to.be.a('string');
			let tmpAgain = tmpSource.add({ Url: 'z', Name: 'New again' });
			libExpect(tmpAgain).to.equal(tmpFirst);
			libExpect(tmpSource.list({}).length).to.equal(4);
		});

		test('add ignores a record with no Url', function ()
		{
			let tmpSource = makeSource();
			libExpect(tmpSource.add({ Name: 'no url' })).to.equal(null);
			libExpect(tmpSource.list({}).length).to.equal(3);
		});

		test('getFilterOptions returns distinct values for a field', function ()
		{
			libExpect(makeSource().getFilterOptions('Palette')).to.deep.equal(['cool', 'neutral', 'warm']);
		});

		test('getFields returns the declared field list', function ()
		{
			libExpect(makeSource().getFields().map((pField) => pField.Key)).to.deep.equal(['Name', 'Palette', 'AddedAt']);
		});

		test('upload stores the data url and reports the record', function (fDone)
		{
			let tmpSource = makeSource();
			tmpSource.upload({ name: 'pic.png', type: 'image/png', size: 1024 }, 'data:image/png;base64,XX', function (pErr, pRecord)
			{
				libExpect(pErr).to.equal(null);
				libExpect(pRecord.Url).to.equal('data:image/png;base64,XX');
				libExpect(pRecord.Metadata.Type).to.equal('image/png');
				libExpect(pRecord.Metadata.SizeBytes).to.equal(1024);
				libExpect(tmpSource.list({}).length).to.equal(4);
				fDone();
			});
		});
	});
});
