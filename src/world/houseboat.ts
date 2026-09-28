import * as THREE from 'three';
import { createNameBoard } from '../assets/textures';
import { MeshBuilder } from '../core/geometry';
import { Rng } from '../core/math';
import type { HouseboatPlacement } from './layout';

// Houseboats are long cedar (deodar) hulls with a cabin of carved panels, a
// fretwork verandah at the bow, and a painted name board. Local frame: bow at +z.

const NAMES = [
  'Gul-e-Nargis', 'Shehjar', 'Kongposh', 'Yemberzal', 'Neelofar', 'Bulbul',
  'Mehtab', 'Gulshan', 'Heemal', 'Sheen', 'Zoon Dab', 'Chinar Leaf', 'Nishat Rose',
];

const PALETTES = [
  { wood: '#6b4226', trim: '#b98251', accent: '#2f4d3c', board: '#5a1a1f', ink: '#e9c983' },
  { wood: '#5a3824', trim: '#c9a06a', accent: '#6e2a24', board: '#1f3b2d', ink: '#f0dca8' },
  { wood: '#7a4c2c', trim: '#e6d6b4', accent: '#2c4a63', board: '#2c2a4a', ink: '#f2e2b6' },
  { wood: '#4e3020', trim: '#a8743f', accent: '#8b3a2a', board: '#6b2224', ink: '#f3d98e' },
];

export interface HouseboatMaterials {
  wood: THREE.MeshStandardMaterial;
  windowLit: THREE.MeshStandardMaterial;
  windowDim: THREE.MeshStandardMaterial;
}

export function createHouseboatMaterials(): HouseboatMaterials {
  return {
    wood: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, flatShading: true }),
    windowLit: new THREE.MeshStandardMaterial({ color: '#241a12', emissive: '#ffa04a', emissiveIntensity: 0, roughness: 0.35 }),
    windowDim: new THREE.MeshStandardMaterial({ color: '#1d1916', emissive: '#ff9540', emissiveIntensity: 0, roughness: 0.35 }),
  };
}

export interface HouseboatInstance {
  group: THREE.Group;
  detail: THREE.Mesh;
  lanterns: THREE.Vector3[]; // world positions
}

