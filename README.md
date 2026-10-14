# TrueCost

The perp cost forecast that publishes its own accuracy. Before you open a leveraged trade on Hyperliquid or Lighter, TrueCost tells you, in plain words:

- **what it costs to get in and out** (fees and slippage, a point estimate),
- **what holding it costs** (funding, as a likely value and an 80% range, never a fake exact number),
- **how far price can move before you're liquidated**, with the maths shown.

It then watches positions you already hold and warns you on Telegram, and it logs every forecast and scores it later, so the accuracy is public.

One Node process runs everything, sharing one engine (`src/engine.js`):

| Part | What it does |
|---|---|
| Website | The TrueCost OS page on `$PORT`, rebuilt every hour from live Hyperliquid + Lighter data. Visitors can paste a wallet to read their positions. |
| Telegram bot | `/cost`, `/watch`, `/positions`, `/alert`, `/record`. Position alerts every 10 minutes. Runs only if `TELEGRAM_BOT_TOKEN` is set. |
| Accuracy log | A reference forecast per market each day, scored when its hold time ends. Served at `/api/accuracy` and by `/record`. |

Routes: `/` (the site), `/health` (status JSON), `/api/snapshot`, `/api/accuracy`, `/api/positions?wallet=0x…` (read-only, 10 lookups a minute per visitor).

## Run it locally

```bash
cp .env.example .env     # paste your bot token, or leave it empty for website only
npm install
npm run check            # pulls live data from both venues once and prints it
npm start                # then open http://localhost:3000
```

Needs Node 20+ and outbound HTTPS to `api.hyperliquid.xyz` and `mainnet.zklighter.elliot.ai`. No API keys: everything used is public.

## Deploy on Railway

1. Push this folder to a GitHub repo (private is fine).
2. Railway → New Project → Deploy from GitHub repo → pick it. `railway.json` sets the start command and a `/health` check.
3. Variables: `TELEGRAM_BOT_TOKEN` (from @BotFather) and `DATA_DIR=/data`.
4. Attach a **Volume** mounted at `/data`. Users, wallets and the forecast log live there; without it they reset on every deploy.
5. Settings → Networking → Generate Domain. Railway sets `PORT`; the app listens on it.
6. Keep one replica. The bot uses long polling, and two copies with the same token fight over updates (error 409). Stop any local `npm start` too.

Check it worked: `https://<your-domain>/health` should show `"live": true`, `"markets": 11` and your bot's `@username` within a minute of starting.

Any host that keeps a Node process running works the same way (Render, Fly, a VPS with `pm2`).

## Bot commands

| Command | What it does |
|---|---|
| `/cost ETH long 25k 5x 3d` | Both venues side by side: entry+exit, funding range, liquidation price, total, which is cheaper |
| `/watch 0x…` | Read-only watch of a wallet's Hyperliquid and Lighter positions (up to 5 wallets) |
| `/positions` | Current state of watched positions |
| `/alert 8` | Warn when any position is within 8% of liquidation (default 8) |
| `/alerts off` / `on` | Pause or resume warnings |
| `/unwatch` | Forget all wallets |
| `/record` | Live forecast accuracy |

Alerts: liquidation within your threshold (critical under half of it), funding likely to flip in the next 24h (over 30% chance), and funding running above 0.4% of the position per week. The same alert isn't repeated within 2h (critical), 6h (warning) or 24h (info).

## How the numbers are made

**Entry and exit.** Fee × size, plus slippage = half the typical spread + 0.5 × daily volatility × √(size ÷ venue's 24h volume). Fees: Hyperliquid base tier 0.045% taker / 0.015% maker; Lighter Standard 0 / 0 (300 ms taker delay), Premium 0.028% / 0.004%. The spread and volatility per market are assumptions in `src/markets.js`; review them now and then.

**Funding.** A bootstrap over the venue's own last 30 days of hourly funding. Each of 1,000 paths replays one contiguous stretch as long as the hold; half the paths use this market's history and half use another market's history over the same dates, so squeezes that haven't hit this market yet are still possible. The current rate fades into history over roughly six hours (exponential decay, 6-hour time constant). Output: median, 10th and 90th percentiles, and the probability the sign goes the other way.

**Liquidation.** Isolated: `liq = entry − side × (margin − mmr × size × entry) ÷ size ÷ (1 − mmr × side)` (Hyperliquid's published formula; Lighter's partial-liquidation trigger reduces to the same form). Hyperliquid mmr = 1 ÷ (2 × max leverage); Lighter mmr from its market config. For watched positions the venue's own liquidation price is used when it reports one, which also covers cross margin.

**Backtest.** `npm run backtest` replays the forecast walk-forward on the snapshot's history (each forecast sees only earlier hours). On Lighter's history from 1 Sep to 13 Oct 2026 the 80% range held 77% of the time at 1 day, 3 days and 1 week (803 forecasts). The pooling weight was picked on that same period, so the live log is the real test.

## Web page

The running service serves the page itself and rebuilds it every hour. To get a static copy instead, `npm run build:web` writes `dist/index.html` (a full page for any static host) and `dist/truecost.html` (the fragment used for the Claude artifact preview), from `data/snapshot.web.json` if the service has written one, else the bundled `web/snapshot.sample.json` (13 Oct 2026). Wallet reading needs the service, so it only appears on the hosted site.

## What's confirmed and what's inferred

Confirmed from the venues' docs: request and response shapes for every endpoint used; Hyperliquid's liquidation formula, maintenance rule and hourly funding; Lighter's fees, margin fractions and liquidation steps.

Inferred from live data, not stated in docs (check these first if numbers look off):

- Lighter `/fundings` `rate` is a percent per hour, unsigned, with `direction` = side that pays.
- Lighter `/funding-rates` `rate` is an 8-hour fraction (÷ 8 for hourly).
- Lighter margin fractions are in 0.01% units (200 = 2%); position `initial_margin_fraction` is a percent.
- Hyperliquid position side is the sign of `szi`; `funding` / `fundingRate` are hourly fractions.

`npm test` covers the parsers against these shapes, snapshot building with one venue down, the engine, calibration scoring and every bot command, with mocked network.

## Known limits

- Hyperliquid margin tiers above the base tier (positions over ~$20M on most alts) aren't modelled.
- Cross-margin positions rely on the venue's reported liquidation price; the pre-trade checker assumes isolated margin.
- Storage is JSON files. Move to Postgres or Supabase past a few thousand users.
- TrueCost takes no fee yet. When routing starts, the fee must appear as its own line ("TrueCost's cut" is already on every breakdown).

## Layout

```
src/engine.js        cost, funding, liquidation, backtest (shared with the web page)
src/venues/          Hyperliquid and Lighter API clients
src/snapshot.js      builds the engine snapshot from live data
src/calibration.js   forecast log and scoring
src/monitor.js       wallet positions -> alerts
src/commands.js      bot command handlers (testable without Telegram)
src/format.js        message text
src/webpage.js       builds the page from a snapshot
src/server.js        website, /health and JSON routes
src/index.js         wires it together (grammY bot, hourly refresh, alerts)
web/page.html        web page template
scripts/             check-live, backtest, build-web
test/                node:test suite
```
