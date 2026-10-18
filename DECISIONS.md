# DECISIONS

## Executive summary

DealerPulse is a decision tool for the CEO and branch managers of a 5-branch Toyota group. It is not a chart gallery. Every screen answers the same three questions in the same order: **what is happening, why, and what should someone do about it today.**

The overview opens with a plain-English briefing, then six vital signs, then a ranked list of problems. Each problem names the owner, the money at stake and a concrete next step. Every number drills down from group → branch → sales officer → individual lead.

---

## What I built and why

| Feature | Why it earns its place |
|---|---|
| **CEO briefing** (overview, branch and rep) | A non-technical CEO should understand the period from four sentences without reading a chart. The text is generated from the same metrics as the tiles, so it never disagrees with them. "Copy summary" pastes it straight into WhatsApp or email. |
| **Vital-sign tiles** | Six numbers: units vs target, revenue vs target, lead→order conversion, loss rate, order-to-delivery time, open pipeline. Each carries a colour state, and on drill-down pages a "+/- pts vs group" comparison, so "is this good?" is answered next to the number. |
| **Needs attention / Action center** | The required "actionable insight", taken further. A rules engine produces alerts for cold leads, stuck orders, branches far behind peers, abnormal loss rates, under-converting reps, slow first contact, delivery delays and data hygiene. Alerts are ranked by severity and then by money at stake. Each one lists the leads involved, so the manager can pick up the phone. The Action center filters by priority, branch and type, and exports to CSV. |
| **Branch scorecard** | Side-by-side comparison with outliers in red. One click opens the branch. |
| **Drill-down** | Branch pages show the team ranking, funnel, lost reasons and a searchable, exportable lead list. Rep pages show the rep's own pipeline and alerts. |
| **Funnel with drop-off** | Shows where leads leak (the weakest step is highlighted) and how many are lost at each stage. |
| **Lost reasons, delivery delays, lead sources** | The "why" behind the funnel, and the levers marketing and operations control. |
| **What-if simulator** | "If test drives converted 10% better, what is it worth?" It answers in INR and cars, and it states its assumptions on screen. |
| **Time filter** | Presets (all, last 3 months, Q3, Q4, latest month) plus a custom from/to range. The range lives in the URL, so any filtered view can be bookmarked or shared, and it carries across navigation. |

---

## Key product decisions and tradeoffs

1. **"Today" is 31 Dec 2025, not the real date.** The dataset ends on 31 Dec 2025. Lead aging measured against the real clock would flag every lead as hundreds of days old. The app derives "as of" from the latest record and shows it on every page.

2. **Two kinds of numbers, labelled as such.** Period metrics (deliveries, revenue, conversion) follow the time filter. Lead-state alerts (cold leads, stuck orders) describe the business *right now* and carry an "As of 31 Dec 2025" badge. Mixing the two silently would confuse a CEO who picks "Q3" and still sees December leads going cold.

3. **Targets are judged relative to peers as well as in absolute terms.** The group delivered 160 units against a target of 1,426 (11%). If every branch is red, red carries no information. Branch colours therefore compare each branch with the group pace. A branch that beats its peers but is still below half of its own target stays amber, never green, so the gap to target is never hidden. Lakeside is the only branch that goes red, because it is far behind everyone.

4. **Conversion uses a cohort.** "Lead → order" is the share of leads *created* in the period that reached an order. That is the honest measure of sales effectiveness. The tradeoff is that the most recent month looks slightly worse, because its leads have had less time to convert.

5. **Data quality is surfaced, not hidden.** 14 leads are marked `lost` but have no "lost" event in their history and no reason recorded. They are counted, shown as "Not recorded" in lost reasons, and raised as a data-hygiene alert. They are not dropped.

6. **One card per problem on the CEO view.** On the overview, per-branch alerts of the same type are merged into one card with a branch breakdown, for example "24 booked orders across 5 branches". The Action center and branch pages keep them separate, because there each branch manager owns their own card.

7. **Server-side computation.** The 620 KB JSON is processed in React Server Components. The browser receives only aggregated numbers plus the lead rows a page actually lists, so the raw dataset never ships to the client. First-load JS is about 205 KB, mostly the charting library. A real CRM feed would replace one module (`src/lib/data.ts`).

