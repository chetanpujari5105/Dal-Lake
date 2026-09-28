import * as THREE from 'three';
import type { QualitySettings } from './quality';

export function isWebGL2Available(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!canvas.getContext('webgl2');
  } catch {
    return false;
  }
}

export function createRenderer(canvas: HTMLCanvasElement, quality: QualitySettings): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: quality.tier === 'high',
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.maxPixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = quality.shadows;
  renderer.shadowMap.type = quality.tier === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  // Shadows are refreshed once per frame manually (the reflection pass reuses them).
  renderer.shadowMap.autoUpdate = false;
  return renderer;
}

/** Keeps renderer and camera in sync with the viewport; calls back with CSS size. */
export function watchResize(
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
  onResize: (w: number, h: number) => void,
): () => void {
  const apply = () => {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Portrait phones get a wider lens so the boat and surroundings still fit.
    camera.fov = camera.aspect < 0.8 ? 66 : camera.aspect < 1.2 ? 60 : 52;
    camera.updateProjectionMatrix();
    onResize(w, h);
  };
  apply();
  let raf = 0;
  const schedule = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(apply);
  };
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  return () => {
    window.removeEventListener('resize', schedule);
    window.removeEventListener('orientationchange', schedule);
  };
}
