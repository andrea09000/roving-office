import assert from 'node:assert/strict';
import { test } from 'node:test';

import { applyAppearancePolicy, FIXED_APPEARANCE } from '../src/appearance-policy.js';
import { createScene, PROJECTS, resolveTheme } from '../src/projects.js';
import { PLACES } from '../src/ui/place-map.js';

test('the appearance policy wins over stored looks for authored and ordinary scenes', () => {
  const scenes = [
    { ...PROJECTS[0], season: 'winter', building: 'tower', lat: 0, lon: 0 },
    createScene({ season: 'summer', building: 'warehouse' }),
  ];

  for (const project of scenes) {
    const theme = resolveTheme(project, applyAppearancePolicy({
      season: 'winter',
      building: 'tower',
      lat: 0,
      lon: 0,
      bearing: 135,
    }));
    assert.equal(theme.building, 'canopy');
    assert.equal(theme.season, 'autumn');
    assert.equal(theme.lat, 41.9028);
    assert.equal(theme.lon, 12.4964);
    assert.equal(theme.bearing, 135);
  }
});

test('Rome is the named place at the fixed Italian coordinates', () => {
  assert.ok(PLACES.some(({ name, lat, lon }) =>
    name === 'Rome' && lat === FIXED_APPEARANCE.lat && lon === FIXED_APPEARANCE.lon));
});
