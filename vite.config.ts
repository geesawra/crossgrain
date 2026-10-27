import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { minify } from 'html-minifier-terser';

export default defineConfig({
  server: {
    allowedHosts: ['thumby', 'thumby.otter-ray.ts.net'],
  },
  preview: {
    allowedHosts: ['thumby', 'thumby.otter-ray.ts.net'],
  },
  plugins: [
    react(),
    {
      name: 'minify-production-html',
      apply: 'build',
      transformIndexHtml: {
        order: 'post',
        handler: html => minify(html, {
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
  },
});
