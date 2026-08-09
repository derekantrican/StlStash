import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import ModelThumbCard from "../components/ModelThumbCard.jsx";
import { useThumbnailQueue } from "../useThumbnailQueue.js";
import { modelUrl } from "../paths.js";

export default function AllModels() {
  const navigate = useNavigate();
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [refreshTokens, setRefreshTokens] = useState({});

  const { enqueue } = useThumbnailQueue({
    onDone: (modelId) => setRefreshTokens((prev) => ({ ...prev, [modelId]: Date.now() })),
  });

  function load(q) {
    setLoading(true);
    api
      .listModels(q)
      .then(setModels)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <div>
      <div className="page-header">
        <h1>All Models</h1>
        <div className="page-header-actions">
          <input
            className="search"
            placeholder="Search models, tags, paths..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {loading ? (
        <p className="muted">Loading...</p>
      ) : models.length === 0 ? (
        <p className="muted">
          No models yet. Head to <a onClick={() => navigate("/browse")}>Browse</a> to upload files.
        </p>
      ) : (
        <div className="entity-grid">
          {models.map((m) => (
            <ModelThumbCard
              key={`${m.id}:${refreshTokens[m.id] || 0}`}
              model={m}
              refreshToken={refreshTokens[m.id]}
              onThumbnailMissing={(model) => enqueue(model.id)}
              onClick={() => navigate(modelUrl(m.fullPath ? [...m.fullPath.split("/"), m.name] : [m.name]))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
