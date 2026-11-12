---
name: release-note
description: Write a release note for this project (release-notes/*.md) and tag it with the roles it is relevant to. Use when a feature or fix should be announced to users, e.g. "write a release note", "add a release note", "/release-note <what changed>".
---

# Write a release note

Notes live in `release-notes/YYYY-MM-DD-<slug>.md` (today's date, lowercase slug with dashes). See README "Release notes" for how they are shown.

## 1. Decide whether a note is needed

Small tweaks get no note. If an unreleased note for the same feature exists, extend it instead of adding a new one (one note per feature).

## 2. Ask who it is relevant for

Ask the author which roles the change concerns (multi-select): **everyone**, `member`, `team_lead`, `admin`.

- Bug fixes: default to `admin` only. The author can override.
- Everyone / nothing selected: no tag (all users see it).
- Everyone counts as `member` besides their own roles (also when signed out), so `member` reaches all users; list every other role that should see the note.

## 3. Write the file

```md
---
roles: team_lead, admin
---
# Short title

Text in German, informal "Du", short bullets, **bold** key terms.
```

Omit the front matter block for notes meant for everyone. Valid roles: `admin`, `team_lead`, `member` (anything else fails the build). Signed-out users and local data mode are treated as `member`.

## 4. Check

Run the build/tests (`mise run`) so a bad name, title or role fails early.
