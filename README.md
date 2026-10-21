# Cadence

A single-screen personal intelligence dashboard for your Google Sheets tracker. Server-rendered first view, four perspectives, interactive cards, and a viewport-fitted layout.

## Start

Requires Node.js 22 or newer.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

On Windows PowerShell, use `Copy-Item .env.example .env.local` for the second command. Open **http://127.0.0.1:3000**.

Set `GOOGLE_SHEET_ID` in `.env.local` to the ID from your spreadsheet URL. No API key is needed for a workbook that is publicly readable. No sample performance data is displayed.

## Deploy to Vercel or another Next.js host

1. Use the repository root, the folder containing `package.json`, as the project root.
2. Import the repository through your Git provider, or deploy it using the Vercel CLI. Vercel detects Next.js; `vercel.json` also records the build settings.
3. Add `GOOGLE_SHEET_ID` and any required server environment variables from `.env.example` in the host's settings. Spreadsheet IDs and credentials are intentionally not included in this repository.
4. Deploy. If you change an environment variable later, redeploy to apply it.

For another Node.js host, run `npm ci`, `npm run build`, then `npm start`. This app requires a Next.js server; it cannot be uploaded to a static-only HTML host. A production host must provide outbound HTTPS access to Google.

For a private tracker, use the read-only credentials below and enable deployment protection or authentication at your host. This build does not add user accounts; anyone allowed to access the deployment can read the dashboard endpoint and its tracker data.

## Choose a Google connection

### Public workbook, no credential

The server connects to Google's public workbook index and CSV export. It discovers monthly tabs and fetches the full current CSV for each. This was tested with a public tracker, including boolean values and empty unscheduled cells. It deliberately avoids the gviz endpoint, whose mixed-column type inference discarded some date values during inspection.

Public export mode refreshes about every **60 seconds** while visible and supports up to 40 monthly tabs. Larger trackers should use API mode.

### Sheets API key

Enable Google Sheets API in your Google Cloud project. Set `GOOGLE_SHEETS_API_KEY` on the server. The workbook must still be public: a key does not grant access to a private sheet.

API mode reads all monthly tabs with **one `values.batchGet` request** and refreshes about every **15 seconds** while visible. Tab metadata is rediscovered about every minute.

### Private workbook

Create a Google service account, enable Google Sheets API, and share the tracker with the account's email as **Viewer**. Set:

```dotenv
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-account@your-project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=<private-key-from-service-account-json>
```

Alternatively supply the three `GOOGLE_OAUTH_*` settings with a refresh token authorized for `spreadsheets.readonly`. Credentials stay in server-only modules. Never use `NEXT_PUBLIC_` for them. Keep secrets in `.env.local` or your host's secret manager; never commit them or add them to `.env.example`.

## Edit-triggered updates

See **[docs/EDIT-NOTIFICATIONS.md](docs/EDIT-NOTIFICATIONS.md)** for the included signed webhook and Google Apps Script. With this optional mode, Google reads happen after edits, rather than on each browser check. The recommended safety read is once per 15 minutes; strict event-only mode is also available.

This optional integration is supplied and tested locally; its Google triggers are **not installed** by extracting the project. A one-time installation and authorization in the sheet owner's Google account is required after HTTPS deployment.

## Dynamic tracker structure

The parser reads the structure, not fixed task names, row numbers, monthly denominators, or checkbox counts:

- Monthly tabs use English month names plus a four-digit year, such as `Oct 2026` or `November 2027`.
- The date row begins with day numbers `1, 2, 3` in column C. Each day continues in the next column.
- A header row contains **AREA** and **ACTION** in columns A and B.
- Rows beneath it contain a category, an activity label, and scheduled checkbox cells.
- `TRUE` means scheduled and complete, `FALSE` means scheduled and unfinished, and a blank means unscheduled.

You can add/reorder activities, change labels, change schedules, check/uncheck tasks, and add monthly tabs without changing dashboard code. API reads discover the current grid row count; public CSV exports include added rows automatically. The unrelated `DASHBOARD` sheet and summary/formula rows are ignored.

