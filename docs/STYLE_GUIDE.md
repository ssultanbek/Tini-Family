# Tini Family — Interface Style Guide ("Iris & Fog")

Scope: the game page chrome (everything under `.gv`, plus the `styles.css` pieces the game page still shows). The 3D yard is untouched. Everything here is CSS-only: new token values in `game.css`, a few new fonts, and overrides for the literal colours listed in `CURRENT_STYLE.md`.

The idea in one line: a cool, faintly lilac "fog" page, crisp white cards with hairline borders, one confident iris-violet accent, and tinted status pills (tint fill + slightly darker border + dark text). Soft like a notebook, strict like a clinical dashboard. Violet was chosen because it is the one hue the yard (green / wood / sky) and the status colours (green / red / amber / gray) don't already use, so the accent never gets confused with a status.

All text/background pairs below were checked: every text pair is ≥ 4.5:1 (most are 6–8:1), so it holds up on a washed-out projector.

---

## 0. Install (offline, npm only)

```bash
npm i @fontsource-variable/manrope @fontsource-variable/fraunces @fontsource-variable/jetbrains-mono
```

In `GameView.tsx`, replace the two current font imports with:

```ts
import "@fontsource-variable/manrope";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/jetbrains-mono";
```

(Bricolage and Instrument Sans can be uninstalled afterwards; nothing else needs them.)

---

## 1. Design tokens

Paste this at the top of `game.css`, replacing the existing `.gv { --gv-… }` block. Existing token names are kept, so every current `.gv` rule picks up the new look automatically. New tokens are added below them.

