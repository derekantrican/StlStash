// Builds human-readable /browse and /model URLs from folder/model name segments,
// e.g. browseUrl(["3D printing", "Articulated"]) -> "/browse/3D%20printing/Articulated"

function encodeSegments(names) {
  return names.map(encodeURIComponent).join("/");
}

export function browseUrl(names) {
  return `/browse/${encodeSegments(names)}`;
}

export function modelUrl(names) {
  return `/model/${encodeSegments(names)}`;
}

// Splits a route's raw splat param back into decoded name segments.
export function decodeSegments(rawSplat) {
  return (rawSplat || "")
    .split("/")
    .filter(Boolean)
    .map((s) => decodeURIComponent(s));
}
