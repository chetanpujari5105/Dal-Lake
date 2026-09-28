// Runs the scene-building steps in order, yielding between them so the
// loading bar can paint. Everything is procedural, so "loading" here means
// generating geometry and textures and compiling shaders.

export interface LoadStep {
  label: string;
  weight: number;
  run: () => void | Promise<void>;
}

export class LoadError extends Error {
  constructor(public step: string, public cause: unknown) {
    super(`Failed while ${step.toLowerCase()}: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}

// rAF lets the progress bar paint, but it never fires in a background tab, so a
// timeout guarantees loading still finishes there.
const nextFrame = () =>
  new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    requestAnimationFrame(finish);
    setTimeout(finish, 50);
  });

export async function runLoadSteps(
  steps: LoadStep[],
  onProgress: (fraction: number, label: string) => void,
): Promise<void> {
  const total = steps.reduce((s, x) => s + x.weight, 0);
  let done = 0;
  for (const step of steps) {
    onProgress(done / total, step.label);
    await nextFrame();
    try {
      await step.run();
    } catch (err) {
      throw new LoadError(step.label, err);
    }
    done += step.weight;
  }
  onProgress(1, 'Ready');
}
