import { getCaptureMigrationCandidates } from "../db/session-queries";
import { startCommunityTunesSync } from "../tunes/community-sync";
import { countStaleSessions } from "../db/session-queries";
import { countStaleRaceResults } from "../db/session-result-queries";
import { RACE_RESULT_PROCESSOR_ID } from "../race-results/reconcile";
import { CURRENT_LAP_DETECTOR_IDS } from "../lap-detection/current-detector-ids";
import { getAllServerGames } from "../games/registry";
import { wsManager } from "./websocket-manager";
import { startSessionCompressor } from "../session-capture/compressor";
import { startUpdateCheckSchedule } from "./update/check";

export interface StartupJobDependencies {
  startCommunityTunesSync?: () => void;
  startSessionCompressor?: () => void;
  startUpdateCheckSchedule?: () => void;
  countStaleSessions?: typeof countStaleSessions;
  countStaleRaceResults?: typeof countStaleRaceResults;
}

export function startSyncAndStaleSessionJobs(dependencies: StartupJobDependencies = {}): void {
  wsManager.setCaptureMigrationCountProvider(getCaptureMigrationCandidates);
  (dependencies.startCommunityTunesSync ?? startCommunityTunesSync)();

  (dependencies.countStaleSessions ?? countStaleSessions)(
    CURRENT_LAP_DETECTOR_IDS,
    getAllServerGames().map((adapter) => adapter.id),
  ).then((count) => {
    if (count > 0) {
      console.log(`[Server] ${count} session(s) recorded with stale lap detector — will prompt user to reprocess`);
      wsManager.setStaleSessionsNotification({
        type: "stale-lap-detection",
        sessionCount: count,
        currentVersion: CURRENT_LAP_DETECTOR_IDS.join(","),
      });
    }
  }).catch((err) => {
    console.error("[Server] Failed to check stale sessions:", err);
  });
  getCaptureMigrationCandidates().then(({ sessionCount, captureCount }) => {
    if (captureCount > 0) {
      console.log(`[Server] ${captureCount} historical capture(s) can be converted to sparse storage`);
      wsManager.setCaptureMigrationNotification(sessionCount, captureCount);
    }
  }).catch((err) => {
    console.error("[Server] Failed to check historical captures:", err);
  });

  (dependencies.countStaleRaceResults ?? countStaleRaceResults)(RACE_RESULT_PROCESSOR_ID).then((count) => {
    if (count > 0) {
      console.log(`[Server] ${count} session result(s) use an older processor — will prompt user to recalculate`);
      if (process.env.RACEIQ_E2E !== "1") {
        wsManager.setStaleRaceResultsNotification({
          type: "stale-race-results",
          sessionCount: count,
          currentVersion: RACE_RESULT_PROCESSOR_ID,
        });
      }
    }
  }).catch((err) => {
    console.error("[Server] Failed to check stale race results:", err);
  });
}

export function startMaintenanceJobs(): void {
  startSessionCompressor();
  startUpdateCheckSchedule();
}
