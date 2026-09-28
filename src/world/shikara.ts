import * as THREE from 'three';
import { composeMatrix, heartBladeGeometry, MeshBuilder } from '../core/geometry';
import { clamp, damp, Rng } from '../core/math';
import type { BoatController } from '../controls/boatController';
import { waterHeight } from './layout';

// Local frame for every boat: +z is the bow, +y up, +x is port (left).

export interface ShikaraStyle {
  length: number;
  width: number;
  segments: number;
  wood: string;
  trim: string;
  deck: string;
  canopy?: { color: string; valance: string; fringe: string; cushion: string };
  boatman?: { pheran: string; cap: string };
  flowers?: boolean;
  seed?: number;
}

export const SKIN = '#b27c56';

function profile(t: number, L: number, W: number) {
  const e = Math.abs(2 * t - 1);
  const w = (W / 2) * Math.pow(Math.max(Math.sin(Math.PI * t), 0), 0.6);
  const s = L / 9;
  const top = 0.34 + 0.62 * Math.pow(e, 3.2) * (0.7 + 0.3 * s);
  const bot = -0.16 + 0.22 * Math.pow(e, 2.5);
  return { w, top, bot, deck: Math.max(0.26, top - 0.07) };
}

export function deckHeightAt(style: Pick<ShikaraStyle, 'length' | 'width'>, z: number): number {
  const t = clamp(z / style.length + 0.5, 0, 1);
  return profile(t, style.length, style.width).deck;
}

