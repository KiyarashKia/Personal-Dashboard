# Design review

The supplied dashboard brief takes precedence over generic marketing patterns. The later Premium Dark Apple Cinematic system supplies the final color, type, control, and surface foundations.

## Final direction

Pure black canvas; `#121214` and `#1c1c1e` charcoal surfaces; Helvetica Neue/Helvetica/Arial; oversized bold numbers; 28px main card radii; white primary pills; functional blue; green health cues. No photography is needed for this analytics task. Large marketing section gaps are adapted to the explicit one-viewport requirement.

The primary view uses an asymmetric bento grid. Day, Week, Month, and Year share overview metrics while changing the contextual composition. Compact layouts present five explicit card pages. Each card's labeled footer cycles meaningful in-place views.

## Polish decisions

| Before                                                           | After                                                                     | Why                                                                    |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| A `ring` class collided with Tailwind's ring utility             | The SVG uses `progress-ring`, with no box shadow                          | Removes the square outline while preserving the circular visualization |
| Slate-blue hero surface                                          | Elevated neutral charcoal from the supplied system                        | Keeps the dark surfaces cohesive                                       |
| Streaming skeleton hid resolved content with JavaScript disabled | The first page waits for its source read and renders real values directly | Verifies useful SSR before hydration                                   |
| Dense alternate states at small sizes                            | Adapted spacing, typography, and explicit card pagination                 | Keeps metrics accessible without clipping or nested scrolling          |
| Missing domains risked looking like a fabricated score           | Unavailable score plus tracked-domain count                               | Makes the routine indicator honest                                     |

## Critique checks

| Heuristic                 | Score / 4 | Evidence                                                                              |
| ------------------------- | --------- | ------------------------------------------------------------------------------------- |
| System status             | 4         | Real read timestamp, offline/stale state, retry                                       |
| Match with the real world | 4         | Calendar periods, task counts, source labels                                          |
| User control              | 4         | Period navigation, explicit pages, Escape closes dialogs                              |
| Consistency               | 4         | Common labeled card navigation and control sizes                                      |
| Error prevention          | 3         | Weight validation, signed notifications; semantic renames may need mapping            |
| Recognition               | 4         | Visible mode, period, card view label and indicators                                  |
| Efficiency                | 3         | T/R shortcuts and arrow navigation; no custom command menu                            |
| Minimalism                | 4         | One dominant idea per card, no sidebar or data table wall                             |
| Recovery                  | 3         | Retained successful data and automatic cooldown; Google availability remains external |
| Help                      | 3         | In-app orientation plus setup/sync documents                                          |
| Total                     | 36 / 40   | Focused personal analytics experience                                                 |

No generic glow-heavy or gradient-heavy styling was added. The dark bento layout and large hero metric are explicit product requirements, not generic defaults.

Power-user checks cover keyboard navigation and preserved card state. First-time-user checks cover discoverable card footer controls and connection recovery. Small-screen checks cover explicit pages, visible period navigation, and all metric states without scrolling.

## Practical limits

At extreme widths below 320px or heights below 300px, content access is prioritized over suppressing scrolling, as permitted by the brief. Real device rendering and native font availability can vary. Google Apps Script execution timing is not guaranteed, and its cloud trigger installation requires the owner's authorization.
