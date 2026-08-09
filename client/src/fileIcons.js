const ICONS = {
  stl: "🧊",
  obj: "🧊",
  "3mf": "🧊",
  step: "⚙️",
  stp: "⚙️",
  sldprt: "⚙️",
  f3d: "⚙️",
  scad: "⚙️",
  dxf: "📐",
  gcode: "🖨️",
  png: "🖼️",
  jpg: "🖼️",
  jpeg: "🖼️",
  gif: "🖼️",
  pdf: "📄",
  txt: "📄",
  md: "📄",
  zip: "🗜️",
  json: "🔧",
};

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "bmp"];

export function extOf(name) {
  return (name.split(".").pop() || "").toLowerCase();
}

export function iconFor(name) {
  return ICONS[extOf(name)] || "📦";
}

export function isImage(name) {
  return IMAGE_EXTENSIONS.includes(extOf(name));
}

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
