import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const assets = fileURLToPath(new URL("../assets/", import.meta.url));
const ffmpeg = process.env.FFMPEG_BIN || "ffmpeg";
const fps = 24;
const input = assets + "forum-hero.webm";
// Count decoded frames after normalizing the time base, rather than trusting
// container duration (which may include an audio stream or nonzero start time).
const hashes = execFileSync(ffmpeg, [
  "-nostdin", "-v", "error", "-i", input, "-map", "0:v:0", "-an",
  "-vf", `fps=${fps}`, "-f", "framemd5", "-",
], { encoding: "utf8" });
const frames = hashes.split("\n").filter((line) => /^0,/.test(line)).length;
if (frames < 3) {
  throw new Error("The source video needs at least three decoded frames.");
}

// Skip both reverse endpoints: each turnaround has exactly one endpoint frame.
const filter = `[0:v:0]fps=${fps},setpts=N/(${fps}*TB),split[f][r];` +
  `[r]reverse,trim=start_frame=1:end_frame=${frames - 1},setpts=N/(${fps}*TB)[back];` +
  "[f][back]concat=n=2:v=1:a=0,format=yuv420p,split[webm][mp4]";
execFileSync(ffmpeg, [
  "-nostdin", "-v", "error", "-y", "-i", input, "-filter_complex", filter,
  "-map", "[webm]", "-an", "-r", String(fps), "-c:v", "libvpx-vp9",
  "-b:v", "0", "-crf", "32", "-cpu-used", "4", "-row-mt", "1",
  "-threads", "2", "-map_metadata", "-1", assets + "forum-hero-loop.webm",
  "-map", "[mp4]", "-an", "-r", String(fps), "-c:v", "libx264",
  "-profile:v", "main", "-level:v", "3.1", "-preset", "medium", "-crf", "24",
  "-movflags", "+faststart", "-map_metadata", "-1", assets + "forum-hero-loop.mp4",
], { stdio: "inherit" });
console.log(`Built silent forward/reverse loops: ${frames * 2 - 2} frames at ${fps} fps.`);
