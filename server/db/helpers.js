const { v4: uuidv4 } = require("uuid");
const { db, ROOT_FOLDER_ID } = require("./index");
const { MODEL_EXTENSIONS } = require("../lib/modelExtensions");

// Grouping/uniqueness key for a model within a folder: the exact filename (including
// extension), case-insensitive. "Lizard.stl" and "Lizard.3mf" are deliberately NOT the same
// key - each file is its own model unless it's a byte-for-byte or exact-name re-upload.
function modelKeyFor(fileName) {
  return fileName.trim().toLowerCase();
}

function getFolder(id) {
  return db.prepare("SELECT * FROM folders WHERE id = ?").get(id);
}

// Ordered list of {id, name} from the root down to (and including) folderId
function getBreadcrumb(folderId) {
  const rows = db
    .prepare(
      `WITH RECURSIVE anc(id, parent_id, name, depth) AS (
        SELECT id, parent_id, name, 0 FROM folders WHERE id = ?
        UNION ALL
        SELECT f.id, f.parent_id, f.name, anc.depth + 1
        FROM folders f JOIN anc ON f.id = anc.parent_id
      )
      SELECT id, name FROM anc ORDER BY depth DESC`
    )
    .all(folderId);
  return rows;
}

function getSubfolders(parentId) {
  return db
    .prepare(
      `SELECT f.*,
        (SELECT COUNT(*) FROM files WHERE folder_id = f.id) AS fileCount,
        (SELECT COUNT(*) FROM folders WHERE parent_id = f.id) AS subfolderCount
      FROM folders f
      WHERE f.parent_id = ?
      ORDER BY f.name COLLATE NOCASE ASC`
    )
    .all(parentId);
}

function getFilesInFolder(folderId) {
  return db
    .prepare("SELECT * FROM files WHERE folder_id = ? ORDER BY original_name COLLATE NOCASE ASC")
    .all(folderId);
}

function getModel(id) {
  return db.prepare("SELECT * FROM models WHERE id = ?").get(id);
}

function getFilesInModel(modelId) {
  return db
    .prepare("SELECT * FROM files WHERE model_id = ? ORDER BY original_name COLLATE NOCASE ASC")
    .all(modelId);
}

// "Folder/Sub/Folder" path string for a folder, empty string at the root.
function folderFullPath(folderId) {
  const crumb = getBreadcrumb(folderId);
  return crumb
    .filter((c) => c.id !== ROOT_FOLDER_ID)
    .map((c) => c.name)
    .join("/");
}

// Read-only path lookup (unlike resolveFolderPath, never creates anything).
// Returns the folder id, or null if any segment doesn't exist.
function findFolderByPath(parts) {
  let currentId = ROOT_FOLDER_ID;
  for (const rawName of parts) {
    const name = rawName.trim();
    if (!name) continue;
    const folder = db
      .prepare("SELECT id FROM folders WHERE parent_id = ? AND name = ?")
      .get(currentId, name);
    if (!folder) return null;
    currentId = folder.id;
  }
  return currentId;
}

// Resolve a "Folder/Sub/ModelName" path to a model id. Returns null if not found.
function findModelByPath(parts) {
  if (parts.length === 0) return null;
  const modelName = parts[parts.length - 1];
  const folderId = findFolderByPath(parts.slice(0, -1));
  if (!folderId) return null;
  const model = db
    .prepare("SELECT id FROM models WHERE folder_id = ? AND name = ?")
    .get(folderId, modelName);
  return model ? model.id : null;
}

// Every model (a group of companion files sharing a folder + normalized base filename)
// that has at least one actual 3D/CAD file - a lone .gcode, .jpg, or .csv doesn't count,
// even though it still gets grouped into a model row for storage purposes - flattened
// across the whole tree, with the containing folder's path as a subtitle.
function listModels(query) {
  const extensionCheck = MODEL_EXTENSIONS.map(() => "LOWER(f.original_name) LIKE ?").join(" OR ");
  const extensionParams = MODEL_EXTENSIONS.map((ext) => `%.${ext}`);

  const rows = db
    .prepare(
      `SELECT m.*, (SELECT COUNT(*) FROM files WHERE model_id = m.id) AS fileCount
       FROM models m
       WHERE EXISTS (SELECT 1 FROM files f WHERE f.model_id = m.id AND (${extensionCheck}))
       ORDER BY m.updated_at DESC`
    )
    .all(...extensionParams);

  for (const r of rows) {
    r.fullPath = folderFullPath(r.folder_id);
  }

  let result = rows;
  if (query) {
    const q = query.toLowerCase();
    result = result.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.description || "").toLowerCase().includes(q) ||
        (r.tags || "").toLowerCase().includes(q) ||
        (r.fullPath || "").toLowerCase().includes(q)
    );
  }
  return result;
}

