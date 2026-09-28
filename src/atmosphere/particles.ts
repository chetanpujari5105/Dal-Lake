import * as THREE from 'three';
import { Rng } from '../core/math';
import { lakeSdf, SHORE } from '../world/layout';
import { sharedUniforms, type AtmosState } from './presets';

// All particle motion runs in vertex shaders; the CPU only updates uniforms.

const fogChunk = /* glsl */ `
uniform float uFogDensity;
float fogFactor(float d) { return exp(-uFogDensity * uFogDensity * d * d); }
`;

// ---------------------------------------------------------------------------
// Lantern glows (houseboats, Boulevard lamps, boats)

const glowVS = /* glsl */ `
attribute float aSeed;
attribute float aSize;
uniform float uTime;
uniform float uAmount;
uniform float uPixelScale;
varying float vA;
${fogChunk}
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float flick = 0.88 + 0.12 * sin(uTime * 7.0 + aSeed * 20.0) * sin(uTime * 3.1 + aSeed * 7.0);
  float d = -mv.z;
  gl_PointSize = clamp(aSize * uPixelScale / max(d, 0.1), 2.0, 160.0) * flick;
  vA = uAmount * flick * mix(0.25, 1.0, fogFactor(d));
}
`;
const glowFS = /* glsl */ `
uniform vec3 uColor;
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  float a = exp(-d * d * 5.0) * 0.8 + smoothstep(0.22, 0.0, d);
  gl_FragColor = vec4(uColor, a * vA);
  #include <colorspace_fragment>
}
`;

export class Glows {
  readonly points: THREE.Points;
  private material: THREE.ShaderMaterial;
  private dynamicStart: number;
  private positions: Float32Array;

