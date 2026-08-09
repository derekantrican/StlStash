# StlStash

A self-hosted catalog for 3D printing files, with an in-browser 3D previewer. Built as a lightweight alternative to [Manyfold](https://manyfold.app) for people who just want a database, a previewer, and upload/download — without Rails, Redis, or Sidekiq.

## Features

- **Browse** mirrors your existing folder structure exactly, including nested subfolders. Upload a whole directory tree and it's preserved as-is.
- **All Models** is a flat, searchable view across the whole library, one card per file. Only files with an actual 3D/CAD extension (`.stl`, `.3mf`, `.obj`, `.step`, `.stp`, `.sldprt`, `.f3d`, `.scad`) appear here — a `.gcode`, image, or `.csv` sitting in a folder does not, though it's still visible and downloadable from Browse. `Lizard.stl` and `Lizard.3mf` in the same folder are two distinct entries, not merged into one.
- **3D preview** for `.stl`, `.obj`, and `.3mf`, rendered client-side with three.js. Models are reoriented from the Z-up convention used by slicers/print files to three.js's Y-up, with the origin placed at the model's base — as if it were sitting on the print bed — rather than its bounding-box center.
- **Thumbnails** are generated the same way: an isometric render is captured in the browser and cached on the server as a PNG. This keeps all 3D rendering off the server entirely, which matters if you're running this on something like a Raspberry Pi.
- **Upload** individual files, or an entire folder (with subfolders) via the browser's folder picker.
- **Duplicate detection**: a byte-identical file already in the target folder is skipped automatically, regardless of name. A file with the same name in the same folder but different content prompts you to replace it, keep both, or discard the new one.
- **Download** a single file directly, or a model/folder with multiple files as a `.zip`.
- URLs are path-based (e.g. `/model/3D%20printing/Articulated/Lizard`) rather than opaque ids, so links are readable and stable.

## Stack

Node.js + Express + SQLite (`better-sqlite3`) on the backend, React + Vite + three.js on the frontend, served as static files from Express in production. No Redis, no background job queue, no separate database server, and no server-side 3D rendering — idles at well under 100MB RAM.

## Requirements

Node.js 18+

## Development

```bash
cd server && npm install
cd ../client && npm install
```

Run both (two terminals):

```bash
cd server && npm run dev      # http://localhost:4000 (API)
cd client && npm run dev      # http://localhost:5173 (UI, proxies /api to :4000)
```

## Production

```bash
cd client && npm run build    # outputs client/dist
cd ../server && npm start     # serves the API and the built client on one port
```

Then visit `http://localhost:4000` (or set `PORT` to change it).

## Data location

Everything lives under `data/` at the repo root:

- `data/stlstash.db` — SQLite database (folders, models, files, metadata)
- `data/storage/` — uploaded file contents, stored flat and keyed by file id
- `data/thumbnails/` — cached PNG thumbnails, keyed by model id
- `data/pending/` — temporary holding area for files awaiting a duplicate/conflict decision

Set `DATA_DIR` to point these somewhere else (e.g. an external drive) if you want.

## Models and files

A "model" isn't something you create separately — each uploaded file gets its own model row (holding its display name, description, tags, and thumbnail), keyed by its exact filename within its folder. Two files only share a model if one is a straight re-upload of the other at the same path. Different extensions, different revisions, anything not byte-identical or name-identical — all separate models.

Browse always operates on folders and shows every file individually. All Models is the same underlying files, just filtered to 3D/CAD extensions and flattened across the whole tree.

## Known limitations

- The bundled 3MF loader (from three.js) doesn't fully support every 3MF variant — files that reference sub-components it can't resolve (something seen from some slicer exports) will show a "can't parse this file" message in the previewer rather than crashing, but won't render. Downloading the file still works.
- `.step`, `.stp`, `.sldprt`, `.f3d`, `.scad`, `.dxf`, and other CAD/vector formats are stored and downloadable but not previewed in-browser.
- No authentication. This is meant to run on a trusted home network.
