// Static preview generator: renders the REAL public marketing content
// below the locked hero — Students, About, Final CTA + footer — exactly as
// the live landing page composes them, and splices the result into the
// hero template. The interactive academic workspace lives behind /app and
// is intentionally absent here. Run via:
//   node preview/generate.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const templatePath = join(root, 'preview/orbit-landing.template.html');
const outPath = join(root, 'preview/orbit-landing.html');

// Bare imports resolved by vite's SSR runner; React global injected because
// the runner classic-compiles JSX (same approach as the smoke test).
globalThis.React = (await import('react')).default ?? (await import('react'));

const vite = await createServer({
  root,
  configFile: join(root, 'vite.config.js'),
  logLevel: 'error',
  server: { middlewareMode: true },
  appType: 'custom',
});

try {
  const { StudentsSection, FinalCTA, LandingFooter } = await vite.ssrLoadModule('/src/components/landing/LandingSections2.jsx');
  const { AboutSection } = await vite.ssrLoadModule('/src/components/landing/Landing.jsx');
  const { createElement: h } = await import('react');
  const { renderToString } = await import('react-dom/server');

  const marketing = h('div', null,
    h('div', { id: 'ws-universe' }, h(StudentsSection)),
    h(AboutSection),
    h(FinalCTA, { onGetStarted: () => {} }),
  );

  const marketingHtml = renderToString(marketing);
  const footerHtml = renderToString(h(LandingFooter, { onNavigate: () => {} }));

  // ---- splice into the template ----
  let tpl = readFileSync(templatePath, 'utf8');
  const mainStart = tpl.indexOf('<main>');
  const mainEnd = tpl.indexOf('</main>') + '</main>'.length;
  if (mainStart === -1 || mainEnd < '</main>'.length) throw new Error('template <main> not found');
  const footStart = tpl.indexOf('<footer');
  const footEnd = tpl.indexOf('</footer>') + '</footer>'.length;
  const head = tpl.slice(0, mainStart);
  const tail = tpl.slice(footEnd);
  const footer = footerHtml
    .replace('<footer', '<footer') // keep as-is
    .replace(/onNavigate/g, ''); // safety, should not match
  let html = head
    + '<main class="ws-wrap">\n' + marketingHtml + '\n'
    + footer + '\n</main>\n'
    + tail;

  // ---- splice both stylesheets: landing.css (hero, LOCKED look) and
  // website.css (ws-* classes used by the About section) ----
  const landingCss = readFileSync(join(root, 'src/styles/landing.css'), 'utf8');
  const wsCss = readFileSync(join(root, 'src/styles/website.css'), 'utf8');
  if (html.includes('<!--CSS-->')) {
    html = html.replace('<!--CSS-->', `<style>\n${landingCss}\n</style>`);
  } else {
    throw new Error('template <!--CSS--> placeholder not found');
  }
  html = html.replace('</head>', `<style>\n${wsCss}\n</style>\n</head>`);

  // ---- .ws-reveal observer (sections stay hidden until observed) ----
  html = html.replace(
    "els.forEach(function (el) { io.observe(el); });",
    "els.forEach(function (el) { io.observe(el); });\n" +
    "  var wsEls = document.querySelectorAll('.ws-reveal');\n" +
    "  wsEls.forEach(function (el) { io.observe(el); });\n" +
    "  var mo = ('MutationObserver' in window) ? new MutationObserver(function(){\n" +
    "    document.querySelectorAll('.ws-reveal:not(.in)').forEach(function (el) { io.observe(el); });\n" +
    "  }) : null;\n" +
    "  if (mo) mo.observe(document.body, { childList: true, subtree: true });\n" +
    "  // Fallback: some embedded/offscreen webviews never deliver IO\n" +
    "  // notifications (no compositor). Reveal by rect on scroll instead —\n" +
    "  // idempotent where IO already works.\n" +
    "  function revealByRect() {\n" +
    "    var vh = window.innerHeight || document.documentElement.clientHeight;\n" +
    "    document.querySelectorAll('.ob-reveal:not(.in), .ws-reveal:not(.in)').forEach(function (el) {\n" +
    "      var r = el.getBoundingClientRect();\n" +
    "      if (r.top < vh - 40 && r.bottom > 0) el.classList.add('in');\n" +
    "    });\n" +
    "  }\n" +
    "  window.addEventListener('scroll', revealByRect, { passive: true });\n" +
    "  window.addEventListener('resize', revealByRect);\n" +
    "  revealByRect();",
  );

  writeFileSync(outPath, html);
  console.log(`preview/orbit-landing.html regenerated (${(html.length / 1024).toFixed(0)} kB)`);
} finally {
  await vite.close();
}
