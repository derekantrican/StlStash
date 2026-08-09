const fs = require("fs");
const path = require("path");
const { THUMBNAILS_DIR } = require("../db");
const { deleteModelIfEmpty } = require("../db/helpers");

// Delete a model (and its cached thumbnail) once it has no files left.
function cleanupModelIfEmpty(modelId) {
  const deleted = deleteModelIfEmpty(modelId);
  if (deleted) {
    fs.rm(path.join(THUMBNAILS_DIR, `${modelId}.png`), { force: true }, () => {});
  }
  return deleted;
}

// Invalidate a model's cached thumbnail (e.g. because its content changed) so it regenerates.
function invalidateThumbnail(modelId) {
  fs.rm(path.join(THUMBNAILS_DIR, `${modelId}.png`), { force: true }, () => {});
}

module.exports = { cleanupModelIfEmpty, invalidateThumbnail };