```css
.gv {
  /* ---------- Neutrals ---------- */
  --gv-page:        #F6F5F9;   /* fog: faintly lilac-gray page */
  --gv-card:        #FFFFFF;   /* panels, cards */
  --gv-soft:        #EFEDF4;   /* stat tiles, hovers, inset areas */
  --gv-sunken:      #F9F8FB;   /* prompt bar, input wells */
  --gv-line:        #E3E1EA;   /* hairline borders (decorative) */
  --gv-line-strong: #8F8B9E;   /* input borders, checkboxes: 3.3:1, meets non-text AA */
  --gv-ink:         #1B1A24;   /* main text, 15.9:1 on page */
  --gv-muted:       #5A5766;   /* secondary text, 6.5:1 on page */
  --gv-faint:       #8F8B9E;   /* placeholders, disabled only, never body copy */

  /* ---------- Header ---------- */
  --gv-head:        #FFFFFF;   /* header is now a light bar, not a dark one */
  --gv-head-ink:    #1B1A24;

  /* ---------- Accent: Iris ---------- */
  --gv-accent:        #5B45D6; /* buttons, focus, links. White on it 6.4:1 */
  --gv-accent-hover:  #4A36BC;
  --gv-accent-press:  #3E2DA3;
  --gv-accent-ink:    #FFFFFF;
  --gv-accent-text:   #4431B0; /* accent-coloured text on light surfaces */
  --gv-accent-soft:   #ECE8FC; /* highlighted card fill, selected chip */
  --gv-accent-line:   #C9BFF5; /* border for accent-soft surfaces */
  --gv-accent-ring:   rgb(91 69 214 / .28);

  /* ---------- Status (text / bg / border / solid) ---------- */
  /* green = safe, allowed, passed */
  --gv-good:        #1C6B3A;
  --gv-good-bg:     #E3F4E8;
  --gv-good-line:   #B4DEC1;
  --gv-good-solid:  #23824A;

  /* red = blocked, needs fix */
  --gv-bad:         #A3262A;
  --gv-bad-bg:      #FDE8E6;
  --gv-bad-line:    #F3BDB7;
  --gv-bad-solid:   #C8322F;

  /* amber = inspecting, warning, narrowed */
  --gv-warn:        #6B4B00;
  --gv-warn-bg:     #FFF2C4;
  --gv-warn-line:   #EDCB6B;
  --gv-warn-solid:  #D39A00;  /* dots and bars only, never text */

  /* gray = planned, idle */
  --gv-plan:        #53505C;
  --gv-plan-bg:     #EFEEF2;
  --gv-plan-line:   #D8D6DF;
  --gv-plan-solid:  #9A97A6;

  /* supporting hues, tied to the yard */
  --gv-wood:        #6B3F1F;  /* fence "built" */
  --gv-wood-bg:     #F4E7DA;
  --gv-wood-line:   #DDC3A7;
  --gv-sky:         #1D5A85;  /* "data leaves to", info */
  --gv-sky-bg:      #E2F0F9;
  --gv-sky-line:    #B3D5EC;

  /* ---------- Type ---------- */
  --gv-display: "Manrope Variable", system-ui, -apple-system, "Segoe UI", sans-serif;
  --gv-body:    "Manrope Variable", system-ui, -apple-system, "Segoe UI", sans-serif;
  --gv-serif:   "Fraunces Variable", Georgia, "Times New Roman", serif;
  --gv-mono:    "JetBrains Mono Variable", ui-monospace, "SF Mono", Menlo, Consolas, monospace;

  --gv-fs-xs:   14px;   /* smallest allowed: labels, pills */
  --gv-fs-sm:   15.5px; /* meta, secondary */
  --gv-fs-base: 17px;   /* body */
  --gv-fs-md:   19px;   /* card titles, big button */
  --gv-fs-lg:   22px;   /* panel titles */
  --gv-fs-xl:   28px;   /* app name */
  --gv-fs-stat: 34px;   /* counters */
  --gv-fs-hero: 40px;   /* report title */

  --gv-fw-regular: 450;
  --gv-fw-medium:  550;
  --gv-fw-semi:    650;
  --gv-fw-bold:    750;
  --gv-fw-black:   800;

  --gv-lh-tight: 1.12;  /* stats, big titles */
  --gv-lh-snug:  1.3;   /* headings, buttons */
  --gv-lh-base:  1.5;   /* body */

  --gv-track-tight: -0.02em; /* display sizes ≥ 22px */
  --gv-track-label:  0.06em; /* the only uppercase text: panel section labels */

  /* ---------- Radius (hierarchy: bigger container, bigger radius) ---------- */
  --gv-r-xs:   6px;    /* kbd, code tags */
  --gv-r-sm:   10px;   /* buttons, inputs, options, stat tiles */
  --gv-r-md:   14px;   /* cards */
  --gv-r-lg:   20px;   /* panels, header, modal */
  --gv-r-pill: 999px;  /* badges, chips */
  --gv-radius: var(--gv-r-lg);   /* legacy name */

  /* ---------- Spacing (4px grid) ---------- */
  --gv-s1: 4px;  --gv-s2: 8px;  --gv-s3: 12px; --gv-s4: 16px;
  --gv-s5: 20px; --gv-s6: 24px; --gv-s8: 32px; --gv-s10: 40px;
  --gv-gap: var(--gv-s4);        /* legacy name */

  /* ---------- Shadows (tinted with ink, never pure black) ---------- */
  --gv-shadow-xs: 0 1px 2px rgb(27 26 36 / .05);
  --gv-shadow-sm: 0 1px 2px rgb(27 26 36 / .04), 0 4px 12px -4px rgb(27 26 36 / .08);
  --gv-shadow-md: 0 1px 2px rgb(27 26 36 / .04), 0 12px 28px -10px rgb(27 26 36 / .16);
  --gv-shadow-lg: 0 2px 4px rgb(27 26 36 / .06), 0 32px 72px -16px rgb(27 26 36 / .32);
  --gv-shadow-accent: 0 8px 22px -8px rgb(91 69 214 / .45); /* primary button only */
  --gv-focus: 0 0 0 3px var(--gv-card), 0 0 0 5px var(--gv-accent);

  /* ---------- Motion ---------- */
  --gv-ease: cubic-bezier(.2, .7, .2, 1);
  --gv-t-fast: 120ms;
  --gv-t-med:  200ms;

  font-family: var(--gv-body);
  font-size: var(--gv-fs-base);
  font-weight: var(--gv-fw-regular);
  line-height: var(--gv-lh-base);
  color: var(--gv-ink);
  font-feature-settings: "ss01", "cv11";   /* Manrope: cleaner alternates */
  -webkit-font-smoothing: antialiased;
}

body:has(.gv) {
  background-color: var(--gv-page);
  /* the "meticulous" detail: a barely-there dot grid, 28px pitch */
  background-image: radial-gradient(rgb(27 26 36 / .055) 1px, transparent 1.2px);
  background-size: 28px 28px;
}

.gv :where(h1, h2, h3, .stat-num) {
  font-family: var(--gv-display);
  letter-spacing: var(--gv-track-tight);
  line-height: var(--gv-lh-snug);
}
.gv :where(.stat-num, .gv-stats b, .turn-num) { font-variant-numeric: tabular-nums; }

.gv :focus-visible { outline: none; box-shadow: var(--gv-focus); border-radius: var(--gv-r-sm); }

@media (prefers-reduced-motion: reduce) {
  .gv *, .gv *::before, .gv *::after { transition: none !important; animation: none !important; }
}
```

