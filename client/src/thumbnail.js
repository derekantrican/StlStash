import * as THREE from "three";
import { loadObject, orientAndCenter, distanceToFit, VIEW_DIRECTION } from "./modelLoaders.js";

// Renders a single static isometric-ish frame of a model off-screen and returns a PNG blob.
// Runs entirely in the browser (no canvas is attached to the DOM) so the server never has
// to do any 3D rendering itself.
export async function generateThumbnail(url, ext, size = 512) {
  const object = await loadObject(url, ext);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x11151c);
  scene.add(object);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));
  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(5, 10, 7);
  scene.add(dir);
  const dir2 = new THREE.DirectionalLight(0xffffff, 0.4);
  dir2.position.set(-5, -5, -5);
  scene.add(dir2);

  const { height, maxDim, radius } = orientAndCenter(object);
  const camera = new THREE.PerspectiveCamera(45, 1, maxDim / 100, maxDim * 100);
  const distance = distanceToFit(radius, camera.fov);
  const target = new THREE.Vector3(0, height / 2, 0);
  camera.position.copy(target).addScaledVector(VIEW_DIRECTION, distance);
  camera.lookAt(target);

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(size, size);
  renderer.render(scene, camera);

  const blob = await new Promise((resolve) => renderer.domElement.toBlob(resolve, "image/png"));

  renderer.dispose();
  object.traverse((child) => {
    child.geometry?.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((m) => m?.dispose());
  });

  if (!blob) throw new Error("Failed to encode thumbnail");
  return blob;
}
