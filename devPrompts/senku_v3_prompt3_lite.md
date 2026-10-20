# SENKU V3 — PROMPT 3-LITE: SMALL FIXES (paste this whole message into the agent chat)

You are continuing work on **Senku** (Electron + Vite + TypeScript, vanilla TS renderer). Fix exactly the 5 items below. **Do not touch storage, the Home/Overview layout, or anything not listed.**

## Identity law
Senku is **quiet**: almost-empty UI. When in doubt, remove. No new colors, fonts, shadows, animations, emoji, labels, badges or helper text. Reuse CSS variables (`--bg --surface --ink --muted --soft --line --hover --green`). Do not ask me questions; pick the simplest option and report it.

## Rules
Run the project's typecheck/build after each item; never leave it non-compiling. Delete CSS/code you orphan. Final report: per item, files + function/selector names, assumptions, and what you could not verify visually.

## 1 — Greeting with an empty name
Today an empty name renders `Good morning, .`. In `renderGreeting` (utils.ts): when `userName` is empty/whitespace, remove the `{name}` token **together with the separator before it** (`, ` or one space), and make sure the sentence still ends cleanly (`Good morning.`). Handle `{name}` mid-sentence too. Do not change stored settings.

## 2 — Launchpad chips show the wrong icon
A file like `Screenshot (56).png` is shown with a folder emoji.
- Extend `path:exists-many` to return `Record<string, 'file' | 'folder' | 'missing'>` (use `fs.stat` in main.ts; update `preload.ts`, `src/env.d.ts`, the cache helpers in `state.ts`, and the usage in `markup.ts`; `missing` replaces the old `false`).
- In `launchpadCardMarkup`: remove the emoji icons. Folder chips use the existing `iconSvg('folder')`; file chips use `iconSvg(fileKind(...))` of the file's extension (reuse the existing file-icon logic); URL chips show **no icon**, only the hostname. Icon size 14px, `currentColor`, `--muted`.
- Missing paths keep the dashed/muted style.

## 3 — Remove remaining emoji
Grep `src/` for emoji used as icons (`📁 🌐 🗑 📖 ⏳` and similar). Remove each or replace with an existing SVG/text glyph already used in the app. `⏳ Opening…` on the Launch button becomes plain `Opening…`. Do not add new icon assets.

## 4 — Remove redundant headings
Remove the `QUIET LOG` kicker + `Timeline` title from the Log panel, and the `LAUNCHPADS` kicker + `Quick Launch` title from the Launchpads panel (the sidebar already says where you are). The Log panel starts directly with its compose/filter row; the entry count becomes small muted text at the far right of that row. The Launchpads panel starts directly with the list; keep the `+` add button, right-aligned in a thin row above the list. Keep the `NOTES` kicker in the Notes sidebar.

## 5 — Lighter topbar
In `style.css`: the quick-note (✎), refresh (↻) and avatar buttons are 32px. The ✎ and ↻ buttons have **no background or border** (transparent; `--hover` background on hover only). The avatar stays filled but 32px. The Space name is plain text in `--muted` (no pill border/background); the "+ Add Space" empty-state button keeps its current style. Date on the left and the divider line stay.

## Definition of done
Zero TypeScript errors. Greeting reads `Good morning.` with no name and `Good morning, Vivek.` with one. A `.png` in a launchpad shows a file icon, a folder shows a folder icon, a URL shows only its hostname. No emoji icons in the UI. Log and Launchpads have no kicker+title headings. Topbar buttons are light and 32px. No dead CSS left.

Start with item 1 now.
