import { clamp, damp } from '../core/math';
import type { Axes } from './input';
import { lakeSdf, lakeSdfGradient, type Obstacle } from '../world/layout';

export interface DynamicCircle {
  x: number;
  z: number;
  r: number;
}

export interface Contact {
  strength: number;
  x: number;
  z: number;
}

const HULL_SAMPLES = [3.9, 1.3, -1.3, -3.9];
const HULL_RADIUS = 0.8;

/**
 * Shikara physics: thrust along the heading, low forward drag and strong
 * sideways (keel) drag so turns carve rather than skid. Inputs are smoothed so
 * acceleration, braking and turning ease in and out.
 */
export class BoatController {
  x: number;
  z: number;
  heading: number;
  vx = 0;
  vz = 0;
  yawRate = 0;
  throttle = 0;
  steer = 0;

  constructor(x: number, z: number, heading: number) {
    this.x = x;
    this.z = z;
    this.heading = heading;
  }

  get forwardSpeed(): number {
    return this.vx * Math.sin(this.heading) + this.vz * Math.cos(this.heading);
  }

  update(dt: number, input: Axes, obstacles: Obstacle[], dynamic: DynamicCircle[]): Contact | null {
    this.throttle = damp(this.throttle, input.throttle, input.throttle !== 0 ? 1.8 : 2.6, dt);
    this.steer = damp(this.steer, input.steer, 3.2, dt);

    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    let vF = this.vx * fx + this.vz * fz;
    let vL = this.vx * fz - this.vz * fx;

    const thrust = this.throttle > 0 ? this.throttle * 1.9 : this.throttle * 0.65;
    vF += thrust * dt;
    vF -= (vF * 0.2 + Math.sign(vF) * vF * vF * 0.02) * dt;
    vL -= vL * Math.min(1, 2.6 * dt);

    this.vx = vF * fx + vL * fz;
    this.vz = vF * fz - vL * fx;

    // Paddle steering works even at rest, but bites harder with way on.
    const speedFactor = clamp(Math.abs(vF) / 2.5, 0, 1);
    const targetYaw = this.steer * (0.24 + 0.32 * speedFactor);
    this.yawRate = damp(this.yawRate, targetYaw, 2.2, dt);
    this.heading += this.yawRate * dt;

    this.x += this.vx * dt;
    this.z += this.vz * dt;

    return this.resolveCollisions(obstacles, dynamic);
  }

  private resolveCollisions(obstacles: Obstacle[], dynamic: DynamicCircle[]): Contact | null {
    let contact: Contact | null = null;
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);

    for (let iter = 0; iter < 2; iter++) {
      for (const off of HULL_SAMPLES) {
        const px = this.x + fx * off;
        const pz = this.z + fz * off;
        const push = this.pushOut(px, pz, obstacles, dynamic);
        if (!push) continue;
        const [nx, nz, depth] = push;
        this.x += nx * depth;
        this.z += nz * depth;
        const vn = this.vx * nx + this.vz * nz;
        if (vn < 0) {
          // Remove the inward velocity with a small bounce, plus a little friction.
          this.vx -= 1.2 * vn * nx;
          this.vz -= 1.2 * vn * nz;
          this.vx *= 0.97;
          this.vz *= 0.97;
          // Glancing blows swing the hull gently away from the obstacle.
          const torque = (fx * nz - fz * nx) * Math.sign(off);
          this.yawRate += torque * Math.min(-vn, 3) * 0.08;
          if (!contact || -vn > contact.strength) contact = { strength: -vn, x: px - nx * HULL_RADIUS, z: pz - nz * HULL_RADIUS };
        }
      }
    }
    return contact;
  }

  /** Returns outward normal and penetration depth for a hull sample, if any. */
  private pushOut(px: number, pz: number, obstacles: Obstacle[], dynamic: DynamicCircle[]): [number, number, number] | null {
    let best: [number, number, number] | null = null;
    const consider = (nx: number, nz: number, depth: number) => {
      if (depth > 0 && (!best || depth > best[2])) best = [nx, nz, depth];
    };

    // Shoreline.
    const d = lakeSdf(px, pz);
    if (d > -HULL_RADIUS) {
      const [gx, gz] = lakeSdfGradient(px, pz);
      consider(-gx, -gz, d + HULL_RADIUS);
    }

    for (const o of obstacles) {
      if (o.kind === 'circle') {
        const dx = px - o.x;
        const dz = pz - o.z;
        const dist = Math.hypot(dx, dz) || 1e-4;
        consider(dx / dist, dz / dist, o.r + HULL_RADIUS - dist);
      } else {
        const c = Math.cos(o.rot);
        const s = Math.sin(o.rot);
        const dx = px - o.x;
        const dz = pz - o.z;
        // Local coordinates (inverse of rotation about y).
        const lx = dx * c - dz * s;
        const lz = dx * s + dz * c;
        if (Math.abs(lx) > o.hx + HULL_RADIUS || Math.abs(lz) > o.hz + HULL_RADIUS) continue;
        const qx = clamp(lx, -o.hx, o.hx);
        const qz = clamp(lz, -o.hz, o.hz);
        let nlx: number;
        let nlz: number;
        let depth: number;
        if (qx === lx && qz === lz) {
          // Inside: exit through the nearest face.
          const ex = o.hx - Math.abs(lx);
          const ez = o.hz - Math.abs(lz);
          if (ex < ez) {
            nlx = Math.sign(lx) || 1;
            nlz = 0;
            depth = ex + HULL_RADIUS;
          } else {
            nlx = 0;
            nlz = Math.sign(lz) || 1;
            depth = ez + HULL_RADIUS;
          }
        } else {
          const ddx = lx - qx;
          const ddz = lz - qz;
          const dist = Math.hypot(ddx, ddz);
          nlx = ddx / dist;
          nlz = ddz / dist;
          depth = HULL_RADIUS - dist;
        }
        // Back to world space.
        consider(nlx * c + nlz * s, -nlx * s + nlz * c, depth);
      }
    }

    for (const o of dynamic) {
      const dx = px - o.x;
      const dz = pz - o.z;
      const dist = Math.hypot(dx, dz) || 1e-4;
      consider(dx / dist, dz / dist, o.r + HULL_RADIUS - dist);
    }
    return best;
  }
}