### Font roles

| Role | Family | Package | Where |
|---|---|---|---|
| Display + body | Manrope Variable | `@fontsource-variable/manrope` | Everything. Display = weight 750–800 with tight tracking; body = 450–550. One family keeps it strict. |
| Warm serif | Fraunces Variable | `@fontsource-variable/fraunces` | Exactly three places: the tagline in the header, the report modal's subtitle, and the "All quiet" empty state. This is the "family" voice. Use regular (400) roman, `font-variation-settings: "SOFT" 100, "WONK" 0`. |
| Mono | JetBrains Mono Variable | `@fontsource-variable/jetbrains-mono` | Paths, the raw view, event log, `.tag`. Nowhere else. |

---

## 2. Component rules

Selectors are the existing ones from `CURRENT_STYLE.md`, so this is a drop-in.

### Global surfaces

**Panels** (`.gv-panel`, Turns and Analysis): `--gv-card` bg, `1px solid var(--gv-line)`, radius `--gv-r-lg`, padding `--gv-s5`, shadow `--gv-shadow-xs`. Panel title `h2`: `--gv-fs-lg` / `--gv-fw-bold`, ink, margin-bottom `--gv-s4`. A panel may have a small count on the right of its title (e.g. "3 turns") in `--gv-fs-sm` muted, like "2 pending" in the reference.

**Cards** (`.card`, inside panels): `--gv-card` bg, `1px solid var(--gv-line)`, radius `--gv-r-md`, padding `--gv-s4 --gv-s5`, shadow `--gv-shadow-sm`. Card title `--gv-fs-md` / `--gv-fw-bold`. Body `--gv-fs-base`, muted for supporting text. Gap between cards `--gv-s3`.

**Highlighted card** (the one that needs the user now, `.card.action-card`): `--gv-accent-soft` bg, `1.5px solid var(--gv-accent)`, shadow `--gv-shadow-md`. Only one highlighted card on screen at a time. This is the "Most popular" treatment from the reference.

**Section label** (`.gv-label`, "Needs you", "Allowed", "Removed first"): `--gv-fs-xs`, `--gv-fw-bold`, uppercase, `--gv-track-label`, colour `--gv-muted`. Inside an action card, use `--gv-accent-text`. This is the only uppercase text in the interface.

### Header bar (`.gv-top`)