export function buildHouseboat(place: HouseboatPlacement, index: number, mats: HouseboatMaterials): HouseboatInstance {
  const rng = new Rng(place.seed);
  const pal = PALETTES[index % PALETTES.length];
  const L = place.length;
  const W = 6.2;
  const main = new MeshBuilder(place.seed, 0.08);
  const detail = new MeshBuilder(place.seed + 1, 0.06);
  const lit = new MeshBuilder(place.seed + 2);
  const dim = new MeshBuilder(place.seed + 3);

  const hullDark = '#2b1f17';
  const deckY = 0.95;
  const cabinZ0 = -L / 2 + 0.6;
  const cabinZ1 = L / 2 - 5.2;
  const cabinLen = cabinZ1 - cabinZ0;
  const cabinMid = (cabinZ0 + cabinZ1) / 2;
  const cabinTop = 4.0;
  const cw = W - 0.5;

  // Hull and deck.
  main.box(W, 1.65, L, 0, 0.12, 0, hullDark, 0, 0, 0);
  main.box(W + 0.04, 0.22, L + 0.04, 0, 0.78, 0, pal.accent);
  main.box(W - 0.8, 0.9, 1.6, 0, 0.35, L / 2 + 0.6, hullDark, 0, -0.35);
  main.box(W, 0.1, L, 0, deckY, 0, '#8a6344');

  // Cabin body, frieze and plinth.
  main.box(cw, cabinTop - deckY, cabinLen, 0, (cabinTop + deckY) / 2, cabinMid, pal.wood);
  main.box(cw + 0.18, 0.34, cabinLen + 0.18, 0, cabinTop - 0.12, cabinMid, pal.trim);
  main.box(cw + 0.14, 0.3, cabinLen + 0.14, 0, deckY + 0.18, cabinMid, pal.trim);

  // Side walls: carved pilasters with windows between them.
  const bays = Math.max(4, Math.floor(cabinLen / 1.75));
  const bayLen = cabinLen / bays;
  for (const side of [-1, 1]) {
    const x = side * (cw / 2);
    for (let i = 0; i <= bays; i++) {
      const z = cabinZ0 + i * bayLen;
      main.box(0.2, cabinTop - deckY - 0.3, 0.22, x + side * 0.06, (cabinTop + deckY) / 2, z, pal.trim);
    }
    for (let i = 0; i < bays; i++) {
      const z = cabinZ0 + (i + 0.5) * bayLen;
      main.box(0.08, 1.35, bayLen * 0.66, x + side * 0.04, 2.45, z, pal.trim);
      const pane = rng.chance(0.6) ? lit : dim;
      pane.box(0.06, 1.1, bayLen * 0.5, x + side * 0.08, 2.45, z, '#ffffff');
      // Arched head over each window.
      main.box(0.1, 0.16, bayLen * 0.4, x + side * 0.08, 3.2, z, pal.trim);
      // Carved panel under the window: a lattice of crossed slats.
      detail.box(0.05, 0.55, bayLen * 0.66, x + side * 0.06, 1.45, z, pal.trim);
      const slats = 4;
      for (let k = 0; k < slats; k++) {
        const zz = z - bayLen * 0.3 + ((k + 0.5) / slats) * bayLen * 0.6;
        detail.box(0.04, 0.5, 0.04, x + side * 0.1, 1.45, zz, pal.wood, 0, 0.6);
        detail.box(0.04, 0.5, 0.04, x + side * 0.1, 1.45, zz, pal.wood, 0, -0.6);
      }
    }
    // Dentil band under the frieze.
    for (let z = cabinZ0 + 0.2; z < cabinZ1; z += 0.36) {
      detail.box(0.08, 0.1, 0.14, x + side * 0.12, cabinTop - 0.36, z, pal.trim);
    }
  }

  // Front facade: door flanked by windows.
  const fz = cabinZ1 + 0.02;
  main.box(1.05, 2.2, 0.1, 0, deckY + 1.1, fz, pal.trim);
  lit.box(0.8, 1.95, 0.06, 0, deckY + 1.02, fz + 0.04, '#ffffff');
  for (const x of [-1.8, 1.8]) {
    main.box(1.1, 1.4, 0.1, x, 2.45, fz, pal.trim);
    lit.box(0.85, 1.15, 0.06, x, 2.45, fz + 0.04, '#ffffff');
  }
  // Back facade.
  for (const x of [-1.4, 1.4]) dim.box(0.9, 1.0, 0.06, x, 2.45, cabinZ0 - 0.03, '#ffffff');

  // Verandah: carved pillars, railing with balusters, fretwork valance.
  const vz0 = cabinZ1;
  const vz1 = L / 2 - 0.5;
  const vlen = vz1 - vz0;
  const roofY = 3.7;
  const pillars: [number, number][] = [[-W / 2 + 0.25, vz1], [W / 2 - 0.25, vz1], [-W / 2 + 0.25, vz0 + vlen * 0.5], [W / 2 - 0.25, vz0 + vlen * 0.5], [-1.1, vz1], [1.1, vz1]];
  for (const [x, z] of pillars) {
    main.cyl(0.1, 0.12, roofY - deckY, 8, x, (roofY + deckY) / 2, z, pal.trim);
    main.box(0.3, 0.14, 0.3, x, deckY + 0.07, z, pal.wood);
    main.box(0.34, 0.16, 0.34, x, roofY - 0.1, z, pal.wood);
    detail.sphere(0.13, 0, x, deckY + 1.6, z, pal.trim, 1, 1.4, 1);
  }
  main.box(W + 0.5, 0.16, vlen + 0.6, 0, roofY + 0.08, vz0 + vlen / 2 + 0.15, pal.wood);
  main.box(W + 0.56, 0.1, vlen + 0.66, 0, roofY + 0.2, vz0 + vlen / 2 + 0.15, pal.trim);

  const railY = deckY + 0.95;
  const railRuns: [number, number, number, number][] = [
    [-W / 2 + 0.25, vz1, -1.1, vz1],
    [1.1, vz1, W / 2 - 0.25, vz1],
    [-W / 2 + 0.25, vz0 + 0.2, -W / 2 + 0.25, vz1],
    [W / 2 - 0.25, vz0 + 0.2, W / 2 - 0.25, vz1],
  ];
  for (const [x0, z0, x1, z1] of railRuns) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ang = Math.atan2(x1 - x0, z1 - z0);
    const mx = (x0 + x1) / 2;
    const mz = (z0 + z1) / 2;
    main.box(0.1, 0.08, len, mx, railY, mz, pal.trim, ang);
    main.box(0.08, 0.06, len, mx, deckY + 0.2, mz, pal.trim, ang);
    const n = Math.floor(len / 0.2);
    for (let i = 1; i < n; i++) {
      const f = i / n;
      detail.box(0.05, 0.7, 0.05, x0 + (x1 - x0) * f, deckY + 0.58, z0 + (z1 - z0) * f, pal.trim);
    }
  }
  // Zig-zag fretwork valance under the verandah roof.
  for (let x = -W / 2; x <= W / 2; x += 0.34) {
    detail.box(0.18, 0.18, 0.04, x, roofY - 0.18, vz1 + 0.38, pal.trim, 0, 0, Math.PI / 4);
  }
  for (const side of [-1, 1]) {
    for (let z = vz0; z <= vz1 + 0.3; z += 0.34) {
      detail.box(0.04, 0.18, 0.18, side * (W / 2 + 0.24), roofY - 0.18, z, pal.trim, 0, Math.PI / 4);
    }
  }

  // Roof: either a railed sun deck or a pitched gable.
  const gable = rng.chance(0.45);
  if (gable) {
    const pitch = 0.42;
    const half = cw / 2 + 0.35;
    const slope = half / Math.cos(pitch);
    const rise = Math.tan(pitch) * half;
    const roofCol = rng.pick(['#3e5a4c', '#5b3b2a', '#6d6f6e']);
    main.box(slope, 0.12, cabinLen + 0.7, -half / 2, cabinTop + rise / 2 + 0.05, cabinMid, roofCol, 0, 0, pitch);
    main.box(slope, 0.12, cabinLen + 0.7, half / 2, cabinTop + rise / 2 + 0.05, cabinMid, roofCol, 0, 0, -pitch);
    for (const z of [cabinZ0 - 0.3, cabinZ1 + 0.3]) {
      main.tris([-half, cabinTop, z, half, cabinTop, z, 0, cabinTop + rise, z], pal.trim);
    }
    main.box(0.12, 0.12, cabinLen + 0.8, 0, cabinTop + rise + 0.05, cabinMid, pal.trim);
  } else {
    main.box(cw + 0.3, 0.2, cabinLen + 0.3, 0, cabinTop + 0.1, cabinMid, pal.wood);
    const ry = cabinTop + 0.2;
    main.box(0.08, 0.06, cabinLen, cw / 2, ry + 0.75, cabinMid, pal.trim);
    main.box(0.08, 0.06, cabinLen, -cw / 2, ry + 0.75, cabinMid, pal.trim);
    main.box(cw, 0.06, 0.08, 0, ry + 0.75, cabinZ0, pal.trim);
    main.box(cw, 0.06, 0.08, 0, ry + 0.75, cabinZ1, pal.trim);
    for (let z = cabinZ0; z <= cabinZ1; z += 0.3) {
      detail.box(0.04, 0.7, 0.04, cw / 2, ry + 0.38, z, pal.trim);
      detail.box(0.04, 0.7, 0.04, -cw / 2, ry + 0.38, z, pal.trim);
    }
    for (let x = -cw / 2; x <= cw / 2; x += 0.3) {
      detail.box(0.04, 0.7, 0.04, x, ry + 0.38, cabinZ0, pal.trim);
      detail.box(0.04, 0.7, 0.04, x, ry + 0.38, cabinZ1, pal.trim);
    }
    // Small awning on the sun deck.
    main.box(2.4, 0.06, 2.4, 0, ry + 1.9, cabinZ1 - 1.6, pal.accent);
    for (const [x, z] of [[-1.1, cabinZ1 - 0.5], [1.1, cabinZ1 - 0.5], [-1.1, cabinZ1 - 2.7], [1.1, cabinZ1 - 2.7]]) {
      main.cyl(0.04, 0.04, 1.9, 5, x, ry + 0.95, z, pal.trim);
    }
  }

  // Side steps down to the water and gangplank to the embankment.
  for (let i = 0; i < 3; i++) {
    main.box(0.8, 0.12, 1.2, W / 2 + 0.4 + i * 0.35, deckY - 0.3 - i * 0.28, vz0 + 1.2, '#7b5a3c');
  }
  main.box(1.2, 0.1, 3.6, 0, deckY + 0.05, -L / 2 - 1.8, '#7b5a3c');

  // Hanging lanterns at the verandah corners.
  const lanternsLocal = [new THREE.Vector3(-W / 2 + 0.3, roofY - 0.55, vz1 + 0.1), new THREE.Vector3(W / 2 - 0.3, roofY - 0.55, vz1 + 0.1)];
  for (const p of lanternsLocal) {
    lit.box(0.16, 0.24, 0.16, p.x, p.y, p.z, '#ffffff');
    detail.box(0.02, 0.3, 0.02, p.x, p.y + 0.27, p.z, '#2a2018');
  }

  const group = new THREE.Group();
  const mainMesh = new THREE.Mesh(main.build(), mats.wood);
  mainMesh.castShadow = true;
  mainMesh.receiveShadow = true;
  const detailMesh = new THREE.Mesh(detail.build(), mats.wood);
  detailMesh.castShadow = true;
  const litMesh = new THREE.Mesh(lit.build(), mats.windowLit);
  const dimMesh = new THREE.Mesh(dim.build(), mats.windowDim);
  group.add(mainMesh, detailMesh, litMesh, dimMesh);

  // Painted name board above the verandah.
  const name = NAMES[index % NAMES.length];
  const tex = createNameBoard(name, pal.board, pal.ink);
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(3.8, 0.83),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }),
  );
  board.position.set(0, roofY + 0.72, vz1 + 0.42);
  const boardBack = new THREE.Mesh(new THREE.BoxGeometry(4.0, 1.0, 0.08), mats.wood);
  boardBack.position.set(0, roofY + 0.72, vz1 + 0.36);
  colorGeometry(boardBack.geometry, pal.trim);
  group.add(board, boardBack);

  // Bow faces west, toward the open lake and the setting sun.
  group.rotation.y = -Math.PI / 2;
  group.position.set(place.x, 0, place.z);
  group.updateMatrixWorld(true);
  const lanterns = lanternsLocal.map((p) => p.clone().applyMatrix4(group.matrixWorld));
  group.name = `houseboat-${name}`;
  return { group, detail: detailMesh, lanterns };
}

function colorGeometry(g: THREE.BufferGeometry, color: string): void {
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(arr, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}
