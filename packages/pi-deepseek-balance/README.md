# @playhard.pro/pi-deepseek-balance

A [Pi](https://pi.dev) extension that shows your **DeepSeek account balance** in the footer status
bar and keeps it up to date as you work.

It reuses the DeepSeek API key that Pi is already configured with — from the `DEEPSEEK_API_KEY`
environment variable or Pi's stored credentials — so there is no extra secret to manage.

```
DeepSeek ¥12.34
```

## Features

- 💰 Balance shown in the persistent footer status line.
- 🔄 Automatic refresh after every agent run (`agent_settled`), throttled to once per 30s.
- ⌨️ Manual refresh with the `/deepseek-balance` command.
- 🔐 Reuses Pi's existing DeepSeek credentials — no extra configuration.
- 🌍 Renders every `balance_infos` entry (e.g. CNY and USD) on one line.
- 🛡️ Graceful handling of missing keys, HTTP failures, timeouts, and unavailable accounts.

## Requirements

- Pi `>= 0.79` (any recent release).
- A configured DeepSeek provider with a valid API key.

## Installation

### From npm (recommended)

```bash
pi install npm:@playhard.pro/pi-deepseek-balance
```

Pin a version if you prefer:

```bash
pi install npm:@playhard.pro/pi-deepseek-balance@0.1.0
```

### From git

```bash
pi install git:github.com/playhard-pro/pi-extensions
```

### As a local path

```bash
pi install /absolute/path/to/pi-extensions/packages/pi-deepseek-balance
# or a relative path
pi install ./packages/pi-deepseek-balance
```

### Try without installing

```bash
pi -e ./packages/pi-deepseek-balance/extensions/pi-deepseek-balance.ts
```

After installation, restart Pi (or run `/reload`).

## Usage

Once loaded, the extension registers itself automatically:

| Trigger | Behavior |
| --- | --- |
| Session start | Fetches the balance and writes it to the footer. |
| Agent run settles | Refreshes the balance, throttled to once per 30 seconds. |
| `/deepseek-balance` | Forces a refresh and shows a notification. |
| Session shutdown | Clears the footer entry. |

The footer text reflects the account state:

| Status | Meaning |
| --- | --- |
| `DeepSeek ¥12.34` | Balance fetched successfully. |
| `DeepSeek ¥12.34 (unavailable)` | The API reports `is_available: false`. |
| `DeepSeek: no API key` | No DeepSeek key is configured for Pi. |
| `DeepSeek: HTTP 401 ...` | The request failed (auth, network, timeout, …). |

### API key resolution

The extension calls `ctx.modelRegistry.getApiKeyForProvider("deepseek")`, so it transparently uses
whichever key Pi already resolves:

1. `DEEPSEEK_API_KEY` environment variable.
2. Credentials stored by Pi (e.g. via `pi` login/provider setup).

No new secret configuration is required.

## How it works

The extension calls `GET https://api.deepseek.com/user/balance` with
`Authorization: Bearer <apiKey>` and renders the returned `balance_infos` in the footer using
`ctx.ui.setStatus`. Requests are throttled and de-duplicated so the endpoint is never hammered, and
each request has a 10 second timeout.

## Development

This package lives in the [`pi-extensions`](https://github.com/playhard-pro/pi-extensions)
monorepo. From the repository root:

```bash
npm install
npm run typecheck
npm run lint
npm test
```

Run only this package's tests:

```bash
npm test --workspace @playhard.pro/pi-deepseek-balance
```

### Smoke test in Pi

```bash
pi -e ./packages/pi-deepseek-balance/extensions/pi-deepseek-balance.ts
```

With `DEEPSEEK_API_KEY` set, confirm the footer shows the balance and that `/deepseek-balance`
forces a refresh.

## License

[MIT](./LICENSE) © playhard.pro