- Bar: `--gv-head` (white), `1px solid var(--gv-line)`, radius `--gv-r-lg`, padding `--gv-s3 --gv-s5`, shadow `--gv-shadow-xs`. Height ≈ 68px.
- Logo (`.gv-logo`): 40px square, radius 12px, `--gv-accent` fill with white glyph. Drop the inset ring.
- Name (`.gv-brand h1`): `--gv-fs-xl`, `--gv-fw-black`, ink, tight tracking.
- Tagline (`.gv-brand p`): `--gv-serif`, 17px, `--gv-muted`, no italic. "Your agent gets the keys to the room, not the house."
- Raw / Reset (`.gv-actions button`, `.gv-link`): secondary buttons (below), min-height 40px.
- Replace every literal: `#c7d0d8` → `--gv-muted`; `#52606d` → `--gv-line`; `#33404b` hover → `--gv-soft`.

### Mode badge (`.gv-pill`)

Pill: `--gv-fs-xs`, `--gv-fw-bold`, padding `6px 12px`, radius pill, `1px` border, with a leading 8px dot (`::before` or the existing "●").

| Class | Text | Bg | Border | Dot |
|---|---|---|---|---|
| `.ok` (Live) | `--gv-good` | `--gv-good-bg` | `--gv-good-line` | `--gv-good-solid`, soft pulse (2s) |
| `.info` (Recorded run, Observing, Mock, Syncing) | `--gv-accent-text` | `--gv-accent-soft` | `--gv-accent-line` | `--gv-accent`, no pulse |
| `.bad` (Offline) | `--gv-bad` | `--gv-bad-bg` | `--gv-bad-line` | hollow ring |

### Buttons

All buttons: `--gv-body`, `--gv-fw-semi`, `--gv-fs-base`, min-height 44px, padding `0 var(--gv-s5)`, radius `--gv-r-sm`, `transition: background var(--gv-t-fast) var(--gv-ease), box-shadow var(--gv-t-fast), transform var(--gv-t-fast)`. `:active` → `translateY(1px)`. Disabled: `--gv-soft` bg, `--gv-faint` text, no shadow, `cursor: not-allowed`.

| Kind | Selector | Rest | Hover |
|---|---|---|---|
| Primary | `.gv-btn`, `.card button` (not option/link/chip) | `--gv-accent` bg, `--gv-accent-ink`, no border, `--gv-shadow-accent` | `--gv-accent-hover` |
| Big (Launch) | `.gv-btn.big` | Primary, full width, min-height 56px, `--gv-fs-md`, `--gv-fw-bold` | same |
| Secondary | `.gv-btn.ghost`, header buttons, report `button.secondary`, "Ask for a change" | `--gv-card` bg, ink text, `1px solid var(--gv-line)`, `--gv-shadow-xs` | `--gv-soft` bg, border `--gv-line-strong` |
| Danger (Stop / Cancel) | `.stop-button` | `--gv-card` bg, `--gv-bad` text, `1px solid var(--gv-bad-line)` | `--gv-bad-bg` |
| Danger armed | `.stop-button.armed` | `--gv-bad-solid` bg, white text (5.3:1), no border | `#B02B28` |
| Text link | `.link-button`, `.gv-link` | no bg, `--gv-accent-text`, underline on hover only, offset 3px | |
| Raw toggle | `.raw-toggle` | Secondary, `--gv-mono` 15px | `.on`: `--gv-accent-soft` bg, `--gv-accent-text`, border `--gv-accent-line` |

### Badges and chips (one recipe everywhere)

Tint fill + 1px border one step darker + dark text of the same hue. `--gv-fs-xs`, `--gv-fw-bold`, padding `4px 10px`, radius pill. Optional leading icon (✓ ● ⚠) in the same colour.

