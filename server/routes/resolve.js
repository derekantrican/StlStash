const express = require("express");
const { findFolderByPath, findModelByPath, ROOT_FOLDER_ID } = require("../db/helpers");

const router = express.Router();

function splitPath(raw) {
  return (raw || "")
    .split("/")
    .filter(Boolean)
    .map((s) => decodeURIComponent(s));
}

// Resolve a human-readable folder path (e.g. "3D printing/Articulated") to its id.
router.get("/folder/*", (req, res) => {
  const parts = splitPath(req.params[0]);
  const id = parts.length === 0 ? ROOT_FOLDER_ID : findFolderByPath(parts);
  if (!id) return res.status(404).json({ error: "Path not found" });
  res.json({ id });
});

// Resolve a human-readable model path (e.g. "3D printing/Articulated/Lizard_5.2_Curl") to its id.
router.get("/model/*", (req, res) => {
  const parts = splitPath(req.params[0]);
  const id = findModelByPath(parts);
  if (!id) return res.status(404).json({ error: "Path not found" });
  res.json({ id });
});

module.exports = router;
