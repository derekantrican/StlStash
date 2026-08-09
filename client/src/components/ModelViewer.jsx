import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  PREVIEWABLE_EXTENSIONS,
  getExtension,
  loadObject,
  orientAndCenter,
  distanceToFit,
  VIEW_DIRECTION,
} from "../modelLoaders.js";

export { PREVIEWABLE_EXTENSIONS };

export default function ModelViewer({ url, filename, large }) {
  const containerRef = useRef(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ext = getExtension(filename);
    const container = containerRef.current;
    if (!container) return;

    setError(null);
    setLoading(true);

    let renderer, scene, camera, controls, frameId, object, resizeObserver;
    let disposed = false;

    function resize() {
      const { clientWidth, clientHeight } = container;
      if (clientWidth === 0 || clientHeight === 0) return;
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(clientWidth, clientHeight);
    }

    function init() {
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x11151c);

      camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000);

      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(window.devicePixelRatio);
      container.appendChild(renderer.domElement);

      const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
      scene.add(hemi);
      const dir = new THREE.DirectionalLight(0xffffff, 1.2);
      dir.position.set(5, 10, 7);
      scene.add(dir);
      const dir2 = new THREE.DirectionalLight(0xffffff, 0.4);
      dir2.position.set(-5, -5, -5);
      scene.add(dir2);

      const grid = new THREE.GridHelper(200, 20, 0x2a2f3a, 0x1c2028);
      scene.add(grid);

      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;

      resize();
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(container);
      animate();
    }

    function animate() {
      if (disposed) return;
      frameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }

    function frameObject(obj) {
      const { height, maxDim, radius } = orientAndCenter(obj);

      const distance = distanceToFit(radius, camera.fov);
      const target = new THREE.Vector3(0, height / 2, 0);
      camera.position.copy(target).addScaledVector(VIEW_DIRECTION, distance);
      camera.near = maxDim / 100;
      camera.far = maxDim * 100;
      camera.updateProjectionMatrix();
      controls.target.copy(target);
      controls.update();
    }

    init();

    loadObject(url, ext)
      .then((obj) => {
        if (disposed) return;
        object = obj;
        scene.add(object);
        frameObject(object);
        setLoading(false);
      })
      .catch((err) => {
        if (disposed) return;
        setError(err.message || "Failed to load preview");
        setLoading(false);
      });

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      cancelAnimationFrame(frameId);
      controls?.dispose();
      renderer?.dispose();
      if (renderer?.domElement?.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, [url, filename]);

  return (
    <div className={`viewer-wrap ${large ? "large" : ""}`}>
      <div ref={containerRef} className="viewer-canvas" />
      {loading && !error && <div className="viewer-overlay">Loading preview...</div>}
      {error && <div className="viewer-overlay error">{error}</div>}
    </div>
  );
}
