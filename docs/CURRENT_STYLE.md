# Current interface style (game, excluding the 3D yard)

Snapshot of `game/src` at e691ce2 (Sun Sept 27). Read-only survey for a later CSS-only restyle.

## Where the styles live

| File | Scope | Notes |
|---|---|---|
| `game/src/ui/game.css` | The game page (`/`, `/?view=2d`): everything under `.gv` | "Harbor Slate" theme. Holds all `--gv-*` tokens. Loaded by `GameView.tsx` together with the two font packages. |
| `game/src/ui/styles.css` | Global base, loaded by `main.tsx` for every view | Base elements, the dashboard (`/?view=dashboard`, the frozen fallback), and the shared pieces the game page still uses unchanged: prompt-bar base, working/Stop states, `.tag`, `.lock-reason`, the access-report modal, the raw view, toasts. No colour tokens: every colour here is a literal. |
| `game/src/layout.ts` | Layout/size variables, injected as inline CSS custom properties by React (`dashboardLayout`, `gameLayout`) | Sizes only, no colours. Also `yardLayout.colors` (Phaser yard palette, out of scope). |
| `game/src/scene3d/game3d.css` | 3D yard labels (`.d3-*`) | Out of scope (3D yard). |
| `game/index.html` | none | No `<link>`, no CDN fonts. |

A restyle of the game page can be CSS-only: `game.css` (tokens + `.gv` overrides) plus overrides for the literal-coloured pieces from `styles.css` listed at the end. No component has inline colour styles (the only inline `style` is the 2D speech-bubble position in `Yard.tsx`).

Views: `/` = 3D diorama (game page), `/?view=2d` = 2D Phaser yard (game page), `/?view=dashboard` = frozen fallback (styles.css only, not covered here).

## Fonts

