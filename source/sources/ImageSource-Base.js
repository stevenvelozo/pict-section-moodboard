'use strict';

/**
 * MoodboardImageSource: the gallery's pluggable image backend.
 *
 * The moodboard gallery does not know where images come from. It asks a source for its fields
 * (so it can build filter / sort / search controls) and for a list of images matching a query.
 * This base class is the built-in, stand-alone source: an in-memory collection of image records,
 * each carrying a Url (a direct URL or a base64 data URL) and a metadata bag. It is what a board
 * uses when no host source is supplied, so everything works on built-ins.
 *
 * An embedding application replaces it (options.ImageSource) with one that serves its own library
 * (for plansheet, the Media blobs) and declares its own metadata fields; the gallery then filters,
 * sorts, and searches over whatever that source exposes. A host source only has to implement
 * getFields(), list(query, callback), and (optionally) add() and upload().
 *
 * Field shape: { Key, Label, Type: 'string'|'enum'|'number'|'date', Searchable?, Filterable?, Sortable? }.
 * 'Name' is a top-level field on each record; every other field reads from record.Metadata[Key].
 *
 * Query shape: { Search: string, Filters: { <Key>: value }, Sort: { Field, Direction: 'asc'|'desc' } }.
 *
 * @author Steven Velozo <steven@velozo.com>
 * @license MIT
 */

const _DEFAULT_FIELDS =
[
	{ Key: 'Name',    Label: 'Name',  Type: 'string', Searchable: true,  Sortable: true },
	{ Key: 'Type',    Label: 'Type',  Type: 'enum',   Filterable: true,  Sortable: true, Searchable: true },
	{ Key: 'AddedAt', Label: 'Added', Type: 'date',   Sortable: true }
];

let _IdCounter = 0;

class MoodboardImageSource
{
	constructor(pOptions)
	{
		let tmpOptions = pOptions || {};
		this._Items = [];
		this._Fields = Array.isArray(tmpOptions.Fields) ? tmpOptions.Fields : _DEFAULT_FIELDS;
		if (Array.isArray(tmpOptions.Items))
		{
			tmpOptions.Items.forEach((pItem) => this.add(pItem));
		}
	}

	/**
	 * The metadata fields this source exposes. The gallery builds its controls from this list.
	 */
	getFields() { return this._Fields; }

	/**
	 * Distinct values for an enum field, for building a filter dropdown.
	 */
	getFilterOptions(pKey)
	{
		let tmpSeen = {};
		let tmpValues = [];
		for (let i = 0; i < this._Items.length; i++)
		{
			let tmpValue = this._fieldValue(this._Items[i], pKey);
			if (tmpValue !== '' && tmpValue != null && !tmpSeen[tmpValue])
			{
				tmpSeen[tmpValue] = true;
				tmpValues.push(tmpValue);
			}
		}
		tmpValues.sort();
		return tmpValues;
	}

	/**
	 * Add an image record. Deduplicates by Url. Returns the stored record (with an Id).
	 * @param {Object} pRecord - { Url, Name?, Thumbnail?, Metadata? }
	 */
	add(pRecord)
	{
		if (!pRecord || !pRecord.Url) { return null; }
		let tmpExisting = this._Items.find((pItem) => pItem.Url === pRecord.Url);
		if (tmpExisting) { return tmpExisting; }

		let tmpRecord =
		{
			Id: pRecord.Id || ('img-' + (++_IdCounter)),
			Url: pRecord.Url,
			Name: pRecord.Name || 'image',
			Thumbnail: pRecord.Thumbnail || pRecord.Url,
			Metadata: Object.assign({}, pRecord.Metadata)
		};
		this._Items.push(tmpRecord);
		return tmpRecord;
	}

	/**
	 * Store an uploaded file. The base source keeps the data URL in memory; a host overrides this to
	 * push the bytes to its own store and hand back a record whose Url points there.
	 * @param {File} pFile
	 * @param {string} pDataUrl - the file read as a base64 data URL
	 * @param {Function} fCallback - function(error, record)
	 */
	upload(pFile, pDataUrl, fCallback)
	{
		let tmpRecord = this.add(
			{
				Url: pDataUrl,
				Name: (pFile && pFile.name) || 'image',
				Metadata: { Type: (pFile && pFile.type) || 'image', SizeBytes: (pFile && pFile.size) || 0, AddedAt: Date.now() }
			});
		if (typeof fCallback === 'function') { fCallback(null, tmpRecord); }
		return tmpRecord;
	}

	/**
	 * Return the images matching a query (search, filters, sort). Node-style callback plus a direct
	 * return so callers can use whichever is convenient.
	 */
	list(pQuery, fCallback)
	{
		let tmpQuery = pQuery || {};
		let tmpItems = this._Items.slice();

		let tmpSearch = (tmpQuery.Search || '').trim().toLowerCase();
		if (tmpSearch)
		{
			tmpItems = tmpItems.filter((pItem) => this._searchableText(pItem).indexOf(tmpSearch) >= 0);
		}

		let tmpFilters = tmpQuery.Filters || {};
		Object.keys(tmpFilters).forEach((pKey) =>
		{
			let tmpValue = tmpFilters[pKey];
			if (tmpValue === '' || tmpValue == null) { return; }
			tmpItems = tmpItems.filter((pItem) => String(this._fieldValue(pItem, pKey)) === String(tmpValue));
		});

		if (tmpQuery.Sort && tmpQuery.Sort.Field)
		{
			let tmpField = tmpQuery.Sort.Field;
			let tmpDir = (tmpQuery.Sort.Direction === 'desc') ? -1 : 1;
			tmpItems.sort((pA, pB) =>
			{
				let tmpAV = this._fieldValue(pA, tmpField);
				let tmpBV = this._fieldValue(pB, tmpField);
				if (tmpAV < tmpBV) { return -1 * tmpDir; }
				if (tmpAV > tmpBV) { return 1 * tmpDir; }
				return 0;
			});
		}

		if (typeof fCallback === 'function') { fCallback(null, tmpItems); }
		return tmpItems;
	}

	_fieldValue(pItem, pKey)
	{
		if (pKey === 'Name') { return pItem.Name || ''; }
		return (pItem.Metadata && pItem.Metadata[pKey] != null) ? pItem.Metadata[pKey] : '';
	}

	_searchableText(pItem)
	{
		let tmpParts = [pItem.Name || ''];
		this._Fields.filter((pField) => pField.Searchable).forEach((pField) =>
		{
			tmpParts.push(String(this._fieldValue(pItem, pField.Key)));
		});
		return tmpParts.join(' ').toLowerCase();
	}
}

module.exports = MoodboardImageSource;
module.exports.DEFAULT_FIELDS = _DEFAULT_FIELDS;
