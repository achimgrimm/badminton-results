---
name: notifications
description: Show messages, confirmations and errors to users of this project. Use whenever UI code needs to tell the user something, report an error or ask for confirmation. Never use the native browser alert(), confirm() or prompt().
---

# Messages and confirmations

## Rule

No native `alert()`, `confirm()` or `prompt()`. They look foreign, block the page and are cramped on tablets. The app has its own dialogs.

## What to use

- **Message or error:** `notice({ title, text })` (one OK button).
- **Confirmation:** `await ask({ title, text, cancel, ok, danger? })` resolves to `true` when confirmed. Use `danger: true` for destructive actions (delete, clear, withdraw).
- Both live in `src/client/online.ts`. Inline page scripts (`src/render/*.ts`, plain JS) use `Online.notice(...)` and `Online.ask(...)`.
- Both render a `.team-dialog.confirm-dialog`; Escape and a click outside close it.

## Wording

- German, informal "Du", short and concrete: what happened and what to do next.
- Titles name the topic ("Konto löschen", "Aufstellung leeren?"), not "Fehler".
- Generic failure: title "Das hat nicht geklappt", text "Bitte versuche es später noch einmal." (or "Bist Du online?" for network actions).
- Confirm buttons name the action ("Leeren", "Entziehen"), the cancel button says "Abbrechen".

## Not a dialog

Small, non-blocking feedback ("Kopiert", "Link kopiert") is a short label change (`flash()` / `copied()` pattern), not a dialog.

## Allowed exceptions

- `prompt("Zum Kopieren:", text)` as the last clipboard fallback (selectable text; spielplan, vorschau, layout share button).
- `confirm()` in `vorschau.ts` only as fallback when `window.Online` is missing.

## Check

`grep -rnE "(^|[^.\w])(alert|confirm)\(" src` should only list the fallback above.