| Meaning | Classes | Tokens |
|---|---|---|
| Safe / allowed / passed / fixed | `.gv-chip.ok`, `.gv-status.green`, turn `done` | `--gv-good`, `--gv-good-bg`, `--gv-good-line` |
| Blocked / needs fix | `.gv-chip.bad`, `.gv-status.red` | `--gv-bad` set |
| Inspecting / warning | `.gv-status.inspecting`, turn `open` | `--gv-warn` set |
| Planned | `.gv-status.planned` | `--gv-plan` set |
| Built (fence) | `.gv-status.built` | `--gv-wood` set (replaces `#f3e7d7` / `#6e421e`) |
| Suggestion chip | `.prompt-suggestions .chip` | `--gv-card` bg, `--gv-accent-text`, `--gv-line` border; hover `--gv-accent-soft` + `--gv-accent-line` |
| Layer tag | `.tag` ("simulated attack") | `--gv-mono` 13.5px, `--gv-warn` set, radius `--gv-r-xs` (replaces `#fff0bf` / `#694b00`) |

Severity in finding chips uses different colours per level, like the reference: high → bad set, medium → warn set, low → plan set. The word is always printed; colour is never the only signal.

### Left panel: Turns

- Timeline rail: 2px `--gv-line`, left of the cards.
- Rail dot: 12px circle, `2px solid var(--gv-accent)` on `--gv-card`; done = filled `--gv-good-solid` with no ring; open = `--gv-warn-solid` fill.
- Turn card: card recipe, radius `--gv-r-md`. Turn number `--gv-fs-sm` `--gv-fw-bold` muted ("Turn 3"), state pill right-aligned. Request text `--gv-fs-base` ink; result/summary `--gv-fs-base` muted. Labels inside use the section label style.
- Pending text: `--gv-warn`, `--gv-fw-semi`.

**Prompt bar** (`.prompt-bar`): sticks to the panel bottom. `--gv-sunken` bg, `1px solid var(--gv-line)`, radius `--gv-r-md`, padding `--gv-s3`. Textarea: `--gv-card` bg, `1px solid var(--gv-line-strong)`, radius `--gv-r-sm`, `--gv-fs-base`, padding `--gv-s3`; focus = `--gv-focus`. Send = primary button. Working state (`.prompt-bar.working`): `--gv-soft` bg, muted text, `.working-dot` = `--gv-warn-solid` (replaces `#ad8500`) with a 1.4s opacity pulse, Stop button on the right.
- Status line under the bar: `--gv-fs-sm`, muted, one line, ellipsis.

### Right panel: Analysis

- Counters (`.gv-stats`): 3 tiles, gap `--gv-s2`. Tile: `--gv-soft` bg, no border, radius `--gv-r-sm`, padding `--gv-s3 --gv-s4`. Number `--gv-fs-stat`, `--gv-fw-black`, `--gv-lh-tight`, tabular. Caption `--gv-fs-sm` muted. "Blocked" number turns `--gv-bad` when > 0; otherwise all numbers are ink. Don't colour all three.
- Launch: big primary button. Locked reason (`.lock-reason`): `--gv-warn-bg`, `1px solid var(--gv-warn-line)`, `--gv-warn` text, radius `--gv-r-sm`, `--gv-fs-sm`, leading lock icon (replaces `#fff3bb` / `#685000`).
- Fence list (`.gv-fence li`): rows of name left + status badge right, padding `--gv-s3 0`, `1px solid var(--gv-line)` between rows (not after the last). Name `--gv-fs-base` `--gv-fw-medium`.
- "All quiet" (`.gv-quiet`): centred, `--gv-serif` 18px muted, e.g. "All quiet in the yard." with a small dog glyph if you have one.

### Cards in detail

**Contract card** (`.card.action-card`): highlighted card. Title `--gv-fs-md` `--gv-fw-bold`. "Allowed" / "Removed first" labels in accent-text section style; lists underneath as `--gv-mono` 15px paths in plain ink, one per line. Actions row: Approve (primary) + "Ask for a change" (secondary), gap `--gv-s2`. The `.gv-adjust` details summary is a text link; open state shows the textarea recipe.

