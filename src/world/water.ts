import * as THREE from 'three';
import type { AtmosState } from '../atmosphere/presets';
import { sharedUniforms } from '../atmosphere/presets';
import type { QualitySettings } from '../core/quality';

const TRAIL_LIFE = 6.5;

const vertexShader = /* glsl */ `
uniform mat4 uTextureMatrix;
varying vec3 vWorld;
varying vec4 vReflCoord;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vReflCoord = uTextureMatrix * wp;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const fragmentShader = /* glsl */ `
uniform float uTime;
uniform sampler2D uRipples;
uniform sampler2D uReflection;
uniform float uUseReflection;
uniform vec4 uTrail[TRAIL_N];
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGlow;
uniform vec3 uWaterDeep;
uniform vec3 uLandTint;
uniform vec3 uHemiSky;
uniform vec3 uFogColor;
uniform float uSunIntensity;
uniform float uHemiIntensity;
uniform float uSpec;
uniform float uWind;
uniform float uRain;
uniform float uFogDensity;
varying vec3 vWorld;
varying vec4 vReflCoord;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// Expanding rings from raindrops, one per grid cell with a random phase.
vec2 rainRipples(vec2 p, float t) {
  vec2 g = floor(p);
  vec2 f = fract(p);
  vec2 slope = vec2(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 o = vec2(float(i), float(j));
      vec2 cell = g + o;
      float h = hash21(cell);
      vec2 c = o + vec2(hash21(cell + 3.1), hash21(cell + 7.7)) - f;
      float ph = fract(t * 1.1 + h);
      float d = length(c);
      float x = (d - ph * 0.85) * 14.0;
      float ring = exp(-x * x) * (1.0 - ph) * (1.0 - ph);
      slope += (-c / (d + 1e-4)) * sin(x * 2.2) * ring;
    }
  }
  return slope;
}

vec3 skyColor(vec3 dir) {
  float y = max(dir.y, 0.0);
  vec3 col = mix(uSkyHorizon, uSkyTop, pow(y, 0.45));
  float sd = max(dot(dir, uSunDir), 0.0);
  col += uSkyGlow * (pow(sd, 6.0) * 0.5 + exp(-y * 9.0) * pow(sd * 0.5 + 0.5, 3.0) * 0.35);
  return col;
}

