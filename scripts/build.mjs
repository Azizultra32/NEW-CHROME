import { build } from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { mkdir, readFile, rm, writeFile, cp } from 'fs/promises';
import { exec as execCallback } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execCallback);
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

async function buildPanel() {
  await build({
    entryPoints: [join(root, 'src/sidepanel/index.tsx')],
    bundle: true,
    format: 'esm',
    outfile: join(distDir, 'assets/sidepanel.js'),
    sourcemap: true,
    minify: true,
    target: ['chrome120'],
    define: {
      'process.env.NODE_ENV': '"production"',
      '__ASSIST_CONFIG__': JSON.stringify({
        API_BASE: 'http://localhost:8080',
        WS_BASE: 'ws://localhost:8080'
      })
    },
    loader: { '.png': 'file' },
    logLevel: 'info'
  });
}

async function buildTailwind() {
  const input = join(root, 'src/styles/sidepanel.css');
  const output = join(distDir, 'styles/sidepanel.css');
  await exec(`npx tailwindcss -i "${input}" -o "${output}" --minify`, { cwd: root });
}

async function copyStatic() {
  const files = ['manifest.json', 'background.js', 'content.js', 'offscreen.html', 'offscreen.js'];
  await Promise.all(files.map(async (file) => {
    await cp(join(root, file), join(distDir, file));
  }));
  await cp(join(root, 'icons'), join(distDir, 'icons'), { recursive: true });
}

async function injectPanelHtml() {
  const srcPath = join(root, 'sidepanel.html');
  const destPath = join(distDir, 'sidepanel.html');
  let html = await readFile(srcPath, 'utf8');
  const marker = '<!-- NO hardcoded <script>; bundler injects -->';
  const injection = `${marker}\n    <script type="module" src="assets/sidepanel.js"></script>`;
  if (html.includes(marker)) {
    html = html.replace(marker, injection);
  } else {
    html = html.replace('</body>', `    <script type="module" src="assets/sidepanel.js"></script>\n  </body>`);
  }
  await writeFile(destPath, html, 'utf8');
}

async function main() {
  await ensureDist();
  await Promise.all([buildPanel(), buildTailwind(), copyStatic()]);
  await injectPanelHtml();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