/** Adds a shikara's static parts to a builder, in the builder's current frame. */
export function addShikara(b: MeshBuilder, style: ShikaraStyle): void {
  const { length: L, width: W, segments: N } = style;
  const rng = new Rng(style.seed ?? 3);
  const dark = new THREE.Color(style.wood).multiplyScalar(0.62).getStyle();

  // Lofted hull: a narrow flat-bottomed boat with raised, pointed ends.
  let prev: number[][] | null = null;
  let prevZ = 0;
  let prevP = profile(0, L, W);
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const z = -L / 2 + t * L;
    const p = profile(t, L, W);
    const mid = p.bot + (p.top - p.bot) * 0.55;
    const pts = [
      [-p.w, p.top], [-p.w * 0.96, mid], [-p.w * 0.62, p.bot],
      [p.w * 0.62, p.bot], [p.w * 0.96, mid], [p.w, p.top],
    ];
    if (prev) {
      for (let k = 0; k < 5; k++) {
        const color = k === 0 || k === 4 ? style.trim : k === 2 ? dark : style.wood;
        b.quad(
          [prev[k][0], prev[k][1], prevZ], [prev[k + 1][0], prev[k + 1][1], prevZ],
          [pts[k + 1][0], pts[k + 1][1], z], [pts[k][0], pts[k][1], z], color,
        );
      }
      b.quad(
        [-prevP.w * 0.97, prevP.deck, prevZ], [prevP.w * 0.97, prevP.deck, prevZ],
        [p.w * 0.97, p.deck, z], [-p.w * 0.97, p.deck, z], style.deck,
      );
    }
    prev = pts;
    prevZ = z;
    prevP = p;
  }
  // Carved stem posts at bow and stern.
  const endTop = profile(1, L, W).top;
  b.cyl(0.03, 0.05, 0.42, 5, 0, endTop + 0.12, L / 2 - 0.12, style.trim, 0.35);
  b.cyl(0.03, 0.05, 0.32, 5, 0, endTop + 0.08, -L / 2 + 0.12, style.trim, -0.35);
  // Thin painted rub-rail.
  b.box(W * 0.98, 0.05, L * 0.62, 0, 0.33, 0, style.trim);

  const s = L / 9;
  if (style.canopy) {
    const c = style.canopy;
    const cz0 = -1.9 * s;
    const cz1 = 1.5 * s;
    const clen = cz1 - cz0;
    const cmid = (cz0 + cz1) / 2;
    const px = (W / 2) * 0.8;
    const base = 0.27;
    const roofY = 1.9;
    for (const z of [cz0, cmid, cz1]) {
      for (const x of [-px, px]) {
        b.cyl(0.035, 0.04, roofY - base, 6, x, (roofY + base) / 2, z, style.trim);
        b.sphere(0.06, 0, x, base + 0.55, z, c.valance);
        b.sphere(0.055, 0, x, roofY - 0.35, z, c.valance);
      }
    }
    b.box(W * 1.1, 0.07, clen + 0.34, 0, roofY + 0.035, cmid, c.color);
    b.box(W * 0.72, 0.1, clen + 0.2, 0, roofY + 0.1, cmid, c.color);
    b.box(0.035, 0.26, clen + 0.34, W * 0.55, roofY - 0.1, cmid, c.valance);
    b.box(0.035, 0.26, clen + 0.34, -W * 0.55, roofY - 0.1, cmid, c.valance);
    b.box(W * 1.1, 0.26, 0.035, 0, roofY - 0.1, cz1 + 0.17, c.valance);
    b.box(W * 1.1, 0.26, 0.035, 0, roofY - 0.1, cz0 - 0.17, c.valance);
    // Fringe.
    const steps = Math.floor((clen + 0.3) / 0.2);
    for (let i = 0; i <= steps; i++) {
      const z = cz0 - 0.15 + (i / steps) * (clen + 0.3);
      const col = i % 2 === 0 ? c.fringe : c.valance;
      b.box(0.04, 0.11, 0.07, W * 0.55, roofY - 0.28, z, col);
      b.box(0.04, 0.11, 0.07, -W * 0.55, roofY - 0.28, z, col);
    }
    // Tied-back curtains at the four corners.
    for (const z of [cz0, cz1]) {
      for (const x of [-px, px]) b.box(0.09, 1.15, 0.2, x * 1.02, 1.2, z, c.color, 0, 0, x > 0 ? 0.04 : -0.04);
    }
    // Cushioned seat and bolsters.
    b.box(W * 0.78, 0.16, clen * 0.78, 0, 0.36, cmid - 0.05, c.cushion);
    b.box(W * 0.78, 0.5, 0.24, 0, 0.62, cz0 + 0.25, c.cushion, 0, -0.18);
    const pillow = new THREE.Color(c.cushion).offsetHSL(0.08, 0, 0.1).getStyle();
    b.box(0.34, 0.22, 0.14, -W * 0.2, 0.55, cz0 + 0.5, pillow, 0, -0.2);
    b.box(0.34, 0.22, 0.14, W * 0.2, 0.55, cz0 + 0.5, pillow, 0, -0.2);
    b.cyl(0.1, 0.1, W * 0.74, 8, 0, 0.5, cz1 - 0.25, c.valance, 0, 0, Math.PI / 2);
  }

  if (style.boatman) {
    const zb = -L / 2 + 1.05 * s;
    const dy = deckHeightAt(style, zb);
    b.cyl(0.16, 0.3, 0.8, 7, 0, dy + 0.4, zb, style.boatman.pheran);
    b.sphere(0.12, 1, 0, dy + 0.93, zb + 0.02, SKIN);
    b.cyl(0.1, 0.115, 0.09, 8, 0, dy + 1.04, zb + 0.01, style.boatman.cap);
  }

  if (style.flowers) {
    const palette = ['#f08a1c', '#b0172a', '#e4608a', '#f4efe6', '#f2c230', '#d94f7a', '#ff9f2e', '#c2185b'];
    b.cyl(0.32, 0.26, 0.24, 8, 0, 0.4, 0.6 * s, '#8a6a3c');
    b.cyl(0.28, 0.22, 0.2, 8, 0, 0.38, -0.6 * s, '#8a6a3c');
    for (let i = 0; i < 80; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = Math.sqrt(rng.next());
      const x = Math.cos(a) * r * W * 0.34;
      const z = Math.sin(a) * r * L * 0.2;
      const y = 0.38 + (1 - r * r) * 0.36 + rng.next() * 0.05;
      b.sphere(rng.range(0.08, 0.13), 0, x, y, z, rng.pick(palette));
    }
    // A few lotus buds on stems.
    for (let i = 0; i < 5; i++) {
      const x = rng.range(-0.2, 0.2);
      const z = rng.range(-0.9, 0.9) * s;
      b.cyl(0.012, 0.012, 0.5, 4, x, 0.75, z, '#5d7a34');
      b.add(new THREE.ConeGeometry(0.07, 0.16, 6), '#f2a7c3', composeMatrix(x, 1.05, z));
    }
  }
}

