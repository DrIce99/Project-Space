// Conversione: parametri astronomici → scala di gioco → simulazione.
// 1 unità di gioco ≈ 50 km fittizi. G è normalizzato a 1: le masse derivano
// dalla gravità superficiale voluta (m = g·r²/G), quindi orbite, velocità di
// fuga e periodi restano fisicamente coerenti tra loro.
export const SCALE = {
  KM_PER_UNIT: 50,
  G: 1,
  STAR_MASS_MIN: 3e5,
  STAR_MASS_MAX: 6e5,
};

export const SHIP = {
  thrust: 18, boost: 2.6, strafe: 12,
  fuelMax: 100, burn: 0.85, hullMax: 100, o2Max: 100,
  dragK: 0.02, brakeK: 1.6,
  landMaxSpeed: 6, landAlt: 2.4, legHeight: 1.7,
  mouseSens: 0.0021,
};

export const EVA = { walk: 6.5, sprint: 12.5, jumpBase: 5.6, height: 1.75 };

export const TYPE_LABEL = {
  star: 'STELLA', terran: 'PIANETA TERRANO', ocean: 'PIANETA OCEANICO',
  desert: 'MONDO DESERTICO', volcanic: 'MONDO VULCANICO', rocky: 'CORPO ROCCIOSO',
  metallic: 'CORPO METALLICO', ice: 'MONDO GHIACCIATO', gas: 'GIGANTE GASSOSO',
  dwarf: 'PIANETA NANO', moon: 'SATELLITE',
};