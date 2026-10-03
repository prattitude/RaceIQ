import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db } from "../../../server/db";
import { sessions } from "../../../server/db/schema";
import { deleteSession } from "../../../server/db/session-queries";
import { initServerGameAdapters } from "../../../server/games/init";
import { initGameAdapters } from "../../../shared/games/init";
import { detectGameIdFromFilename, importSessionBin } from "../../../server/session-capture/import-capture";
import { readRecordedTelemetry } from "../../../server/session-capture/replay-packets";
import { getAcCarName } from "../../../shared/racing/cars/ac";
import { developmentReleaseFeatures } from "../../../scripts/release/development-release-features";

const AC_FIXTURE = "test/artifacts/sessions/ac-2026-10-03T05-24-31-321Z.bin.gz";
const sessionIds: number[] = [];

beforeAll(() => {
  initGameAdapters();
  initServerGameAdapters(developmentReleaseFeatures);
});
afterEach(async () => {
  for (const id of sessionIds.splice(0)) await deleteSession(id);
});

describe("AC capture import", () => {
  test("filename prefix resolves to ac without shadowing ac-evo or acc", () => {
    expect(detectGameIdFromFilename("ac-2026-10-03T05-24-31-321Z.bin.gz")).toBe("ac");
    expect(detectGameIdFromFilename("ac-evo-2026-04-21.bin.gz")).toBe("ac-evo");
    expect(detectGameIdFromFilename("acc-2026-04-23.bin.gz")).toBe("acc");
  });

  test("replays the AC dump with car folder and track name", () => {
    const recorded = readRecordedTelemetry("ac", AC_FIXTURE);
    expect(recorded.packets.length).toBeGreaterThan(1000);
    expect(recorded.carModel).toBe("ktm_xbow_r");
    expect(recorded.trackName).toBe("Brands Hatch - Indy");
  });

  test("imports the AC dump into a discovered-car session with the cut lap invalid", async () => {
    const imported = await importSessionBin(readFileSync(AC_FIXTURE), "ac", { requireLaps: true, notifyDriverProfile: false });
    for (const id of new Set(imported.laps.map((lap) => lap.sessionId))) sessionIds.push(id);

    const timed = imported.laps.filter((lap) => lap.lapTime > 50 && lap.lapTime < 60);
    expect(timed.map((lap) => [lap.lapTime, lap.isValid])).toEqual([
      [56.057, true],
      [55.285, true],
      [54.694, true],
      [53.879, true],
      [53.967, false],
    ]);

    const row = await db.select().from(sessions).where(eq(sessions.id, imported.laps[0]!.sessionId)).get();
    expect(row).toMatchObject({ gameId: "ac", trackOrdinal: 2 });
    expect(row!.carOrdinal).toBeGreaterThanOrEqual(100000);
    expect(getAcCarName(row!.carOrdinal)).toBe("KTM Xbow R");
  }, 60_000);
});
