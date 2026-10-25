# donechime

**Know what your agent needs by ear.**

[![npm version](https://img.shields.io/npm/v/donechime)](https://www.npmjs.com/package/donechime)
[![npm downloads](https://img.shields.io/npm/dm/donechime)](https://www.npmjs.com/package/donechime)
[![CI](https://github.com/EvilPrime98/donechime/actions/workflows/ci.yml/badge.svg)](https://github.com/EvilPrime98/donechime/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/npm/l/donechime)](LICENSE)

Claude Code runs for minutes at a time. You tab away, and then you either check too early or find out ten minutes late that it was waiting on you. donechime gives each situation its own sound, so you can ignore the terminal until it asks.

| Sound        | Plays when                                                  | Hook           |
| ------------ | ----------------------------------------------------------- | -------------- |
| Rising chime | Claude finished its turn                                    | `Stop`         |
| Double beep  | Claude needs you (permission, input)                        | `Notification` |
| Falling tone | The turn died on an API error (rate limit, billing, server) | `StopFailure`  |

## Why this one

- **One command.** `donechime install` wires up all three hooks. No JSON editing.
- **Never gets in the agent's way.** Playback is detached and the hook always exits 0 with no output. A missing sound file or bad config can't break a session.
- **No sound spam.** A per-event cooldown stops bursts from stacking up.
- **Safe with your settings.** It merges into `~/.claude/settings.json`, leaves your other hooks alone, and writes a `.bak` first. `uninstall` removes only what it added.
- **No licensing headaches.** The bundled sounds are synthesized, not sampled.
- **Yours to change.** Swap any sound or mute any event in one small file.

Unofficial; not affiliated with Anthropic.

## Install

Requires Node.js 18+ and Windows. Sound plays on the machine running Claude Code, so SSH and WSL sessions won't play on your desktop.

```sh
npm install -g donechime
donechime install
```

`donechime` must stay on your `PATH`, because the hooks run `donechime play`. If a hook doesn't fire, open `/hooks` once in Claude Code or restart it.

## Configure

Optional. Create `~/.donechime.json`:

```json
{
  "Notification": "C:/sounds/ping.wav",
  "Stop": false,
  "cooldownMs": 3000
}
```

- An event maps to a WAV path, or to `false` to mute it. Unlisted events use the bundled sound.
- `cooldownMs` is the minimum gap between plays of the same event (default 2000).

## Commands

```sh
donechime install     # write sounds, add the hooks
donechime uninstall   # remove the hooks and sounds
donechime play Stop   # hook entry point; also handy to test a sound
```

## Roadmap

Per-tool rules (e.g. a different sound for `Bash`), `test` and `list` commands. macOS and Linux support if people ask for it.

## Contributing

Issues and pull requests are welcome. Please open an issue before sending a large pull request, and run `pnpm test` and `pnpm lint` first.

## License

MIT. See [LICENSE](LICENSE).

## Author

AminPerez
