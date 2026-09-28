import * as THREE from 'three';
import { clamp, fbm, smoothstep } from '../core/math';
import type { QualitySettings } from '../core/quality';
import { lakeSdf, NISHAT, terrainHeight } from './layout';

const C = {
  mud: new THREE.Color('#5a4c36'),
  grassA: new THREE.Color('#6f8a3c'),
  grassB: new THREE.Color('#8e9a48'),
  field: new THREE.Color('#b59d4c'),
  stone: new THREE.Color('#a39580'),
  forestA: new THREE.Color('#3d5731'),
  forestB: new THREE.Color('#2f4430'),
  rock: new THREE.Color('#7d7064'),
  snow: new THREE.Color('#eef1f4'),
};

/**
 * Polar grid centred on the lake. Rings are dense near the shoreline and grow
 * sparse toward the mountains, so one draw call covers everything from the
 * banks to the far ranges.
 */
export function buildTerrain(q: QualitySettings): THREE.Mesh {
  const radii: number[] = [];
  let r = 150;
  while (r < 470) {
    radii.push(r);
    r += q.terrainRadialStep;
  }
  while (r < 4200) {
    radii.push(r);
    r *= q.tier === 'high' ? 1.045 : 1.07;
  }
  radii.push(4200);

  const segs = q.terrainAngular;
  const rings = radii.length;
  const positions = new Float32Array(rings * (segs + 1) * 3);
  const colors = new Float32Array(rings * (segs + 1) * 3);
  const sdfCache = new Float32Array(rings * (segs + 1));

  let k = 0;
  for (let i = 0; i < rings; i++) {
    const rr = radii[i];
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      const x = Math.cos(a) * rr;
      const z = Math.sin(a) * rr;
      positions[k * 3] = x;
      positions[k * 3 + 1] = terrainHeight(x, z);
      positions[k * 3 + 2] = z;
      sdfCache[k] = rr < 520 ? lakeSdf(x, z) : 999;
      k++;
    }
  }

  const index: number[] = [];
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * (segs + 1) + j;
      const b = a + 1;
      const c = a + segs + 1;
      const d = c + 1;
      index.push(a, b, c, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();

  const normals = geo.attributes.normal.array as Float32Array;
  const col = new THREE.Color();
  for (let v = 0; v < rings * (segs + 1); v++) {
    const x = positions[v * 3];
    const h = positions[v * 3 + 1];
    const z = positions[v * 3 + 2];
    const ny = normals[v * 3 + 1];
    const d = sdfCache[v];
    const n = fbm(x * 0.02, z * 0.02, 3);

    col.copy(C.grassA).lerp(C.grassB, n);
    // Patchwork of mustard and paddy fields on the western plain.
    const fieldN = fbm(x * 0.006 + 40, z * 0.006, 2);
    if (x < 150 && h < 12 && fieldN > 0.56) col.lerp(C.field, smoothstep(0.56, 0.66, fieldN) * 0.7);
    // Muddy banks.
    col.lerp(C.mud, 1 - smoothstep(0.2, 1.4, h + (d < 6 ? 0 : 2)));
    // Promenade and Nishat retaining walls read as stone.
    const onProm = x > 216 && x < 246 && Math.abs(z) < 250 && h < 2;
    const inNishat = x > NISHAT.x0 - 4 && x < NISHAT.x1 + 4 && z > NISHAT.z0 - 4 && z < NISHAT.z1 + 4;
    if (onProm && !inNishat) col.lerp(C.stone, 0.85);
    // Forested slopes, rock and snow on the ranges.
    const forest = smoothstep(18, 90, h);
    col.lerp(n > 0.5 ? C.forestA : C.forestB, forest);
    const rocky = clamp(smoothstep(0.82, 0.62, ny) + smoothstep(330, 520, h), 0, 1);
    col.lerp(C.rock, rocky * 0.85);
    const snowLine = 470 + (n - 0.5) * 120;
    col.lerp(C.snow, smoothstep(snowLine, snowLine + 120, h) * smoothstep(0.45, 0.75, ny + 0.2));
    colors[v * 3] = col.r;
    colors[v * 3 + 1] = col.g;
    colors[v * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeBoundingSphere();

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain';
  mesh.receiveShadow = q.shadows;
  mesh.matrixAutoUpdate = false;
  return mesh;
}

/** Stone embankment wall that gives the Boulevard its crisp edge. */
export function buildEmbankment(): THREE.Mesh {
  const geo = new THREE.BoxGeometry(1.2, 2.1, 1, 1, 1, 1);
  const count = 52;
  const z0 = -228;
  const z1 = 184;
  const mat = new THREE.MeshLambertMaterial({ color: '#9b8b74' });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4();
  const len = (z1 - z0) / count;
  for (let i = 0; i < count; i++) {
    const z = z0 + (i + 0.5) * len;
    m.compose(new THREE.Vector3(218.6, 0.2, z), new THREE.Quaternion(), new THREE.Vector3(1, 1, len * 1.001));
    mesh.setMatrixAt(i, m);
  }
  mesh.receiveShadow = true;
  mesh.name = 'embankment';
  return mesh;
}

