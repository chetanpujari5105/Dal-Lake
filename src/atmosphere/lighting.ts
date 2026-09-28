import * as THREE from 'three';
import type { QualitySettings } from '../core/quality';
import type { AtmosState } from './presets';

const SHADOW_HALF = 55;

/** Warm key light (sun or moon) with a shadow box that follows the boat, plus sky fill. */
export class Lighting {
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;

  constructor(scene: THREE.Scene, q: QualitySettings) {
    this.sun = new THREE.DirectionalLight('#ffffff', 2);
    this.sun.castShadow = q.shadows;
    this.sun.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
    const cam = this.sun.shadow.camera;
    cam.left = -SHADOW_HALF;
    cam.right = SHADOW_HALF;
    cam.top = SHADOW_HALF;
    cam.bottom = -SHADOW_HALF;
    cam.near = 1;
    cam.far = 500;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.05;
    scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight('#ffffff', '#444444', 1);
    scene.add(this.hemi);
  }

  setShadows(on: boolean): void {
    this.sun.castShadow = on;
  }

  update(s: AtmosState, focus: THREE.Vector3): void {
    // Snap the shadow box to its texel grid to stop edges shimmering as the boat moves.
    const texel = (SHADOW_HALF * 2) / this.sun.shadow.mapSize.x;
    const fx = Math.round(focus.x / texel) * texel;
    const fz = Math.round(focus.z / texel) * texel;
    const dir = s.sunDir;
    // Keep the light above the horizon so low sun still casts sensible shadows.
    const ly = Math.max(dir.y, 0.16);
    this.sun.position.set(fx + dir.x * 220, ly * 220, fz + dir.z * 220);
    this.sun.target.position.set(fx, 0, fz);
    this.sun.target.updateMatrixWorld();
    this.sun.color.copy(s.sunColor);
    this.sun.intensity = s.sunIntensity;
    this.hemi.color.copy(s.hemiSky);
    this.hemi.groundColor.copy(s.hemiGround);
    this.hemi.intensity = s.hemiIntensity;
  }
}
