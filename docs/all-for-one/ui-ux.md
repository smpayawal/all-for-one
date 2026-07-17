# All-For-One UI/UX design

## Purpose

Modernize the interactive coding experience without replacing Pi's terminal UI architecture, adding a desktop/web shell, or imposing a permanent rendering cost on print, RPC, or SDK modes.

The design must make the active task, context, capabilities, progress, and errors easier to understand while preserving the speed and keyboard-first behavior of Native Pi.

## Current implementation findings

The existing interactive mode already provides the correct primitives:

- the Pi TUI component system and differential rendering;
- theme discovery, custom themes, hot reload, and terminal background detection;
- configurable editor padding, output padding, autocomplete size, hardware cursor, and terminal image support;
- a branded header with an inline-image fallback;
- a responsive session rail shown only on sufficiently wide terminals;
- collapsible tool output and thinking content;
- selectors for settings, models, sessions, extensions, and trees;
- extension-owned widgets, overlays, headers, footers, commands, and editors.

The improvement should refine these surfaces rather than add another UI framework.

## Design principles

### Terminal native

All-For-One remains a terminal application. It must respect the user's terminal emulator, font, zoom, color capabilities, and accessibility settings.

The harness must not bundle or attempt to force a font family. Font selection belongs to the terminal. All-For-One may document recommended monospaced fonts, but the runtime must rely on normal terminal cells and safe fallback characters.

Nerd Font glyphs, private-use icons, and ligatures must never be required for understanding the interface.

### Progressive disclosure

The default view should show only information needed to continue the current task. Additional context, tool output, diagnostics, and shortcuts remain available through existing expansion and selector mechanisms.

The transcript and editor are primary. The header, rail, status line, and footer support them; they must not compete with them.

### Responsive by default

The UI must remain useful at common terminal sizes without horizontal scrolling or clipped controls.

- Narrow terminals: transcript, status, editor, and footer only.
- Medium terminals: the same primary column with compact metadata in the footer or status line.
- Wide terminals: an optional contextual rail.
- Non-interactive modes: no rail, branded image, or implicit interactive-only state.

### Stable keyboard model

Use Pi's existing keybinding manager and selectors. Do not hardcode key checks or create a second navigation system.

Every action available through a shortcut must remain discoverable through an existing command, selector, or help surface. Mouse support may remain supplemental but is not required.

### Accessible presentation

Themes should target WCAG 2.2 AA contrast for normal text where terminal colors permit it. State must not be communicated by color alone.

Success, failure, pending work, warnings, selected items, and disabled items must use text or symbols in addition to color. Themes must work with terminal default backgrounds and degrade safely when truecolor or inline images are unavailable.

### Low rendering and context cost

UI improvements must not add model tokens. Presentation state remains local to interactive mode. The rail and transcript summaries consume runtime events already produced by the session; they must not trigger additional model calls, repository scans, or background processes.

## Proposed visual system

### Typography policy

All application text uses the terminal's configured monospace font.

The product documentation may recommend fonts such as JetBrains Mono, Iosevka, Berkeley Mono, or the platform default, but no font files are distributed and no rendering assumes a specific font.

Use terminal typography sparingly:

- bold for current section labels and selected controls;
- normal weight for primary content;
- dim text only for non-essential metadata;
- no long all-uppercase prose;
- no decorative ASCII art in the persistent transcript;
- symbols must have ASCII-safe equivalents when necessary.

### Theme family

Keep Native Pi's `dark` and `light` themes unchanged for compatibility and easier upstream comparison.

Add two small bundled All-For-One themes through the native theme loader:

- `all-for-one-dark`
- `all-for-one-light`

Both themes use the existing theme schema and all required tokens. They introduce no runtime dependency.

New installations may resolve to the matching All-For-One theme when no explicit theme is configured. Existing explicit theme selections remain untouched. The implementation must retain a documented setting or first-run choice that allows users to select Native Pi's themes immediately.

Theme requirements:

- readable accent and text contrast;
- distinct pending, success, warning, and error states;
- restrained backgrounds for message and tool blocks;
- consistent syntax and Markdown hierarchy;
- no reliance on saturated color for ordinary text;
- verified behavior on truecolor and 256-color terminals;
- dark and light screenshots or captured TUI fixtures in the implementation review.

A third built-in aesthetic theme is not justified initially. Additional themes belong in Pi packages.

### Spacing and density

Use a compact default density:

- one blank line between major transcript blocks;
- no repeated blank padding inside collapsed tool rows;
- one-cell output padding by default;
- zero or one-cell editor padding based on current Native Pi settings;
- concise headings and labels;
- no persistent panel with empty sections.

Do not add a general layout engine or user-configurable spacing matrix. Existing padding settings remain sufficient.

## Layout proposal

### Welcome header

The current brand header can display a 12 by 6 cell image followed by the title. This is appropriate for an initial welcome state but consumes unnecessary transcript height after work begins.

Replace the persistent large header behavior with two states:

1. Welcome state
   - shown before the first user message;
   - optional inline product mark when terminal images are supported and sufficient height is available;
   - product name, version, selected model, and one concise help hint;
   - text-only fallback everywhere.

