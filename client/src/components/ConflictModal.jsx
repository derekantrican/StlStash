import { useState } from "react";
import { api } from "../api.js";
import { formatSize } from "../fileIcons.js";

const REASON_LABEL = {
  "same-name-different-content": "A file with this exact name already exists here, but the contents differ.",
};

export default function ConflictModal({ conflicts, onResolved, onClose }) {
  const [items, setItems] = useState(conflicts);
  const [busyId, setBusyId] = useState(null);

  async function resolveOne(pendingId, action) {
    setBusyId(pendingId);
    try {
      const { results } = await api.resolveUpload([pendingId], action);
      const remaining = items.filter((c) => c.pendingId !== pendingId);
      setItems(remaining);
      onResolved(results);
      if (remaining.length === 0) onClose();
    } finally {
      setBusyId(null);
    }
  }

  async function resolveAll(action) {
    const ids = items.map((c) => c.pendingId);
    setBusyId("all");
    try {
      const { results } = await api.resolveUpload(ids, action);
      setItems([]);
      onResolved(results);
      onClose();
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal conflict-modal">
        <h2>{items.length} file{items.length === 1 ? "" : "s"} need a decision</h2>
        <p className="muted">
          Byte-identical files were skipped automatically. These files have a name that
          already exists with different content — choose what to do with each.
        </p>

        <div className="conflict-list">
          {items.map((c) => (
            <div key={c.pendingId} className="conflict-item">
              <div className="conflict-item-info">
                <div className="conflict-item-path">{c.path}</div>
                <div className="muted small">{REASON_LABEL[c.reason] || c.reason}</div>
                <div className="muted small">
                  New: {c.newName} ({formatSize(c.newSize)}) &nbsp;·&nbsp; Existing: {c.existingName} ({formatSize(c.existingSize)})
                </div>
              </div>
              <div className="conflict-item-actions">
                <button
                  disabled={busyId !== null}
                  onClick={() => resolveOne(c.pendingId, "replace")}
                >
                  Replace existing
                </button>
                <button
                  disabled={busyId !== null}
                  onClick={() => resolveOne(c.pendingId, "keep-both")}
                >
                  Keep both
                </button>
                <button
                  disabled={busyId !== null}
                  onClick={() => resolveOne(c.pendingId, "discard")}
                >
                  Discard new
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
          <span className="muted small" style={{ marginRight: "auto" }}>Apply to all {items.length}:</span>
          <button className="btn" disabled={busyId !== null} onClick={() => resolveAll("replace")}>
            Replace existing
          </button>
          <button className="btn" disabled={busyId !== null} onClick={() => resolveAll("keep-both")}>
            Keep both
          </button>
          <button className="btn" disabled={busyId !== null} onClick={() => resolveAll("discard")}>
            Discard new
          </button>
        </div>
      </div>
    </div>
  );
}
