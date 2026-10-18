import { expect, test } from 'vitest';

test('ID-04/05: independent offline reference builder is available', async () => {
  const { buildInstalledReference } = await import('../scripts/build-installed-reference.mjs');
  expect(typeof buildInstalledReference).toBe('function');
});
