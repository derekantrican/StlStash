const express = require("express");
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const { db, STORAGE_DIR, THUMBNAILS_DIR } = require("../db");
const { getModel, getFilesInModel, getBreadcrumb, listModels } = require("../db/helpers");

const router = express.Router();

// Flat view: every model (group of companion files) anywhere in the tree.
router.get("/", (req, res) => {
  res.json(listModels(req.query.q));
});

router.get("/:id", (req, res) => {
  const model = getModel(req.params.id);
  if (!model) return res.status(404).json({ error: "Model not found" });
  res.json({
    model,
    files: getFilesInModel(model.id),
    breadcrumb: getBreadcrumb(model.folder_id),
  });
});

router.patch("/:id", (req, res) => {
  const model = getModel(req.params.id);
  if (!model) return res.status(404).json({ error: "Model not found" });

  const name = req.body.name !== undefined ? req.body.name.trim() : model.name;
  const description = req.body.description !== undefined ? req.body.description : model.description;
  const tags = req.body.tags !== undefined ? req.body.tags : model.tags;
  if (!name) return res.status(400).json({ error: "Name is required" });

  db.prepare(
    "UPDATE models SET name = ?, description = ?, tags = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(name, description, tags, model.id);
  res.json(getModel(model.id));
});

router.delete("/:id", (req, res) => {
  const model = getModel(req.params.id);
  if (!model) return res.status(404).json({ error: "Model not found" });

  const files = getFilesInModel(model.id);
  db.prepare("DELETE FROM files WHERE model_id = ?").run(model.id);
  db.prepare("DELETE FROM models WHERE id = ?").run(model.id);
  for (const f of files) {
    fs.rm(path.join(STORAGE_DIR, f.filename), { force: true }, () => {});
  }
  fs.rm(path.join(THUMBNAILS_DIR, `${model.id}.png`), { force: true }, () => {});
  res.status(204).end();
});

router.get("/:id/thumbnail", (req, res) => {
  const thumbPath = path.join(THUMBNAILS_DIR, `${req.params.id}.png`);
  if (!fs.existsSync(thumbPath)) return res.status(404).end();
  res.sendFile(thumbPath);
});

router.post("/:id/thumbnail", express.raw({ type: "image/png", limit: "5mb" }), (req, res) => {
  const model = getModel(req.params.id);
  if (!model) return res.status(404).json({ error: "Model not found" });
  if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: "PNG body required" });
  }
  fs.writeFileSync(path.join(THUMBNAILS_DIR, `${model.id}.png`), req.body);
  res.status(204).end();
});

router.get("/:id/download", (req, res) => {
  const model = getModel(req.params.id);
  if (!model) return res.status(404).json({ error: "Model not found" });
  const files = getFilesInModel(model.id);
  if (files.length === 0) return res.status(404).json({ error: "No files to download" });

  const safeName = model.name.replace(/[^a-z0-9_\- ]/gi, "_");
  res.attachment(`${safeName}.zip`);
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.on("error", (err) => res.status(500).end(String(err)));
  archive.pipe(res);
  for (const f of files) {
    const filePath = path.join(STORAGE_DIR, f.filename);
    if (fs.existsSync(filePath)) {
      archive.file(filePath, { name: f.original_name });
    }
  }
  archive.finalize();
});

module.exports = router;