// Find (or create) the model a file belongs to. Each distinct filename within a folder is
// its own model - "Lizard.stl" and "Lizard.3mf" are separate models, not one. A model only
// ever has more than one file if a byte-identical re-upload was skipped (same file, so it
// stays put) - "keep both" always produces a distinct name and thus a distinct model too.
function resolveOrCreateModel(folderId, fileName) {
  const base = modelKeyFor(fileName);
  let model = db
    .prepare("SELECT * FROM models WHERE folder_id = ? AND base_name = ?")
    .get(folderId, base);
  if (!model) {
    const id = uuidv4();
    const displayName = fileName.replace(/\.[^./\\]+$/, "");
    db.prepare(
      "INSERT INTO models (id, folder_id, base_name, name) VALUES (?, ?, ?, ?)"
    ).run(id, folderId, base, displayName);
    model = getModel(id);
  }
  return model;
}

// Delete a model if it has no files left (e.g. after its last file was deleted or replaced).
// Returns true if the model was deleted.
function deleteModelIfEmpty(modelId) {
  if (!modelId) return false;
  const remaining = db.prepare("SELECT COUNT(*) c FROM files WHERE model_id = ?").get(modelId).c;
  if (remaining > 0) return false;
  db.prepare("DELETE FROM models WHERE id = ?").run(modelId);
  return true;
}

// Every model id anywhere under (and including) folderId - used to clean up thumbnails
// when a folder is deleted.
function collectModelsRecursive(folderId) {
  return db
    .prepare(
      `WITH RECURSIVE sub(id) AS (
        SELECT id FROM folders WHERE id = ?
        UNION ALL
        SELECT f.id FROM folders f JOIN sub ON f.parent_id = sub.id
      )
      SELECT id FROM models WHERE folder_id IN (SELECT id FROM sub)`
    )
    .all(folderId);
}

// Recursively collect every file row under (and including) folderId.
function collectFilesRecursive(folderId) {
  const rows = db
    .prepare(
      `WITH RECURSIVE sub(id) AS (
        SELECT id FROM folders WHERE id = ?
        UNION ALL
        SELECT f.id FROM folders f JOIN sub ON f.parent_id = sub.id
      )
      SELECT files.*, folders.name as folder_name FROM files
      JOIN folders ON folders.id = files.folder_id
      WHERE files.folder_id IN (SELECT id FROM sub)`
    )
    .all(folderId);
  return rows;
}

// Find or create the folder chain described by relative path parts under parentId.
function resolveFolderPath(parentId, parts) {
  let currentId = parentId;
  for (const rawName of parts) {
    const name = rawName.trim();
    if (!name) continue;
    let folder = db
      .prepare("SELECT * FROM folders WHERE parent_id = ? AND name = ? COLLATE NOCASE")
      .get(currentId, name);
    if (!folder) {
      const id = uuidv4();
      db.prepare("INSERT INTO folders (id, parent_id, name) VALUES (?, ?, ?)").run(
        id,
        currentId,
        name
      );
      folder = getFolder(id);
    }
    currentId = folder.id;
  }
  return currentId;
}

module.exports = {
  getFolder,
  getBreadcrumb,
  getSubfolders,
  getFilesInFolder,
  getModel,
  getFilesInModel,
  folderFullPath,
  findFolderByPath,
  findModelByPath,
  listModels,
  resolveOrCreateModel,
  deleteModelIfEmpty,
  collectModelsRecursive,
  collectFilesRecursive,
  resolveFolderPath,
  ROOT_FOLDER_ID,
};
