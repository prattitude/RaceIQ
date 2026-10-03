/**
 * Record original Assetto Corsa (acs.exe) shared-memory pages to a Kunos
 * `.bin` capture for adapter development.
 *
 * Original AC publishes the same `Local\acpmf_*` mapping names as ACC with a
 * different layout, so this refuses to attach while ACC is running. Pages are
 * copied raw and untruncated up to a fixed cap; no field is interpreted beyond
 * the packet id, status, and identity strings used for progress logging.
 *
 * Waits for acs.exe, records while the session is live or paused, and
 * finalizes the capture when the game exits or on Ctrl+C.
 *
 * Usage: bun scripts/telemetry/ac/capture.ts [--out <dir>]
 */
import { dlopen, FFIType, ptr, type Pointer } from "bun:ffi";
import { exec } from "node:child_process";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { readWString } from "../../../server/games/acc/utils";
import { KunosRecorder } from "../../../server/games/kunos/recorder";
import {
  acquireHighResolutionTimer,
  releaseHighResolutionTimer,
} from "../../../server/games/shared/win-timer-resolution";

const AC_PROCESSES = ["acs.exe", "acs_x86.exe"];
const ACC_PROCESSES = ["acc.exe", "ac2-win64-shipping.exe"];

const PAGES = {
  physics: { name: "Local\\acpmf_physics", cap: 1024 },
  graphics: { name: "Local\\acpmf_graphics", cap: 2048 },
  static: { name: "Local\\acpmf_static", cap: 2048 },
} as const;
type PageKey = keyof typeof PAGES;

const STATUS_OFFSET = 4;
const STATUS_NAMES = ["off", "replay", "live", "pause"];
const STATUS_LIVE = 2;
const STATUS_PAUSE = 3;

const FILE_MAP_READ = 0x0004;
const MBI_SIZE = 48;
const MBI_REGION_SIZE_OFFSET = 24;

const PROCESS_POLL_MS = 2000;
const PAGE_POLL_MS = 1;
const STATIC_POLL_MS = 1000;
const PROGRESS_MS = 5000;

const outArg = process.argv.indexOf("--out");
const outDir = outArg > 0 && process.argv[outArg + 1]
  ? resolve(process.argv[outArg + 1])
  : resolve(homedir(), "RaceIQ-captures", "ac");

const kernel32 = dlopen("kernel32.dll", {
  OpenFileMappingW: { args: [FFIType.u32, FFIType.bool, FFIType.ptr], returns: FFIType.ptr },
  MapViewOfFile: { args: [FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.u64], returns: FFIType.ptr },
  UnmapViewOfFile: { args: [FFIType.ptr], returns: FFIType.bool },
  CloseHandle: { args: [FFIType.ptr], returns: FFIType.bool },
  VirtualQuery: { args: [FFIType.ptr, FFIType.ptr, FFIType.u64], returns: FFIType.u64 },
  RtlCopyMemory: { args: [FFIType.ptr, FFIType.ptr, FFIType.u64], returns: FFIType.void },
});

interface MappedPage {
  handle: Pointer;
  view: Pointer;
  size: number;
}

const recorder = new KunosRecorder();
const mapped: Partial<Record<PageKey, MappedPage>> = {};
const lastPacketId: Partial<Record<"physics" | "graphics", number>> = {};
const written = { physics: 0, graphics: 0, static: 0 };
const packetIdProbe = Buffer.alloc(4);

let connected = false;
let holdsTimer = false;
let stopping = false;
let pageTimer: ReturnType<typeof setInterval> | null = null;
let staticTimer: ReturnType<typeof setInterval> | null = null;
let lastStatus = -1;
let identity = "";
let lastProgressAt = Date.now();
let lastProgressCounts = { ...written };

