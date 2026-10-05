// Integration smoke test: the landing page (locked hero + marketing
// sections) must render server-side without throwing, and every marketing
// anchor must be present. Catches broken imports, missing exports and
// drift that pure unit tests cannot see. The interactive academic workspace
// lives behind /app — this page is public marketing only.
//
// Note on JSX: vitest's SSR module runner classic-compiles JSX to
// React.createElement without importing React, so we provide React as a
// global before rendering. No app files or vite config are affected.
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

globalThis.React = React;

const { default: Landing } = await import('../components/landing/Landing.jsx');

const HTML = renderToString(
  createElement(Landing, { onGetStarted: () => {}, onSignIn: () => {} }),
);

const ANCHORS = [
  'ob-top', // hero
  'ws-universe', // marketing features anchor (Students section)
  'ob-students',
  'ob-about',
];

describe('landing page integration (marketing-only)', () => {
  it('renders the locked hero copy untouched', () => {
    expect(HTML).toContain('Your college life,');
    expect(HTML).toContain('in one place');
    expect(HTML).toContain('ob-h1-gradient');
  });

  it('renders the locked hero scene elements', () => {
    expect(HTML).toContain('ob-hero');
    expect(HTML).toContain('ob-scene');
    expect(HTML).toContain('ob-planet-glow');
    expect(HTML).toContain('ob-hero-cards-desktop');
    expect(HTML).toContain('ob-hero-cards-mobile');
    // floating feature cards intact
    expect(HTML).toContain('Class Schedule');
    expect(HTML).toContain('Track Progress');
    expect(HTML).toContain('Set Goals');
  });

  it('renders the marketing sections that remain below the hero', () => {
    expect(HTML).toContain('Built for how college actually works'); // For Students
    expect(HTML).toContain('A personal academic operating system.'); // About
    expect(HTML).toContain('Enter your academic universe'); // Final CTA
  });

  it('exposes every marketing anchor for the nav', () => {
    for (const id of ANCHORS) {
      expect(HTML, `missing anchor: ${id}`).toContain(`id="${id}"`);
    }
  });

  it('no longer exposes interactive student-data sections publicly', () => {
    // These belonged to the localStorage workspace sections, now moved
    // behind authentication.
    expect(HTML).not.toContain('ws-today');
    expect(HTML).not.toContain('Today Command Center');
    expect(HTML).not.toContain('orbit.website.db.v2');
    expect(HTML).not.toContain('Freezing of CIA-1 Marks'); // seeded calendar data
  });

  it('keeps nav links and the sign-in/get-started buttons', () => {
    expect(HTML).toContain('Sign in');
    expect(HTML).toContain('Get started');
    expect(HTML).toContain('Features');
    expect(HTML).toContain('For Students');
    expect(HTML).toContain('About');
  });
});
