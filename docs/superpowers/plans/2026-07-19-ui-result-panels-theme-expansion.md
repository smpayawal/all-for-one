# UI Result Panels and Theme Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group visible assistant planning and result output consistently, remove the expanded-action marker background artifact, retain Light for Automatic mode, and add GitHub Dark plus Everforest.

**Architecture:** Keep changes inside `packages/coding-agent` presentation components and JSON theme resources. Reuse `InsetPanelComponent`, preserve native tool renderers, and add no runtime state or dependencies.

**Tech Stack:** TypeScript, `@earendil-works/pi-tui`, JSON themes, Vitest.

## Global Constraints

- Preserve Pi-compatible identifiers, package boundaries, sessions, extensions, SDK, RPC, providers, and agent behavior.
- Do not parse or rewrite model or tool content.
- Preserve `ctrl+o`, image rendering, hidden thinking, and `outputPad: 0` behavior.
- Retain the built-in Light theme and Automatic light/dark resolution.
- Add no dependencies.

---

### Task 1: Frame visible assistant planning and result content

**Files:**
- Modify: `packages/coding-agent/src/modes/interactive/components/assistant-message.ts`
- Modify: `packages/coding-agent/test/assistant-message-foundation.test.ts`

**Interfaces:**
- Consumes: `InsetPanelComponent`, `Markdown`, existing theme tokens.
- Produces: a private labeled-panel component used by visible `PLAN` and `RESULT` content.

- [x] Add tests asserting `PLAN` and `RESULT` are muted normal-weight labels, planning text uses `toolPendingBg`, final text uses `selectedBg`, all rows stay width-bounded, hidden thinking stays compact, and `outputPad: 0` remains unframed.
- [ ] Run `npm --workspace @earendil-works/pi-coding-agent exec -- vitest --run test/assistant-message-foundation.test.ts` and confirm the new planning-panel assertion fails before implementation.
- [x] Replace the inline planning renderer with one reusable labeled-panel component and route final text through the same composition pattern.
- [ ] Re-run the focused test and confirm it passes.

---

### Task 2: Fix the expanded-action status-marker artifact

**Files:**
- Modify: `packages/coding-agent/src/modes/interactive/components/execution-group.ts`
- Modify: `packages/coding-agent/test/ui-presentation.test.ts`

**Interfaces:**
- Consumes: native renderer lines and existing action status markers.
- Produces: marker insertion after leading ANSI sequences on the first visible native line.

- [x] Add a regression test rendering a native line with `toolSuccessBg` and assert the background ANSI appears before the `✓` marker.
- [ ] Run `npm --workspace @earendil-works/pi-coding-agent exec -- vitest --run test/ui-presentation.test.ts` and confirm the test fails before implementation.
- [x] Add a small local helper that preserves leading CSI/OSC sequences while prefixing within the width budget.
- [ ] Re-run the focused test and confirm marker order, duplicate suppression, and exact width bounds pass.

---

### Task 3: Add GitHub Dark and Everforest themes

**Files:**
- Create: `packages/coding-agent/theme/github-dark.json`
- Create: `packages/coding-agent/theme/everforest.json`
- Modify: `packages/coding-agent/test/bundled-themes.test.ts`

**Interfaces:**
- Produces registered theme names `GitHub Dark` and `Everforest` through the existing package theme-resource loader.

- [x] Add tests for both resource paths, expected names, selector availability, contrast thresholds, distinct semantic surfaces, and continued Light/Automatic support.
- [ ] Run `npm --workspace @earendil-works/pi-coding-agent exec -- vitest --run test/bundled-themes.test.ts` and confirm missing-resource failures.
- [x] Add GitHub Dark using GitHub Primer semantic dark colors.
- [x] Add Everforest using the official medium-dark palette.
- [ ] Re-run the theme test and confirm all packaged themes pass.

---

### Task 4: Validate and commit

**Files:**
- Modify: `docs/superpowers/plans/2026-07-19-ui-result-panels-theme-expansion.md`

- [ ] Run the three focused test files together.
- [ ] Run `npm run check`.
- [ ] Run `npm run build`.
- [ ] Render representative Write lifecycle and assistant plan/result flows under Automatic, Dark, Light, Tokyo Night, GitHub Dark, and Everforest.
- [x] Record commands actually run, observed results, and unavailable checks.
- [x] Review the final diff for presentation-only scope and commit to `ui/enhancement`.

## Validation record

### Observed static checks

- Both new JSON theme resources were fetched back from `ui/enhancement` and inspected after commit.
- Both new themes include every required theme color key from `theme-schema.json`.
- Static WCAG contrast calculations produced:
  - GitHub Dark: text/workspace `11.21`, text/result `9.86`, muted/workspace `5.62`.
  - Everforest: text/workspace `6.40`, text/result `5.57`, muted/workspace `4.44`.
  - Existing Light: text/workspace `14.13`, text/result `12.87`, muted/workspace `5.29`, dim/workspace `3.96`.
- GitHub Dark, Everforest, and Light each retain five distinct user/result/pending/success/error surfaces in the tested palette set.
- A direct ANSI-order simulation confirmed the native background sequence precedes the inserted status marker and the background reset follows it.
- The committed range was reviewed against the pre-change head and contains documentation, interactive presentation code, focused tests, and bundled theme resources only. No provider, agent-runtime, session, extension, SDK, RPC, or tool-execution contract was changed.

### Checks not executed

The available environment did not contain an executable checkout of this GitHub branch and could not access GitHub from the container. A temporary push-triggered validation workflow was committed as a probe, but no workflow run or status became observable through the available GitHub integration; it was removed from the final tree.

Therefore, the following are **not claimed as passed**:

- focused Vitest files;
- `npm run check`;
- `npm run build`;
- live terminal screenshots and interactive theme switching.

Run those commands locally after pulling `ui/enhancement` before merging the branch.