| Font | Package (self-hosted, no CDN) | Used for |
|---|---|---|
| Bricolage Grotesque Variable | `@fontsource-variable/bricolage-grotesque` (imported in `GameView.tsx`) | `--gv-display`: h1-h3, stat numbers, the big Launch button, turn numbers, yard caption, report title |
| Instrument Sans Variable | `@fontsource-variable/instrument-sans` (imported in `GameView.tsx`) | `--gv-body`: all body text, buttons, textareas, bubbles, report body |
| System monospace (`ui-monospace, "SF Mono", Menlo, Consolas`) | none | `.path`, the raw-view toggle, the whole raw view |
| `:root` default: `Inter, ui-sans-serif, system-ui, …` | none (Inter isn't installed, so it resolves to system-ui) | Only outside `.gv` (dashboard) |

## Design tokens

### Colour tokens (`.gv` in game.css)

| Purpose | Token | Value |
|---|---|---|
| Page background | `--gv-page` | `#f1f3f4` |
| Header bar bg / ink | `--gv-head` / `--gv-head-ink` | `#27313a` / `#f5f7f8` |
| Card / soft fill | `--gv-card` / `--gv-soft` | `#ffffff` / `#eef1f3` |
| Text / muted text | `--gv-ink` / `--gv-muted` | `#1b2228` / `#5b6670` |
| Lines, borders | `--gv-line` | `#d7dde2` |
| Accent (primary) | `--gv-accent` / `--gv-accent-hover` | `#2d6f73` / `#245b5e` |
| Accent ink / text / soft | `--gv-accent-ink` / `--gv-accent-text` / `--gv-accent-soft` | `#ffffff` / `#28666a` / `#bfe0de` |
| Good (green) | `--gv-good` / `--gv-good-bg` | `#2f7a47` / `#e2f2e6` |
| Bad (red) | `--gv-bad` / `--gv-bad-bg` | `#a3322a` / `#fde6e3` |
| Warn (amber) | `--gv-warn` / `--gv-warn-bg` | `#7a5a00` / `#fff2c2` |

### Type, radius, spacing (`.gv`)

| Token / rule | Value |
|---|---|
| `--gv-display` | `"Bricolage Grotesque Variable", "Instrument Sans Variable", system-ui, sans-serif` |
| `--gv-body` | `"Instrument Sans Variable", system-ui, -apple-system, "Segoe UI", sans-serif` |
| Base size / line height | 17px / 1.45 |
| `--gv-radius` | 14px (panels, header, yard frame) |
| `--gv-gap` | 14px |
| Page | max-width 1880px, padding 14px 18px 18px; 3 columns `300px \| 1fr \| 350px` (single column ≤1180px; one-screen layout ≥1181px) |

Font sizes in use (literal px, no size tokens): 28 (h1), 26 (stat numbers), 21 (panel h2), 20 (yard caption), 19 (big button), 18.5 (card h2), 17 (base, send button), 16, 15.5, 15, 14, 13.5, 13, 12.5 (labels), 11.5. Weights: 600, 650, 700, 750, 800.
Radii in use (literal): 14 (`--gv-radius`), 12 (cards, prompt bar, turn cards), 11, 10 (buttons, options, notices), 9 (textarea), 7 (chips, status tags), 999px (pills).
Shadows: `.action-card` `0 6px 18px #27313a14`; `.gv-logo` inset `0 0 0 5px var(--gv-accent)`. Panels and cards have no shadow.

### Layout variables (inline from `layout.ts`, `gameLayout`)

`--page-width 1800px`, `--page-padding 20px`, `--gap 16px`, `--card-padding 20px`, `--radius 14px`, `--body-size 18px`, `--title-size 32px`, `--heading-size 23px`, `--stat-size 28px`, `--control-height 46px`, `--input-height 130px`, `--log-height 480px`, `--raw-height 320px`, `--toast-width 430px`, `--toast-height 48vh`, `--yard-controls-width 390px`, `--yard-min-width 660px`, `--yard-top 16px`, `--yard-aspect <canvas w/h>`. Used by styles.css rules (report modal, toasts, base buttons); `.gv` rules mostly use their own literals.

## Components (game page)

| Component | Classes | Styling today |
|---|---|---|
| Header bar | `.gv-top`, `.gv-logo`, `.gv-brand h1/p`, `.gv-actions`, `.gv-link` | `--gv-head` bar, 12px 18px padding, radius 14; logo 38px square (accent-soft with an inset accent ring); h1 28px/800 display; tagline 15.5px `#c7d0d8`; action buttons are ghost buttons with border `#52606d`, hover `#33404b` |
| Mode badge | `.gv-pill.ok / .bad / .info` (text from `modeBadge.ts`: "● Live", "● Recorded run", "● Observing", "● Mock", "○ Offline", "● Syncing") | 14px/700 pill, radius 999; ok `#1f4d3a` on `#a8e7c3`, bad `#5a2622` on `#ffc4bd`, info `#33404b` on `#d6dee6` |
| Primary button | `.gv-btn`, and any `.card button` that isn't an option/link/chip | `--gv-accent` fill, white ink, 1.5px accent border, radius 10, min-height 42, 650 weight; hover `--gv-accent-hover` |
| Big button (Launch) | `.gv-btn.big` | Full width, min-height 50, 19px display font |
| Secondary button | `.gv-btn.ghost`; report `button.secondary` | Transparent, ink text, `--gv-line` border; hover `--gv-soft` |
| Danger button (Stop / Cancel) | `.stop-button`, `.stop-button.armed` (styles.css, not overridden) | White with `#9a2922` text and `#b6372c` border, hover `#ffe5e1`; armed = `#b6372c` fill, white text. Two-click confirm. |
| Raw toggle | `.raw-toggle`, `.raw-toggle.on` | Monospace 15px ghost; on = `--gv-accent-soft` fill, `--gv-head` text |
| Notices | `.gv-notice`, `.gv-notice.bad` | 10px 14px, radius 10; warn colours, or bad colours for engine errors |
| Turns panel | `.gv-panel.gv-chat-panel` > `.gv-chat-scroll` > `.timeline` > `.turn-card(.done/.open)` | Panel: white, `--gv-line` border, radius 14, padding 14, scrolls itself. Timeline: 3px `--gv-line` rail; each turn card is white, radius 12, with a dot on the rail (accent ring; filled when done). Turn number 15px/700 display; state pill 12.5px (done = good colours, open = warn); labels 11.5px uppercase muted; request/summary 15.5px; pending = warn/600 |
| Prompt bar | `.prompt-bar`, `.prompt-row`, `.prompt-suggestions .chip`, `.prompt-bar.working`, `.working-dot` | Static at the bottom of the Turns panel: `--gv-page` bg, 1.5px `--gv-line` border, radius 12, padding 10. Textarea 4.4em, white, radius 9. Send = accent button 17px. Suggestion chips: white, accent text, line border, 14px pill. Working state: `--gv-soft` bg, muted text, pulsing amber dot `#ad8500` (literal) + Stop button |
| Analysis panel | `.gv-panel.gv-analysis` (h2 21px/750) | Same panel look as Turns |
| "Needs you" / "All quiet" | `.gv-needs`, `.gv-label`, `.gv-quiet` | Label 12.5px/700 uppercase .09em, muted |
| Counters | `.gv-stats` (Bricks, Fences, Blocked, …) | 3-column grid, gap 8; tiles `--gv-soft`, radius 11, padding 8px 10px; number 26px display tabular; caption 14px muted |
| Launch | `.gv-launch`, `.gv-btn.big`, `.lock-reason`, `.report-reopen` | Big accent button; lock reason = amber box `#fff3bb` / `#685000` (literal, styles.css) at 15px |
| Fence list | `.gv-fence li`, `.gv-status.planned/.built/.inspecting/.red/.green` | Name left, status tag right (13.5px/700, radius 7): planned soft/muted; built `#f3e7d7`/`#6e421e` (literal); inspecting warn; red bad; green good |
| Contract card | `.card.action-card` (title from the contract), `.gv-label` (Allowed / Removed first), `.gv-btn` Approve, `.gv-adjust` (details/summary + textarea) | White card, radius 12, padding 14, 16px; 2px accent border + soft shadow; Adjust summary in accent text 15px |
| Escalation card | `.card.action-card`, `.gv-counts li.sev-high/.sev-medium`, `.gv-options .option(.recommended)`, `.recommend-label` | Counts list: number bold, high = bad colour, medium = warn colour. Options: full-width, radius 10, 1.5px line border, 15.5px; hover soft. Recommended = accent border + `#e6f2f1` (literal) bg, "★ Recommended" label 13px/750 accent text |
| Finding card | `.card.finding`, `.gv-chip.bad` ("⚠ high · web-packages"), `.gv-btn` fixes; `.finding.fixed` + `.gv-chip.ok` | 6px `--gv-bad` left border. Severity chip: 14px/700, radius 7, bad colours (same colour for every severity). Fixed: good left border + good bg, "✓ Fixed" chip |
| Last blocked | `.gv-block`, `.gv-label`, `.path`, `.tag` | Box radius 11, `--gv-bad-bg`; path mono 15px bad/600; `.tag` (the layer) = `#fff0bf`/`#694b00` (literal, styles.css) |
| Event log | `.gv-log` (details) > `.event-log .event .event-meta` | Summary 15px muted; log max-height 260, 14px; rows border `#d7e0d9`, meta `#53685a` (literals, styles.css) |
| Access report modal | `.report-screen`, `.report-panel`, `.report-header`, `.report-grid`, `.report-section.report-allowed/-blocked/-narrowed/-fixed`, `.report-icon`, `.report-count`, `.report-leaves`, `.report-note`, `.report-actions` | styles.css, with `.gv` only swapping the fonts and the action buttons. Backdrop `#0f1f18d9`; panel `#fbfcf8`, max 1100px, 19px, shadow `0 24px 80px #0008`; title 34px. Sections: white, 2px border, 8px top border; allowed `#397848`/`#205d34`, blocked `#b6372c`/`#9a2922`, narrowed `#ad8500`/`#6b5200`, fixed `#2f6fae`/`#1f4f80`; count pill `#17251e`; "data leaves to" `#5b4a8a` border, chips `#ece8f6`/`#2e2350`; note `#fff3cc`/`#6b4e00` |
| Raw view drawer | `.raw-view`, `.raw-head`, `.raw-tabs`, `.raw-close`, `.raw-filters .raw-chip.ch-*`, `.raw-line`, `.raw-event`, `.json-*`, `.actor-*` | styles.css, not overridden: dark drawer `#0d1410` / `#d8e4dc`, 16px monospace, width ≤760px, shadow. Accent `#7ee2a8`. Channels: hook `#ff7b72`, config `#79c0ff`, sdk `#d2a8ff`, scan `#e3b341`, ai `#56d4dd`, engine `#f0a868`, other `#9fb3a6`. Actors: tini `#79c0ff`, tina `#d2a8ff`, dog `#e3b341`, system `#9fb3a6` |

## Hard-coded colours that bypass the tokens

A token swap in `game.css` would miss all of these.

In `game.css` (inside `.gv`):
- `body:has(.gv)` background `#f1f3f4` (duplicates `--gv-page`)
- header: tagline and `.gv-link` `#c7d0d8`; ghost border `#52606d`; ghost hover `#33404b`
- mode pills: `#1f4d3a`/`#a8e7c3` (ok), `#5a2622`/`#ffc4bd` (bad), `#33404b`/`#d6dee6` (info)
- fence status "built": `#f3e7d7` / `#6e421e`
- recommended option background `#e6f2f1`
- action-card shadow `#27313a14`

From `styles.css`, still visible on the game page (no `--gv-*` override):
- Stop/Cancel button: `#fff`, `#9a2922`, `#b6372c`, hover `#ffe5e1`
- working dot `#ad8500`
- `.lock-reason` `#fff3bb` / `#685000`; `.tag` `#fff0bf` / `#694b00`
- `.link-button` `#205640` (hover `#163d2c`), except inside `.msg` (legacy chat)
- event log rows `#d7e0d9`, `.event-meta` `#53685a`
- the whole access report modal (all colours listed above) and the whole raw view drawer (all colours listed above)
- toasts `#a9392e` border, shadow `#17251e30` (the game page shows toasts statically)
- base textarea border `#899a91` where `.gv` doesn't override it
- focus ring outside `.gv`: `#2563eb` (inside `.gv` it's `--gv-accent`)
- `:root` colour `#182d25`, background `#f2f5f0`, and the base `button` `#205640` (only reached by buttons that no `.gv` rule matches)

Out of scope but worth knowing: `layout.ts` `yardLayout.colors` (Phaser 2D yard palette) and `game3d.css` (3D labels) carry their own literal palettes.
