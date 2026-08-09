const express = require("express");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const archiver = require("archiver");
const { db, STORAGE_DIR, THUMBNAILS_DIR } = require("../db");
const {
  getFolder,
  getBreadcrumb,
  getSubfolders,
  getFilesInFolder,
  collectFilesRecursive,
  collectModelsRecursive,
  ROOT_FOLDER_ID,
} = require("../db/helpers");

const router = express.Router();

function folderPayload(id) {
  const folder = getFolder(id);
  if (!folder) return null;
  return {
    folder,
    breadcrumb: getBreadcrumb(id),
    subfolders: getSubfolders(id),
    files: getFilesInFolder(id),
  };
}

router.get("/root", (req, res) => {
  res.json(folderPayload(ROOT_FOLDER_ID));
});

router.get("/:id", (req, res) => {
  const payload = folderPayload(req.params.id);
  if (!payload) return res.status(404).json({ error: "Folder not found" });
  res.json(payload);
});

router.post("/", (req, res) => {
  const { parentId, name, description = "", tags = "" } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Name is required" });
  const parent = getFolder(parentId || ROOT_FOLDER_ID);
  if (!parent) return res.status(404).json({ error: "Parent folder not found" });

  const existing = db
    .prepare("SELECT id FROM folders WHERE parent_id = ? AND name = ? COLLATE NOCASE")
    .get(parent.id, name.trim());
  if (existing) return res.status(409).json({ error: "A folder with that name already exists here" });

  const id = uuidv4();
  db.prepare(
    "INSERT INTO folders (id, parent_id, name, description, tags) VALUES (?, ?, ?, ?, ?)"
  ).run(id, parent.id, name.trim(), description, tags);
  res.status(201).json(getFolder(id));
});

router.patch("/:id", (req, res) => {
  if (req.params.id === ROOT_FOLDER_ID) {
    return res.status(400).json({ error: "Cannot rename the root folder" });
  }
  const folder = getFolder(req.params.id);
  if (!folder) return res.status(404).json({ error: "Folder not found" });

  const name = req.body.name !== undefined ? req.body.name.trim() : folder.name;
  const description = req.body.description !== undefined ? req.body.description : folder.description;
  const tags = req.body.tags !== undefined ? req.body.tags : folder.tags;
  if (!name) return res.status(400).json({ error: "Name is required" });

  db.prepare(
    "UPDATE folders SET name = ?, description = ?, tags = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(name, description, tags, folder.id);
  res.json(getFolder(folder.id));
});

router.delete("/:id", (req, res) => {
  if (req.params.id === ROOT_FOLDER_ID) {
    return res.status(400).json({ error: "Cannot delete the root folder" });
  }
  const folder = getFolder(req.params.id);
  if (!folder) return res.status(404).json({ error: "Folder not found" });

  const files = collectFilesRecursive(folder.id);
  const models = collectModelsRecursive(folder.id);
  db.prepare("DELETE FROM folders WHERE id = ?").run(folder.id); // cascades subfolders + file/model rows
  for (const f of files) {
    fs.rm(path.join(STORAGE_DIR, f.filename), { force: true }, () => {});
  }
  for (const m of models) {
    fs.rm(path.join(THUMBNAILS_DIR, `${m.id}.png`), { force: true }, () => {});
  }
  res.status(204).end();
});

// Download the folder and everything beneath it as a zip, preserving relative paths.
router.get("/:id/download", (req, res) => {
  const folder = getFolder(req.params.id);
  if (!folder) return res.status(404).json({ error: "Folder not found" });
  const files = collectFilesRecursive(folder.id);
  if (files.length === 0) return res.status(404).json({ error: "No files to download" });

  // Path of a descendant folder relative to the folder being downloaded (which becomes the zip root).
  function relativePathFor(folderId) {
    const crumb = getBreadcrumb(folderId);
    const anchorIndex = crumb.findIndex((c) => c.id === folder.id);
    return crumb
      .slice(anchorIndex + 1)
      .map((c) => c.name)
      .join("/");
  }

  const safeName = folder.name.replace(/[^a-z0-9_\- ]/gi, "_");
  res.attachment(`${safeName}.zip`);
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.on("error", (err) => res.status(500).end(String(err)));
  archive.pipe(res);

  const folderRelCache = new Map();
  for (const f of files) {
    if (!folderRelCache.has(f.folder_id)) {
      folderRelCache.set(f.folder_id, relativePathFor(f.folder_id));
    }
    const relDir = folderRelCache.get(f.folder_id);
    const entryName = relDir ? `${relDir}/${f.original_name}` : f.original_name;
    const filePath = path.join(STORAGE_DIR, f.filename);
    if (fs.existsSync(filePath)) {
      archive.file(filePath, { name: entryName });
    }
  }
  archive.finalize();
});

module.exports = router;
