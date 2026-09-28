import * as THREE from 'three';
import type { AtmosState } from './presets';
import { sharedUniforms } from './presets';

const vertexShader = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // pin to the far plane
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uGlow;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uFogColor;
uniform float uSunDisc;
uniform float uStars;
uniform float uMoon;
uniform float uClouds;
uniform float uRain;
uniform float uTime;
varying vec3 vDir;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += noise(p) * a;
    p = p * 2.03 + 11.7;
    a *= 0.5;
  }
  return s;
}

void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  float yc = max(y, 0.0);
  vec3 col = mix(uHorizon, uTop, pow(yc, 0.45));
  float sd = max(dot(d, uSunDir), 0.0);
  float horizonBand = exp(-abs(y) * 9.0);
  col += uGlow * (pow(sd, 7.0) * 0.55 + horizonBand * pow(sd * 0.5 + 0.5, 3.0) * 0.4);

  // Stylised stratus bands, lit from the sun side.
  if (uClouds > 0.01 && y > -0.02) {
    vec2 uv = d.xz / (y + 0.12);
    float c = fbm(uv * vec2(0.9, 2.2) + vec2(uTime * 0.004, 0.0));
    float cover = mix(0.62, 0.28, uRain);
    float m = smoothstep(cover, cover + 0.22, c) * smoothstep(0.0, 0.18, y) * uClouds;
    vec3 lit = mix(uHorizon * 1.05, uGlow * 1.3 + uSunColor * 0.4, pow(sd, 3.0) * (1.0 - uRain));
    vec3 cloudCol = mix(lit, uTop * 0.8 + uHorizon * 0.3, smoothstep(0.1, 0.6, y));
    col = mix(col, cloudCol, m * 0.85);
  }

  // Sun disc.
  col += uSunColor * smoothstep(0.99955, 0.99975, sd) * 14.0 * uSunDisc;

  // Moon and stars.
  if (uMoon > 0.01) {
    float md = dot(d, uSunDir);
    float disc = smoothstep(0.99935, 0.99955, md);
    float shade = 0.8 + 0.2 * noise(d.xz * 900.0);
    col += vec3(1.0, 0.97, 0.9) * disc * 3.0 * shade * uMoon;
    col += vec3(0.5, 0.6, 0.9) * pow(max(md, 0.0), 180.0) * 0.18 * uMoon;
  }
  if (uStars > 0.01 && y > 0.0) {
    vec2 sp = vec2(atan(d.z, d.x) * 160.0, asin(clamp(y, -1.0, 1.0)) * 160.0);
    vec2 cell = floor(sp);
    float h = hash12(cell);
    vec2 center = cell + vec2(hash12(cell + 1.7), hash12(cell + 9.1));
    float star = step(0.985, h) * smoothstep(0.35, 0.0, length(sp - center));
    float tw = 0.6 + 0.4 * sin(uTime * (1.5 + h * 3.0) + h * 40.0);
    col += vec3(0.85, 0.9, 1.0) * star * tw * uStars * smoothstep(0.0, 0.25, y) * 1.4;
  }

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  // Blend into the same haze colour the scene fogs toward, so the horizon has no seam.
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uFogColor, horizonBand * 0.55 + smoothstep(0.02, -0.12, y));
}
`;

export class Sky {
  readonly mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTop: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uGlow: { value: new THREE.Color() },
        uSunDir: sharedUniforms.uSunDir,
        uSunColor: sharedUniforms.uSunColor,
        uFogColor: sharedUniforms.uFogColor,
        uTime: sharedUniforms.uTime,
        uSunDisc: { value: 1 },
        uStars: { value: 0 },
        uMoon: { value: 0 },
        uClouds: { value: 0.5 },
        uRain: { value: 0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
    this.mesh.name = 'sky';
  }

  update(camera: THREE.Camera, s: AtmosState): void {
    this.mesh.position.copy(camera.position);
    const u = this.material.uniforms;
    u.uTop.value.copy(s.skyTop);
    u.uHorizon.value.copy(s.skyHorizon);
    u.uGlow.value.copy(s.skyGlow).multiplyScalar(1 - s.rain * 0.7);
    u.uSunDisc.value = s.sunDisc;
    u.uStars.value = s.stars;
    u.uMoon.value = s.moon;
    u.uClouds.value = s.clouds;
    u.uRain.value = s.rain;
  }
}
