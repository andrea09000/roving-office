import assert from 'node:assert/strict';
import { test } from 'node:test';
import { all, stubPage } from './lib/dom.js';

const { byId, document, window } = stubPage();
byId.set('scene-panel', document.createElement('div'));
window.devicePixelRatio = 1;
document.documentElement = document.createElement('html');
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });

const createElement = document.createElement.bind(document);
document.createElement = (tag) => {
  const el = createElement(tag);
  if (tag === 'canvas') {
    const context = new Proxy({}, {
      get: (_, property) => (property === 'measureText'
        ? () => ({ width: 8 })
        : () => {}),
      set: () => true,
    });
    el.getContext = () => context;
  }
  return el;
};

const { createScenePanel } = await import('../src/ui/scene-panel.js');

test('a locked scene panel shows Rome and disables appearance controls', () => {
  const panel = createScenePanel({
    lockAppearance: true,
    onSeason() {},
    onBuilding() {},
    onPlace() {},
  });
  panel.setState({
    season: 'autumn',
    building: 'canopy',
    place: { lat: 41.9028, lon: 12.4964, declination: -0.5, day: '08:00–16:00' },
  });

  const elements = all(byId.get('scene-panel'));
  const season = elements.find((el) => el.dataset?.key === 'autumn');
  const building = elements.find((el) => el.dataset?.key === 'canopy');
  const picker = elements.find((el) => el.tagName === 'SELECT');
  const map = elements.find((el) => el.className === 'dev-map');

  assert.equal(season.disabled, true);
  assert.equal(season.classList.contains('active'), true);
  assert.equal(building.disabled, true);
  assert.equal(building.classList.contains('active'), true);
  assert.equal(picker.disabled, true);
  assert.equal(picker.value, 'Rome');
  assert.equal(map.inert, true);
  assert.equal(map.tabIndex, -1);
  assert.equal(map.style.pointerEvents, 'none');
});
