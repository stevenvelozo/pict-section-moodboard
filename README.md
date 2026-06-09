# pict-section-moodboard

[pict-section-moodboard on npm](https://www.npmjs.com/package/pict-section-moodboard) | [MIT License](LICENSE)

A free-form moodboard canvas for the Pict application framework: a board of draggable, resizable
image tiles, sticky notes, big-type text statements, and stickers, over a board background you can
tint. It is a thin, heavily customized layer over
[pict-section-flow](https://www.npmjs.com/package/pict-section-flow) (no ports, no connections, a
zero-height title bar so cards fill edge to edge), so you get drag, resize, pan, zoom, multi-select,
marquee, alignment guides, and save/restore for free.

Each card is edited through its on-graph properties panel (double-click a card): a textarea plus the
card's parameters (image URL and fit; note color; a curated font family, weight, size, and text
color for notes and text; sticker URL; rotation). The card body itself is a read-only display, so the
whole card drags from anywhere.

A board can be shown read-only (`Editable: false`): the edit toolbar and card panels are off, but a
viewer bar gives fit-to-content, zoom in/out, and a fullscreen toggle, and the board still pans and
zooms so a viewer can look around without changing anything.

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

## Stickers

Stickers are transparent cutouts (PNG or SVG) that float on the board with no card chrome. The
toolbar's "Stickers" button opens the same gallery in sticker mode (search, upload, pick), backed by
a `StickerSource` with the exact same interface as `ImageSource`. The bundled `StickerSource`
(exported as `require('pict-section-moodboard').StickerSource`) ships a small built-in set of shapes,
so stickers work stand-alone; pass your own to serve a customer library:

```javascript
pict.addView('Moodboard', Object.assign({}, libMoodboard.default_configuration,
    {
        StickerSource: myStickerSource    // same interface as ImageSource
    }), libMoodboard);
```

Uploaded SVG is rendered through an `<img>` (which neuters embedded script); a host `StickerSource`
that persists bytes should still sanitize SVG on its end before storing.

## Board background and fonts

The board background is a solid color stored on `ViewState.BackgroundColor`; the toolbar offers a set
of curated swatches, a custom color, and a "no background" option. Note and text cards carry a curated
font family (a short list of web-safe stacks, no web-font loading), a weight, a size, and a text
color, all set from each card's properties panel and stored on the node data. All of this round-trips
through `getBoard` / `setBoard`.

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
