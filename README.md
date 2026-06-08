# pict-section-moodboard

[pict-section-moodboard on npm](https://www.npmjs.com/package/pict-section-moodboard) | [MIT License](LICENSE)

A free-form moodboard canvas for the Pict application framework: a board of draggable, resizable
image tiles, sticky notes, and big-type text statements. It is a thin, heavily customized layer over
[pict-section-flow](https://www.npmjs.com/package/pict-section-flow) (no ports, no connections, a
zero-height title bar so cards fill edge to edge), so you get drag, resize, pan, zoom, multi-select,
marquee, alignment guides, and save/restore for free.

Each card is edited through its on-graph properties panel (double-click a card): a textarea plus the
card's parameters (image URL and fit, note color, text font size, rotation). The card body itself is
a read-only display, so the whole card drags from anywhere.

## Install

```bash
npm install pict-section-moodboard
```

It expects `pict-section-flow` (^1.3.0) and `pict-view` (^1.0.68) alongside it.

## Use

Register the view on a Pict instance and render it:

```javascript
const libMoodboard = require('pict-section-moodboard');

pict.addView('Moodboard', libMoodboard.default_configuration, libMoodboard);
pict.views['Moodboard'].render();
```

The board reads and writes its whole state through two methods:

```javascript
let tmpBoard = pict.views['Moodboard'].getBoard();   // { Nodes, Connections, ViewState }
pict.views['Moodboard'].setBoard(tmpBoard);          // restore a saved board
```

## Images

A board is self-contained by default: dropped, pasted, or file-picked images are kept as base64 data
URLs right in the board JSON, and the built-in gallery remembers them.

An embedding application can take over image storage by passing its own `ImageSource`:

```javascript
pict.addView('Moodboard', Object.assign({}, libMoodboard.default_configuration,
    {
        ImageSource: myImageSource,          // see the interface below
        onBoardChanged: (pBoard) => save(pBoard)
    }), libMoodboard);
```

An `ImageSource` declares its own fields, so the gallery builds its filter, sort, and search controls
from whatever metadata the host has:

- `getFields()` returns field descriptors (`{ Key, Label, Type, Searchable, Filterable, Sortable }`).
- `getFilterOptions(key)` returns the distinct values for a filterable field.
- `list({ Search, Filters, Sort })` returns the matching images (an array, or a Promise of one for a
  remote store) as `{ Id, Name, Url, Thumbnail, Metadata }`.
- `upload(file, dataUrl, callback)` stores a dropped or pasted file and calls back with `{ Url }`.
- `add(record)` registers an image added by URL (optional).

The bundled `ImageSource` (exported as `require('pict-section-moodboard').ImageSource`) implements all
of this over an in-memory base64 collection, so the gallery works stand-alone with no backend.

## Autosave

Pass `onBoardChanged` to be called with the current board after any change (debounce it on your side;
it can fire rapidly during a drag). Loading a board with `setBoard` does not trigger it.

## Underlying flow options

The moodboard turns on these `pict-section-flow` options, all available to any flow consumer:
`EnableNodeResizing`, `EnableGridSnap` / `GridSnapSize`, `EnableMultiSelect` (shift-click, marquee,
multi-drag, multi-delete), `EnableAlignmentGuides`, per-node `Rotation`, and `NodeTitleBarHeight: 0`.

## Demo

`example_applications/moodboard_demo` is a stand-alone Pict application that seeds a board and wires a
sample gallery with custom metadata. Build it with `npm run build` and serve its `dist` directory.

## License

MIT. See [LICENSE](LICENSE).