2. Working state
   - compact one-line product label or no header when the footer already communicates the necessary state;
   - no repeated logo in the transcript;
   - custom extension headers remain supported through the existing extension API.

No animation, spinner framework, or background asset loading is added.

### Primary transcript

The transcript remains the visual focus.

Presentation rules:

- user and assistant messages retain clear visual separation;
- Markdown hierarchy is visible but restrained;
- long reasoning blocks remain collapsible according to the existing setting;
- code blocks and diffs keep syntax and semantic coloring;
- tool calls render as compact rows before expansion;
- failures automatically expose the actionable part of the error;
- repeated metadata is removed from individual blocks when it is already present in the footer or rail.

### Contextual session rail

Retain the current responsive overlay approach and existing terminal-width boundary. Do not convert the rail into a permanent application sidebar or navigation tree.

Rename and reorganize the rail sections:

- `STATUS`
  - idle, working, retrying, or compacting;
  - current progress when supplied by an extension;
  - completed and failed tool counts.

- `ACTIVITY`
  - active tool calls;
  - the most recent completed or failed calls;
  - concise names only.

- `CONTEXT`
  - active project instruction files and scopes;
  - omitted or conflicting context shown only as a warning count linked to `/context` details.

- `CAPABILITIES`
  - skills loaded for the current task;
  - enabled optional capabilities when relevant;
  - no `AGENTS` label because the primary design is single-agent.

Rail behavior:

- `auto` is the default: show only on wide terminals and only when useful content exists;
- `on` forces display when terminal width permits;
- `off` disables it;
- empty sections are hidden;
- the rail never causes repository reads or model calls;
- the main column remains usable when the rail is absent;
- shortcuts remain at the bottom only when vertical space permits.

Add one `sessionRailMode` setting with `auto`, `on`, and `off`. Avoid additional rail-specific configuration until a concrete need exists.

### Navigation

Retain Pi's command and selector model:

- slash-command autocomplete is the primary command discovery surface;
- `/settings` owns UI preferences;
- `/context` owns detailed context and capability diagnostics;
- model, session, extension, and tree selectors remain separate focused surfaces;
- manual skill invocation remains `/skill:<name>`.

Do not add tabs, a router, a page stack, or a second command palette.

### Footer and status

Keep the footer concise and stable. It should communicate only durable session information such as model, working directory, context usage, and essential mode state.

Transient work belongs in the status indicator or rail. Do not display the same state simultaneously in the header, status line, rail, and footer.

### Tool presentation

Standardize built-in and extension tool rows around the same concepts:

- tool name;
- short target or operation summary;
- pending, success, cancelled, or failed state;
- elapsed time only when useful;
- exit code for shell failures;
- truncation or continuation information when output is incomplete.

Collapsed success rows should normally occupy one line. Failed calls should expose a short error and remain expandable. Detailed outputs remain available through the existing expand interaction.

## Content language

Use short, concrete labels:

- `Working`, not `Agent is currently working on your request`;
- `3 succeeded · 1 failed`, not a verbose activity sentence;
- `Context`, not `Context / Agents`;
- `Capabilities`, not `Available intelligent resources`.

Messages must distinguish:

- what happened;
- whether action is required;
- how to inspect more detail.

Avoid anthropomorphic status copy, celebratory completion language, and claims not supported by fresh command evidence.

## Settings changes

Proposed new setting:

```ts
sessionRailMode?: "auto" | "on" | "off";
```

Existing settings continue to own theme, editor padding, output padding, autocomplete size, thinking visibility, terminal image behavior, and hardware cursor behavior.

Do not add font, animation, panel-width, per-section visibility, or arbitrary CSS-like settings.

## Architecture placement

- Theme JSON files: `packages/coding-agent/src/modes/interactive/theme/`
- Theme loading and selection: existing theme controller and settings manager
- Welcome and compact header: `packages/coding-agent/src/modes/interactive/components/brand-header.ts`
- Rail rendering and responsive layout: `packages/coding-agent/src/modes/interactive/components/session-rail.ts`
- Interactive composition only: `packages/coding-agent/src/modes/interactive/interactive-mode.ts`
- Settings UI: existing settings selector
- Shared rendering primitives: `packages/tui` only when the required behavior is generally useful to Native Pi components

Do not move UI concerns into `packages/agent` or `packages/ai`.

## Non-goals

- Desktop or browser UI
- Bundled fonts
- Nerd Font dependency
- New TUI framework
- Persistent navigation sidebar
- Multiple workspaces or panes
- Animated visual effects
- Automatic screenshots or visual telemetry
- UI behavior in print, RPC, or SDK modes
- A large theme gallery in the core repository

## Acceptance criteria

The UI/UX implementation is ready when:

1. The normal transcript is visibly cleaner without removing existing information.
2. The welcome header does not permanently consume vertical space.
3. The rail remains responsive, optional, and free of model or repository work.
4. Empty rail sections are not rendered.
5. Theme changes use the native schema and preserve Native Pi themes.
6. All essential states remain understandable without color.
7. Narrow terminal behavior is unchanged or improved.
8. Print, RPC, and SDK modes receive no interactive-only layout state.
9. Existing extension headers, footers, widgets, overlays, commands, and custom editors remain compatible.
10. No new runtime dependency is added.