import { iconFor, formatSize, isImage } from "../fileIcons.js";
import { api } from "../api.js";

export function FolderCard({ folder, view, selected, onClick, onOpen }) {
  const itemsLabel = `${folder.subfolderCount ?? 0} folder${folder.subfolderCount === 1 ? "" : "s"}, ${folder.fileCount ?? 0} file${folder.fileCount === 1 ? "" : "s"}`;
  if (view === "list") {
    return (
      <div
        className={`row-item ${selected ? "selected" : ""}`}
        onClick={onClick}
        onDoubleClick={onOpen}
      >
        <span className="row-icon">📁</span>
        <span className="row-name">{folder.name}</span>
        <span className="row-meta muted">{folder.fullPath ? folder.fullPath : itemsLabel}</span>
      </div>
    );
  }
  return (
    <div
      className={`model-thumb-card ${selected ? "selected" : ""}`}
      onClick={onClick}
      onDoubleClick={onOpen}
    >
      <div className="model-thumb-image">
        <span className="model-thumb-fallback">📁</span>
      </div>
      <div className="model-thumb-body">
        <div className="model-thumb-name" title={folder.name}>{folder.name}</div>
        <div className="model-thumb-meta muted">{folder.fullPath || itemsLabel}</div>
      </div>
    </div>
  );
}

export function FileCard({ file, view, selected, onClick, onOpen }) {
  if (view === "list") {
    return (
      <div
        className={`row-item ${selected ? "selected" : ""}`}
        onClick={onClick}
        onDoubleClick={onOpen}
      >
        <span className="row-icon">{iconFor(file.original_name)}</span>
        <span className="row-name">{file.original_name}</span>
        <span className="row-meta muted">{formatSize(file.size)}</span>
      </div>
    );
  }
  return (
    <div
      className={`model-thumb-card ${selected ? "selected" : ""}`}
      onClick={onClick}
      onDoubleClick={onOpen}
    >
      <div className="model-thumb-image">
        {isImage(file.original_name) ? (
          <img src={api.fileContentUrl(file.id)} alt="" loading="lazy" />
        ) : (
          <span className="model-thumb-fallback">{iconFor(file.original_name)}</span>
        )}
      </div>
      <div className="model-thumb-body">
        <div className="model-thumb-name" title={file.original_name}>{file.original_name}</div>
        <div className="model-thumb-meta muted">{formatSize(file.size)}</div>
      </div>
    </div>
  );
}
