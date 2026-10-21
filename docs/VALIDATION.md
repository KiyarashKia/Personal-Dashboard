# Validation

Verified on October 20, 2026 (America/Toronto).

| Check | Result |
| --- | --- |
| Strict TypeScript | Passed |
| Optimized Next.js production build | Passed; page and both API routes render on demand |
| Pure logic and integration-contract tests | 26 passed across 3 files |
| Browser tests against the production build | 8 passed |
| Card-state containment | All four modes and every card view checked at 6 viewport sizes |
| SSR without JavaScript | Real monthly and daily metrics visible before hydration |
| French ring square outline | Removed; no box shadow on the progress SVG |
| Offline/reconnection, keyboard, reduced motion | Passed browser checks |
| Signed webhook rejection/acceptance | Invalid signature returned 401; authentic local notification returned 200 |
| Read after edit notification | Fresh source read confirmed; subsequent checks reused the dataset cache |
| Public Google Sheets adapter | Live read completed with no schema warnings |

Viewport sizes: 1440×900, 1280×720, 390×844, 375×667, 844×390, and 640×360. Tests check both document containment and card-content containment; they do not rely on hiding overflow. The last size also exercises a zoom-equivalent compact viewport.

The dashboard displays its configured source without substituting sample statistics. Live personal tracker values are intentionally omitted from this public project.

The source integration tests also cover current row-bound discovery, batched reads, concurrent-reader deduplication, event-only cached checks, cooldown/reset behavior, and retention of a successful dataset after Google failure.

Private service-account/OAuth credentials were not supplied, so those authentication paths were checked through code and mocked API contracts rather than a live private account. The Apps Script file is included, but its Google cloud triggers are not installed: installing them requires the owner's Google authorization and the deployed HTTPS callback URL.

No edits were made to the source spreadsheet during verification. The final ZIP excludes credentials, installed dependencies, build output, and transient browser-test artifacts.
