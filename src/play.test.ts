import { existsSync, mkdtempSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type Config,
  DEFAULT_SOUNDS,
  ensureSounds,
  parsePlayArgs,
  parseVolume,
  play,
  resolveSound,
  resolveVolume,
  scaledCopy,
  SOUND_DIR,
  throttled,
} from './play.js';

describe('resolveSound', () => {
  it('uses the bundled sound by default', () => {
    expect(resolveSound('Stop', {})).toBe(DEFAULT_SOUNDS.Stop);
  });

  it('honors overrides and mute', () => {
    expect(resolveSound('Stop', { Stop: 'a.wav' })).toBe('a.wav');
    expect(resolveSound('Stop', { Stop: false })).toBeUndefined();
  });

  it('ignores unknown events', () => {
    expect(resolveSound('PreToolUse', {})).toBeUndefined();
  });
});

describe('throttled', () => {
  it('blocks repeats within the cooldown only', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dc-'));
    const t = Date.now();
    expect(throttled('Stop', 2000, dir, t)).toBe(false);
    expect(throttled('Stop', 2000, dir, t + 500)).toBe(true);
    expect(throttled('Stop', 2000, dir, t + 5000)).toBe(false);
  });
});

describe('ensureSounds', () => {
  it('writes every bundled sound into an empty dir', () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'dc-')), 'sounds');
    ensureSounds(dir);
    for (const name of ['done', 'attention', 'failed']) {
      expect(existsSync(join(dir, `${name}.wav`))).toBe(true);
    }
  });
});

describe('parseVolume', () => {
  it('clamps and rounds usable numbers', () => {
    expect(parseVolume('50')).toBe(50);
    expect(parseVolume(50.6)).toBe(51);
    expect(parseVolume(-5)).toBe(0);
    expect(parseVolume(150)).toBe(100);
  });

  it('rejects anything else', () => {
    for (const v of ['abc', '', '50%', NaN, null, undefined])
      expect(parseVolume(v)).toBeUndefined();
  });
});

describe('resolveVolume', () => {
  it('prefers flag, then config, then 100', () => {
    expect(resolveVolume(20, { volume: 40 })).toBe(20);
    expect(resolveVolume(undefined, { volume: 40 })).toBe(40);
    expect(resolveVolume(undefined, {})).toBe(100);
  });
});

describe('parsePlayArgs', () => {
  it('finds the event and volume in any order', () => {
    expect(parsePlayArgs(['--volume', '50', 'Stop'])).toEqual({ event: 'Stop', volume: 50 });
    expect(parsePlayArgs(['Stop', '--volume', '50'])).toEqual({ event: 'Stop', volume: 50 });
    expect(parsePlayArgs(['Stop', '--volume=50'])).toEqual({ event: 'Stop', volume: 50 });
  });

  it('tolerates a missing value or event', () => {
    expect(parsePlayArgs(['Stop', '--volume'])).toEqual({ event: 'Stop', volume: undefined });
    expect(parsePlayArgs([])).toEqual({ event: undefined, volume: undefined });
  });

  it('does not swallow the event when the value is missing', () => {
    expect(parsePlayArgs(['--volume', 'Stop'])).toEqual({ event: 'Stop', volume: undefined });
  });
});

describe('scaledCopy', () => {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(2, 40);
  const make = () => {
    const dir = mkdtempSync(join(tmpdir(), 'dc-'));
    const src = join(dir, 'a.wav');
    writeFileSync(src, Buffer.concat([header, Buffer.from([0xe8, 0x03])]));
    return { dir, src };
  };

  it('caches by source and mtime', () => {
    const { dir, src } = make();
    const first = scaledCopy(src, 50, dir);
    const mtime = statSync(first).mtimeMs;
    expect(first).not.toBe(src);
    expect(scaledCopy(src, 50, dir)).toBe(first);
    expect(statSync(first).mtimeMs).toBe(mtime);
    utimesSync(src, new Date(), new Date(Date.now() + 5000));
    expect(scaledCopy(src, 50, dir)).not.toBe(first);
  });

  it('falls back to the original on a bad source', () => {
    const { dir } = make();
    expect(scaledCopy(join(dir, 'missing.wav'), 50, dir)).toBe(join(dir, 'missing.wav'));
  });
});

describe('play', () => {
  const sound = () => {
    const dir = mkdtempSync(join(tmpdir(), 'dc-'));
    const wav = join(dir, 'a.wav');
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.write('WAVEfmt ', 8);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(16, 34);
    header.write('data', 36);
    header.writeUInt32LE(2, 40);
    writeFileSync(wav, Buffer.concat([header, Buffer.from([0xe8, 0x03])]));
    return wav;
  };
  const run = (config: Config, volume?: number) => {
    const played: string[] = [];
    let checked = 0;
    play('', 'Stop', volume, {
      config,
      throttle: () => (checked++, false),
      output: (wav) => played.push(wav),
    });
    return { played, checked };
  };

  it('plays the original file at full volume', () => {
    const wav = sound();
    expect(run({ Stop: wav }).played).toEqual([wav]);
  });

  it('plays a scaled copy below 100', () => {
    const wav = sound();
    const { played } = run({ Stop: wav, volume: 50 });
    expect(played).toHaveLength(1);
    expect(played[0]).not.toBe(wav);
  });

  it('stays silent at volume 0 without touching the cooldown', () => {
    const wav = sound();
    expect(run({ Stop: wav }, 0)).toEqual({ played: [], checked: 0 });
  });

  it('does not create the sound dir for custom sounds', () => {
    const wav = sound();
    const before = existsSync(SOUND_DIR);
    run({ Stop: wav });
    expect(existsSync(SOUND_DIR)).toBe(before);
  });
});
