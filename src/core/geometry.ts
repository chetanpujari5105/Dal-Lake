import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng } from './math';

const tmpColor = new THREE.Color();
const tmpEuler = new THREE.Euler();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpPos = new THREE.Vector3();

export function composeMatrix(
  x: number, y: number, z: number,
  rx = 0, ry = 0, rz = 0,
  sx = 1, sy = 1, sz = 1,
): THREE.Matrix4 {
  tmpEuler.set(rx, ry, rz, 'YXZ');
  tmpQuat.setFromEuler(tmpEuler);
  return new THREE.Matrix4().compose(tmpPos.set(x, y, z), tmpQuat, tmpScale.set(sx, sy, sz));
}

/**
 * Accumulates primitives with baked vertex colours and merges them into one
 * geometry, so each prop costs a single draw call. Transforms can be nested.
 */
export class MeshBuilder {
  private parts: THREE.BufferGeometry[] = [];
  private stack: THREE.Matrix4[] = [new THREE.Matrix4()];
  private rng: Rng;

  constructor(seed = 1, private jitter = 0) {
    this.rng = new Rng(seed);
  }

  get isEmpty(): boolean {
    return this.parts.length === 0;
  }

  push(m: THREE.Matrix4): void {
    this.stack.push(this.stack[this.stack.length - 1].clone().multiply(m));
  }

  pop(): void {
    if (this.stack.length > 1) this.stack.pop();
  }

  with(m: THREE.Matrix4, fn: () => void): void {
    this.push(m);
    try {
      fn();
    } finally {
      this.pop();
    }
  }

  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, local?: THREE.Matrix4, jitter = this.jitter): this {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    geo.dispose();
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    }
    const m = this.stack[this.stack.length - 1].clone();
    if (local) m.multiply(local);
    g.applyMatrix4(m);
    if (!g.attributes.normal) g.computeVertexNormals();
    tmpColor.set(color);
    if (jitter > 0) {
      const k = 1 + (this.rng.next() - 0.5) * jitter;
      tmpColor.multiplyScalar(k);
    }
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = tmpColor.r;
      arr[i * 3 + 1] = tmpColor.g;
      arr[i * 3 + 2] = tmpColor.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.parts.push(g);
    return this;
  }

  box(
    sx: number, sy: number, sz: number,
    x: number, y: number, z: number,
    color: THREE.ColorRepresentation,
    ry = 0, rx = 0, rz = 0,
  ): this {
    return this.add(new THREE.BoxGeometry(sx, sy, sz), color, composeMatrix(x, y, z, rx, ry, rz));
  }

  cyl(
    rTop: number, rBot: number, h: number, seg: number,
    x: number, y: number, z: number,
    color: THREE.ColorRepresentation,
    rx = 0, ry = 0, rz = 0,
  ): this {
    return this.add(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, false), color, composeMatrix(x, y, z, rx, ry, rz));
  }

  sphere(
    r: number, detail: number,
    x: number, y: number, z: number,
    color: THREE.ColorRepresentation,
    sx = 1, sy = 1, sz = 1,
  ): this {
    return this.add(new THREE.IcosahedronGeometry(r, detail), color, composeMatrix(x, y, z, 0, 0, 0, sx, sy, sz));
  }

  /** Raw triangle soup: [x,y,z, x,y,z, x,y,z, ...]. */
  tris(positions: number[], color: THREE.ColorRepresentation): this {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.computeVertexNormals();
    return this.add(g, color);
  }

  quad(a: number[], b: number[], c: number[], d: number[], color: THREE.ColorRepresentation): this {
    return this.tris([...a, ...b, ...c, ...a, ...c, ...d], color);
  }

  build(): THREE.BufferGeometry {
    if (this.parts.length === 0) return new THREE.BufferGeometry();
    const merged = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    if (!merged) throw new Error('MeshBuilder: failed to merge geometry');
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    return merged;
  }
}

/** Heart-shaped shikara paddle blade in the XY plane, tip at the origin. */
export function heartBladeGeometry(scale = 1): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(0.13 * scale, 0.1 * scale, 0.17 * scale, 0.3 * scale, 0.09 * scale, 0.39 * scale);
  s.bezierCurveTo(0.04 * scale, 0.44 * scale, 0, 0.4 * scale, 0, 0.35 * scale);
  s.bezierCurveTo(0, 0.4 * scale, -0.04 * scale, 0.44 * scale, -0.09 * scale, 0.39 * scale);
  s.bezierCurveTo(-0.17 * scale, 0.3 * scale, -0.13 * scale, 0.1 * scale, 0, 0);
  return new THREE.ShapeGeometry(s, 6);
}
