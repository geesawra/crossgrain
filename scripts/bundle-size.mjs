import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync, brotliCompressSync } from 'node:zlib';

const manifestPath = 'dist/.vite/manifest.json';
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
// Vite's build manifest is generated after HTML processing. Minify it too.
writeFileSync(manifestPath, JSON.stringify(manifest));

function dependencies(key, files = new Set()) {
  const chunk = manifest[key];
  if (!chunk || files.has(chunk.file)) return files;
  if (chunk.file.endsWith('.js')) files.add(chunk.file);
  for (const dependency of chunk.imports || []) dependencies(dependency, files);
  return files;
}

function measure(files) {
  return [...files].reduce(
    (sum, file) => {
      const data = readFileSync(`dist/${file}`);
      return {
        raw: sum.raw + data.length,
        gzip: sum.gzip + gzipSync(data).length,
        brotli: sum.brotli + brotliCompressSync(data).length,
      };
    },
    { raw: 0, gzip: 0, brotli: 0 },
  );
}

const home = measure(dependencies('index.html'));
const gallery = measure(dependencies('src/elements/gallery.ts', dependencies('index.html')));
const complete = measure(
  new Set(
    Object.values(manifest)
      .map((chunk) => chunk.file)
      .filter((file) => file.endsWith('.js')),
  ),
);
const row = (value) => ({
  'JS (KB)': (value.raw / 1000).toFixed(2),
  'gzip (KB)': (value.gzip / 1000).toFixed(2),
  'Brotli (KB)': (value.brotli / 1000).toFixed(2),
});
console.table({ Home: row(home), Gallery: row(gallery), 'Including lightbox': row(complete) });

// Keep room for the optional profile and progressive loading without unbounded growth.
if (gallery.gzip > 18_500 || complete.gzip > 21_000)
  throw new Error('The client JavaScript exceeded its size budget.');
