const BASE = "/api";

async function handle(res) {
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.error || message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  // Path resolution (human-readable URL segments -> db ids)
  resolveFolderPath: (segments) =>
    fetch(`${BASE}/resolve/folder/${segments.map(encodeURIComponent).join("/")}`).then(handle),
  resolveModelPath: (segments) =>
    fetch(`${BASE}/resolve/model/${segments.map(encodeURIComponent).join("/")}`).then(handle),

  // Folders (tree browsing)
  getFolder: (id) => fetch(`${BASE}/folders/${id}`).then(handle),

  createFolder: (data) =>
    fetch(`${BASE}/folders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then(handle),

  updateFolder: (id, data) =>
    fetch(`${BASE}/folders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then(handle),

  deleteFolder: (id) => fetch(`${BASE}/folders/${id}`, { method: "DELETE" }).then(handle),

  folderDownloadUrl: (id) => `${BASE}/folders/${id}/download`,

  // Models (a group of companion files sharing a folder + base filename, e.g. "Lizard.stl" + "Lizard.3mf")
  listModels: (q) =>
    fetch(`${BASE}/models${q ? `?q=${encodeURIComponent(q)}` : ""}`).then(handle),

  getModel: (id) => fetch(`${BASE}/models/${id}`).then(handle),

  updateModel: (id, data) =>
    fetch(`${BASE}/models/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then(handle),

  deleteModel: (id) => fetch(`${BASE}/models/${id}`, { method: "DELETE" }).then(handle),

  modelDownloadUrl: (id) => `${BASE}/models/${id}/download`,

  modelThumbnailUrl: (id, v) => `${BASE}/models/${id}/thumbnail${v ? `?v=${v}` : ""}`,

  uploadThumbnail: (id, blob) =>
    fetch(`${BASE}/models/${id}/thumbnail`, {
      method: "POST",
      headers: { "Content-Type": "image/png" },
      body: blob,
    }).then(handle),

  // Files
  deleteFile: (id) => fetch(`${BASE}/files/${id}`, { method: "DELETE" }).then(handle),
  fileDownloadUrl: (id) => `${BASE}/files/${id}`,
  fileContentUrl: (id) => `${BASE}/files/${id}/content`,

  // Upload
  uploadFiles: (targetFolderId, files, relPaths, onProgress) =>
    new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append("targetFolderId", targetFolderId);
      formData.append("relPaths", JSON.stringify(relPaths));
      for (const f of files) formData.append("files", f);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${BASE}/upload`);
      xhr.upload.onprogress = (e) => {
        if (onProgress && e.lengthComputable) onProgress(e.loaded / e.total);
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          try {
            reject(new Error(JSON.parse(xhr.responseText).error));
          } catch {
            reject(new Error(xhr.statusText));
          }
        }
      };
      xhr.onerror = () => reject(new Error("Upload failed"));
      xhr.send(formData);
    }),

  resolveUpload: (pendingIds, action) =>
    fetch(`${BASE}/upload/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingIds, action }),
    }).then(handle),
};
