---
name: backlog-issue
description: Add an issue to this project's GitHub backlog (achimgrimm/badminton-results). Use when the user wants to note a bug, idea, feature request or todo for later, e.g. "add to the backlog", "create an issue", "remember this for later", "/backlog-issue <text>".
---

# Add an issue to the backlog

The backlog is the list of open issues in `achimgrimm/badminton-results` with the label `backlog`. Use the `gh` CLI (already logged in).

## 1. Understand the request

Take the description from the skill arguments or the conversation. If it is too vague to write a useful title, ask one short question; otherwise go ahead.

## 2. Look for duplicates

```sh
gh issue list --state open --search "<two or three keywords>" --limit 5
```

If something similar exists, name it (number and title) in the draft and ask whether to create a new issue anyway.

## 3. Draft the issue

Always in **English**, even if the request was in German.

- **Title**: imperative, plain words, at most 70 characters, no prefix. Example: "Show hall address in shared match plan".
- **Body** (Markdown), from the user's point of view:
  - `## Problem` for a bug (what goes wrong, where, on which device if known) or `## Idea` for anything else (what and why).
  - Optional `## Done when` with a short checklist.
  - **No technical details by default**: no file paths, function names, code or implementation approach. Add a `## Technical notes` section only when the user explicitly asks for it.
  - Short. Don't pad it or invent details the user didn't give.
- **Labels**: always `backlog`, plus one fitting existing label: `bug`, `enhancement`, `documentation` or `accessibility`.

## 4. Show the draft and wait

Show title, labels and body. Create the issue only after the user's OK; apply any changes they ask for first.

## 5. Create it

```sh
# first run only: make sure the label exists
gh label create backlog --description "Planned for later" --color c5def5 2>/dev/null || true
```

Write the body to a file in the scratchpad directory (avoids quoting problems), then:

```sh
gh issue create --title "<title>" --label backlog --label <type> --body-file <file>
```

Report the issue number and URL.

## Don'ts

- Don't change code, commit or push as part of this skill.
- Write `@name` only for real GitHub logins.
