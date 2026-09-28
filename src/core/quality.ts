// Device capability tiers and an adaptive step-down so slow devices never collapse.

export type QualityTier = 'high' | 'low';

export interface QualitySettings {
  tier: QualityTier;
  maxPixelRatio: number;
  reflections: boolean;
  shadows: boolean;
  shadowMapSize: number;
  trailPoints: number;
  terrainRadialStep: number;
  terrainAngular: number;
  treeScale: number; // multiplier on instance counts
  particles: number; // multiplier on particle counts
}

export function detectTouch(): boolean {
  return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
}

export function detectQuality(): QualitySettings {
  const params = new URLSearchParams(window.location.search);
  const forced = params.get('quality');
  const ua = navigator.userAgent;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (detectTouch() && Math.min(screen.width, screen.height) < 820);
  const lowMemory = ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) <= 3;
  const tier: QualityTier = forced === 'high' ? 'high' : forced === 'low' ? 'low' : mobile || lowMemory ? 'low' : 'high';

  if (tier === 'high') {
    return {
      tier,
      maxPixelRatio: 1.75,
      reflections: true,
      shadows: true,
      shadowMapSize: 2048,
      trailPoints: 56,
      terrainRadialStep: 4,
      terrainAngular: 300,
      treeScale: 1,
      particles: 1,
    };
  }
  return {
    tier,
    maxPixelRatio: 1.5,
    reflections: false,
    shadows: true,
    shadowMapSize: 1024,
    trailPoints: 24,
    terrainRadialStep: 6.5,
    terrainAngular: 200,
    treeScale: 0.5,
    particles: 0.4,
  };
}

/**
 * Watches frame time and steps quality down (never up, to avoid oscillation):
 * pixel ratio first, then reflections, then shadows.
 */
export class AdaptiveQuality {
  private ema = 1 / 60;
  private slowTime = 0;
  private warmup = 3;
  private level = 0;

  constructor(private onStepDown: (level: number) => boolean) {}

  update(dt: number): void {
    if (this.warmup > 0) {
      this.warmup -= dt;
      return;
    }
    this.ema += (dt - this.ema) * 0.05;
    if (this.ema > 1 / 38) this.slowTime += dt;
    else this.slowTime = Math.max(0, this.slowTime - dt * 0.5);
    if (this.slowTime > 2.5) {
      this.slowTime = 0;
      this.warmup = 2;
      this.level++;
      if (!this.onStepDown(this.level)) this.level--;
    }
  }
}
