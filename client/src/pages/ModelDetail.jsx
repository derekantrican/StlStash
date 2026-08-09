import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import Breadcrumb from "../components/Breadcrumb.jsx";
import ModelViewer, { PREVIEWABLE_EXTENSIONS } from "../components/ModelViewer.jsx";
import { extOf, formatSize, iconFor } from "../fileIcons.js";
import { browseUrl, decodeSegments } from "../paths.js";

export default function ModelDetail() {
  const params = useParams();
  const pathSegments = decodeSegments(params["*"]);
  const navigate = useNavigate();
  const [modelId, setModelId] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [selectedFileId, setSelectedFileId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", tags: "" });
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const pathKey = pathSegments.join("/");

  function load() {
    api
      .resolveModelPath(pathSegments)
      .then(({ id }) => {
        setModelId(id);
        return api.getModel(id);
      })
      .then((d) => {
        setData(d);
        setForm({ name: d.model.name, description: d.model.description, tags: d.model.tags });
        setSelectedFileId((prev) => {
          if (prev && d.files.some((f) => f.id === prev)) return prev;
          const previewable = d.files.find((f) => PREVIEWABLE_EXTENSIONS.includes(extOf(f.original_name)));
          return (previewable || d.files[0])?.id || null;
        });
      })
      .catch((e) => setError(e.message));
  }

  useEffect(() => {
    setData(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathKey]);

  async function handleUpload(fileList) {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    try {
      const files = Array.from(fileList);
      await api.uploadFiles(
        data.model.folder_id,
        files,
        files.map((f) => f.name)
      );
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteFile(fileId) {
    if (!confirm("Delete this file?")) return;
    try {
      await api.deleteFile(fileId);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDeleteModel() {
    if (!confirm(`Delete "${data.model.name}" and all its files? This cannot be undone.`)) return;
    try {
      await api.deleteModel(modelId);
      navigate("/");
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleSaveEdit(e) {
    e.preventDefault();
    try {
      const updated = await api.updateModel(modelId, form);
      setData((d) => ({ ...d, model: updated }));
      setEditing(false);
    } catch (e) {
      setError(e.message);
    }
  }

  if (error && !data) return <div className="error">{error}</div>;
  if (!data) return <p className="muted">Loading...</p>;

  const { model, files, breadcrumb } = data;
  const selectedFile = files.find((f) => f.id === selectedFileId);
  const tags = (model.tags || "").split(",").map((t) => t.trim()).filter(Boolean);
  const folderPathSegments = breadcrumb.slice(1).map((c) => c.name);

  return (
    <div>
      <button className="btn" onClick={() => navigate("/")} style={{ marginBottom: 8 }}>
        ← All Models
      </button>
      <div style={{ marginBottom: 16 }}>
        <Breadcrumb crumbs={breadcrumb} />
      </div>

      {error && <div className="error">{error}</div>}

      <div className="browse-layout with-panel">
        <div>
          {selectedFile ? (
            <ModelViewer url={api.fileContentUrl(selectedFile.id)} filename={selectedFile.original_name} large />
          ) : (
            <div className="viewer-wrap empty">
              <p className="muted">No files yet</p>
            </div>
          )}
        </div>

        <div className="detail-panel">
          {editing ? (
            <form className="form" onSubmit={handleSaveEdit}>
              <label>
                Name
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </label>
              <label>
                Description
                <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </label>
              <label>
                Tags (comma separated)
                <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
              </label>
              <div className="row">
                <button className="btn primary" type="submit">Save</button>
                <button className="btn" type="button" onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </form>
          ) : (
            <>
              <div className="detail-panel-header">
                <h3>{model.name}</h3>
              </div>
              {model.description && <p className="muted">{model.description}</p>}
              {tags.length > 0 && (
                <div className="tags">
                  {tags.map((t) => <span key={t} className="tag">{t}</span>)}
                </div>
              )}
              <div className="row" style={{ marginTop: 12 }}>
                {files.length === 1 ? (
                  <a className="btn primary" href={api.fileDownloadUrl(files[0].id)}>⬇ Download</a>
                ) : (
                  <a className="btn primary" href={api.modelDownloadUrl(modelId)}>⬇ Download .zip</a>
                )}
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn" onClick={() => setEditing(true)}>Edit</button>
                <button className="btn" onClick={() => navigate(browseUrl(folderPathSegments))}>Open folder</button>
                <button className="btn danger" onClick={handleDeleteModel}>Delete</button>
              </div>
            </>
          )}

          <h3 style={{ marginTop: 20 }}>Files</h3>
          <div className="entity-list">
            {files.map((f) => (
              <div
                key={f.id}
                className={`row-item ${f.id === selectedFileId ? "selected" : ""}`}
                onClick={() => setSelectedFileId(f.id)}
              >
                <span className="row-icon">{iconFor(f.original_name)}</span>
                <span className="row-name">{f.original_name}</span>
                <span className="row-meta muted">{formatSize(f.size)}</span>
                <span className="file-actions">
                  <a href={api.fileDownloadUrl(f.id)} onClick={(e) => e.stopPropagation()} title="Download">⬇</a>
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteFile(f.id); }} title="Delete">🗑</button>
                </span>
              </div>
            ))}
          </div>

          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
              {uploading ? "Uploading..." : "+ Add file"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              style={{ display: "none" }}
              onChange={(e) => {
                handleUpload(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