/** Boatman's arm and heart-shaped paddle, pivoting at the shoulder. */
export function buildPaddle(pheran: string, wood = '#6b4527'): THREE.Group {
  const b = new MeshBuilder(5);
  b.box(0.09, 0.42, 0.09, 0.07, -0.17, 0.06, pheran, 0, 0.4, 0.35);
  b.sphere(0.05, 0, 0.14, -0.33, 0.1, SKIN);
  const rz = Math.atan2(0.61, 1.25);
  b.cyl(0.022, 0.026, 1.75, 6, 0.42, -0.86, 0.1, wood, 0, 0, rz);
  const blade = heartBladeGeometry(1.15);
  const up = new THREE.Vector2(-Math.sin(rz), Math.cos(rz));
  const end = new THREE.Vector2(0.78, -1.62);
  const tip = end.clone().addScaledVector(up, -0.5);
  b.add(blade, wood, composeMatrix(tip.x, tip.y, 0.1, 0, 0, rz));
  const mesh = new THREE.Mesh(b.build(), shikaraMaterial());
  mesh.castShadow = true;
  const g = new THREE.Group();
  g.add(mesh);
  return g;
}

let sharedMaterial: THREE.MeshStandardMaterial | null = null;
export function shikaraMaterial(): THREE.MeshStandardMaterial {
  if (!sharedMaterial) {
    sharedMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.78,
      metalness: 0,
      side: THREE.DoubleSide,
      flatShading: true,
    });
  }
  return sharedMaterial;
}

export const PLAYER_STYLE: ShikaraStyle = {
  length: 9,
  width: 1.5,
  segments: 26,
  wood: '#5a3520',
  trim: '#d8b25a',
  deck: '#7a5234',
  canopy: { color: '#9c1f2e', valance: '#e8b64a', fringe: '#f3e6c4', cushion: '#b83246' },
  boatman: { pheran: '#6e5b4b', cap: '#e7e1d6' },
};

export interface SplashEvent {
  x: number;
  z: number;
  strength: number;
  /** Paddle strokes make a sound; wake rings are silent. */
  audible?: boolean;
}

/** The player's boat: model plus bobbing, tilting, paddling and wake emission. */
export class PlayerShikara {
  readonly root = new THREE.Group();
  private tilt = new THREE.Group();
  private paddle: THREE.Group;
  readonly lamp: THREE.PointLight;
  private lanternMat: THREE.MeshStandardMaterial;
  readonly lanternWorld = new THREE.Vector3();
  private lanternLocal = new THREE.Vector3();

  private pitch = 0;
  private pitchV = 0;
  private roll = 0;
  private rollV = 0;
  private heave = 0;
  private heaveV = 0;
  private phase = 0;
  private activity = 0;
  private prevVF = 0;
  private accel = 0;
  private wakeTimer = 0;
  private bowTimer = 0;
  private idleTimer = 0;
  private impulse = 0;

