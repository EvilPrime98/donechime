import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { EVENTS, type HookEvent } from './settings.js';
import { BUNDLED } from './sounds.js';
import { scaleWav } from './wav.js';

export const CONFIG_PATH = join(homedir(), '.donechime.json');
export const SOUND_DIR = join(homedir(), '.donechime', 'sounds');

/** Flat config: event name -> wav path (or false to mute), plus a shared cooldown. */
export interface Config {
  cooldownMs?: number;
  volume?: number;
  [event: string]: string | number | false | undefined;
}

export const DEFAULT_SOUNDS: Record<HookEvent, string> = {
  Stop: join(SOUND_DIR, 'done.wav'),
  Notification: join(SOUND_DIR, 'attention.wav'),
  StopFailure: join(SOUND_DIR, 'failed.wav'),
};
const DEFAULT_COOLDOWN_MS = 2000;
const DEFAULT_VOLUME = 100;

export function loadConfig(path = CONFIG_PATH): Config {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Config;
  } catch {
    return {};
  }
}

/** Write the bundled sounds that are missing, so the plugin works without `donechime install`. */
export function ensureSounds(dir = SOUND_DIR): void {
  mkdirSync(dir, { recursive: true });
  for (const [name, data] of Object.entries(BUNDLED)) {
    const file = join(dir, `${name}.wav`);
    if (!existsSync(file)) writeFileSync(file, data);
  }
}

/** Resolve the wav to play for `event`, or undefined if muted/unknown. */
export function resolveSound(event: string, config: Config): string | undefined {
  if (!(EVENTS as readonly string[]).includes(event)) return undefined;
  const choice = config[event];
  if (choice === false) return undefined;
  return typeof choice === 'string' ? choice : DEFAULT_SOUNDS[event as HookEvent];
}

/** True if `event` already played within the cooldown; otherwise records this play. */
export function throttled(
  event: string,
  cooldownMs: number,
  dir = tmpdir(),
  now = Date.now(),
): boolean {
  const stamp = join(dir, `donechime-${event}.stamp`);
  try {
    if (now - statSync(stamp).mtimeMs < cooldownMs) return true;
    utimesSync(stamp, new Date(now), new Date(now));
  } catch {
    writeFileSync(stamp, '');
  }
  return false;
}

/** Clamp to an integer 0-100; undefined if not a usable number. */
export function parseVolume(value: unknown): number | undefined {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : NaN;
  return Number.isFinite(n) ? Math.round(Math.max(0, Math.min(100, n))) : undefined;
}

/** flag > config.volume > 100 */
export function resolveVolume(flag: number | undefined, config: Config): number {
  return parseVolume(flag) ?? parseVolume(config.volume) ?? DEFAULT_VOLUME;
}

/** Split `play` args into the event and an optional `--volume N` / `--volume=N`. */
export function parsePlayArgs(args: string[]): {
  event?: string | undefined;
  volume?: number | undefined;
} {
  let event: string | undefined;
  let volume: number | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    if (arg === '--volume') {
      // don't swallow the event name when the value is missing: `--volume Stop`
      const value = parseVolume(args[i + 1]);
      if (value !== undefined) {
        volume = value;
        i++;
      }
    } else if (arg.startsWith('--volume=')) volume = parseVolume(arg.slice('--volume='.length));
    else if (!arg.startsWith('--') && event === undefined) event = arg;
  }
  return { event, volume };
}

/** Path of a cached copy of `wav` at `volume`%; falls back to `wav` itself on any error. */
export function scaledCopy(wav: string, volume: number, dir = tmpdir()): string {
  try {
    const hash = createHash('sha1')
      .update(`${wav}|${statSync(wav).mtimeMs}`)
      .digest('hex')
      .slice(0, 12);
    const out = join(dir, `donechime-${hash}-${volume}.wav`);
    if (!existsSync(out)) writeFileSync(out, scaleWav(readFileSync(wav), volume / 100));
    return out;
  } catch {
    return wav;
  }
}

/**
 * Play to completion inside the hook. A detached child is killed when Claude Code reaps the
 * hook's process tree, so the sound never starts; the clips are short and the hook timeout is 5s.
 */
function playBlocking(wav: string): void {
  const script = `(New-Object Media.SoundPlayer $env:DONECHIME_WAV).PlaySync()`;
  spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
    stdio: 'ignore',
    windowsHide: true,
    timeout: 4000,
    env: { ...process.env, DONECHIME_WAV: wav },
  });
}

/** Seams for tests: config, cooldown check and the audio output. */
export interface PlayDeps {
  config?: Config;
  throttle?: typeof throttled;
  output?: (wav: string) => void;
}

/** Hook entry point: never throws, never prints, always succeeds. */
export function play(
  stdin: string,
  argEvent?: string,
  volumeFlag?: number,
  { config = loadConfig(), throttle = throttled, output = playBlocking }: PlayDeps = {},
): void {
  try {
    let event = argEvent;
    if (!event) event = (JSON.parse(stdin) as { hook_event_name?: string }).hook_event_name;
    if (!event) return;
    const wav = resolveSound(event, config);
    // only for the defaults, so users with custom sounds don't get ~/.donechime created
    if (wav && Object.values(DEFAULT_SOUNDS).includes(wav)) ensureSounds();
    if (!wav || !existsSync(wav)) return;
    const volume = resolveVolume(volumeFlag, config);
    if (volume === 0) return;
    if (throttle(event, config.cooldownMs ?? DEFAULT_COOLDOWN_MS)) return;
    output(volume === 100 ? wav : scaledCopy(wav, volume));
  } catch {
    /* a sound hook must never fail the agent */
  }
}
