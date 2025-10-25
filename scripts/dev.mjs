import { context } from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { mkdir, rm, cp, readFile, writeFile, watch } from 'fs/promises';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, '..');
const distDir = join(root, 'dist');

async function ensureDist() {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });
  await mkdir(join(distDir, 'assets'), { recursive: true });
  await mkdir(join(distDir, 'styles'), { recursive: true });
}

async function copyStatic() {
  const files = ['manifest.json', 'background.js', 'content.js', 'offscreen.html', 'offscreen.js'];
  await Promise.all(files.map(async (file) => {
    await cp(join(root, file), join(distDir, file));
  }));
  await cp(join(root, 'icons'), join(distDir, 'icons'), { recursive: true });
  try {
    await cp(join(root, 'public', 'worklet.js'), join(distDir, 'worklet.js'));
  } catch {}
  try {
    await cp(join(root, 'public', 'audio-router-worklet.js'), join(distDir, 'audio-router-worklet.js'));
  } catch {}
}

async function injectPanelHtml() {
  const srcPath = join(root, 'sidepanel.html');
  const destPath = join(distDir, 'sidepanel.html');
  let html = await readFile(srcPath, 'utf8');
  const marker = '<!-- NO hardcoded <script>; bundler injects -->';
  const injection = `${marker}\n    <script type=\"module\" src=\"assets/sidepanel.js\"></script>`;
  if (html.includes(marker)) {
    html = html.replace(marker, injection);
  } else {
    html = html.replace('</body>', `    <script type=\"module\" src=\"assets/sidepanel.js\"></script>\n  </body>`);
  }
  await writeFile(destPath, html, 'utf8');
}

async function startTailwindWatch() {
  const input = join(root, 'src/styles/sidepanel.css');
  const output = join(distDir, 'styles/sidepanel.css');
  const child = spawn('npx', ['tailwindcss', '-i', input, '-o', output, '--watch'], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  child.on('exit', (code) => console.log('[dev] tailwind exited:', code));
}

async function startEsbuildWatch() {
  const ctx = await context({
    entryPoints: [join(root, 'src/sidepanel/index.tsx')],
    bundle: true,
    format: 'esm',
    outfile: join(distDir, 'assets/sidepanel.js'),
    sourcemap: true,
    target: ['chrome120'],
    define: {
      'process.env.NODE_ENV': '"development"',
      '__ASSIST_CONFIG__': JSON.stringify({
        API_BASE: 'http://localhost:8080',
        WS_BASE: 'ws://localhost:8080'
      })
    },
    loader: { '.png': 'file' },
    logLevel: 'info'
  });
  await ctx.watch();
  console.log('[dev] esbuild watching');
}

async function watchStatic() {
  const files = ['manifest.json', 'background.js', 'content.js', 'offscreen.html', 'offscreen.js', 'sidepanel.html'];
  for (const f of files) {
    const src = join(root, f);
    const dest = join(distDir, f);
    const isPanel = f === 'sidepanel.html';
    (await import('fs')).watch(src, { persistent: true }, async () => {
      try {
        if (isPanel) await injectPanelHtml(); else await cp(src, dest);
        console.log('[dev] updated', f);
      } catch (e) { console.warn('[dev] copy failed for', f, e); }
    });
  }
  try {
    (await import('fs')).watch(join(root, 'icons'), { recursive: true }, async () => {
      try { await cp(join(root, 'icons'), join(distDir, 'icons'), { recursive: true }); console.log('[dev] updated icons'); } catch {}
    });
  } catch {}
}

async function main() {
  await ensureDist();
  await copyStatic();
  await injectPanelHtml();
  startTailwindWatch();
  await startEsbuildWatch();
  await watchStatic();
  console.log('[dev] ready — load dist/ in Chrome');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
