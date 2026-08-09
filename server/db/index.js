const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const { v4: uuidv4 } = require("uuid");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "..", "data");
const STORAGE_DIR = path.join(DATA_DIR, "storage");
const PENDING_DIR = path.join(DATA_DIR, "pending");
const THUMBNAILS_DIR = path.join(DATA_DIR, "thumbnails");
const DB_PATH = path.join(DATA_DIR, "stlstash.db");
const ROOT_FOLDER_ID = "root";

fs.mkdirSync(STORAGE_DIR, { recursive: true });
fs.mkdirSync(PENDING_DIR, { recursive: true });
fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    tags TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS models (
    id TEXT PRIMARY KEY,
    folder_id TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    base_name TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    tags TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(folder_id, base_name)
  );

  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    folder_id TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    model_id TEXT REFERENCES models(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    size INTEGER NOT NULL,
    content_type TEXT,
    checksum TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS pending_uploads (
    id TEXT PRIMARY KEY,
    folder_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    size INTEGER NOT NULL,
    content_type TEXT,
    checksum TEXT NOT NULL,
    conflict_reason TEXT NOT NULL,
    existing_file_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id);
  CREATE INDEX IF NOT EXISTS idx_files_folder_id ON files(folder_id);
  CREATE INDEX IF NOT EXISTS idx_files_checksum ON files(checksum);
  CREATE INDEX IF NOT EXISTS idx_models_folder_id ON models(folder_id);
`);

db.prepare(
  "INSERT OR IGNORE INTO folders (id, parent_id, name) VALUES (?, NULL, ?)"
).run(ROOT_FOLDER_ID, "StlStash");

// Migration: files predating the `models` table don't have a model_id yet. Group them by
// (folder, exact filename) - each distinct filename is its own model.
const hasModelIdColumn = db
  .prepare("PRAGMA table_info(files)")
  .all()
  .some((c) => c.name === "model_id");
if (!hasModelIdColumn) {
  db.exec(`ALTER TABLE files ADD COLUMN model_id TEXT`);
  const backfill = db.transaction(() => {
    const orphanFiles = db.prepare("SELECT * FROM files WHERE model_id IS NULL").all();
    const modelIdByKey = new Map();
    const insertModel = db.prepare(
      "INSERT INTO models (id, folder_id, base_name, name) VALUES (?, ?, ?, ?)"
    );
    const setFileModel = db.prepare("UPDATE files SET model_id = ? WHERE id = ?");
    for (const file of orphanFiles) {
      const base = file.original_name.trim().toLowerCase();
      const key = `${file.folder_id}|${base}`;
      let modelId = modelIdByKey.get(key);
      if (!modelId) {
        modelId = uuidv4();
        const displayName = file.original_name.replace(/\.[^./\\]+$/, "");
        insertModel.run(modelId, file.folder_id, base, displayName);
        modelIdByKey.set(key, modelId);
      }
      setFileModel.run(modelId, file.id);
    }
  });
  backfill();
}
db.prepare("CREATE INDEX IF NOT EXISTS idx_files_model_id ON files(model_id)").run();

// Fix-up: earlier versions grouped files by normalized base name across extensions, so
// "Lizard.stl" and "Lizard.3mf" ended up sharing one model. Split any model that still has
// more than one file into one model per file - the first file keeps the original model's id,
// tags, and description; the rest get fresh model rows. Self-limiting: once every model has
// at most one file (which is what normal uploads always produce now - see
// resolveOrCreateModel), there's nothing left to split, so this is safe to run on every start.
const splitMultiFileModels = db.transaction(() => {
  const multiFileModelIds = db
    .prepare(
      `SELECT model_id FROM files WHERE model_id IS NOT NULL
       GROUP BY model_id HAVING COUNT(*) > 1`
    )
    .all()
    .map((r) => r.model_id);

  const insertModel = db.prepare(
    "INSERT INTO models (id, folder_id, base_name, name) VALUES (?, ?, ?, ?)"
  );
  const findModelByKey = db.prepare(
    "SELECT id FROM models WHERE folder_id = ? AND base_name = ?"
  );
  const setFileModel = db.prepare("UPDATE files SET model_id = ? WHERE id = ?");
  const renameModel = db.prepare("UPDATE models SET base_name = ? WHERE id = ?");

  for (const modelId of multiFileModelIds) {
    const files = db
      .prepare("SELECT * FROM files WHERE model_id = ? ORDER BY created_at ASC")
      .all(modelId);
    const [keep, ...rest] = files;

    renameModel.run(keep.original_name.trim().toLowerCase(), modelId);
    fs.rm(path.join(THUMBNAILS_DIR, `${modelId}.png`), { force: true }, () => {});

    for (const file of rest) {
      const key = file.original_name.trim().toLowerCase();
      let target = findModelByKey.get(file.folder_id, key);
      if (!target) {
        const id = uuidv4();
        const displayName = file.original_name.replace(/\.[^./\\]+$/, "");
        insertModel.run(id, file.folder_id, key, displayName);
        target = { id };
      }
      setFileModel.run(target.id, file.id);
    }
  }
});
splitMultiFileModels();

// Fix-up: single-file models created before the change above still have their old
// extension-stripped base_name (e.g. "lizard_5.2_curl" instead of "lizard_5.2_curl.3mf").
// That's harmless (it can't collide with the new key format), but normalize it anyway for
// consistency. Idempotent - a no-op once every model's base_name already matches its file.
const normalizeSingleFileModelKeys = db.transaction(() => {
  const rows = db
    .prepare(
      `SELECT m.id, m.base_name, f.original_name
       FROM models m JOIN files f ON f.model_id = m.id
       WHERE (SELECT COUNT(*) FROM files WHERE model_id = m.id) = 1`
    )
    .all();
  const renameModel = db.prepare("UPDATE models SET base_name = ? WHERE id = ?");
  for (const row of rows) {
    const correctKey = row.original_name.trim().toLowerCase();
    if (row.base_name !== correctKey) {
      renameModel.run(correctKey, row.id);
    }
  }
});
normalizeSingleFileModelKeys();

// Discard conflict uploads nobody resolved (avoids unbounded disk growth in PENDING_DIR).
function cleanupStalePending(maxAgeHours = 24) {
  const stale = db
    .prepare(
      `SELECT * FROM pending_uploads WHERE created_at < datetime('now', ?)`
    )
    .all(`-${maxAgeHours} hours`);
  for (const p of stale) {
    fs.rm(path.join(PENDING_DIR, p.filename), { force: true }, () => {});
  }
  db.prepare(`DELETE FROM pending_uploads WHERE created_at < datetime('now', ?)`).run(
    `-${maxAgeHours} hours`
  );
}
cleanupStalePending();

module.exports = {
  db,
  DATA_DIR,
  STORAGE_DIR,
  PENDING_DIR,
  THUMBNAILS_DIR,
  ROOT_FOLDER_ID,
  cleanupStalePending,
};
