import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  formatAcCarModel,
  getAcCarName,
  injectDiscoveredAcCars,
} from "../../../shared/racing/cars/ac";
import {
  getAcSharedTrackName,
  getAcTrackByIdentity,
  getAcTrackByName,
  getAcTrackName,
  getAcTracks,
} from "../../../shared/racing/tracks/catalogs/ac";

describe("AC car names", () => {
  test("formats Kunos and mod folder names", () => {
    expect(formatAcCarModel("ks_porsche_911_gt3_r_2016")).toBe("Porsche 911 GT3 R 2016");
    expect(formatAcCarModel("ktm_xbow_r")).toBe("KTM Xbow R");
    expect(formatAcCarModel("bmw_m3_e30")).toBe("BMW M3 E30");
    expect(formatAcCarModel("")).toBe("");
  });

  test("resolves discovered ordinals and rejects unregistered cars", () => {
    injectDiscoveredAcCars([{ ordinal: 100042, name: "ks_mazda_mx5_cup" }]);
    expect(getAcCarName(100042)).toBe("Mazda MX5 Cup");
    expect(getAcCarName(-1)).toBe("Unknown Car");
    expect(getAcCarName(999999)).toBe("Car #999999");
  });
});

describe("AC track catalog", () => {
  test("every CSV row has a unique positive ordinal and unique folder + layout", () => {
    const rows = readFileSync("shared/games/ac/tracks.csv", "utf-8").split(/\r?\n/).slice(1).filter((line) => line.trim());
    const tracks = [...getAcTracks().values()];
    expect(tracks).toHaveLength(rows.length);
    expect(tracks.every((track) => track.id > 0)).toBe(true);
    const identities = tracks.map((track) => `${track.track}/${track.layout}`);
    expect(new Set(identities).size).toBe(identities.length);
  });

  test("matches folder + layout exactly, case-insensitively", () => {
    const indy = getAcTrackByIdentity("KS_BRANDS_HATCH", "indy");
    expect(indy?.id).toBe(2);
    expect(getAcTrackName(2)).toBe("Brands Hatch - Indy");
    expect(getAcSharedTrackName(2)).toBe("brands-hatch-indy");
    expect(getAcTrackByIdentity("ks_brands_hatch", "no_such_layout")).toBeUndefined();
  });

  test("looks up by display name or folder/layout", () => {
    expect(getAcTrackByName("Brands Hatch - Indy")?.id).toBe(2);
    expect(getAcTrackByName("ks_brands_hatch/indy")?.id).toBe(2);
  });
});
