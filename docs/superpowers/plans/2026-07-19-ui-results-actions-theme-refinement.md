# UI Results, Actions, and Theme Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove duplicated expanded tool headings, make assistant results visually primary, and provide readable workspace/card contrast across Automatic, Dark, Light, Tokyo Night, AFO Midnight, and Catppuccin Mocha.

**Architecture:** Keep all behavior inside `packages/coding-agent` presentation code. Execution groups continue delegating to native tool renderers, assistant content continues using Markdown, and the application shell remains responsible only for region composition. Add one optional `workspaceBg` theme token with terminal-default fallback so existing custom themes remain compatible while bundled themes can paint a reliable workspace.

**Tech Stack:** TypeScript, `@earendil-works/pi-tui`, JSON theme resources, Vitest.

## Global Constraints

- Preserve provider, agent-loop, session, extension, SDK, RPC, tool execution, image, and `ctrl+o` behavior.
- Keep Pi-compatible identifiers and package boundaries unchanged.
- Do not add dependencies.
- Do not parse or rewrite LLM or native tool output.
- Expanded actions must show the native renderer once; collapsed actions retain structured summaries.
- Existing custom themes without `workspaceBg` must continue loading.
- Automatic resolves through the corrected light or dark theme.

---

### Task 1: Consolidate expanded tool actions

**Files:**
- Modify: `packages/coding-agent/test/ui-presentation.test.ts`
- Modify: `packages/coding-agent/src/modes/interactive/components/execution-group.ts`

**Interfaces:**
- Consumes: `ToolExecutionComponent.render(width): string[]`, `ExecutionGroupAction.status`, existing `formatToolActionSummary()` for collapsed mode.
- Produces: expanded rendering where the first non-empty native line is prefixed with one status marker and no separate action-summary row exists.

- [ ] **Step 1: Add failing tests**

Add tests asserting that an expanded `read` action renders `Read README.md` only once, prefixes the first native line with `✓`, retains two native action bodies for two actions, preserves separators, and keeps every row exactly width-bounded. Add a collapsed-state assertion proving the summary remains visible when native output is hidden.

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
npm --workspace @earendil-works/pi-coding-agent exec -- vitest --run test/ui-presentation.test.ts
```

Expected: failure because expanded mode still renders both `formatToolActionSummary()` and the native heading.

- [ ] **Step 3: Implement minimal consolidation**

In `renderExpandedAction()`:

- remove the standalone action header row;
- render the native component once;
- find the first non-empty visible native line;
- prefix that line with the structured status marker using the existing status colors;
- keep empty-output fallback, card background, border, separator, ANSI content, and width bounds;
- leave `renderCollapsedAction()` unchanged.

- [ ] **Step 4: Run focused test and verify pass**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/coding-agent/src/modes/interactive/components/execution-group.ts packages/coding-agent/test/ui-presentation.test.ts
git commit -m "refactor(ui): consolidate expanded tool actions"
```

---

### Task 2: Reduce result-label weight and strengthen result cards

**Files:**
- Modify: `packages/coding-agent/test/assistant-message-foundation.test.ts`
- Modify: `packages/coding-agent/src/modes/interactive/components/assistant-message.ts`

**Interfaces:**
- Consumes: `InsetPanelComponent`, existing Markdown theme, OSC 133 markers, `outputPad` compatibility.
- Produces: muted normal-weight `RESULT` metadata followed by a bordered result panel whose Markdown remains the primary content.

- [ ] **Step 1: Add failing tests**

Assert that:

- `RESULT` uses the theme's muted foreground ANSI and not bold styling;
- final Markdown remains inside an inset line beginning with `│`;
- the result card uses `customMessageBg`;
- OSC 133 markers remain present;
- `outputPad: 0` remains unframed and does not show `RESULT`.

- [ ] **Step 2: Run the focused test and verify failure**

```bash
npm --workspace @earendil-works/pi-coding-agent exec -- vitest --run test/assistant-message-foundation.test.ts test/assistant-message.test.ts
```

Expected: failure because `RESULT` currently uses bold `customMessageLabel` styling.

- [ ] **Step 3: Implement minimal hierarchy change**

Render `RESULT` with `theme.fg("muted", RESULT_LABEL)` and normal weight. Keep planning labels, result Markdown, card border, card background, stop reasons, hidden thinking, tool-call ordering, OSC 133, and zero-padding behavior unchanged.

