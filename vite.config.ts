import { defineConfig } from 'vite';
import { minify } from 'html-minifier-terser';
import { readFileSync } from 'node:fs';
import minifyHTML from '@lit-labs/rollup-plugin-minify-html-literals';

const base = (process.env.PAGES_BASE_PATH || '/').replace(/\/?$/, '/');
const siteUrl = new URL(process.env.SITE_URL || `http://localhost:4173${base}`);
siteUrl.pathname = siteUrl.pathname.replace(/\/?$/, '/');
const socialImage = new URL('social-card.png', siteUrl).href;
const socialMetadata = [
  ['og:title', 'crossgrain'],
  ['og:type', 'website'],
  ['og:description', 'A gallery viewer for your grain.social photos.'],
  ['og:image', socialImage],
  ['og:image:type', 'image/png'],
  ['og:image:width', '1200'],
  ['og:image:height', '630'],
  ['og:image:alt', 'crossgrain wordmark and aperture logo on a white background'],
]
  .map(([property, content]) => `<meta property="${property}" content="${content}">`)
  .join('');

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
            `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html{background:#fff;color-scheme:light dark}@media(prefers-color-scheme:dark){html{background:#111}}</style><link rel="icon" type="image/png" href="${base}favicon.png?v=2"><title>crossgrain</title>${socialMetadata}<script>location.replace(${JSON.stringify(base)}+'?__crossgrain_route='+encodeURIComponent(location.pathname+location.search+location.hash))</script></head><body><noscript>Enable JavaScript to open this gallery.</noscript></body></html>`,
            { collapseWhitespace: true, minifyCSS: true, minifyJS: true },
          ),
        });
      },
      transformIndexHtml: {
        order: 'post',
        handler: (html) =>
          minify(html.replace('</head>', `${socialMetadata}</head>`), {
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
