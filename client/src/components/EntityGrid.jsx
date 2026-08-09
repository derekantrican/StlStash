import { FolderCard, FileCard } from "./Cards.jsx";

export default function EntityGrid({ folders = [], files = [], view, selectedId, onSelect, onOpenFolder, onOpenFile }) {
  if (folders.length === 0 && files.length === 0) {
    return <p className="muted">This folder is empty.</p>;
  }

  const className = view === "list" ? "entity-list" : "entity-grid";

  return (
    <div className={className}>
      {folders.map((f) => (
        <FolderCard
          key={f.id}
          folder={f}
          view={view}
          selected={selectedId === f.id}
          onClick={() => onSelect({ type: "folder", id: f.id })}
          onOpen={() => onOpenFolder(f)}
        />
      ))}
      {files.map((f) => (
        <FileCard
          key={f.id}
          file={f}
          view={view}
          selected={selectedId === f.id}
          onClick={() => onSelect({ type: "file", id: f.id })}
          onOpen={() => onOpenFile(f)}
        />
      ))}
    </div>
  );
}
