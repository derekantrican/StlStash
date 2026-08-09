import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import Breadcrumb from "../components/Breadcrumb.jsx";
import EntityGrid from "../components/EntityGrid.jsx";
import UploadWidget from "../components/UploadWidget.jsx";
import { FileDetailPanel, FolderDetailPanel } from "../components/DetailPanel.jsx";
import { browseUrl, decodeSegments } from "../paths.js";

function useViewMode() {
  const [view, setView] = useState(() => localStorage.getItem("stlstash-view") || "grid");
  function toggle(mode) {
    setView(mode);
    localStorage.setItem("stlstash-view", mode);
  }
  return [view, toggle];
}

export default function Browse() {
  const params = useParams();
  const pathSegments = decodeSegments(params["*"]);
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [selection, setSelection] = useState(null);
  const [view, setView] = useViewMode();
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const pathKey = pathSegments.join("/");

  function load() {
    api
      .resolveFolderPath(pathSegments)
      .then(({ id }) => api.getFolder(id))
      .then(setData)
      .catch((e) => setError(e.message));
  }

  useEffect(() => {
    setSelection(null);
    setData(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathKey]);

  async function handleCreateFolder(e) {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      await api.createFolder({ parentId: data.folder.id, name: newFolderName });
      setNewFolderName("");
      setShowNewFolder(false);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  if (error && !data) return <div className="error">{error}</div>;
  if (!data) return <p className="muted">Loading...</p>;

  const selectedFolder = selection?.type === "folder" ? data.subfolders.find((f) => f.id === selection.id) : null;
  const selectedFile = selection?.type === "file" ? data.files.find((f) => f.id === selection.id) : null;

  return (
    <div>
      <div className="page-header">
        <Breadcrumb crumbs={data.breadcrumb} />
        <div className="page-header-actions">
          <div className="view-toggle">
            <button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")} title="Grid view">▦</button>
            <button className={view === "list" ? "active" : ""} onClick={() => setView("list")} title="List view">☰</button>
          </div>
          <button className="btn" onClick={() => setShowNewFolder((s) => !s)}>
            {showNewFolder ? "Cancel" : "+ New Folder"}
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {showNewFolder && (
        <form className="card form inline-form" onSubmit={handleCreateFolder}>
          <input
            autoFocus
            placeholder="Folder name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            required
          />
          <button className="btn primary" type="submit">Create</button>
        </form>
      )}

      <UploadWidget targetFolderId={data.folder.id} onUploaded={load} />

      <div className={`browse-layout ${selection ? "with-panel" : ""}`}>
        <div>
          <EntityGrid
            folders={data.subfolders}
            files={data.files}
            view={view}
            selectedId={selection?.id}
            onSelect={setSelection}
            onOpenFolder={(folder) => navigate(browseUrl([...pathSegments, folder.name]))}
            onOpenFile={(f) => window.open(api.fileDownloadUrl(f.id), "_blank")}
          />
        </div>
        {selectedFolder && (
          <FolderDetailPanel
            folder={selectedFolder}
            onClose={() => setSelection(null)}
            onDeleted={() => {
              setSelection(null);
              load();
            }}
            onUpdated={() => load()}
            onNavigate={(folder) => navigate(browseUrl([...pathSegments, folder.name]))}
          />
        )}
        {selectedFile && (
          <FileDetailPanel
            file={selectedFile}
            onClose={() => setSelection(null)}
            onDeleted={() => {
              setSelection(null);
              load();
            }}
          />
        )}
      </div>
    </div>
  );
}
