const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const { db, STORAGE_DIR, PENDING_DIR } = require("../db");
const { getFolder, resolveFolderPath, resolveOrCreateModel } = require("../db/helpers");
const { sha256File } = require("../lib/checksum");
const { invalidateThumbnail } = require("../lib/modelCleanup");

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PENDING_DIR),
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 2 * 1024 * 1024 * 1024 } }); // 2GB/file

function moveFile(src, dest) {
  try {
    fs.renameSync(src, dest);
  } catch (err) {
    if (err.code === "EXDEV") {
      fs.copyFileSync(src, dest);
      fs.rmSync(src, { force: true });
    } else {
      throw err;
    }
  }
}

function sanitizeRelPath(relPath, fallbackName) {
  const raw = (relPath || fallbackName || "").replace(/\\/g, "/");
  const parts = raw.split("/").filter((p) => p && p !== "." && p !== "..");
  if (parts.length === 0) parts.push(fallbackName || "file");
  return parts;
}

function insertFile(folderId, storedFilename, originalName, size, contentType, checksum) {
  const model = resolveOrCreateModel(folderId, originalName);
  const id = uuidv4();
  db.prepare(
    "INSERT INTO files (id, folder_id, model_id, filename, original_name, size, content_type, checksum) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(id, folderId, model.id, storedFilename, originalName, size, contentType, checksum);
  db.prepare("UPDATE folders SET updated_at = datetime('now') WHERE id = ?").run(folderId);
  db.prepare("UPDATE models SET updated_at = datetime('now') WHERE id = ?").run(model.id);
  return db.prepare("SELECT * FROM files WHERE id = ?").get(id);
}

function uniqueNameInFolder(folderId, originalName) {
  const ext = path.extname(originalName);
  const base = originalName.slice(0, originalName.length - ext.length);
  let candidate = originalName;
  let n = 2;
  while (
    db
      .prepare("SELECT 1 FROM files WHERE folder_id = ? AND original_name = ? COLLATE NOCASE")
      .get(folderId, candidate)
  ) {
    candidate = `${base} (${n})${ext}`;
    n++;
  }
  return candidate;
}

// Upload files (optionally with folder structure via relPaths[i] = "Sub/Dir/file.stl")
router.post("/upload", upload.array("files"), async (req, res) => {
  const targetFolderId = req.body.targetFolderId;
  if (!targetFolderId) return res.status(400).json({ error: "targetFolderId is required" });
  if (!getFolder(targetFolderId)) return res.status(404).json({ error: "Target folder not found" });
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: "No files uploaded" });

  let relPaths = [];
  try {
    relPaths = req.body.relPaths ? JSON.parse(req.body.relPaths) : [];
  } catch {
    relPaths = [];
  }

  const added = [];
  const duplicates = [];
  const conflicts = [];
  const failed = [];

  for (let i = 0; i < req.files.length; i++) {
    const file = req.files[i];
    const parts = sanitizeRelPath(relPaths[i], file.originalname);
    const dirParts = parts.slice(0, -1);
    const fileName = parts[parts.length - 1];
    const displayPath = parts.join("/");

    try {
      const folderId = resolveFolderPath(targetFolderId, dirParts);
      const checksum = await sha256File(file.path);

      const checksumMatch = db
        .prepare("SELECT * FROM files WHERE folder_id = ? AND checksum = ?")
        .get(folderId, checksum);

      if (checksumMatch) {
        fs.rm(file.path, { force: true }, () => {});
        duplicates.push({ path: displayPath, matchedName: checksumMatch.original_name });
        continue;
      }

      const exactNameMatch = db
        .prepare("SELECT * FROM files WHERE folder_id = ? AND original_name = ? COLLATE NOCASE")
        .get(folderId, fileName);

      // A conflict only means "same folder, same exact filename, different content" - a
      // file of a different name (e.g. "Lizard.3mf" alongside "Lizard.stl") is just a new,
      // separate file/model, not a naming collision.
      const conflict = exactNameMatch
        ? { existing: exactNameMatch, reason: "same-name-different-content" }
        : null;

      if (conflict) {
        const pendingId = uuidv4();
        db.prepare(
          `INSERT INTO pending_uploads
            (id, folder_id, filename, original_name, size, content_type, checksum, conflict_reason, existing_file_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          pendingId,
          folderId,
          file.filename,
          fileName,
          file.size,
          file.mimetype,
          checksum,
          conflict.reason,
          conflict.existing.id
        );
        conflicts.push({
          pendingId,
          path: displayPath,
          newName: fileName,
          newSize: file.size,
          existingFileId: conflict.existing.id,
          existingName: conflict.existing.original_name,
          existingSize: conflict.existing.size,
          reason: conflict.reason,
        });
        continue;
      }

      const storedName = `${uuidv4()}${path.extname(fileName)}`;
      moveFile(file.path, path.join(STORAGE_DIR, storedName));
      const row = insertFile(folderId, storedName, fileName, file.size, file.mimetype, checksum);
      added.push({ ...row, path: displayPath });
    } catch (err) {
      console.error(`Upload failed for ${displayPath}:`, err);
      fs.rm(file.path, { force: true }, () => {});
      failed.push({ path: displayPath, error: err.message });
    }
  }

  res.status(201).json({ added, duplicates, conflicts, failed });
});

// Resolve one or more pending conflicts
router.post("/upload/resolve", (req, res) => {
  const ids = req.body.pendingIds || (req.body.pendingId ? [req.body.pendingId] : []);
  const action = req.body.action;
  if (ids.length === 0) return res.status(400).json({ error: "pendingId(s) required" });
  if (!["replace", "keep-both", "discard"].includes(action)) {
    return res.status(400).json({ error: "Invalid action" });
  }

  const results = [];
  for (const pendingId of ids) {
    const pending = db.prepare("SELECT * FROM pending_uploads WHERE id = ?").get(pendingId);
    if (!pending) {
      results.push({ pendingId, error: "Pending upload not found" });
      continue;
    }
    const tempPath = path.join(PENDING_DIR, pending.filename);

    if (action === "discard") {
      fs.rm(tempPath, { force: true }, () => {});
      db.prepare("DELETE FROM pending_uploads WHERE id = ?").run(pendingId);
      results.push({ pendingId, status: "discarded" });
      continue;
    }

    if (action === "replace") {
      const existing = db.prepare("SELECT * FROM files WHERE id = ?").get(pending.existing_file_id);
      const storedName = `${uuidv4()}${path.extname(pending.original_name)}`;
      moveFile(tempPath, path.join(STORAGE_DIR, storedName));

      let row;
      if (existing) {
        // Update the existing file row in place (same id/model) rather than delete+recreate,
        // so the model keeps its identity, tags, description, and we just drop its stale thumbnail.
        fs.rm(path.join(STORAGE_DIR, existing.filename), { force: true }, () => {});
        db.prepare(
          "UPDATE files SET filename = ?, size = ?, content_type = ?, checksum = ?, created_at = datetime('now') WHERE id = ?"
        ).run(storedName, pending.size, pending.content_type, pending.checksum, existing.id);
        if (existing.model_id) {
          invalidateThumbnail(existing.model_id);
          db.prepare("UPDATE models SET updated_at = datetime('now') WHERE id = ?").run(existing.model_id);
        }
        row = db.prepare("SELECT * FROM files WHERE id = ?").get(existing.id);
      } else {
        row = insertFile(
          pending.folder_id,
          storedName,
          pending.original_name,
          pending.size,
          pending.content_type,
          pending.checksum
        );
      }
      db.prepare("DELETE FROM pending_uploads WHERE id = ?").run(pendingId);
      results.push({ pendingId, status: "replaced", file: row });
      continue;
    }

    // keep-both
    const finalName = uniqueNameInFolder(pending.folder_id, pending.original_name);
    const storedName = `${uuidv4()}${path.extname(finalName)}`;
    moveFile(tempPath, path.join(STORAGE_DIR, storedName));
    const row = insertFile(
      pending.folder_id,
      storedName,
      finalName,
      pending.size,
      pending.content_type,
      pending.checksum
    );
    db.prepare("DELETE FROM pending_uploads WHERE id = ?").run(pendingId);
    results.push({ pendingId, status: "kept-both", file: row });
  }

  res.json({ results });
});

module.exports = router;