- [ ] **Step 4: Run focused tests and verify pass**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/coding-agent/src/modes/interactive/components/assistant-message.ts packages/coding-agent/test/assistant-message-foundation.test.ts
git commit -m "refactor(ui): prioritize assistant result content"
```

---

### Task 3: Add a compatibility-safe workspace surface

**Files:**
- Modify: `packages/coding-agent/src/modes/interactive/theme/theme.ts`
- Modify: `packages/coding-agent/src/modes/interactive/theme/theme-schema.json`
- Modify: `packages/coding-agent/src/modes/interactive/components/app-shell.ts`
- Modify: `packages/coding-agent/test/app-shell.test.ts`
- Modify: `packages/coding-agent/test/background-fill.test.ts`

**Interfaces:**
- Produces: optional `workspaceBg` in theme JSON, `ThemeBg`, fallback resolution, and shell workspace painting.
- Compatibility: missing `workspaceBg` resolves to terminal-default background (`""`).

- [ ] **Step 1: Add failing tests**

Assert that:

- a theme omitting `workspaceBg` still loads;
- `theme.getBgAnsi("workspaceBg")` resolves to the default-background reset for omitted tokens;
- shell transcript/editor/footer rows use `workspaceBg`, not `customMessageBg`;
- result cards still carry `customMessageBg` independently.

- [ ] **Step 2: Run focused tests and verify failure**

```bash
npm --workspace @earendil-works/pi-coding-agent exec -- vitest --run test/app-shell.test.ts test/background-fill.test.ts
```

Expected: failure because `workspaceBg` is not part of the schema or shell.

- [ ] **Step 3: Implement optional token and shell usage**

- Add optional `workspaceBg` to the theme schema.
- Extend `ThemeBg` with `workspaceBg`.
- Extend fallback resolution to use `""` when absent.
- Include `workspaceBg` in background-key routing.
- Replace shell-wide `customMessageBg` fills with `workspaceBg` while leaving semantic child cards unchanged.

- [ ] **Step 4: Run focused tests and verify pass**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/coding-agent/src/modes/interactive/theme/theme.ts packages/coding-agent/src/modes/interactive/theme/theme-schema.json packages/coding-agent/src/modes/interactive/components/app-shell.ts packages/coding-agent/test/app-shell.test.ts packages/coding-agent/test/background-fill.test.ts
git commit -m "feat(ui): add optional workspace theme surface"
```

---

### Task 4: Harmonize bundled palettes and add Tokyo Night

**Files:**
- Modify: `packages/coding-agent/src/modes/interactive/theme/dark.json`
- Modify: `packages/coding-agent/src/modes/interactive/theme/light.json`
- Modify: `packages/coding-agent/theme/afo-midnight.json`
- Modify: `packages/coding-agent/theme/catppuccin-mocha.json`
- Create: `packages/coding-agent/theme/tokyonight.json`
- Modify: `packages/coding-agent/test/bundled-themes.test.ts`

**Interfaces:**
- Produces bundled themes with explicit workspace/card separation and a registered theme named `tokyonight`.
- Automatic continues resolving to `light` or `dark` through existing `resolveThemeSetting()` behavior.

- [ ] **Step 1: Add failing theme tests**

Add tests that load Dark, Light, AFO Midnight, Catppuccin Mocha, and Tokyo Night; verify `workspaceBg` exists for bundled palettes; verify `tokyonight` appears in available themes; verify Automatic resolution selects light/dark; and calculate representative contrast ratios:

- primary text vs workspace >= 4.5;
- primary result text vs result card >= 4.5;
- muted text vs workspace >= 3.0;
- result card background differs from workspace;
- user, selected, pending, success, and error backgrounds are not all identical.

- [ ] **Step 2: Run theme tests and verify failure**

```bash
npm --workspace @earendil-works/pi-coding-agent exec -- vitest --run test/bundled-themes.test.ts
```

Expected: failure because Tokyo Night and explicit workspace tokens do not yet exist.

- [ ] **Step 3: Update palettes**

- Give Dark a cool neutral workspace with distinct user, result, selected, and tool surfaces.
- Give Light a pale neutral workspace, near-white result card, dark primary text, readable muted text, and distinct tool states.
- Add explicit `workspaceBg` to AFO Midnight and Catppuccin Mocha using their existing terminal vars.
- Add `theme/tokyonight.json` with cool navy workspace, purple/blue accents, readable muted text, and distinct result/tool surfaces.
- Keep token names semantic and avoid component-specific exceptions.

- [ ] **Step 4: Run theme tests and verify pass**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/coding-agent/src/modes/interactive/theme/dark.json packages/coding-agent/src/modes/interactive/theme/light.json packages/coding-agent/theme/afo-midnight.json packages/coding-agent/theme/catppuccin-mocha.json packages/coding-agent/theme/tokyonight.json packages/coding-agent/test/bundled-themes.test.ts
git commit -m "feat(ui): harmonize bundled theme palettes"
```

---

### Task 5: Validate the complete UI refinement

**Files:**
- Modify: `docs/superpowers/plans/2026-07-19-ui-results-actions-theme-refinement.md`

- [ ] **Step 1: Run focused UI tests**

```bash
npm --workspace @earendil-works/pi-coding-agent exec -- vitest --run \
  test/ui-presentation.test.ts \
  test/assistant-message-foundation.test.ts \
  test/assistant-message.test.ts \
  test/app-shell.test.ts \
  test/background-fill.test.ts \
  test/bundled-themes.test.ts \
  test/session-rail-style.test.ts \
  test/session-rail.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run repository checks**

```bash
npm run check
npm run build
```

Expected: both exit successfully.

- [ ] **Step 3: Run live visual checks**

Capture representative renders at 80, 128, 160, and 239 columns for Automatic, Dark, Light, and Tokyo Night. Confirm one tool heading per expanded action, muted `RESULT` metadata, distinct result cards, readable rail text, and no stale background after theme switching.

- [ ] **Step 4: Review final diff**

Confirm the implementation range contains only the plan, interactive presentation code, theme infrastructure/resources, and focused tests. Confirm no provider or runtime behavior changes.

- [ ] **Step 5: Record validation and commit**

Update this plan with commands run, observed results, unavailable checks, and the final commit range.

```bash
git add docs/superpowers/plans/2026-07-19-ui-results-actions-theme-refinement.md
git commit -m "docs(ui): record refinement validation"
```