Category names determine semantic groups. The inspected categories map as follows: FRENCH → learning, HEALTH → health, CAREER/INCOME → career, PR/REVIEW → life admin. Common descriptive aliases are recognized. If you invent a category name with no identifiable meaning, set a semantic override rather than expecting the software to guess:

```dotenv
GOOGLE_CATEGORY_DOMAINS={"MY LANGUAGE STUDY":"learning","PERSONAL CARE":"health"}
```

Unknown categories still count toward overall progress; balance reports an explicit source note. French skill and walking submetrics recognize descriptive label keywords; changing a habit's semantic meaning may require updating those small classifiers. A renamed generic French activity still counts in French completion even when its skill is unknown.

Leave `GOOGLE_SHEET_RANGES` empty for automatic discovery. To intentionally limit the source, supply a JSON array of full ranges beginning at A1, such as `["'Oct 2026'!A1:AG85"]`. Explicit ranges are an intentional cap: increase their end row when you add rows, or return to automatic discovery.

## Correctness rules

- Only actual scheduled opportunities enter denominators. Future dates do not reduce current completion.
- The configured timezone defaults to **America/Toronto**. Weeks run Sunday–Saturday.
- Empty denominators display **—**, never a fabricated 0%.
- In-progress comparisons use equivalent elapsed prior periods; rate differences are percentage points.
- Full days require at least one scheduled task. French streaks count scheduled practice days and leave today open until midnight.
- Habit rankings require at least three scheduled opportunities and compare normalized completion rates.
- Routine balance uses the supplied coverage/participation formula. An untracked domain makes the score unavailable; it is never assumed complete. Weights can be changed in settings and are stored only in that browser.
- Overlapping identical activities count once. Conflicting duplicate states fail visibly instead of silently picking a value.

## Free-quota behavior

Cadence intentionally leaves headroom. API polling normally uses about four data reads plus one metadata read per minute, beneath Google's published 60/user/minute and 300/project/minute limits. It adds an eight-read/minute process circuit breaker, a shared Next.js Data Cache, concurrent-request deduplication, and a 45-request/minute circuit breaker for public exports. Hidden/offline tabs pause polling. Focus and reconnection reuse the same server cache.

Quota or temporary-unavailability responses honor `Retry-After`, then use increasing cooldowns. During the cooldown, the app does not keep retrying Google, and successful data stays visible. Budgets reset automatically. Cached values show their real last-read time.

The process gate is not a distributed quota ledger and cannot account for other applications using the same Google project. For unusually large public traffic or a custom multi-region host, add a shared rate limiter or host access limits. There is no paid quota increase or quota purchase in this application. Hosting usage is separate from Google's API usage.

## Check the project

```sh
npm test
npm run typecheck
npm run build
npm run dev
npm run test:e2e
```

Browser tests use installed Microsoft Edge by default. On another system, install Playwright Chromium (`npx playwright install chromium`) and set `PLAYWRIGHT_CHANNEL=chromium`. Keep a local server running for these tests.

The suite checks KPI edge cases, dynamic schema handling, timezone/week boundaries, quota cooldowns, signed edit notifications, cached event-driven updates, SSR before JavaScript, offline recovery, and all card states at representative viewports.

## Project map

```text
src/app/                    Server-rendered page, API routes, dark design tokens
src/components/             Dashboard, interactive cards, SVG visualizations
src/lib/                    Typed normalization, calendar math, metrics, source sync
google-apps-script/Code.gs   Optional Google edit notifications
tests/                      Pure logic, source orchestration, and browser tests
docs/                       Schema, deployment/sync details, design review
.env.example                Server configuration template, no credentials
package-lock.json           Locked dependencies
```

## Sources checked

- [Google Sheets API quotas and pricing](https://developers.google.com/workspace/sheets/api/limits)
- [Google Sheets batchGet](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/batchGet)
- [Google Apps Script installable triggers](https://developers.google.com/apps-script/guides/triggers/installable)
- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines)

The visual foundations use the supplied **Premium Dark Apple Cinematic (System Cut)**: pure black, charcoal surfaces, Helvetica, white primary actions, restrained blue interaction indicators, and green health indicators. Native font availability varies by operating system; Helvetica falls back to Arial.
