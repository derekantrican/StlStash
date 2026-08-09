const express = require("express");
const fs = require("fs");
const path = require("path");
const { db, STORAGE_DIR } = require("../db");
const { cleanupModelIfEmpty } = require("../lib/modelCleanup");

const router = express.Router();

// Download a single file
router.get("/files/:id", (req, res) => {
  const file = db.prepare("SELECT * FROM files WHERE id = ?").get(req.params.id);
  if (!file) return res.status(404).json({ error: "File not found" });
  const filePath = path.join(STORAGE_DIR, file.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File missing on disk" });
  res.download(filePath, file.original_name);
});

// Stream file content inline (used by the 3D previewer)
router.get("/files/:id/content", (req, res) => {
  const file = db.prepare("SELECT * FROM files WHERE id = ?").get(req.params.id);
  if (!file) return res.status(404).json({ error: "File not found" });
  const filePath = path.join(STORAGE_DIR, file.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File missing on disk" });
  res.sendFile(filePath);
});

// Delete a file
router.delete("/files/:id", (req, res) => {
  const file = db.prepare("SELECT * FROM files WHERE id = ?").get(req.params.id);
  if (!file) return res.status(404).json({ error: "File not found" });
  db.prepare("DELETE FROM files WHERE id = ?").run(file.id);
  fs.rm(path.join(STORAGE_DIR, file.filename), { force: true }, () => {});
  cleanupModelIfEmpty(file.model_id);
  res.status(204).end();
});

module.exports = router;
