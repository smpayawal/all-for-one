# UI Result Panels and Theme Expansion Design

## Goal

Finish the current interactive-TUI refinement by grouping all visible assistant output consistently, removing the status-marker background artifact in expanded tool cards, retaining a readable Light theme for Automatic mode, and adding two focused dark palettes without changing runtime behavior.

## Approved direction

Use **Option A**:

- keep and refine the built-in Light theme because Automatic mode resolves separate light and dark targets;
- add **GitHub Dark**, based on GitHub Primer's semantic dark palette;
- add **Everforest**, based on the official Everforest medium-dark palette and selected because OpenCode also treats Everforest as a supported built-in theme;
- keep the theme set lightweight and do not add a theme framework or new dependencies.

## Scope and ownership

All changes remain in `packages/coding-agent` presentation code, bundled theme resources, and focused tests.

The implementation will not change:

- providers, model selection, the agent loop, or tool execution;
- session formats, extensions, skills, SDK, or RPC behavior;
- Pi-compatible command, package, path, or environment-variable identifiers;
- `ctrl+o` expansion behavior or native tool-renderer ownership;
- terminal image handling.

## Assistant-output hierarchy

Visible assistant output uses a consistent labeled-panel pattern:

- labels such as `PLAN` and `RESULT` are muted, normal-weight metadata;
- visible planning/analysis text is placed in a bounded panel using the existing planning surface;
- final text remains in the existing result panel;
- hidden thinking remains compact and unframed;
- `outputPad: 0` remains unframed for compatibility;
- branch summaries, compaction summaries, and extension custom messages keep their existing card components because they are already bounded semantic containers.

This change groups assistant output without parsing or rewriting model text.

## Tool-card artifact fix

The square behind the expanded action status marker is caused by composition order: the marker is emitted before the native tool line's leading background ANSI sequence, so it receives the outer group background instead of the native success, pending, or error surface.

The fix inserts the status marker after leading ANSI control sequences on the first visible native line. This preserves:

- the native renderer's background;
- status foreground color;
- ANSI and OSC content;
- width bounds;
- subsequent lines and separators;
- unknown/custom tool rendering.

No component-specific color patch is added.

## Theme design

### Light and Automatic

Light remains a built-in theme. Automatic continues resolving `lightTheme/darkTheme` based on detected terminal appearance. Existing Light contrast values remain the compatibility baseline; focused tests continue checking body, result, muted, and semantic-surface contrast.

### GitHub Dark

Use GitHub's familiar semantic roles:

- workspace/card surfaces derived from `#0d1117`, `#161b22`, and `#21262d`;
- primary and muted text derived from `#c9d1d9` and `#8b949e`;
- accent and state colors derived from GitHub blue, green, red, yellow, and purple roles.

### Everforest

Use the official medium-dark Everforest palette:

- workspace/card surfaces derived from `bg0`, `bg1`, and `bg2`;
- foreground and muted text derived from `fg`, `grey2`, and `grey0`;
- semantic accents derived from Everforest red, yellow, green, aqua, blue, and purple.

## Testing

Focused tests cover:

- `PLAN` and `RESULT` as muted metadata;
- planning/analysis and final text inside bounded panels;
- hidden-thinking and zero-padding compatibility;
- marker placement after the native background ANSI sequence;
- exact width bounds for expanded groups;
- loading and registration of GitHub Dark and Everforest;
- continued availability of Light and Automatic resolution;
- representative WCAG contrast thresholds and distinct semantic surfaces.

## Acceptance criteria

- Visible planning/analysis and final result text use consistent bounded containers.
- Labels remain visually secondary to content.
- Expanded Write, Read, Edit, Bash, and custom-tool markers do not show a mismatched square background.
- Light remains available and Automatic still resolves a light target.
- GitHub Dark and Everforest appear in the theme selector and package resources.
- Focused tests, repository checks, build, and live visual checks are recorded honestly; unavailable checks are not claimed.