  constructor() {
    const style = PLAYER_STYLE;
    const b = new MeshBuilder(9);
    addShikara(b, style);
    const hull = new THREE.Mesh(b.build(), shikaraMaterial());
    hull.castShadow = true;
    hull.receiveShadow = true;
    this.tilt.add(hull);

    // Boatman's paddle rig at the stern.
    this.paddle = buildPaddle(style.boatman!.pheran);
    const zb = -style.length / 2 + 1.05;
    this.paddle.position.set(0.18, deckHeightAt(style, zb) + 0.72, zb + 0.08);
    this.tilt.add(this.paddle);

    // Hanging lantern at the front of the canopy.
    this.lanternMat = new THREE.MeshStandardMaterial({ color: '#3a2a18', emissive: '#ffb060', emissiveIntensity: 0 });
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.2, 6), this.lanternMat);
    this.lanternLocal.set(0, 1.55, 1.5 + 0.12);
    lantern.position.copy(this.lanternLocal);
    this.tilt.add(lantern);
    this.lamp = new THREE.PointLight('#ffb468', 0, 16, 2);
    this.lamp.position.copy(this.lanternLocal);
    this.tilt.add(this.lamp);

    this.root.add(this.tilt);
    this.root.name = 'player-shikara';
  }

  update(dt: number, t: number, c: BoatController, lantern: number, reducedMotion: boolean, splash: (e: SplashEvent) => void): void {
    const { x, z, heading } = c;
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    const vF = c.forwardSpeed;

    // Water-driven heave, pitch and roll with springs so nothing snaps.
    const hB = waterHeight(x + fx * 3.5, z + fz * 3.5, t);
    const hS = waterHeight(x - fx * 3.5, z - fz * 3.5, t);
    const hL = waterHeight(x + fz * 0.8, z - fx * 0.8, t);
    const hR = waterHeight(x - fz * 0.8, z + fx * 0.8, t);
    const a = (vF - this.prevVF) / Math.max(dt, 1e-3);
    this.prevVF = vF;
    this.accel = damp(this.accel, a, 4, dt);

    const motion = reducedMotion ? 0.5 : 1;
    const targetPitch = (Math.atan2(hB - hS, 7) * 1.4 + this.accel * 0.02 + Math.abs(vF) * 0.004) * motion;
    const targetRoll = (Math.atan2(hL - hR, 1.6) * 0.8 + c.yawRate * vF * 0.05) * motion + this.impulse * 0.06;
    const targetHeave = (hB + hS + hL + hR) * 0.25 - Math.abs(vF) * 0.006;

    const k = 30;
    const cdamp = 7;
    this.pitchV += ((targetPitch - this.pitch) * k - this.pitchV * cdamp) * dt;
    this.pitch += this.pitchV * dt;
    this.rollV += ((targetRoll - this.roll) * k - this.rollV * cdamp) * dt;
    this.roll += this.rollV * dt;
    this.heaveV += ((targetHeave - this.heave) * 40 - this.heaveV * 8) * dt;
    this.heave += this.heaveV * dt;
    this.impulse = damp(this.impulse, 0, 3, dt);

    this.root.position.set(x, 0, z);
    this.root.rotation.y = heading;
    this.tilt.position.y = this.heave;
    this.tilt.rotation.set(-this.pitch, 0, this.roll);

    // Paddle stroke: power phase with the blade in the water, then a lifted recovery.
    const drive = clamp(Math.abs(c.throttle) + Math.abs(c.steer) * 0.6, 0, 1);
    this.activity = damp(this.activity, drive, 3, dt);
    const dir = c.throttle < -0.05 ? -1 : 1;
    const prevPhase = this.phase;
    this.phase += dt * (1.5 + 2.2 * this.activity) * dir * (this.activity > 0.04 ? 1 : 0);
    const TWO_PI = Math.PI * 2;
    const crossed = Math.floor(this.phase / TWO_PI) !== Math.floor(prevPhase / TWO_PI);
    const ph = ((this.phase % TWO_PI) + TWO_PI) % TWO_PI;
    const sweep = -Math.cos(ph) * 0.55;
    const lift = ph > Math.PI ? Math.sin(ph - Math.PI) * 0.45 : 0;
    const act = this.activity;
    this.paddle.rotation.x = sweep * act + 0.75 * (1 - act);
    this.paddle.rotation.z = lift * act + 0.28 * (1 - act);

    if (crossed && act > 0.2) {
      // Blade entry: splash on the port side just behind the boatman.
      const px = x - fx * 3.4 + fz * 1.0;
      const pz = z - fz * 3.4 - fx * 1.0;
      splash({ x: px, z: pz, strength: 0.55 * act, audible: true });
    }

    // Wake: rings from the stern and bow; slow idle rings from bobbing.
    const speed = Math.abs(vF);
    this.wakeTimer -= dt;
    this.bowTimer -= dt;
    this.idleTimer -= dt;
    if (speed > 0.35 && this.wakeTimer <= 0) {
      this.wakeTimer = clamp(0.9 / speed, 0.14, 0.4);
      const sgn = vF >= 0 ? -1 : 1;
      splash({ x: x + fx * 3.8 * sgn, z: z + fz * 3.8 * sgn, strength: clamp(speed / 5, 0.12, 0.85) });
    }
    if (speed > 1.2 && this.bowTimer <= 0) {
      this.bowTimer = 0.32;
      const sgn = vF >= 0 ? 1 : -1;
      splash({ x: x + fx * 4.2 * sgn, z: z + fz * 4.2 * sgn, strength: clamp(speed / 7, 0.1, 0.6) });
    }
    if (speed < 0.35 && this.idleTimer <= 0) {
      this.idleTimer = 1.9;
      splash({ x, z, strength: 0.14 });
    }

    // Lantern.
    this.lanternMat.emissiveIntensity = 0.2 + lantern * 3;
    this.lamp.intensity = lantern * 7;
    this.lanternWorld.copy(this.lanternLocal);
    this.tilt.localToWorld(this.lanternWorld);
  }

  bump(strength: number): void {
    this.impulse += clamp(strength, 0, 2) * (Math.random() > 0.5 ? 1 : -1);
  }
}