void main() {
  vec2 p = vWorld.xz;
  float dist = length(cameraPosition - vWorld);
  float t = uTime;

  // Three scales of wind ripples drifting at different speeds.
  vec2 s1 = texture2D(uRipples, p * 0.043 + t * vec2(0.011, 0.007)).xy * 2.0 - 1.0;
  vec2 s2 = texture2D(uRipples, p * 0.107 + t * vec2(-0.016, 0.012)).xy * 2.0 - 1.0;
  vec2 s3 = texture2D(uRipples, p * 0.012 + t * vec2(0.003, -0.005)).xy * 2.0 - 1.0;
  float fade = 1.0 / (1.0 + dist * 0.012);
  vec2 slope = ((s1 * 0.55 + s2 * 0.3) * uWind + s3 * 0.35 * (0.5 + 0.5 * uWind)) * 0.26 * (0.3 + 0.7 * fade);

  // Wake and paddle ripples: every trail point emits an expanding ring;
  // successive points along the boat's path add up to a V-shaped wake.
  float foam = 0.0;
  for (int i = 0; i < TRAIL_N; i++) {
    vec4 tp = uTrail[i];
    if (tp.w <= 0.0) continue;
    vec2 d = p - tp.xy;
    float dd = dot(d, d);
    if (dd > 160.0) continue;
    float len = sqrt(dd);
    float age = tp.z;
    float band = len - (0.35 + age * 1.5);
    float env = exp(-band * band * 1.4) * exp(-age * 0.6) * tp.w;
    slope += (d / (len + 1e-3)) * cos(band * 6.0) * env * 0.22;
    foam += exp(-dd * 1.4) * exp(-age * 2.0) * tp.w;
  }

  if (uRain > 0.01) slope += rainRipples(p * 1.4, t) * 0.2 * uRain * fade;

  vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));
  vec3 V = normalize(cameraPosition - vWorld);
  float ndv = max(dot(N, V), 0.0);
  float fres = clamp(0.035 + pow(1.0 - ndv, 4.0) * 0.965, 0.0, 1.0);
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);

  vec3 refl = skyColor(R);
  if (uUseReflection > 0.5) {
    vec2 ruv = vReflCoord.xy / vReflCoord.w + slope * 0.11;
    refl = texture2D(uReflection, ruv).rgb;
  } else {
    // Cheap stand-in for reflected shoreline, trees and hills near the horizon.
    refl = mix(refl, uLandTint, smoothstep(0.1, 0.0, R.y) * 0.8);
  }

  vec3 body = uWaterDeep * (0.25 + uHemiIntensity * 0.55 + uSunIntensity * max(uSunDir.y, 0.0) * 0.4);
  vec3 col = mix(body, refl, fres);

  // Sun (or moon) glitter path.
  float sd = max(dot(R, uSunDir), 0.0);
  col += uSunColor * uSunIntensity * uSpec * (pow(sd, 900.0) * 5.0 + pow(sd, 110.0) * 0.3) * (0.35 + 0.65 * fade);

  // Soft foam where the hull and paddle disturb the surface.
  float fn = texture2D(uRipples, p * 0.7 + t * 0.02).x;
  foam = clamp(foam * (0.5 + 0.9 * fn) - 0.12, 0.0, 1.0);
  vec3 foamCol = uSunColor * uSunIntensity * max(uSunDir.y, 0.12) * 0.5 + uHemiSky * uHemiIntensity * 0.55;
  col = mix(col, foamCol, foam * 0.5);

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  float fogF = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uFogColor, fogF);
}
`;

export class Water {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  private trail: THREE.Vector4[];
  private trailHead = 0;
  private rt: THREE.WebGLRenderTarget | null = null;
  private virtualCamera = new THREE.PerspectiveCamera();
  private textureMatrix = new THREE.Matrix4();
  private reflectionScale = 0.5;
  reflectionsEnabled: boolean;

  constructor(q: QualitySettings, ripples: THREE.Texture, private renderer: THREE.WebGLRenderer) {
    this.trail = Array.from({ length: q.trailPoints }, () => new THREE.Vector4(0, 0, 99, 0));
    this.reflectionsEnabled = q.reflections;

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      defines: { TRAIL_N: q.trailPoints },
      uniforms: {
        uTime: sharedUniforms.uTime,
        uFogColor: sharedUniforms.uFogColor,
        uFogDensity: sharedUniforms.uFogDensity,
        uSunDir: sharedUniforms.uSunDir,
        uSunColor: sharedUniforms.uSunColor,
        uRipples: { value: ripples },
        uReflection: { value: null },
        uUseReflection: { value: 0 },
        uTextureMatrix: { value: this.textureMatrix },
        uTrail: { value: this.trail },
        uSkyTop: { value: new THREE.Color() },
        uSkyHorizon: { value: new THREE.Color() },
        uSkyGlow: { value: new THREE.Color() },
        uWaterDeep: { value: new THREE.Color() },
        uLandTint: { value: new THREE.Color() },
        uHemiSky: { value: new THREE.Color() },
        uSunIntensity: { value: 1 },
        uHemiIntensity: { value: 1 },
        uSpec: { value: 1 },
        uWind: { value: 1 },
        uRain: { value: 0 },
      },
    });

    const geo = new THREE.PlaneGeometry(9000, 9000, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'water';
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.updateMatrix();

    if (this.reflectionsEnabled) this.createTarget();
  }

  private createTarget(): void {
    const ext = this.renderer.extensions;
    const canFloat = ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float');
    this.rt = new THREE.WebGLRenderTarget(16, 16, {
      type: canFloat ? THREE.HalfFloatType : THREE.UnsignedByteType,
      depthBuffer: true,
    });
    this.rt.texture.generateMipmaps = false;
    this.material.uniforms.uReflection.value = this.rt.texture;
    this.material.uniforms.uUseReflection.value = 1;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.resize(size.x, size.y);
  }

  setReflections(on: boolean): void {
    this.reflectionsEnabled = on;
    if (on && !this.rt) this.createTarget();
    if (!on && this.rt) {
      this.rt.dispose();
      this.rt = null;
      this.material.uniforms.uReflection.value = null;
    }
    this.material.uniforms.uUseReflection.value = on ? 1 : 0;
  }

  /** Drawing-buffer size in physical pixels. */
  resize(width: number, height: number): void {
    this.rt?.setSize(Math.max(1, Math.round(width * this.reflectionScale)), Math.max(1, Math.round(height * this.reflectionScale)));
  }

  addRipple(x: number, z: number, strength: number): void {
    const p = this.trail[this.trailHead];
    p.set(x, z, 0, strength);
    this.trailHead = (this.trailHead + 1) % this.trail.length;
  }

  update(dt: number, s: AtmosState): void {
    for (const p of this.trail) {
      if (p.w <= 0) continue;
      p.z += dt;
      if (p.z > TRAIL_LIFE) p.w = 0;
    }
    const u = this.material.uniforms;
    u.uSkyTop.value.copy(s.skyTop);
    u.uSkyHorizon.value.copy(s.skyHorizon);
    u.uSkyGlow.value.copy(s.skyGlow).multiplyScalar(1 - s.rain * 0.8);
    u.uWaterDeep.value.copy(s.waterDeep);
    u.uLandTint.value.copy(s.landTint);
    u.uHemiSky.value.copy(s.hemiSky);
    u.uSunIntensity.value = s.sunIntensity;
    u.uHemiIntensity.value = s.hemiIntensity;
    u.uSpec.value = s.waterSpec;
    u.uWind.value = s.wind;
    u.uRain.value = s.rain;
  }

  /** Planar reflection from a mirrored camera with an oblique near plane (same maths as three's Reflector). */
  renderReflection(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    if (!this.reflectionsEnabled || !this.rt) return;
    const vc = this.virtualCamera;
    const normal = _normal.set(0, 1, 0);
    const camPos = _camPos.setFromMatrixPosition(camera.matrixWorld);
    if (camPos.y <= 0.02) return;

    const view = _view.set(camPos.x, -camPos.y, camPos.z);
    _rot.extractRotation(camera.matrixWorld);
    const lookAt = _look.set(0, 0, -1).applyMatrix4(_rot).add(camPos);
    const target = _target.set(lookAt.x, -lookAt.y, lookAt.z);

    vc.position.copy(view);
    vc.up.set(0, 1, 0).applyMatrix4(_rot).reflect(normal);
    vc.lookAt(target);
    vc.far = camera.far;
    vc.near = camera.near;
    vc.updateMatrixWorld();
    vc.projectionMatrix.copy(camera.projectionMatrix);
    vc.layers.set(0);

    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(vc.projectionMatrix);
    this.textureMatrix.multiply(vc.matrixWorldInverse);

    // Oblique clipping so nothing below the water plane leaks into the reflection.
    _plane.setFromNormalAndCoplanarPoint(normal, _origin);
    _plane.applyMatrix4(vc.matrixWorldInverse);
    _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
    const pm = vc.projectionMatrix;
    _q.x = (Math.sign(_clip.x) + pm.elements[8]) / pm.elements[0];
    _q.y = (Math.sign(_clip.y) + pm.elements[9]) / pm.elements[5];
    _q.z = -1.0;
    _q.w = (1.0 + pm.elements[10]) / pm.elements[14];
    _clip.multiplyScalar(2.0 / _clip.dot(_q));
    pm.elements[2] = _clip.x;
    pm.elements[6] = _clip.y;
    pm.elements[10] = _clip.z + 1.0;
    pm.elements[14] = _clip.w;

    const prev = this.renderer.getRenderTarget();
    this.mesh.visible = false;
    this.renderer.setRenderTarget(this.rt);
    this.renderer.clear();
    this.renderer.render(scene, vc);
    this.renderer.setRenderTarget(prev);
    this.mesh.visible = true;
  }

  dispose(): void {
    this.rt?.dispose();
    this.material.dispose();
    this.mesh.geometry.dispose();
  }
}

const _normal = new THREE.Vector3();
const _camPos = new THREE.Vector3();
const _view = new THREE.Vector3();
const _look = new THREE.Vector3();
const _target = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _rot = new THREE.Matrix4();
const _plane = new THREE.Plane();
const _clip = new THREE.Vector4();
const _q = new THREE.Vector4();
