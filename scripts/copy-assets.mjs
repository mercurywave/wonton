import { existsSync, mkdirSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const resourcesDir = join(rootDir, 'resources');

if (!existsSync(resourcesDir)) {
  mkdirSync(resourcesDir, { recursive: true });
}

// Copy CSS from src to resources root
const srcCssDir = join(rootDir, 'src', 'css');
if (existsSync(srcCssDir)) {
  const src = join(srcCssDir, 'app.css');
  const dest = join(resourcesDir, 'app.css');
  if (existsSync(src)) {
    copyFileSync(src, dest);
    console.log('Copied app.css to resources root');
  }
}

// Copy neutralino client if it exists at root level
const neutralinoSrc = join(rootDir, 'neutralino.js');
const neutralinoDest = join(resourcesDir, 'js', 'neutralino.js');
if (existsSync(neutralinoSrc)) {
  copyFileSync(neutralinoSrc, neutralinoDest);
  console.log('Copied neutralino.js client');
}

console.log('Build complete.');
