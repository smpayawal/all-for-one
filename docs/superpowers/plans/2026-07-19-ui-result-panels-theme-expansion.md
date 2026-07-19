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

- [ ] Add tests asserting `PLAN` and `RESULT` are muted normal-weight labels, planning text uses `toolPendingBg`, final text uses `selectedBg`, all rows stay width-bounded, hidden thinking stays compact, and `outputPad: 0` remains unframed.
- [ ] Run `npm --workspace @earendil-works/pi-coding-agent exec -- vitest --run test/assistant-message-foundation.test.ts` and confirm the new planning-panel assertion fails before implementation.
- [ ] Replace the inline planning renderer with one reusable labeled-panel component and route final text through the same composition pattern.
- [ ] Re-run the focused test and confirm it passes.

---

### Task 2: Fix the expanded-action status-marker artifact

**Files:**
- Modify: `packages/coding-agent/src/modes/interactive/components/execution-group.ts`
- Modify: `packages/coding-agent/test/ui-presentation.test.ts`

**Interfaces:**
- Consumes: native renderer lines and existing action status markers.
- Produces: marker insertion after leading ANSI sequences on the first visible native line.

- [ ] Add a regression test rendering a native line with `toolSuccessBg` and assert the background ANSI appears before the `✓` marker.
- [ ] Run `npm --workspace @earendil-works/pi-coding-agent exec -- vitest --run test/ui-presentation.test.ts` and confirm the test fails before implementation.
- [ ] Add a small local helper that preserves leading CSI/OSC sequences while prefixing within the width budget.
- [ ] Re-run the focused test and confirm marker order, duplicate suppression, and exact width bounds pass.

---

### Task 3: Add GitHub Dark and Everforest themes

**Files:**
- Create: `packages/coding-agent/theme/github-dark.json`
- Create: `packages/coding-agent/theme/everforest.json`
- Modify: `packages/coding-agent/test/bundled-themes.test.ts`

**Interfaces:**
- Produces registered theme names `GitHub Dark` and `Everforest` through the existing package theme-resource loader.

- [ ] Add failing tests for both resource paths, expected names, selector availability, contrast thresholds, distinct semantic surfaces, and continued Light/Automatic support.
- [ ] Run `npm --workspace @earendil-works/pi-coding-agent exec -- vitest --run test/bundled-themes.test.ts` and confirm missing-resource failures.
- [ ] Add GitHub Dark using GitHub Primer semantic dark colors.
- [ ] Add Everforest using the official medium-dark palette.
- [ ] Re-run the theme test and confirm all packaged themes pass.

---

### Task 4: Validate and commit

**Files:**
- Modify: `docs/superpowers/plans/2026-07-19-ui-result-panels-theme-expansion.md`

- [ ] Run the three focused test files together.
- [ ] Run `npm run check`.
- [ ] Run `npm run build`.
- [ ] Render representative Write lifecycle and assistant plan/result flows under Automatic, Dark, Light, Tokyo Night, GitHub Dark, and Everforest.
- [ ] Record commands actually run, observed results, and unavailable checks.
- [ ] Review the final diff for presentation-only scope and commit to `ui/enhancement`.

## Validation record

Pending implementation. Do not mark commands as passed unless their output was observed.
