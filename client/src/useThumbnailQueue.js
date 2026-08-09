import { useCallback, useEffect, useRef } from "react";
import { api } from "./api.js";
import { PREVIEWABLE_EXTENSIONS, getExtension } from "./modelLoaders.js";
import { generateThumbnail } from "./thumbnail.js";

const CONCURRENCY = 1;
const DELAY_MS = 150;

// Module-level singleton: exactly one thumbnail-generation queue for the app's whole
// lifetime, not one per mounted page. Previously each AllModels/UploadWidget mount created
// its own queue that kept running via chained setTimeouts even after navigating away, so
// bouncing between pages stacked up multiple overlapping queues all doing GPU renders at
// once - that was the source of the "lag catching up" after navigating.
const queue = [];
const attempted = new Set();
const listeners = new Set();
let active = 0;

async function processJob(modelId) {
  const { files } = await api.getModel(modelId);
  const previewFile = files.find((f) => PREVIEWABLE_EXTENSIONS.includes(getExtension(f.original_name)));
  if (!previewFile) return;
  const blob = await generateThumbnail(
    api.fileContentUrl(previewFile.id),
    getExtension(previewFile.original_name)
  );
  await api.uploadThumbnail(modelId, blob);
  for (const listener of listeners) listener(modelId);
}

function pump() {
  while (active < CONCURRENCY && queue.length > 0) {
    const modelId = queue.shift();
    active++;
    processJob(modelId)
      .catch((e) => console.warn(`Thumbnail generation failed for ${modelId}:`, e.message))
      .finally(() => {
        active--;
        setTimeout(pump, DELAY_MS);
      });
  }
}

// `force` bypasses the "already tried this session" guard - used right after an upload/
// replace, where we know the content is fresh and a stale skip would be wrong.
function enqueueThumbnail(modelId, { force = false } = {}) {
  if (!force && attempted.has(modelId)) return;
  attempted.add(modelId);
  queue.push(modelId);
  pump();
}

export function useThumbnailQueue({ onDone } = {}) {
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const listener = (modelId) => onDoneRef.current?.(modelId);
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, []);

  const enqueue = useCallback((modelId, opts) => enqueueThumbnail(modelId, opts), []);

  return { enqueue };
}
