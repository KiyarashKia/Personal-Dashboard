# Sync after an edit

Pintelli includes an optional **edit → signed notification → invalidate cache → read fresh data** path. The existing public tracker works immediately in polling mode; Google requires you to install and authorize the optional trigger in your own account.

## Activate it

1. Deploy the project to an HTTPS host such as Vercel.
2. Generate a random secret of at least 32 characters. For example, run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` locally. Keep it private.
3. In the host's server environment, set `DASHBOARD_SYNC_MODE=webhook`, `GOOGLE_WEBHOOK_SECRET=<your secret>`, and `DASHBOARD_FALLBACK_SECONDS=900`. Redeploy to apply these values.
4. Open the tracker in Google Sheets. Choose **Extensions → Apps Script**. Paste the contents of `google-apps-script/Code.gs` into its bound script project.
5. Under **Project Settings → Script Properties**, add:
   - `PINTELLI_WEBHOOK_URL`: `https://YOUR-DEPLOYED-HOST/api/sheet-change`
   - `PINTELLI_WEBHOOK_SECRET`: the exact same secret from step 3.
6. Save the script. Run **installPintelliTriggers** once and grant Google's requested permissions. It creates this project's edit, structural change, and linked-form submission triggers, plus one initial notification.
7. In Google Sheets, change a real scheduled checkbox. Keep Pintelli open and check that the corresponding value updates. Apps Script's **Executions** view shows notification failures, if any.

If Vercel deployment protection blocks external POST requests, configure a host-approved protection bypass for the webhook. Keep the signed notification check enabled. A localhost preview cannot receive Google's HTTPS notifications.

## What happens

- A burst of edits is collected into one notification scheduled for approximately 15 seconds later. Google may run time triggers later; there is no guaranteed latency.
- The notification contains the workbook ID, changed tab names, timestamp, nonce, and structural-change flag. It sends **no cell values or form responses**.
- The receiver verifies an HMAC SHA-256 signature and a five-minute timestamp window. Invalid requests cannot invalidate the dataset.
- A valid event expires the shared dataset cache. Structural events also expire tab discovery.
- While visible, the browser checks **Pintelli's own cached endpoint** every five seconds. This does not read Google every five seconds. The next read after invalidation fetches the updated tracker.
- Multiple edits before a reader opens the dashboard collapse into one later read. The webhook itself does not fetch Google.
- Read budgets, quota cooldowns, and retained last-successful data still apply.

API mode is recommended for frequent edits: all months are fetched in one `values.batchGet` request. Public-export mode fetches one CSV per monthly tab, so its conservative budget may delay very rapid changes.

## Strict event-only option

Set `DASHBOARD_FALLBACK_SECONDS=0` to retain a successful dataset until the next authenticated notification. An initial cache miss, deployment/cache eviction, or an expired edit event still requires an initial read. Leave the default `900` for a safety read about every 15 minutes while the dashboard is open.

Google's edit/form triggers do **not** fire for ordinary writes made by other scripts or API clients. Formula recalculation is also not a direct edit event. If another script updates the monthly tabs, have it call `pintelliQueue_('', true)` after its write, or retain the safety refresh. If a linked Google Form writes only a responses tab, the separate logic that updates monthly checkbox tabs must still exist; Pintelli does not reshape form responses into a new tracker.

Google Drive also offers file-change push channels, but they require OAuth permissions, HTTPS channel management, and periodic renewal. The bound Apps Script is simpler for this personal tracker.

## Remove it

Set `DASHBOARD_SYNC_MODE=poll` and redeploy. In the bound Apps Script project's **Triggers**, delete only the handlers named `pintelliEdited`, `pintelliChanged`, `pintelliSubmitted`, and `pintelliFlush`. Preserve any unrelated tracker scripts and triggers.

## References

- [Google Apps Script installable triggers](https://developers.google.com/apps-script/guides/triggers/installable)
- [Trigger event objects](https://developers.google.com/apps-script/guides/triggers/events)
- [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas)
- [Drive push notifications](https://developers.google.com/workspace/drive/api/guides/push)
