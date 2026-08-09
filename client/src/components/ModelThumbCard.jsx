import { useState } from "react";
import { api } from "../api.js";

export default function ModelThumbCard({ model, refreshToken, onThumbnailMissing, onClick }) {
  const [failed, setFailed] = useState(false);
  const tags = (model.tags || "").split(",").map((t) => t.trim()).filter(Boolean);

  return (
    <div className="model-thumb-card" onClick={onClick}>
      <div className="model-thumb-image">
        {!failed ? (
          <img
            key={refreshToken}
            src={api.modelThumbnailUrl(model.id, refreshToken)}
            alt=""
            loading="lazy"
            onError={() => {
              setFailed(true);
              onThumbnailMissing?.(model);
            }}
          />
        ) : (
          <span className="model-thumb-fallback">📦</span>
        )}
      </div>
      <div className="model-thumb-body">
        <div className="model-thumb-name" title={model.name}>{model.name}</div>
        <div className="model-thumb-meta muted" title={model.fullPath || "StlStash"}>{model.fullPath || "StlStash"}</div>
        {tags.length > 0 && (
          <div className="tags">
            {tags.map((t) => <span key={t} className="tag">{t}</span>)}
          </div>
        )}
      </div>
    </div>
  );
}
