import { describe, expect, it } from 'vitest';

import stylesheet from './styles.css?inline';

function declarationsFor(selector: string): Map<string, string[]> {
  const declarations = new Map<string, string[]>();

  for (const match of stylesheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = match[1]?.split(',').map((value) => value.trim()) ?? [];
    if (!selectors.includes(selector)) continue;

    for (const declaration of match[2]?.split(';') ?? []) {
      const separator = declaration.indexOf(':');
      if (separator < 0) continue;

      const property = declaration.slice(0, separator).trim();
      const value = declaration.slice(separator + 1).trim();
      if (property === '' || value === '') continue;

      declarations.set(property, [
        ...(declarations.get(property) ?? []),
        value,
      ]);
    }
  }

  return declarations;
}

describe('viewport sizing contract', () => {
  it.each(['html', 'body', '#game'])(
    'keeps %s fixed to the current viewport so the canvas cannot grow its parent',
    (selector) => {
      const declarations = declarationsFor(selector);

      expect(declarations.get('height')).toEqual(['100vh', '100dvh']);
      expect(declarations.get('min-height')).toEqual(['0']);
    },
  );
});
