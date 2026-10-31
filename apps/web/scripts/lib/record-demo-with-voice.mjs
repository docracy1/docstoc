/**
 * Record an HTML demo (Playwright) + neural TTS (edge-tts) + ffmpeg mux → MP4.
 * Usage: node apps/web/scripts/lib/record-demo-with-voice.mjs <demo.html> <out.mp4> <durationMs>
 * Narration segments are read from window.__DEMO_NARRATION__ in the HTML file.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../../..");
const VIEWPORT = { width: 1280, height: 720 };
const EDGE_VOICE = process.env.DEMO_TTS_VOICE || "en-US-JennyNeural";
const EDGE_RATE = process.env.DEMO_TTS_RATE || "+0%";

function speakWav(outPath, text) {
  // Offline fallback on macOS for when the edge-tts service refuses the connection.
  if (process.env.DEMO_TTS_ENGINE === "say") {
    const aiff = outPath.replace(/\.wav$/, ".aiff");
    run("say", ["-v", process.env.DEMO_TTS_SAY_VOICE || "Samantha", "-o", aiff, text]);
    run("ffmpeg", ["-y", "-i", aiff, "-ar", "44100", "-ac", "1", outPath]);
    fs.unlinkSync(aiff);
    return;
  }
  const mp3 = outPath.replace(/\.wav$/, ".mp3");
  run("python3", [
    "-m",
    "edge_tts",
    "--voice",
    EDGE_VOICE,
    `--rate=${EDGE_RATE}`,
    "--text",
    text,
    "--write-media",
    mp3,
  ]);
  run("ffmpeg", ["-y", "-i", mp3, "-ar", "44100", "-ac", "1", outPath]);
  fs.unlinkSync(mp3);
}

async function loadPlaywright() {
  const candidates = [
    path.join(root, "node_modules/playwright/index.js"),
    path.join(root, "apps/web/node_modules/playwright/index.js"),
  ];
  for (const entry of candidates) {
    if (!fs.existsSync(entry)) continue;
    return createRequire(entry)("playwright");
  }
  throw new Error("playwright not found — npm install playwright");
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "pipe", encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed: ${r.stderr || r.stdout}`);
  }
  return r.stdout;
}

function silenceWav(outPath, durationSec) {
  run("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=channel_layout=mono:sample_rate=44100",
    "-t",
    String(durationSec),
    outPath,
  ]);
}

function sayWav(outPath, text) {
  speakWav(outPath, text);
}

function wavDurationSec(wavPath) {
  const out = run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    wavPath,
  ]);
  return parseFloat(out.trim()) || 0;
}

async function buildNarrationTrack(segments, outWav, tmpDir, totalMs) {
  fs.mkdirSync(tmpDir, { recursive: true });
  const listPath = path.join(tmpDir, "concat.txt");
  const lines = [];
  let idx = 0;
  let cursorMs = 0;

  const normalized = segments.every((s) => s.atMs != null)
    ? [...segments].sort((a, b) => a.atMs - b.atMs)
    : segments;

  for (const seg of normalized) {
    const startMs = seg.atMs != null ? seg.atMs : cursorMs + (seg.pauseMs || 0);
    const gapMs = Math.max(0, startMs - cursorMs);
    if (gapMs > 0) {
      const p = path.join(tmpDir, `pause-${idx}.wav`);
      silenceWav(p, gapMs / 1000);
      lines.push(`file '${p}'`);
      cursorMs += gapMs;
      idx++;
    }
    if (seg.text?.trim()) {
      const p = path.join(tmpDir, `say-${idx}.wav`);
      sayWav(p, seg.text.trim());
      const durMs = wavDurationSec(p) * 1000;
      lines.push(`file '${p}'`);
      cursorMs += durMs;
      idx++;
    } else if (seg.pauseMs && seg.atMs == null) {
      cursorMs += seg.pauseMs;
    }
  }

  const tailMs = Math.max(0, totalMs - cursorMs);
  if (tailMs > 0) {
    const p = path.join(tmpDir, `pause-${idx}.wav`);
    silenceWav(p, tailMs / 1000);
    lines.push(`file '${p}'`);
  }

  fs.writeFileSync(listPath, lines.join("\n"));
  run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outWav]);
}

async function recordVideo(demoPath, outWebm, durationMs) {
  const { chromium } = await loadPlaywright();
  const outDir = path.dirname(outWebm);
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir: outDir, size: VIEWPORT },
  });
  const page = await context.newPage();
  await page.goto(pathToFileURL(demoPath).href);
  await page.waitForTimeout(durationMs);
  const video = page.video();
  await context.close();
  await browser.close();
  if (!video) throw new Error("No video recorded");
  const tempPath = await video.path();
  if (fs.existsSync(outWebm)) fs.unlinkSync(outWebm);
  fs.renameSync(tempPath, outWebm);
}

function videoDurationSec(videoPath) {
  const out = run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    videoPath,
  ]);
  return parseFloat(out.trim()) || 0;
}

function padAudioToDuration(inWav, outWav, durationSec) {
  run("ffmpeg", [
    "-y",
    "-i",
    inWav,
    "-af",
    `apad=whole_dur=${durationSec}`,
    outWav,
  ]);
}

function muxVideoAudio(videoPath, audioPath, outMp4) {
  run("ffmpeg", [
    "-y",
    "-i",
    videoPath,
    "-i",
    audioPath,
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "22",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    outMp4,
  ]);
}

export async function recordDemoWithVoice({ demoPath, outMp4, durationMs, segments }) {
  const tmpDir = path.join(path.dirname(outMp4), `.tmp-${path.basename(outMp4, ".mp4")}`);
  const webm = path.join(tmpDir, "video.webm");
  const wav = path.join(tmpDir, "narration.wav");
  fs.mkdirSync(tmpDir, { recursive: true });

  console.log(`Recording video (${durationMs}ms)…`);
  await recordVideo(demoPath, webm, durationMs);

  console.log(`Building narration (${segments.length} segments)…`);
  await buildNarrationTrack(segments, wav, path.join(tmpDir, "audio-parts"), durationMs);

  console.log("Muxing MP4…");
  muxVideoAudio(webm, wav, outMp4);
  const vidDur = videoDurationSec(outMp4);
  console.log(`✓ ${outMp4} (${vidDur.toFixed(1)}s)`);
  return outMp4;
}

async function main() {
  const demoPath = process.argv[2];
  const outMp4 = process.argv[3];
  const durationMs = Number(process.argv[4]);
  if (!demoPath || !outMp4 || !durationMs) {
    console.error(
      "Usage: node record-demo-with-voice.mjs <demo.html> <out.mp4> <durationMs>"
    );
    process.exit(1);
  }
  const html = fs.readFileSync(demoPath, "utf8");
  const m = html.match(/window\.__DEMO_NARRATION__\s*=\s*(\[[\s\S]*?\]);/);
  if (!m) throw new Error(`No window.__DEMO_NARRATION__ in ${demoPath}`);
  const segments = JSON.parse(m[1]);
  await recordDemoWithVoice({
    demoPath: path.resolve(demoPath),
    outMp4: path.resolve(outMp4),
    durationMs,
    segments,
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
