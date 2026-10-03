/**
 * Original Assetto Corsa car identity.
 *
 * AC exposes only the car's content folder name (static.carModel) and ships
 * hundreds of Kunos and mod cars, so there is no bundled roster: every car is
 * registered in discovered_cars on first sight and named from its folder.
 */
const discoveredById = new Map<number, string>();

const UPPERCASE_TOKENS = new Set(["amg", "bmw", "dtm", "gt", "gtr", "gts", "gtb", "ktm", "lm", "lmp", "rs", "rsr", "svr", "vw", "wrc"]);

/** "ks_porsche_911_gt3_r_2016" → "Porsche 911 GT3 R 2016". */
export function formatAcCarModel(model: string): string {
  const tokens = model.trim().replace(/^ks_/i, "").split(/[_\s]+/).filter(Boolean);
  if (tokens.length === 0) return model;
  return tokens
    .map((token) => {
      const lower = token.toLowerCase();
      if (UPPERCASE_TOKENS.has(lower) || lower.length === 1 || (/\d/.test(lower) && lower.length <= 4)) {
        return token.toUpperCase();
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

/** Overlay DB-discovered cars (ordinal → raw folder name). */
export function injectDiscoveredAcCars(cars: { ordinal: number; name: string }[]): void {
  for (const car of cars) discoveredById.set(car.ordinal, car.name);
}

export function getAcCarModel(ordinal: number): string | undefined {
  return discoveredById.get(ordinal);
}

export function getAcCarName(ordinal: number): string {
  if (ordinal < 0) return "Unknown Car";
  const model = discoveredById.get(ordinal);
  return model ? formatAcCarModel(model) : `Car #${ordinal}`;
}
