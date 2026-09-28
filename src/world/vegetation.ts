import * as THREE from 'three';
import { composeMatrix, MeshBuilder } from '../core/geometry';
import { Rng } from '../core/math';
import type { QualitySettings } from '../core/quality';
import { BOULEVARD_X, lakeSdf, NISHAT, SHORE, terrainHeight } from './layout';
import type { TreeSpot } from './props';

// Every species is two instanced meshes (trunk + crown) so crowns can be tinted
// per instance (green chinars next to autumn-red ones) without tinting the bark.

interface Species {
  trunk: THREE.BufferGeometry;
  crown: THREE.BufferGeometry;
  colors: string[];
  castShadow: boolean;
}

function jitterGeometry(g: THREE.BufferGeometry, amount: number, seed: number): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const pos = g.attributes.position;
  // Jitter shared vertices consistently so the low-poly crown stays watertight.
  const map = new Map<string, [number, number, number]>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let o = map.get(key);
    if (!o) {
      o = [rng.range(-amount, amount), rng.range(-amount, amount), rng.range(-amount, amount)];
      map.set(key, o);
    }
    pos.setXYZ(i, pos.getX(i) + o[0], pos.getY(i) + o[1], pos.getZ(i) + o[2]);
  }
  g.computeVertexNormals();
  return g;
}

function crown(build: (b: MeshBuilder) => void, seed: number, jitter: number): THREE.BufferGeometry {
  const b = new MeshBuilder(seed, 0.18);
  build(b);
  return jitterGeometry(b.build(), jitter, seed);
}

function trunk(build: (b: MeshBuilder) => void): THREE.BufferGeometry {
  const b = new MeshBuilder(1);
  build(b);
  return b.build();
}

const SPECIES = {
  poplar: (): Species => ({
    trunk: trunk((b) => b.cyl(0.12, 0.22, 4, 5, 0, 2, 0, '#5e4a38')),
    crown: crown((b) => {
      b.sphere(1, 1, 0, 8.4, 0, '#ffffff', 1.5, 6.2, 1.5);
      b.sphere(1, 0, 0, 13.2, 0, '#f2f2f2', 0.9, 2.2, 0.9);
    }, 5, 0.18),
    colors: ['#5f7d33', '#6c8a3a', '#56722f', '#7c8f38', '#a7962f'],
    castShadow: true,
  }),
  chinar: (): Species => ({
    trunk: trunk((b) => {
      b.cyl(0.4, 0.7, 6, 7, 0, 3, 0, '#6e5f52');
      b.cyl(0.18, 0.28, 3.4, 5, 1.2, 6.5, 0, '#6e5f52', 0, 0, -0.6);
      b.cyl(0.18, 0.28, 3.4, 5, -1.1, 6.6, 0.4, '#6e5f52', 0.3, 0, 0.6);
    }),
    crown: crown((b) => {
      b.sphere(4.6, 1, 0, 10.5, 0, '#ffffff', 1, 0.78, 1);
      b.sphere(3.4, 1, 3.4, 9.0, 1.2, '#eeeeee', 1, 0.8, 1);
      b.sphere(3.3, 1, -3.2, 9.4, -1.0, '#f5f5f5', 1, 0.8, 1);
      b.sphere(3.0, 1, 0.8, 9.2, -3.4, '#e6e6e6', 1, 0.8, 1);
      b.sphere(3.0, 1, -0.6, 12.8, 1.4, '#fafafa', 1, 0.8, 1);
    }, 6, 0.45),
    colors: ['#4e6b2e', '#587632', '#4a6530', '#b8572a', '#c9782f', '#9c3b22', '#d18c3a'],
    castShadow: true,
  }),
  willow: (): Species => ({
    trunk: trunk((b) => b.cyl(0.25, 0.4, 3.2, 6, 0.3, 1.6, 0, '#5a4b3c', 0, 0, -0.2)),
    crown: crown((b) => {
      b.sphere(3.4, 1, 0.6, 5.2, 0, '#ffffff', 1.1, 0.8, 1.1);
      b.add(new THREE.CylinderGeometry(2.6, 4.2, 3.6, 9, 1, true), '#e8e8e8', composeMatrix(0.6, 3.2, 0));
    }, 7, 0.35),
    colors: ['#7f9a45', '#8ea64e', '#90a24a', '#a3ad58'],
    castShadow: true,
  }),
  cypress: (): Species => ({
    trunk: trunk((b) => b.cyl(0.1, 0.14, 1.2, 5, 0, 0.6, 0, '#4a3c30')),
    crown: crown((b) => {
      b.add(new THREE.ConeGeometry(0.95, 7.5, 7), '#ffffff', composeMatrix(0, 4.6, 0));
    }, 8, 0.08),
    colors: ['#2f4a2a', '#34512d', '#2a4327'],
    castShadow: true,
  }),
  deodar: (): Species => ({
    trunk: trunk((b) => b.cyl(0.3, 0.4, 2, 4, 0, 1, 0, '#3e3228')),
    crown: crown((b) => {
      b.add(new THREE.ConeGeometry(3.2, 7, 5), '#ffffff', composeMatrix(0, 5, 0));
      b.add(new THREE.ConeGeometry(2.2, 6, 5), '#eeeeee', composeMatrix(0, 9, 0));
    }, 9, 0.2),
    colors: ['#2b3f2c', '#34492e', '#2f4531', '#3a4f33'],
    castShadow: false,
  }),
};