8. **Privacy by default.** Phone numbers are masked (`•••••••594`) before they leave the server, including in CSV exports. CSV cells are also guarded against spreadsheet formula injection.

9. **Deterministic executive briefings, with optional grounded Gemini Q&A.** The on-page briefings remain template-driven: instant, free, and consistent with the dashboard numbers. Ask DealerPulse separately supports live Gemini answers from a server-built fact sheet, verifies answer figures against that sheet, and falls back to curated metric-based answers when no Google API key is configured.

10. **Light theme, tablet-first.** The minimum bar was desktop and tablet. Below 1024 px the sidebar becomes a top bar, wide tables scroll inside their own card, and tiles reflow from six columns to three to two. I skipped dark mode to spend the time on insight quality.

### Thresholds used (all in one place in `src/lib/metrics.ts` / `insights.ts`)

| Rule | Threshold | Rationale |
|---|---|---|
| Cold lead | Open lead with no activity for 7+ days | Matches the example in the brief |
| Stuck order | Booked but not delivered after 30+ days | About 2× the 17-day median order-to-delivery |
| Branch behind target | Under 50% of the group's attainment | Relative, see decision 3 |
| Unusual loss rate | 15+ points above the group | Large enough to rule out noise at about 80–130 leads per branch |
| Rep conversion | Under 60% of branch peers, with 8+ leads | Avoids flagging reps with tiny samples |

---

## Patterns in the data

- **Lakeside (Bangalore) is a branch-level problem, not a people problem.** It delivered 6 cars against a 264-unit target, loses 87% of its leads (group average 56%) and converts 13% to orders against 39–47% elsewhere. 75% of its losses happen *before a test drive*, and all five of its officers are low. That points to lead quality, local pricing or process at the branch, not one weak rep. The useful next step is a branch review, not individual coaching.
- **Booked orders are going stale.** 24 of 38 undelivered bookings (INR 5.5 Cr) are more than 30 days old. The oldest was booked 195 days ago, while completed deliveries take a median of 17 days. These are either cancellations nobody recorded or a real allocation backlog. Either way, the revenue isn't real until someone checks.
- **Targets are about 9× actual volume at every branch.** Even the best branch (Eastside, 47 units) reached 15% of target. Either the targets are planning numbers for the full network and this dataset is a sample of leads, or the targets were never realistic. I would raise this with the client before anyone acts on "11% of target".
- **The biggest leak is at the top of the funnel.** 23% of leads are never contacted, and 114 are lost at the "new" stage. Median time to first contact is about two days across the group, with reps ranging from 35 to 61 hours. For high-intent buyers that is slow.
- **Walk-ins convert 3× better than social media** (59% vs 17% lead → order). Social media brings volume but little revenue, so it is worth checking marketing spend against delivered revenue by source.
- **Delays are mostly customer-driven.** 45% of deliveries slipped. The top cause is "Customer requested date change" (18), ahead of logistics (11) and factory allocation (11). Confirming the handover date at booking would remove the largest single cause.
- **Demand is rising.** New leads grew from 55 in June to 95 in November, and deliveries peaked in December (52). Branch managers carry no leads of their own, so all selling happens at officer level.

---

## What I'd build next

1. **Production data integration.** Replace the synthetic JSON file with an incremental CRM sync, freshness indicators, and explicit data-quality monitoring.
2. **Alert workflow.** Assign, snooze and resolve alerts, with an owner and due date stored in a database. Then measure time-to-action per manager.
3. **Scheduled digests.** A Monday-morning email or WhatsApp briefing per branch manager, generated from the same alert engine.
4. **Forecast calibration.** Compare forecasted pipeline outcomes with real future results and add confidence bands only after enough history exists to validate them.
5. **Role-based views.** A branch manager lands on their own branch, and a CEO on the group. This needs authentication, which was out of scope.
6. **Model and pricing analysis.** Win rate by model and deal size, and discounting patterns from negotiation notes.

---

## Tech

Next.js 15.5 (App Router, Server Components) · TypeScript (strict) · Tailwind CSS 3 · Recharts 2 · Vitest. Dependencies use their respective upstream licenses. The Vitest suite covers the metric engine, range parsing, alerts, AI request/configuration safeguards, narrative copy, and CSV escaping; lint, type-check and production build are validated before release.
