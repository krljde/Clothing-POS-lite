/* Build pipeline for Clothing-POS-lite.
   Produces minified, bundled assets in dist/ that the deployed HTML references.
   Source files (js/*.js) stay CDN-importable so they still run raw in the
   browser for quick dev — the firebaseCdnPlugin below rewrites the gstatic
   Firebase ESM URLs to the npm `firebase` package only at bundle time, so the
   SDK is inlined and the 3-request CDN module waterfall disappears.

   Usage:  node build.mjs        (one-off build)
           node build.mjs --watch (rebuild on change)
*/
import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

/* Map gstatic Firebase ESM URLs -> npm `firebase/<sub>` so esbuild inlines the
   SDK. Source keeps the CDN URLs (works un-bundled in dev); only the bundle
   resolves them to node_modules. */
const firebaseCdnPlugin = {
  name: 'firebase-cdn-to-npm',
  setup(build) {
    build.onResolve({ filter: /^https:\/\/www\.gstatic\.com\/firebasejs\// }, async (args) => {
      const m = args.path.match(/firebase-([a-z]+)\.js$/);
      if (!m) return null;
      return build.resolve(`firebase/${m[1]}`, { kind: args.kind, resolveDir: args.resolveDir });
    });
  }
};

const shared = {
  bundle: true,
  minify: true,
  legalComments: 'none',
  target: ['es2020'],
  logLevel: 'info',
};

/** @type {esbuild.BuildOptions[]} */
const configs = [
  // app.js — classic script, no imports. Keep isolated as an iife so ESM
  // strict-mode never touches the 1776-line classic file; just minify + wrap.
  {
    ...shared,
    entryPoints: ['js/app.js'],
    outfile: 'dist/app.min.js',
    format: 'iife',
  },
  // Owner module trio (sync + admin + fulfillment), Firebase + util inlined once.
  {
    ...shared,
    entryPoints: ['js/entry-owner.js'],
    outfile: 'dist/owner.min.js',
    format: 'esm',
    plugins: [firebaseCdnPlugin],
  },
  // Booker bundle (sync + fulfillment) — single request, no CDN hops.
  {
    ...shared,
    entryPoints: ['js/entry-booker.js'],
    outfile: 'dist/booker.min.js',
    format: 'esm',
    plugins: [firebaseCdnPlugin],
  },
  // Stylesheet — minify only (no bundle: no @import left after the font move,
  // and we don't want esbuild touching url() refs).
  {
    ...shared,
    bundle: false,
    entryPoints: ['css/style.css'],
    outfile: 'dist/style.min.css',
  },
];

if (watch) {
  const contexts = await Promise.all(configs.map((c) => esbuild.context(c)));
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  console.log('watching for changes…');
} else {
  await Promise.all(configs.map((c) => esbuild.build(c)));
  console.log('build complete → dist/');
}
