import { useEffect, useState } from "react";
import { api } from "../api.js";
import ModelViewer, { PREVIEWABLE_EXTENSIONS } from "./ModelViewer.jsx";
import { extOf, formatSize, iconFor } from "../fileIcons.js";

export function FileDetailPanel({ file, onClose, onDeleted }) {
  const ext = extOf(file.original_name);
  const previewable = PREVIEWABLE_EXTENSIONS.includes(ext);

  async function handleDelete() {
    if (!confirm(`Delete "${file.original_name}"?`)) return;
    await api.deleteFile(file.id);
    onDeleted();
  }

  return (
    <div className="detail-panel">
      <div className="detail-panel-header">
        <h3 title={file.original_name}>{file.original_name}</h3>
        <button className="btn link" onClick={onClose}>✕</button>
      </div>

      {previewable ? (
        <ModelViewer url={api.fileContentUrl(file.id)} filename={file.original_name} />
      ) : (
        <div className="viewer-wrap empty">
          <div className="no-preview">
            <div className="no-preview-icon">{iconFor(file.original_name)}</div>
            <p className="muted">No 3D preview for .{ext} files</p>
          </div>
        </div>
      )}

      <div className="detail-panel-meta muted">{formatSize(file.size)}</div>

      <div className="row">
        <a className="btn primary" href={api.fileDownloadUrl(file.id)}>Download</a>
        <button className="btn danger" onClick={handleDelete}>Delete</button>
      </div>
    </div>
  );
}

export function FolderDetailPanel({ folder, onClose, onDeleted, onUpdated, onNavigate }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: folder.name, description: folder.description, tags: folder.tags });

  useEffect(() => {
    setForm({ name: folder.name, description: folder.description, tags: folder.tags });
    setEditing(false);
  }, [folder.id]);

  const isRoot = folder.id === "root";
  const tags = (folder.tags || "").split(",").map((t) => t.trim()).filter(Boolean);

  async function handleSave(e) {
    e.preventDefault();
    const updated = await api.updateFolder(folder.id, form);
    onUpdated(updated);
    setEditing(false);
  }

  async function handleDelete() {
    if (!confirm(`Delete "${folder.name}" and everything inside it? This cannot be undone.`)) return;
    await api.deleteFolder(folder.id);
    onDeleted();
  }

  return (
    <div className="detail-panel">
      <div className="detail-panel-header">
        <h3>📁 {folder.name}</h3>
        <button className="btn link" onClick={onClose}>✕</button>
      </div>

      {editing ? (
        <form className="form" onSubmit={handleSave}>
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
          {folder.description && <p className="muted">{folder.description}</p>}
          {tags.length > 0 && (
            <div className="tags">
              {tags.map((t) => <span key={t} className="tag">{t}</span>)}
            </div>
          )}
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={() => onNavigate(folder)}>Open</button>
            <button className="btn" onClick={() => setEditing(true)}>Edit</button>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <a className="btn" href={api.folderDownloadUrl(folder.id)}>Download .zip</a>
            {!isRoot && <button className="btn danger" onClick={handleDelete}>Delete</button>}
          </div>
        </>
      )}
    </div>
  );
}
