import { useRef, useState } from "react";
import { api } from "../api.js";
import ConflictModal from "./ConflictModal.jsx";
import { useThumbnailQueue } from "../useThumbnailQueue.js";

export default function UploadWidget({ targetFolderId, onUploaded }) {
  const filesInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState(null);
  const [conflicts, setConflicts] = useState([]);
  const [error, setError] = useState(null);

  const { enqueue } = useThumbnailQueue();

  function enqueueThumbnailsFor(files) {
    const modelIds = new Set(files.map((f) => f.model_id).filter(Boolean));
    for (const modelId of modelIds) enqueue(modelId, { force: true });
  }

  async function doUpload(fileList, isFolder) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    const relPaths = files.map((f) => (isFolder ? f.webkitRelativePath : f.name));

    setUploading(true);
    setProgress(0);
    setSummary(null);
    setError(null);
    try {
      const result = await api.uploadFiles(targetFolderId, files, relPaths, setProgress);
      setSummary({
        added: result.added.length,
        duplicates: result.duplicates.length,
        failed: result.failed?.length || 0,
      });
      if (result.conflicts.length > 0) setConflicts(result.conflicts);
      enqueueThumbnailsFor(result.added);
      onUploaded();
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="upload-widget">
      <div className="row">
        <button className="btn primary" disabled={uploading} onClick={() => filesInputRef.current?.click()}>
          {uploading ? `Uploading... ${Math.round(progress * 100)}%` : "+ Upload files"}
        </button>
        <button className="btn" disabled={uploading} onClick={() => folderInputRef.current?.click()}>
          + Upload folder
        </button>
      </div>

      <input
        ref={filesInputRef}
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          doUpload(e.target.files, false);
          e.target.value = "";
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        webkitdirectory="true"
        directory="true"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          doUpload(e.target.files, true);
          e.target.value = "";
        }}
      />

      {error && <div className="error">{error}</div>}
      {summary && !conflicts.length && (
        <div className="upload-summary muted">
          Added {summary.added} file{summary.added === 1 ? "" : "s"}
          {summary.duplicates > 0 && ` · skipped ${summary.duplicates} duplicate${summary.duplicates === 1 ? "" : "s"}`}
        </div>
      )}

      {conflicts.length > 0 && (
        <ConflictModal
          conflicts={conflicts}
          onResolved={(results) => {
            enqueueThumbnailsFor(results.map((r) => r.file).filter(Boolean));
            onUploaded();
          }}
          onClose={() => setConflicts([])}
        />
      )}
    </div>
  );
}
