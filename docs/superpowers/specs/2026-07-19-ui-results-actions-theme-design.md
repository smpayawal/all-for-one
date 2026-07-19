# UI Results, Actions, and Theme Refinement Design

## Goal

Refine the interactive TUI so LLM results, tool actions, and theme surfaces are easier to scan and visually consistent across Automatic, Dark, Light, and Tokyo Night, while preserving Pi-compatible runtime behavior and All-For-One's existing package boundaries.

## Scope

This change is presentation-only and remains inside `packages/coding-agent` interactive UI code and bundled theme resources.

It will:

- reduce the visual weight of `RESULT` labels;
- place final assistant text inside a dedicated result card;
- remove duplicate expanded action summaries when the native tool renderer already repeats the same tool name and target;
- preserve native tool output, expansion, status, image, and error behavior;
- separate application surfaces from result, user-message, and tool-card surfaces;
- improve foreground/background contrast for Dark, Light, and Tokyo Night;
- validate Automatic by confirming it resolves to the corrected light or dark theme path.

It will not:

- change the agent loop, tool execution, sessions, extensions, SDK, RPC, providers, or model behavior;
- change `ctrl+o` expansion behavior;
- parse or rewrite LLM content;
- add dependencies;
- rename Pi-compatible technical identifiers.

## Approved interaction design

### Expanded tool actions

Use the approved **Option A**:

1. Keep the execution-group header.
2. Remove the extra per-action summary row in expanded mode.
3. Keep the native tool renderer as the single source of call details and output.
4. Prefix the native card's first visible line with the structured action status marker.
5. Preserve a small separator between actions.
6. Keep collapsed mode unchanged, because the summary row is still needed when native output is hidden.

This removes repeated `Read`, `Write`, `Edit`, and `Bash` labels without losing path, command, diff, content, truncation, error, or image information owned by native renderers.

### Assistant result hierarchy

The result presentation will use two levels:

- `RESULT` becomes small, muted metadata rather than a competing headline.
- Final assistant Markdown remains the primary content and renders inside a dedicated inset panel with a semantic accent border and a card background distinct from the application surface.

`PLAN` remains a planning label, but its visual weight must stay secondary to delivered result content.

Explicit `outputPad: 0` behavior remains unframed and column-zero for compatibility.

## Theme and surface model

### Surface ownership

The application shell must use a neutral workspace surface, not `customMessageBg`, for the full transcript/editor/footer region.

Semantic surfaces remain:

- workspace: terminal/default background;
- user prompt: `userMessageBg`;
- result card: `customMessageBg`;
- execution group header: `toolPendingBg`;
- successful/error tool output: native tool success/error surfaces;
- selection/action emphasis: `selectedBg`.

The theme system currently has no explicit workspace background token. The implementation should prefer terminal-default background for the shell rather than introducing a new required schema token, avoiding compatibility costs for custom themes.

### Theme requirements

For built-in Dark and Light plus bundled Tokyo Night:

- body text must clearly contrast with its card background;
- muted and dim text must remain readable but subordinate;
- result labels must have less contrast and weight than result body text;
- result, user, selected, pending, success, and error backgrounds must remain visually distinct;
- borders must remain visible without overpowering content;
- Light must not render pale text on a pale workspace or card;
- Tokyo Night must preserve its intended cool-blue/purple identity without collapsing surfaces into one tone.

Automatic is validated through its resolved light/dark target rather than treated as a separate palette.

## Component changes

### `execution-group.ts`

Expanded rendering will stop calling `formatToolActionSummary()` for a standalone header row. It will render the native child component once, then decorate only the first non-empty visible native line with the action status marker.

The decoration must:

- preserve ANSI sequences;
- preserve exact width bounds;
- handle empty native output;
- leave subsequent native lines unchanged apart from existing card padding/background;
- retain collapsed summaries.

### `assistant-message.ts`

- Render `RESULT` with muted foreground and normal weight.
- Keep result Markdown inside `InsetPanelComponent`.
- Ensure the card background differs from the workspace after the shell is corrected.
- Preserve OSC 133 zones, stop-reason messages, hidden thinking, tool-call ordering, and zero-padding behavior.

### `app-shell.ts`

Stop filling the full transcript/editor/footer workspace with `customMessageBg`. Preserve width filling and rail divider behavior while allowing terminal-default background to own the workspace.

Cards and child components continue painting their own semantic backgrounds.

### Theme files

Review and adjust only tokens that demonstrably clash in Dark, Light, or Tokyo Night. Prefer token-value corrections over component-specific color exceptions.

## Data flow and compatibility

Runtime data flow remains unchanged:

`InteractiveMode -> ExecutionGroupComponent / AssistantMessageComponent -> native child renderers -> ApplicationShell`

No new runtime state is introduced. The changes only alter final rendering composition.

Unknown/custom tools continue using their native fallback renderer. If a native action produces no lines, the execution group still renders a bounded empty body row so layout remains stable.

## Testing

Focused tests will cover:

- expanded actions show one tool name/target instead of duplicate summary plus native heading;
- status markers appear on the first native line;
- collapsed actions retain summaries;
- result labels use muted styling and result bodies remain inside bounded panels;
- `outputPad: 0` compatibility;
- workspace rows no longer carry result-card background ANSI;
- all rendered rows remain width-bounded;
- Dark, Light, and Tokyo Night theme files load successfully;
- representative foreground/background pairs meet project contrast thresholds;
- Automatic resolves to corrected light/dark targets.

Validation order:

1. focused component tests;
2. theme-loading and contrast tests;
3. coding-agent UI test set;
4. `npm run check`;
5. `npm run build`;
6. live screenshots in Dark, Light, Tokyo Night, and Automatic at representative terminal widths.

## Risks and mitigations

- **ANSI prefix corruption:** decorate native lines with width-aware string composition and retain existing reset handling.
- **Custom tool regressions:** avoid suppressing or parsing native renderer content.
- **Custom theme compatibility:** do not add a required schema token for workspace background.
- **Light-theme readability:** validate concrete token pairs rather than relying on visual inspection alone.
- **Transcript density:** remove duplication only in expanded mode; preserve collapsed summaries and group-level status.

## Acceptance criteria

- No repeated expanded `Read`, `Write`, `Edit`, or `Bash` heading for the same action.
- Result content is visually stronger than the `RESULT` label.
- Result content has a dedicated card distinct from the workspace.
- Dark, Light, Tokyo Night, and Automatic are readable and internally consistent.
- Existing runtime and interaction behavior remains unchanged.
- Focused tests, type checks, build, and visual checks pass before merge.
