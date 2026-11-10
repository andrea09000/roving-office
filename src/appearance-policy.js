// This deployment pins scenery and location for every scene.
export const FIXED_APPEARANCE = Object.freeze({
  building: 'canopy',
  season: 'autumn',
  lat: 41.9028,
  lon: 12.4964,
});

export function applyAppearancePolicy(look = {}) {
  return { ...look, ...FIXED_APPEARANCE };
}
