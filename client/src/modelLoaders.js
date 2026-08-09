import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { ThreeMFLoader } from "three/examples/jsm/loaders/3MFLoader.js";

export const PREVIEWABLE_EXTENSIONS = ["stl", "obj", "3mf"];

export function getExtension(filename) {
  return (filename.split(".").pop() || "").toLowerCase();
}

// three.js's bundled loaders throw raw, implementation-detail error messages (e.g. a 3MF
// referencing a sub-object the simple parser can't resolve throws "Cannot read properties
// of undefined (reading 'mesh')"). Turn anything unrecognizable into a message a user can act on.
function friendlyLoadError(ext, err) {
  const message = err?.message || String(err);
  if (/undefined|null|cannot read/i.test(message)) {
    return new Error(
      `This .${ext} file uses a variant the in-browser previewer can't parse. Try downloading it instead.`
    );
  }
  return err instanceof Error ? err : new Error(message);
}

// 3D printing files (STL/3MF/OBJ) are authored Z-up, matching the print bed (XY) and
// height (Z); three.js is Y-up. Rotate to match, then place the origin at the model's
// bottom-center - like it's sitting on the build plate - rather than its bounding-box
// center, and return its footprint for camera framing.
export function orientAndCenter(object) {
  object.rotation.x = -Math.PI / 2;
  object.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const sphere = box.getBoundingSphere(new THREE.Sphere());

  object.position.x -= center.x;
  object.position.z -= center.z;
  object.position.y -= box.min.y;

  return {
    size,
    height: size.y,
    maxDim: Math.max(size.x, size.y, size.z) || 1,
    radius: sphere.radius || 1,
  };
}

// Straight-line camera distance that fits a bounding sphere of the given radius within the
// camera's vertical field of view. Using the sphere (rather than the single longest bounding
// box dimension) frames elongated shapes correctly - a tall, thin object doesn't need nearly
// as much clearance as its longest axis alone would suggest.
export function distanceToFit(radius, fovDegrees, margin = 1.15) {
  const halfFovRad = (fovDegrees / 2) * (Math.PI / 180);
  return (radius / Math.sin(halfFovRad)) * margin;
}

// A pleasant fixed iso-ish viewing direction, used so callers can turn a straight-line
// distance into an actual camera position: target + VIEW_DIRECTION * distance.
export const VIEW_DIRECTION = new THREE.Vector3(1, 0.7, 1).normalize();

export function loadObject(url, ext) {
  return new Promise((resolve, reject) => {
    const onError = (err) => reject(friendlyLoadError(ext, err));
    if (ext === "stl") {
      new STLLoader().load(
        url,
        (geometry) => {
          geometry.computeVertexNormals();
          const material = new THREE.MeshStandardMaterial({
            color: 0x7c93c9,
            roughness: 0.6,
            metalness: 0.05,
          });
          resolve(new THREE.Mesh(geometry, material));
        },
        undefined,
        onError
      );
    } else if (ext === "obj") {
      new OBJLoader().load(url, resolve, undefined, onError);
    } else if (ext === "3mf") {
      new ThreeMFLoader().load(url, resolve, undefined, onError);
    } else {
      reject(new Error(`Preview not supported for .${ext} files`));
    }
  });
}
