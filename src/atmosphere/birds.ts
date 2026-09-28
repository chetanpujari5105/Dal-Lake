import * as THREE from 'three';
import { sharedUniforms } from './presets';

const vertexShader = /* glsl */ `
attribute float aWing;
attribute float aPhase;
uniform float uTime;
uniform float uFlap;
varying float vFog;
uniform float uFogDensity;
void main() {
  vec3 p = position;
  float flap = sin(uTime * 8.5 * uFlap + aPhase * 6.2831);
  p.y += abs(p.x) * flap * 0.9 * aWing;
  p.x *= 1.0 - 0.15 * abs(flap) * aWing;
  vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
  vec4 mv = viewMatrix * wp;
  float d = length(mv.xyz);
  vFog = 1.0 - exp(-uFogDensity * uFogDensity * d * d);
  gl_Position = projectionMatrix * mv;
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uFogColor;
uniform float uAlpha;
varying float vFog;
void main() {
  gl_FragColor = vec4(uColor, 1.0);
  #include <colorspace_fragment>
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uFogColor, vFog);
  gl_FragColor.a = uAlpha;
}
`;

interface Bird {
  flock: number;
  ox: number;
  oy: number;
  oz: number;
  seed: number;
}

interface Flock {
  cx: number;
  cz: number;
  radius: number;
  height: number;
  speed: number;
  angle: number;
}

/** Small flocks wheeling over the lake. Wings flap on the GPU. */
export class Birds {
  readonly mesh: THREE.InstancedMesh;
  private birds: Bird[] = [];
  private flocks: Flock[] = [];
  private material: THREE.ShaderMaterial;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();

  constructor(reducedMotion: boolean) {
    // Body plus two wings; aWing marks vertices that move with the flap.
    const pos = [
      // left wing
      0, 0, 0.25, -1.1, 0, -0.1, 0, 0, -0.25,
      // right wing
      0, 0, 0.25, 0, 0, -0.25, 1.1, 0, -0.1,
      // body
      0, 0.05, 0.4, -0.08, 0, -0.35, 0.08, 0, -0.35,
    ];
    const wing = [0, 1, 0, 0, 0, 1, 0, 0, 0];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 1));

    this.flocks = [
      { cx: 40, cz: -60, radius: 170, height: 48, speed: 0.055, angle: 0 },
      { cx: -80, cz: 80, radius: 130, height: 34, speed: -0.07, angle: 2 },
      { cx: 120, cz: -150, radius: 95, height: 28, speed: 0.085, angle: 4 },
    ];
    const phases: number[] = [];
    this.flocks.forEach((_, fi) => {
      for (let i = 0; i < 7; i++) {
        const row = Math.ceil(i / 2);
        const side = i % 2 === 0 ? 1 : -1;
        this.birds.push({ flock: fi, ox: side * row * 2.2, oy: Math.sin(i * 3.1) * 0.8, oz: -row * 2.4, seed: Math.random() });
        phases.push(Math.random());
      }
    });
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(phases), 1));

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: sharedUniforms.uTime,
        uFogColor: sharedUniforms.uFogColor,
        uFogDensity: sharedUniforms.uFogDensity,
        uColor: { value: new THREE.Color('#1c1511') },
        uAlpha: { value: 1 },
        uFlap: { value: reducedMotion ? 0.5 : 1 },
      },
      side: THREE.DoubleSide,
      transparent: true,
    });
    this.mesh = new THREE.InstancedMesh(geo, this.material, this.birds.length);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'birds';
  }

  update(dt: number, t: number, amount: number): void {
    this.mesh.visible = amount > 0.03;
    this.material.uniforms.uAlpha.value = Math.min(1, amount * 1.2);
    if (!this.mesh.visible) return;
    for (const f of this.flocks) f.angle += f.speed * dt;
    this.birds.forEach((b, i) => {
      const f = this.flocks[b.flock];
      const a = f.angle;
      const cx = f.cx + Math.cos(a) * f.radius;
      const cz = f.cz + Math.sin(a) * f.radius;
      // Tangent heading along the circle.
      const heading = Math.atan2(-Math.sin(a) * Math.sign(f.speed), Math.cos(a) * Math.sign(f.speed));
      const ch = Math.cos(heading);
      const sh = Math.sin(heading);
      const wob = Math.sin(t * 0.7 + b.seed * 10) * 0.6;
      const x = cx + b.ox * ch + b.oz * sh + wob;
      const z = cz - b.ox * sh + b.oz * ch;
      const y = f.height + b.oy + Math.sin(t * 0.5 + b.seed * 6) * 1.5;
      this.e.set(0, heading, -Math.sign(f.speed) * 0.25);
      this.q.setFromEuler(this.e);
      this.m.compose(this.v.set(x, y, z), this.q, this.s.setScalar(1.3));
      this.mesh.setMatrixAt(i, this.m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