  constructor(staticPositions: THREE.Vector3[], dynamicCount: number, size = 1.1) {
    const total = staticPositions.length + dynamicCount;
    this.positions = new Float32Array(total * 3);
    const seeds = new Float32Array(total);
    const sizes = new Float32Array(total);
    staticPositions.forEach((p, i) => {
      p.toArray(this.positions, i * 3);
      seeds[i] = Math.random();
      sizes[i] = size;
    });
    for (let i = staticPositions.length; i < total; i++) {
      seeds[i] = Math.random();
      sizes[i] = size * 0.9;
    }
    this.dynamicStart = staticPositions.length;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    this.material = new THREE.ShaderMaterial({
      vertexShader: glowVS,
      fragmentShader: glowFS,
      uniforms: {
        uTime: sharedUniforms.uTime,
        uPixelScale: sharedUniforms.uPixelScale,
        uFogDensity: sharedUniforms.uFogDensity,
        uAmount: { value: 0 },
        uColor: { value: new THREE.Color('#ffb25c').multiplyScalar(1.6) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.name = 'lantern-glows';
  }

  setDynamic(i: number, p: THREE.Vector3): void {
    p.toArray(this.positions, (this.dynamicStart + i) * 3);
  }

  update(amount: number): void {
    this.points.geometry.attributes.position.needsUpdate = true;
    this.material.uniforms.uAmount.value = amount;
    this.points.visible = amount > 0.02;
  }
}

// ---------------------------------------------------------------------------
// Sunlit dust motes around the camera

const dustVS = /* glsl */ `
attribute float aSeed;
uniform float uTime;
uniform float uPixelScale;
uniform float uAmount;
uniform vec3 uCam;
uniform vec3 uSunDir;
varying float vA;
const float BOX = 46.0;
void main() {
  vec3 p = position;
  p.x += sin(uTime * 0.13 + aSeed * 6.0) * 1.5 + uTime * 0.25;
  p.z += cos(uTime * 0.11 + aSeed * 4.0) * 1.5 + uTime * 0.08;
  vec3 rel = mod(p - uCam + BOX * 0.5, BOX) - BOX * 0.5;
  vec3 world = vec3(uCam.x + rel.x, 0.4 + mod(position.y + sin(uTime * 0.2 + aSeed * 9.0) * 0.6, 9.0), uCam.z + rel.z);
  vec4 mv = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = -mv.z;
  gl_PointSize = clamp(0.07 * uPixelScale / max(d, 0.1), 1.0, 5.0);
  vec3 v = normalize(world - cameraPosition);
  float backlit = pow(max(dot(v, uSunDir), 0.0), 3.0) * 2.2 + 0.25;
  float edge = smoothstep(BOX * 0.5, BOX * 0.3, length(rel.xz));
  vA = uAmount * backlit * edge * (0.5 + 0.5 * sin(uTime * 2.0 + aSeed * 30.0));
}
`;
const softPointFS = /* glsl */ `
uniform vec3 uColor;
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.0, d);
  gl_FragColor = vec4(uColor, a * vA);
  #include <colorspace_fragment>
}
`;

// ---------------------------------------------------------------------------
// Fireflies along the shore at night

const fireflyVS = /* glsl */ `
attribute float aSeed;
uniform float uTime;
uniform float uPixelScale;
uniform float uAmount;
varying float vA;
${fogChunk}
void main() {
  vec3 p = position;
  p.x += sin(uTime * 0.4 + aSeed * 20.0) * 1.2;
  p.y += sin(uTime * 0.6 + aSeed * 13.0) * 0.5;
  p.z += cos(uTime * 0.35 + aSeed * 17.0) * 1.2;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = -mv.z;
  gl_PointSize = clamp(0.25 * uPixelScale / max(d, 0.1), 1.5, 10.0);
  float blink = smoothstep(0.55, 1.0, sin(uTime * (0.8 + aSeed) + aSeed * 50.0));
  vA = uAmount * blink * fogFactor(d);
}
`;

// ---------------------------------------------------------------------------
// Rain streaks: instanced quads in a box that travels with the camera

const rainVS = /* glsl */ `
attribute vec3 aOffset;
attribute float aSpeed;
uniform float uTime;
uniform vec3 uCam;
uniform float uAmount;
varying float vA;
varying float vV;
const vec3 BOX = vec3(56.0, 26.0, 56.0);
void main() {
  vec3 fall = normalize(vec3(0.18, -1.0, 0.1));
  float y = mod(aOffset.y - uTime * aSpeed, BOX.y);
  vec3 p = vec3(aOffset.x, y, aOffset.z);
  vec2 rel = mod(p.xz - uCam.xz + BOX.xz * 0.5, BOX.xz) - BOX.xz * 0.5;
  vec3 world = vec3(uCam.x + rel.x + fall.x * y, uCam.y - 8.0 + y, uCam.z + rel.y + fall.z * y);
  vec3 toCam = normalize(cameraPosition - world);
  vec3 side = normalize(cross(fall, toCam));
  world += side * position.x * 0.03 - fall * position.y * 0.9;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  float edge = smoothstep(BOX.x * 0.5, BOX.x * 0.25, length(rel));
  vA = uAmount * edge * step(0.0, world.y);
  vV = position.y;
}
`;
const rainFS = /* glsl */ `
uniform vec3 uColor;
varying float vA;
varying float vV;
void main() {
  gl_FragColor = vec4(uColor, vA * 0.5 * smoothstep(0.0, 0.6, vV));
  #include <colorspace_fragment>
}
`;

// ---------------------------------------------------------------------------
// Low mist banks for dawn

const mistVS = /* glsl */ `
attribute vec3 aOffset;
attribute float aSize;
attribute float aSeed;
uniform float uTime;
uniform vec3 uCam;
varying vec2 vUv;
varying float vSeed;
varying float vFade;
const float BOX = 220.0;
void main() {
  vec2 drift = vec2(uTime * 0.6, uTime * 0.25);
  vec2 rel = mod(aOffset.xz + drift - uCam.xz + BOX * 0.5, BOX) - BOX * 0.5;
  vec3 center = vec3(uCam.x + rel.x, aOffset.y, uCam.z + rel.y);
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 world = center + right * position.x * aSize + vec3(0.0, 1.0, 0.0) * position.y * aSize * 0.35;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  vUv = position.xy + 0.5;
  vSeed = aSeed;
  float d = length(center - cameraPosition);
  vFade = smoothstep(6.0, 22.0, d) * smoothstep(BOX * 0.5, BOX * 0.3, length(rel));
}
`;
const mistFS = /* glsl */ `
uniform vec3 uColor;
uniform float uAmount;
varying vec2 vUv;
varying float vSeed;
varying float vFade;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
void main() {
  vec2 c = vUv - 0.5;
  float r = length(c * vec2(1.0, 2.0)) * 2.0;
  float n = noise(vUv * 3.0 + vSeed * 10.0) * 0.6 + noise(vUv * 7.0 - vSeed * 5.0) * 0.4;
  float a = smoothstep(1.0, 0.1, r) * n * uAmount * vFade * 0.42;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}
`;

export class Particles {
  readonly group = new THREE.Group();
  private dust: THREE.ShaderMaterial;
  private fireflies: THREE.ShaderMaterial;
  private rain: THREE.ShaderMaterial;
  private mist: THREE.ShaderMaterial;
  private dustPts: THREE.Points;
  private fireflyPts: THREE.Points;
  private rainMesh: THREE.Mesh;
  private mistMesh: THREE.Mesh;

  constructor(scale: number, layer: number) {
    const rng = new Rng(404);

    // Dust.
    const dustN = Math.round(360 * scale);
    const dp = new Float32Array(dustN * 3);
    const ds = new Float32Array(dustN);
    for (let i = 0; i < dustN; i++) {
      dp.set([rng.range(0, 46), rng.range(0, 9), rng.range(0, 46)], i * 3);
      ds[i] = rng.next();
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    dg.setAttribute('aSeed', new THREE.BufferAttribute(ds, 1));
    this.dust = new THREE.ShaderMaterial({
      vertexShader: dustVS,
      fragmentShader: softPointFS,
      uniforms: {
        uTime: sharedUniforms.uTime,
        uPixelScale: sharedUniforms.uPixelScale,
        uSunDir: sharedUniforms.uSunDir,
        uCam: { value: new THREE.Vector3() },
        uAmount: { value: 0 },
        uColor: { value: new THREE.Color('#ffe0ad') },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.dustPts = new THREE.Points(dg, this.dust);

    // Fireflies near the natural shoreline.
    const ffN = Math.round(320 * Math.max(scale, 0.5));
    const fp = new Float32Array(ffN * 3);
    const fs = new Float32Array(ffN);
    for (let i = 0; i < ffN; i++) {
      for (let tries = 0; tries < 20; tries++) {
        const [sx, sz] = SHORE[rng.int(0, SHORE.length - 1)];
        if (sx > 200) continue;
        const x = sx + rng.range(-10, 10);
        const z = sz + rng.range(-10, 10);
        if (lakeSdf(x, z) < -4) continue;
        fp.set([x, rng.range(0.6, 3.5), z], i * 3);
        break;
      }
      fs[i] = rng.next();
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
    fg.setAttribute('aSeed', new THREE.BufferAttribute(fs, 1));
    this.fireflies = new THREE.ShaderMaterial({
      vertexShader: fireflyVS,
      fragmentShader: softPointFS,
      uniforms: {
        uTime: sharedUniforms.uTime,
        uPixelScale: sharedUniforms.uPixelScale,
        uFogDensity: sharedUniforms.uFogDensity,
        uAmount: { value: 0 },
        uColor: { value: new THREE.Color('#d8ff8a').multiplyScalar(1.6) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.fireflyPts = new THREE.Points(fg, this.fireflies);

    // Rain.
    const rainN = Math.round(2600 * scale);
    const quad = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const rg = new THREE.InstancedBufferGeometry();
    rg.index = quad.index;
    rg.setAttribute('position', quad.attributes.position);
    const ro = new Float32Array(rainN * 3);
    const rs = new Float32Array(rainN);
    for (let i = 0; i < rainN; i++) {
      ro.set([rng.range(0, 56), rng.range(0, 26), rng.range(0, 56)], i * 3);
      rs[i] = rng.range(13, 18);
    }
    rg.setAttribute('aOffset', new THREE.InstancedBufferAttribute(ro, 3));
    rg.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(rs, 1));
    rg.instanceCount = rainN;
    this.rain = new THREE.ShaderMaterial({
      vertexShader: rainVS,
      fragmentShader: rainFS,
      uniforms: {
        uTime: sharedUniforms.uTime,
        uCam: { value: new THREE.Vector3() },
        uAmount: { value: 0 },
        uColor: { value: new THREE.Color('#cfd8e0') },
      },
      transparent: true,
      depthWrite: false,
    });
    this.rainMesh = new THREE.Mesh(rg, this.rain);

    // Mist.
    const mistN = Math.round(70 * Math.max(scale, 0.5));
    const mg = new THREE.InstancedBufferGeometry();
    const mq = new THREE.PlaneGeometry(1, 1);
    mg.index = mq.index;
    mg.setAttribute('position', mq.attributes.position);
    const mo = new Float32Array(mistN * 3);
    const msz = new Float32Array(mistN);
    const msd = new Float32Array(mistN);
    for (let i = 0; i < mistN; i++) {
      mo.set([rng.range(0, 220), rng.range(1.5, 5), rng.range(0, 220)], i * 3);
      msz[i] = rng.range(26, 46);
      msd[i] = rng.next();
    }
    mg.setAttribute('aOffset', new THREE.InstancedBufferAttribute(mo, 3));
    mg.setAttribute('aSize', new THREE.InstancedBufferAttribute(msz, 1));
    mg.setAttribute('aSeed', new THREE.InstancedBufferAttribute(msd, 1));
    mg.instanceCount = mistN;
    this.mist = new THREE.ShaderMaterial({
      vertexShader: mistVS,
      fragmentShader: mistFS,
      uniforms: {
        uTime: sharedUniforms.uTime,
        uCam: { value: new THREE.Vector3() },
        uAmount: { value: 0 },
        uColor: { value: new THREE.Color() },
      },
      transparent: true,
      depthWrite: false,
    });
    this.mistMesh = new THREE.Mesh(mg, this.mist);

    for (const o of [this.dustPts, this.fireflyPts, this.rainMesh, this.mistMesh]) {
      o.frustumCulled = false;
      o.layers.set(layer);
      this.group.add(o);
    }
    this.mistMesh.renderOrder = 5;
    this.rainMesh.renderOrder = 6;
    this.group.name = 'particles';
  }

  /** `fog` is the tone-mapped linear fog colour, so mist blends into the haze. */
  update(camera: THREE.Camera, s: AtmosState, lightColor: THREE.Color, fog: THREE.Color): void {
    const cam = camera.position;
    this.dust.uniforms.uCam.value.copy(cam);
    this.dust.uniforms.uAmount.value = s.dust;
    this.dustPts.visible = s.dust > 0.02;

    this.fireflies.uniforms.uAmount.value = s.fireflies;
    this.fireflyPts.visible = s.fireflies > 0.02;

    this.rain.uniforms.uCam.value.copy(cam);
    this.rain.uniforms.uAmount.value = s.rain;
    this.rain.uniforms.uColor.value.copy(lightColor);
    this.rainMesh.visible = s.rain > 0.02;

    this.mist.uniforms.uCam.value.copy(cam);
    this.mist.uniforms.uAmount.value = s.mist;
    this.mist.uniforms.uColor.value.copy(fog);
    this.mistMesh.visible = s.mist > 0.02;
  }
}