function runningProcesses(): Promise<Set<string>> {
  return new Promise((resolveNames) => {
    exec("tasklist /FO CSV /NH", { windowsHide: true }, (error, stdout) => {
      if (error) return resolveNames(new Set());
      const names = new Set<string>();
      for (const line of stdout.split(/\r?\n/)) {
        const name = line.split(",")[0]?.replace(/"/g, "").trim().toLowerCase();
        if (name) names.add(name);
      }
      resolveNames(names);
    });
  });
}

function regionSize(view: Pointer): number {
  const info = Buffer.alloc(MBI_SIZE);
  const bytes = Number(kernel32.symbols.VirtualQuery(view, ptr(info), MBI_SIZE));
  if (bytes < MBI_REGION_SIZE_OFFSET + 8) return 0;
  return Number(info.readBigUInt64LE(MBI_REGION_SIZE_OFFSET));
}

function openPage(key: PageKey): MappedPage | null {
  const page = PAGES[key];
  const handle = kernel32.symbols.OpenFileMappingW(FILE_MAP_READ, false, ptr(Buffer.from(`${page.name}\0`, "utf16le")));
  if (!handle) return null;
  const view = kernel32.symbols.MapViewOfFile(handle, FILE_MAP_READ, 0, 0, 0);
  if (!view) {
    kernel32.symbols.CloseHandle(handle);
    return null;
  }
  const region = regionSize(view);
  const size = Math.min(region, page.cap);
  if (size <= 0) {
    kernel32.symbols.UnmapViewOfFile(view);
    kernel32.symbols.CloseHandle(handle);
    return null;
  }
  console.log(`[AC Capture] Mapped ${page.name}: region ${region} bytes, capturing ${size}`);
  return { handle, view, size };
}

function readPage(page: MappedPage): Buffer {
  const dest = Buffer.alloc(page.size);
  kernel32.symbols.RtlCopyMemory(ptr(dest), page.view, page.size);
  return dest;
}

function readPacketId(page: MappedPage): number {
  kernel32.symbols.RtlCopyMemory(ptr(packetIdProbe), page.view, 4);
  return packetIdProbe.readInt32LE(0);
}

function closePages(): void {
  for (const key of Object.keys(mapped) as PageKey[]) {
    const page = mapped[key];
    if (!page) continue;
    kernel32.symbols.UnmapViewOfFile(page.view);
    kernel32.symbols.CloseHandle(page.handle);
    delete mapped[key];
  }
}

function describeStatic(buf: Buffer): string {
  const smVersion = readWString(buf, 0, 30);
  const acVersion = readWString(buf, 30, 30);
  const car = readWString(buf, 68, 66);
  const track = readWString(buf, 134, 66);
  const layout = buf.length >= 590 ? readWString(buf, 524, 66) : "";
  if (!car && !track) return "";
  return `car=${car || "?"} track=${track || "?"}${layout ? `/${layout}` : ""} sm=${smVersion || "?"} ac=${acVersion || "?"}`;
}

function pollStatic(): void {
  const page = mapped.static;
  if (!page) return;
  const buf = readPage(page);
  const before = recorder.frameCount;
  recorder.writeStatic(buf);
  if (recorder.frameCount !== before) {
    written.static++;
    const next = describeStatic(buf);
    if (next && next !== identity) {
      identity = next;
      console.log(`[AC Capture] Static page: ${identity}`);
    }
  }
}

function pollPages(): void {
  const graphics = mapped.graphics;
  const physics = mapped.physics;
  if (!graphics || !physics) return;

  const graphicsId = readPacketId(graphics);
  let graphicsBuf: Buffer | null = null;
  if (graphicsId !== lastPacketId.graphics) {
    graphicsBuf = readPage(graphics);
    lastPacketId.graphics = graphicsId;
    const status = graphicsBuf.readInt32LE(STATUS_OFFSET);
    if (status !== lastStatus) {
      console.log(`[AC Capture] Status: ${STATUS_NAMES[status] ?? status}`);
      lastStatus = status;
    }
  }

  const recording = lastStatus === STATUS_LIVE || lastStatus === STATUS_PAUSE;
  if (graphicsBuf && recording) {
    recorder.writeGraphics(graphicsBuf);
    written.graphics++;
  }

  const physicsId = readPacketId(physics);
  if (physicsId !== lastPacketId.physics) {
    lastPacketId.physics = physicsId;
    if (recording) {
      recorder.writePhysics(readPage(physics));
      written.physics++;
    }
  }

  const now = Date.now();
  if (now - lastProgressAt >= PROGRESS_MS) {
    const seconds = (now - lastProgressAt) / 1000;
    const physicsHz = ((written.physics - lastProgressCounts.physics) / seconds).toFixed(0);
    const graphicsHz = ((written.graphics - lastProgressCounts.graphics) / seconds).toFixed(0);
    console.log(
      `[AC Capture] ${STATUS_NAMES[lastStatus] ?? lastStatus} · physics ${physicsHz} Hz · graphics ${graphicsHz} Hz · ` +
      `frames ${recorder.frameCount}${identity ? ` · ${identity}` : ""}`,
    );
    lastProgressAt = now;
    lastProgressCounts = { ...written };
  }
}

function connect(): boolean {
  const physics = openPage("physics");
  const graphics = openPage("graphics");
  const staticPage = openPage("static");
  if (!physics || !graphics || !staticPage) {
    for (const page of [physics, graphics, staticPage]) {
      if (!page) continue;
      kernel32.symbols.UnmapViewOfFile(page.view);
      kernel32.symbols.CloseHandle(page.handle);
    }
    return false;
  }
  mapped.physics = physics;
  mapped.graphics = graphics;
  mapped.static = staticPage;

  const path = recorder.start(outDir, "ac");
  console.log(`[AC Capture] Recording to ${path}`);
  if (acquireHighResolutionTimer() !== null) holdsTimer = true;
  pollStatic();
  pageTimer = setInterval(pollPages, PAGE_POLL_MS);
  staticTimer = setInterval(pollStatic, STATIC_POLL_MS);
  connected = true;
  return true;
}

async function finish(reason: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.log(`[AC Capture] Stopping: ${reason}`);
  if (pageTimer) clearInterval(pageTimer);
  if (staticTimer) clearInterval(staticTimer);
  if (holdsTimer) releaseHighResolutionTimer();
  await recorder.stop();
  closePages();
  console.log(
    `[AC Capture] Done. physics=${written.physics} graphics=${written.graphics} static=${written.static}` +
    `${recorder.path ? ` file=${recorder.path}` : ""}`,
  );
  process.exit(0);
}

async function superviseProcess(): Promise<void> {
  if (stopping) return;
  const names = await runningProcesses();
  const acRunning = AC_PROCESSES.some((name) => names.has(name));
  const accRunning = ACC_PROCESSES.some((name) => names.has(name));

  if (connected) {
    if (!acRunning) await finish("Assetto Corsa exited");
    return;
  }
  if (accRunning) {
    console.log("[AC Capture] ACC is running and owns the acpmf_* mappings; waiting for it to close");
    return;
  }
  if (acRunning && !connect()) {
    console.log("[AC Capture] acs.exe is running but shared memory is not ready yet; retrying");
  }
}

if (process.platform !== "win32") {
  console.error("[AC Capture] Assetto Corsa shared memory is only available on Windows");
  process.exit(1);
}

process.on("SIGINT", () => void finish("Ctrl+C"));
process.on("SIGTERM", () => void finish("terminated"));

console.log(`[AC Capture] Waiting for Assetto Corsa (acs.exe). Captures go to ${outDir}`);
await superviseProcess();
setInterval(() => void superviseProcess(), PROCESS_POLL_MS);