**Escalation card**: highlighted card. Counts list (`.gv-counts`): number `--gv-fw-bold` with severity colour (high = `--gv-bad`, medium = `--gv-warn`). Options (`.gv-options .option`): full-width, left-aligned, `--gv-card` bg, `1px solid var(--gv-line)`, radius `--gv-r-sm`, padding `--gv-s3 --gv-s4`, `--gv-fs-base`; hover border `--gv-line-strong` and `--gv-sunken` bg. Recommended (`.option.recommended`): `1.5px solid var(--gv-accent)`, `--gv-card` bg (so it stands out against the lilac card), `--gv-shadow-sm`. `.recommend-label` is a small pill: `--gv-accent` bg, white text, `--gv-fs-xs` `--gv-fw-bold`, text "Recommended" (drop the ★).

**Finding card** (`.card.finding`): normal card with a 4px left border in the severity solid (`--gv-bad-solid` / `--gv-warn-solid` / `--gv-plan-solid`) and radius kept on the right side. Severity chip top-left, fix buttons at the bottom (first = primary, others = secondary). Fixed (`.finding.fixed`): left border `--gv-good-solid`, bg `--gv-good-bg`, "✓ Fixed" chip in good set, fix buttons hidden.

**Last blocked** (`.gv-block`): `--gv-bad-bg` bg, `1px solid var(--gv-bad-line)`, radius `--gv-r-md`, padding `--gv-s4`. Path `--gv-mono` 15.5px `--gv-bad` `--gv-fw-semi`, word-break anywhere. The "simulated attack" `.tag` sits right of the label, amber, so it reads as "this was a test", not a real incident.

**Notices** (`.gv-notice`): warn set, `1px` warn-line border, radius `--gv-r-sm`, padding `--gv-s3 --gv-s4`. `.bad` swaps to bad set.

**Event log** (`.gv-log`): summary `--gv-fs-sm` muted with a chevron. Rows: `--gv-mono` 14px, `1px solid var(--gv-line)` between rows (replaces `#d7e0d9`), meta in `--gv-muted` (replaces `#53685a`).

### Access report modal (`.report-*`)

- Backdrop `.report-screen`: `rgb(27 26 36 / .45)` + `backdrop-filter: blur(6px)` (replaces `#0f1f18d9`).
- Panel `.report-panel`: `--gv-card` bg (replaces `#fbfcf8`), radius `--gv-r-lg`, `--gv-shadow-lg`, padding `--gv-s8`, max-width 1100px, `--gv-fs-base`.
- Header: title `--gv-fs-hero` `--gv-fw-black` tight tracking ("Access report"); one-line subtitle under it in `--gv-serif` 19px muted ("What your agent could touch, and what it couldn't."). Close = secondary button.
- Grid: 2 columns, gap `--gv-s4`; "Data leaves to" spans both columns at the bottom.
- Sections: `--gv-card` bg, `1px solid var(--gv-line)`, radius `--gv-r-md`, padding `--gv-s5`, plus a 4px top border in the section's solid colour (drop the 2px full coloured border). Icon: 36px rounded square in the tint bg with the icon in the text colour. Count pill (`.report-count`): tint bg + text colour of the section (replaces `#17251e`).

| Section | Top border | Icon / count |
|---|---|---|
| Allowed | `--gv-good-solid` | good set |
| Blocked | `--gv-bad-solid` | bad set |
| Narrowed | `--gv-warn-solid` | warn set |
| Fixed | `--gv-accent` | accent set (fixed = "we did something", distinct from plain allowed) |
| Data leaves to | `--gv-sky` | sky set; destination chips `--gv-sky-bg` / `--gv-sky` / `--gv-sky-line` (replaces the purple `#ece8f6` / `#2e2350`) |

- Note (`.report-note`): warn set box, radius `--gv-r-sm`. Actions row right-aligned: primary + secondary.

### Raw view drawer (the one dark surface)

