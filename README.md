# DealerPulse

Sales performance and follow-up alerts for a multi-branch automotive dealership group. Built for the CEO and branch managers: what is happening, why, and who should act today.

See [DECISIONS.md](DECISIONS.md) for product decisions, tradeoffs and patterns in the data.

## Run locally

Requires Node.js 18.18 or later (tested on 20.x).

```bash
npm install
npm run dev        # http://localhost:3000
```

Other scripts:

| Command | What it does |
|---|---|
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm test` | Unit tests (Vitest) |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no emit |

## Deploy to Vercel

No environment variables are needed. The app works without them; only the live AI chatbot needs a key (see below).

1. Push this folder to a Git repository.
2. In Vercel, choose **Add New → Project**, import the repository, and keep the detected Next.js settings. If the repository root is not this folder, set the **Root Directory** to it.
3. Deploy.

Or, with the Vercel CLI: `npx vercel` from this folder, then `npx vercel --prod`.

## AI chatbot

The **Ask DealerPulse** button (bottom right, on every page) opens a chat drawer. It answers questions about the range and branch or sales officer in the current URL.

- **Live mode** sends the question to Claude (`@anthropic-ai/sdk`, server-side only, in `src/app/api/ask/route.ts`). The model only sees a fact sheet built from our own metrics (`src/lib/factsheet.ts`): aggregates, lead IDs and staff names, with no customer names or phone numbers. The figures in each answer are checked against that fact sheet, and the drawer shows "Couldn't verify every figure" when one isn't found.
- **Offline mode** is used when no key is set or the kill switch is off. It answers nine curated decision questions straight from the dashboard metrics (`src/lib/curatedAnswers.ts`), with no API call. The drawer shows an "Offline answers" badge.

### Environment variables

Copy `.env.example` to `.env.local` for local development. Never commit a real key.

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | (unset) | Claude API key. Without it the chatbot runs in offline mode. Server-side only; never use a `NEXT_PUBLIC_` prefix. |
| `ASK_AI_ENABLED` | `true` | Kill switch. Set it to `false` to force offline mode without removing the key. |
| `ASK_AI_MODEL` | `claude-opus-5-5` | Model ID for live answers. |
| `ASK_AI_RATE_LIMIT_PER_MINUTE` | `8` | Live questions allowed per IP per minute. |
| `ASK_AI_RATE_LIMIT_PER_DAY` | `60` | Live questions allowed per IP per day. |

The two limits must be positive whole numbers; any other value falls back to the default. The limit is held in memory per server instance, which is fine for a demo. A production deployment needs a shared store such as Vercel KV. Also set a monthly spend limit in the Anthropic Console.

### Vercel setup

1. In Vercel, open the project, then **Settings → Environment Variables**.
2. Add `ANTHROPIC_API_KEY` (mark it **Sensitive**) for the Production and Preview environments. Add the other variables only if you want values other than the defaults.
3. Redeploy so the new values take effect.

To switch the AI off in an emergency, set `ASK_AI_ENABLED` to `false` and redeploy. The chatbot keeps working in offline mode.

## Project structure

```
data/dealership_data.json   Source dataset (read on the server only)
src/lib/                    Data layer, no React
  data.ts                   Loads and indexes the dataset once; derives per-lead fields
  metrics.ts                KPIs, funnel, trends, branch and rep rows
  insights.ts               Alert rules engine
  narrative.ts              Plain-English briefings
  factsheet.ts              Grounding text for the AI chatbot (no customer data)
  curatedAnswers.ts         Offline answers to the chatbot's curated questions
  askRequest.ts, verifyNumbers.ts, askConfig.ts, rateLimit.ts   Chatbot request checks, figure check, env config, rate limit
  range.ts                  Time-range parsing and presets (URL ?from=YYYY-MM&to=YYYY-MM)
  whatif.ts                 Conversion what-if model
  csv.ts, format.ts         Export and formatting helpers
src/components/             UI components (client components only where interaction needs it)
src/app/                    Routes: / · /actions · /branches/[branchId] · /reps/[repId]
```

## URLs

| Page | Example |
|---|---|
| Group overview | `/` |
| Action center | `/actions` |
| Branch | `/branches/B3` |
| Sales rep | `/reps/SR2` |
| Any page, filtered | `/branches/B1?from=2025-10&to=2025-12` |
