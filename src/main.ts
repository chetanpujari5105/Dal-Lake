import './ui/styles.css';
import { App } from './app';
import { LoadError } from './assets/loader';
import { isWebGL2Available } from './core/renderer';

function fatal(message: string, detail = ''): void {
  const error = document.getElementById('error');
  const text = error?.querySelector('.error-text');
  const pre = error?.querySelector('.error-detail');
  if (!error || !text) {
    alert(message);
    return;
  }
  text.textContent = message;
  if (pre) pre.textContent = detail;
  const details = pre?.closest('details');
  if (details) details.hidden = !detail;
  error.hidden = false;
  document.getElementById('title')?.setAttribute('hidden', '');
  error.querySelector<HTMLButtonElement>('.error-reload')?.addEventListener('click', () => window.location.reload());
}

async function boot(): Promise<void> {
  const canvas = document.getElementById('scene') as HTMLCanvasElement | null;
  if (!canvas) return fatal('The page did not load correctly.');

  if (!isWebGL2Available()) {
    return fatal(
      'This journey needs WebGL 2, which your browser or device does not currently provide. Try an up-to-date Chrome, Edge, Firefox or Safari, and check that hardware acceleration is enabled.',
    );
  }

  let app: App;
  try {
    app = new App(canvas);
  } catch (err) {
    console.error(err);
    return fatal('The 3D renderer could not start on this device.', err instanceof Error ? err.stack ?? err.message : String(err));
  }

  try {
    await app.init();
  } catch (err) {
    console.error(err);
    const msg = err instanceof LoadError ? err.message : 'Something went wrong while building the lake.';
    app.ui.showError(msg, err instanceof Error ? (err instanceof LoadError && err.cause instanceof Error ? err.cause.stack ?? '' : err.stack ?? '') : String(err));
    app.dispose();
  }

  if (import.meta.env.DEV) (window as unknown as { app: App }).app = app;
}

void boot();