Keep it dark on purpose: it's "under the hood". Violet-black, not hacker green.

| Part | Value |
|---|---|
| Drawer bg / text | `#15141C` / `#E4E2EE` (14.3:1) |
| Muted text, line numbers | `#9D99AD` |
| Borders inside | `#2A2835` |
| Accent (active tab, focus) | `#A897FF` (replaces `#7ee2a8`) |
| Font | `--gv-mono` 15px, line-height 1.55 |
| Radius / shadow | left corners `--gv-r-lg`, `--gv-shadow-lg` |
| Channels | hook `#FF8A80`, config `#8CC8FF`, sdk `#C9B2FF`, scan `#F2C45A`, ai `#6ADBD9`, engine `#F5A874`, other `#9D99AD` |
| Actors | tini `#8CC8FF`, tina `#C9B2FF`, dog `#F2C45A`, system `#9D99AD` |
| Channel filter chips `.raw-chip` | transparent bg, `1px solid #2A2835`, text in channel colour; on = channel colour at 16% alpha bg |

All channel colours are ≥ 7.4:1 on the drawer bg.

### Leftover literals from `styles.css` (override under `body:has(.gv)`)

Scope these as `body:has(.gv) .selector` so they win even if the modal, raw drawer or toasts are portalled outside `.gv`. Also copy the token block onto `body:has(.gv)` (not just `.gv`) so portalled elements can read the variables.

| Literal today | Becomes |
|---|---|
| Toast border `#a9392e`, shadow `#17251e30` | `--gv-bad-line` border, `--gv-shadow-md`, radius `--gv-r-md` |
| Base textarea border `#899a91` | `--gv-line-strong` |
| Focus ring `#2563eb` | `--gv-focus` |
| Base `button` `#205640` | primary button recipe |
| `.link-button` `#205640` / `#163d2c` | `--gv-accent-text` / `--gv-accent-hover` |
| `.action-card` shadow `#27313a14` | `--gv-shadow-md` |
| Recommended option bg `#e6f2f1` | `--gv-card` (with accent border, see above) |
| Mode pill literals | see Mode badge table |

---

## 3. Light mode only

Dark mode is skipped for the demo. The projector favours a light UI, and the raw drawer already gives the one dark moment. If you ever want it, the token names above are the whole surface to redefine.

---

## 4. Do / don't

**Do**
- Use the accent for exactly one thing per view that the user should do next (Approve, Launch, Send). Everything else is secondary.
- Pair every status colour with a word or icon (✓ Allowed, ✕ Blocked, ● Inspecting). Colour-blind judges and washed-out projectors both need it.
- Keep the badge recipe identical everywhere: tint, 1px darker border, dark text, pill. Consistency is what makes it feel meticulously built.
- Let radius grow with the container: 10 (button) → 14 (card) → 20 (panel/modal).
- Use tabular numbers for counters and turn numbers so they don't jitter while updating.
- Keep text at 14px minimum and body at 17px. Test by standing two meters from the laptop.
- Use the serif only for the three warm spots listed. It's the family's voice; used everywhere it stops meaning anything.

**Don't**
- Don't use green, red or amber for decoration, links or the brand. They are reserved for meaning.
- Don't use violet for any status except "Fixed" and "Recorded run". It's the brand, not a verdict.
- Don't put shadows on everything: panels get `xs`, cards `sm`, the one action card `md`, the modal `lg`.
- Don't use gradients, glows, or neon. The only texture is the faint dot grid on the page.
- Don't put amber (`--gv-warn-solid`) or light tints behind white text; solid fills with white text are only accent, bad-solid and good-solid.
- Don't use pure black (`#000`) or pure gray; every neutral carries a hint of violet so the page feels one piece.
- Don't uppercase anything except the small section labels.
- Don't animate on load. Motion only answers the user (hover, press, open) plus the two pulses (Live dot, working dot), and both switch off under reduced motion.