function plant(
  species: Species,
  spots: TreeSpot[],
  seed: number,
  mat: THREE.Material,
  layer = 0,
): THREE.Group {
  const rng = new Rng(seed);
  const g = new THREE.Group();
  const trunkMesh = new THREE.InstancedMesh(species.trunk, mat, spots.length);
  const crownMesh = new THREE.InstancedMesh(species.crown, mat, spots.length);
  const col = new THREE.Color();
  spots.forEach((s, i) => {
    const y = s.y ?? terrainHeight(s.x, s.z) - 0.2;
    const sy = s.s * rng.range(0.9, 1.12);
    const m = composeMatrix(s.x, y, s.z, rng.range(-0.03, 0.03), rng.next() * Math.PI * 2, rng.range(-0.03, 0.03), s.s, sy, s.s);
    trunkMesh.setMatrixAt(i, m);
    crownMesh.setMatrixAt(i, m);
    col.set(rng.pick(species.colors)).multiplyScalar(rng.range(0.88, 1.1));
    crownMesh.setColorAt(i, col);
  });
  for (const m of [trunkMesh, crownMesh]) {
    m.castShadow = species.castShadow;
    m.computeBoundingSphere();
    m.layers.set(layer);
  }
  g.add(trunkMesh, crownMesh);
  return g;
}

export interface VegetationInput {
  chinars: TreeSpot[];
  cypresses: TreeSpot[];
  willows: TreeSpot[];
}

export function buildVegetation(q: QualitySettings, input: VegetationInput, farLayer: number): THREE.Group {
  const rng = new Rng(2024);
  const group = new THREE.Group();
  group.name = 'vegetation';
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const n = (x: number) => Math.round(x * q.treeScale);

  const inNishat = (x: number, z: number) => x > NISHAT.x0 - 8 && x < NISHAT.x1 + 8 && z > NISHAT.z0 - 8 && z < NISHAT.z1 + 8;
  const onLand = (x: number, z: number, minSdf: number, maxH = 30) => {
    if (inNishat(x, z)) return false;
    const d = lakeSdf(x, z);
    return d > minSdf && terrainHeight(x, z) < maxH;
  };

  // Poplars: the Boulevard row, avenues across the plain and scattered stands.
  const poplars: TreeSpot[] = [];
  for (let z = -236; z <= 190; z += 9) {
    if (inNishat(BOULEVARD_X + 20, z)) continue;
    poplars.push({ x: BOULEVARD_X + 20 + rng.range(-1, 1), z, s: rng.range(0.9, 1.15) });
  }
  const avenues = Math.round(26 * q.treeScale + 6);
  for (let a = 0; a < avenues; a++) {
    const ang = rng.next() * Math.PI * 2;
    const r = rng.range(300, 640);
    let x = Math.cos(ang) * r;
    let z = Math.sin(ang) * r;
    const dir = rng.next() * Math.PI;
    const len = rng.int(6, 16);
    for (let i = 0; i < len; i++) {
      if (onLand(x, z, 12, 20)) poplars.push({ x, z, s: rng.range(0.85, 1.2) });
      x += Math.cos(dir) * 7;
      z += Math.sin(dir) * 7;
    }
  }
  for (let i = 0, tries = 0; i < n(160) && tries < 5000; tries++) {
    const x = rng.range(-700, 700);
    const z = rng.range(-700, 700);
    if (onLand(x, z, 10, 40)) {
      poplars.push({ x, z, s: rng.range(0.8, 1.2) });
      i++;
    }
  }

  // Chinars scattered near the shore, plus the placed ones (island, Boulevard, garden).
  const chinars = [...input.chinars];
  for (let i = 0, tries = 0; i < n(50) && tries < 4000; tries++) {
    const x = rng.range(-500, 500);
    const z = rng.range(-500, 500);
    if (onLand(x, z, 16, 30) && lakeSdf(x, z) < 120) {
      chinars.push({ x, z, s: rng.range(0.85, 1.25) });
      i++;
    }
  }

  // Willows trailing along the natural (non-Boulevard) shoreline.
  const willows = [...input.willows];
  const stride = q.tier === 'high' ? 2 : 4;
  for (let i = 0; i < SHORE.length; i += stride) {
    const [sx, sz] = SHORE[i];
    if (sx > 190) continue;
    if (!rng.chance(0.75)) continue;
    const len = Math.hypot(sx + 30, sz + 20) || 1;
    const off = rng.range(3.5, 9);
    const x = sx + ((sx + 30) / len) * off;
    const z = sz + ((sz + 20) / len) * off;
    if (lakeSdf(x, z) > 2) willows.push({ x, z, s: rng.range(0.7, 1.05) });
  }

  // Deodar forests on the foothills; far away and cheap, so kept out of reflections.
  const deodars: TreeSpot[] = [];
  for (let i = 0, tries = 0; i < n(2600) && tries < 40000; tries++) {
    const ang = rng.next() * Math.PI * 2;
    const r = rng.range(420, 1700);
    const x = Math.cos(ang) * r;
    const z = Math.sin(ang) * r;
    const h = terrainHeight(x, z);
    if (h < 25 || h > 330 || inNishat(x, z)) continue;
    if (x < 0 && rng.chance(0.6)) continue;
    deodars.push({ x, z, y: h - 0.5, s: rng.range(0.9, 1.6) * (1 + r / 1700) });
    i++;
  }

  group.add(plant(SPECIES.poplar(), poplars, 1, mat));
  group.add(plant(SPECIES.chinar(), chinars, 2, mat));
  group.add(plant(SPECIES.willow(), willows, 3, mat));
  group.add(plant(SPECIES.cypress(), input.cypresses, 4, mat));
  group.add(plant(SPECIES.deodar(), deodars, 5, mat, farLayer));
  return group;
}
