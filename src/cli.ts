#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { parsePlayArgs, play, SOUND_DIR } from './play.js';
import { BUNDLED } from './sounds.js';
import { addHook, EVENTS, removeHooks, type Settings } from './settings.js';

const claudeDir = join(homedir(), '.claude');
const settingsPath = join(claudeDir, 'settings.json');
const legacySound = join(claudeDir, 'sounds', 'done.wav');

const USAGE = `Usage: donechime <install|uninstall|play [event] [--volume 0-100]>

  install     Write bundled sounds and add ${EVENTS.join(', ')} hooks
  uninstall   Remove the hooks and bundled sounds
  play        Hook entry point: reads hook JSON on stdin (or pass an event name);
              --volume sets loudness (default 100)

Config: ~/.donechime.json, e.g. { "Notification": "C:/sounds/x.wav", "Stop": false, "cooldownMs": 2000, "volume": 60 }`;

function readSettings(): Settings {
  if (!existsSync(settingsPath)) return {};
  return JSON.parse(readFileSync(settingsPath, 'utf8')) as Settings;
}

function writeSettings(settings: Settings): void {
  mkdirSync(dirname(settingsPath), { recursive: true });
  if (existsSync(settingsPath)) copyFileSync(settingsPath, `${settingsPath}.bak`);
  writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
}

function main(args: string[]): number {
  const [cmd] = args;
  if (cmd === 'play') {
    // Hooks must never block or fail the agent: exit 0 no matter what.
    const { event, volume } = parsePlayArgs(args.slice(1));
    const stdin = event || process.stdin.isTTY ? '' : readFileSync(0, 'utf8');
    play(stdin, event, volume);
    return 0;
  }
  if (cmd === 'install') {
    if (process.platform !== 'win32') {
      console.error('Playback uses Windows PowerShell SoundPlayer; Windows only.');
      return 1;
    }
    mkdirSync(SOUND_DIR, { recursive: true });
    for (const [name, data] of Object.entries(BUNDLED)) {
      writeFileSync(join(SOUND_DIR, `${name}.wav`), data);
    }
    writeSettings(EVENTS.reduce(addHook, readSettings()));
    console.log(`Wrote sounds to ${SOUND_DIR}`);
    console.log(`Hooks added to ${settingsPath} (backup: settings.json.bak)`);
    console.log(
      'Needs `donechime` on PATH (npm i -g donechime). Open /hooks once or restart Claude Code.',
    );
    return 0;
  }
  if (cmd === 'uninstall') {
    if (existsSync(settingsPath)) writeSettings(removeHooks(readSettings()));
    rmSync(SOUND_DIR, { recursive: true, force: true });
    rmSync(legacySound, { force: true });
    console.log('Removed donechime hooks and sounds');
    return 0;
  }
  console.log(USAGE);
  return cmd === undefined || cmd === '--help' || cmd === '-h' ? 0 : 1;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (err) {
  if (process.argv[2] !== 'play') console.error(err instanceof Error ? err.message : err);
  process.exitCode = process.argv[2] === 'play' ? 0 : 1;
}
