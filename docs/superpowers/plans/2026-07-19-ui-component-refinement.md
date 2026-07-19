# Prototype-Aligned UI Component Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the interactive TUI's cards, panels, grouping, and typographic hierarchy to more closely match `preview.html` without changing runtime behavior, tool expansion behavior, sessions, extensions, or package boundaries.

**Architecture:** Keep all changes in `packages/coding-agent/src/modes/interactive`. Existing runtime-owned components continue supplying data and native tool output. New presentation wrappers only add width-bounded backgrounds, borders, labels, spacing, and hierarchy.

**Tech Stack:** TypeScript, `@earendil-works/pi-tui`, Vitest, ANSI terminal rendering.

## Global Constraints

- Preserve the existing architecture and functionality.
- Focus only on UI/UX refinements.
- Keep current execution-group expansion behavior unchanged.
- Continue using native tool renderers for detailed output.
- Do not add dependencies or modify provider, agent-loop, session, extension, SDK, or RPC behavior.
- Keep every rendered line bounded to the supplied terminal width.

---

### Task 1: Refine expanded execution cards

**Files:**
- Modify: `packages/coding-agent/src/modes/interactive/components/execution-group.ts`
- Test: `packages/coding-agent/test/ui-presentation.test.ts`

**Interfaces:**
- Consumes: `formatToolActionSummary(action, width): string`, `ToolExecutionComponent.render(width): string[]`.
- Produces: unchanged `ExecutionGroupComponent.render(width): string[]`.

- [ ] Add a focused rendering test requiring a distinct compact action header, a darker native-output body, separation between expanded actions, and exact width bounds.
- [ ] Run the focused test and confirm it fails because expanded actions are still rendered as one uniform tool-body surface.
- [ ] Update `renderExpandedAction` to render a compact metadata header from existing structured tool arguments, followed by the unchanged native renderer inside a darker body panel.
- [ ] Add a one-row separator between expanded actions without changing the number or ordering of actions.
- [ ] Run execution-group and UI-presentation tests.
- [ ] Commit as `refactor(ui): refine execution action cards`.

### Task 2: Add assistant plan and result panels

**Files:**
- Create: `packages/coding-agent/src/modes/interactive/components/inset-panel.ts`
- Modify: `packages/coding-agent/src/modes/interactive/components/assistant-message.ts`
- Test: `packages/coding-agent/test/assistant-message-foundation.test.ts`

**Interfaces:**
- Produces: `InsetPanelComponent` accepting a child `Component`, a left-border theme color, background theme token, horizontal inset, and internal padding.
- Preserves: `AssistantMessageComponent` constructor and public setters.

- [ ] Add tests requiring visible thinking to begin with a `PLAN` label and final assistant text to render inside a blue-bordered, width-bounded result panel.
- [ ] Run the focused test and confirm it fails because thinking is unlabeled and assistant text is currently unframed Markdown.
- [ ] Implement the reusable width-bounded inset panel.
- [ ] Render thinking through a prefixed planning presentation while preserving Markdown wrapping and hidden-thinking behavior.
- [ ] Render assistant text through the result panel while preserving OSC 133 zones, stop-reason messages, and tool-call ordering.
- [ ] Run assistant-message and transcript rendering tests.
- [ ] Commit as `refactor(ui): add assistant plan and result panels`.

### Task 3: Refine session-rail typographic hierarchy

**Files:**
- Modify: `packages/coding-agent/src/modes/interactive/components/session-rail.ts`
- Test: `packages/coding-agent/test/session-rail-style.test.ts`
- Test: `packages/coding-agent/test/session-rail-enhancement.test.ts`

**Interfaces:**
- Preserves: `SessionRailComponent` data shape and responsive height rules.

- [ ] Add tests requiring section values to be indented beneath uppercase headings, lifecycle status to retain semantic color, and resource lists to remain whole when height permits.
- [ ] Run the focused tests and confirm they fail because body values currently align too closely with headings.
- [ ] Add consistent body indentation and compact secondary metadata styling.
- [ ] Preserve section priority, shortcut placement, width bounds, and short-terminal omission behavior.
- [ ] Run all rail, app-shell, and responsive-layout tests.
- [ ] Commit as `refactor(ui): strengthen session rail hierarchy`.

### Task 4: Final validation

**Files:**
- Review only the files changed by Tasks 1-3.

- [ ] Run focused coding-agent UI tests.
- [ ] Run `npm run check`.
- [ ] Run `npm run build`.
- [ ] Compare `ui/enhancement` against the pre-refinement head and confirm there are no runtime or provider changes.
- [ ] Inspect renders at 80, 128, 160, and 239 columns with AFO Midnight and Catppuccin Mocha.
- [ ] Report tests that ran, tests that could not run, and the exact commit range.