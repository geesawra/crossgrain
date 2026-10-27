import { defineConfig } from 'vite';
import { minify } from 'html-minifier-terser';
import { readFileSync } from 'node:fs';
import minifyHTML from '@lit-labs/rollup-plugin-minify-html-literals';

const base = (process.env.PAGES_BASE_PATH || '/').replace(/\/?$/, '/');

export default defineConfig({
  base,
  server: {
    allowedHosts: ['thumby', 'thumby.otter-ray.ts.net'],
  },
  preview: {
    allowedHosts: ['thumby', 'thumby.otter-ray.ts.net'],
  },
  plugins: [
    { ...minifyHTML({ include: ['**/src/**/*.ts'], failOnError: true }), apply: 'build' },
    {
      name: 'production-html-and-license',
      apply: 'build',
      async generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'LICENSE',
          source: readFileSync(new URL('./LICENSE', import.meta.url), 'utf8'),
        });
        this.emitFile({
          type: 'asset',
          fileName: '404.html',
          source: await minify(
            `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html{background:#fff;color-scheme:light dark}@media(prefers-color-scheme:dark){html{background:#111}}</style><title>Photoshow</title><script>location.replace(${JSON.stringify(base)}+'?__photoshow_route='+encodeURIComponent(location.pathname+location.search+location.hash))</script></head><body><noscript>Enable JavaScript to open this gallery.</noscript></body></html>`,
            { collapseWhitespace: true, minifyCSS: true, minifyJS: true },
          ),
        });
      },
      transformIndexHtml: {
        order: 'post',
        handler: (html) =>
          minify(html, {
            collapseWhitespace: true,
            removeComments: true,
            removeRedundantAttributes: true,
            removeScriptTypeAttributes: true,
            removeStyleLinkTypeAttributes: true,
            minifyCSS: true,
            minifyJS: true,
          }),
      },
    },
  ],
  build: {
    minify: 'oxc',
    cssMinify: 'lightningcss',
    sourcemap: false,
    target: 'es2022',
    modulePreload: false,
    cssCodeSplit: false,
    manifest: true,
  },
});
