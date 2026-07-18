# Context and capabilities

All-For-One keeps the Native Pi single-agent runtime and definition-first tool registry. The default active tools are exactly:

```text
read, bash, edit, write
```

`apply_patch` remains registered as the explicit patch-profile mutation tool. `grep`, `find`, and `ls` remain registered optional read-only capabilities. The removed `changes` capability is not part of the registry, public exports, extension event unions, default prompts, or tests. Repository inspection remains available through Bash and the existing read-only tools.

## Tool selection and ownership

The canonical registry remains one registry; profiles only choose its active built-ins:

| Profile | Active built-ins | Intended mutation strategy |
|---------|------------------|----------------------------|
| `auto` | Follows the resolved model profile | Model-keyed `edit` or `apply_patch` strategy |
| `native` | `read`, `bash`, `edit`, `write` | Precise native edit operations |
| `patch` | `read`, `bash`, `apply_patch`, `write` | Coherent multi-hunk or multi-file patches |
| `full` | All five coding tools | Explicit compatibility/debugging choice |

Use `--tool-profile` or the SDK `toolProfile` for an explicit profile. The default is `auto`, which follows the current model's resolved mutation strategy when the model changes. Use `--tools`/`tools` and `--exclude-tools`/`excludeTools` when an exact allowlist or denylist is required; those explicit selections win over the profile. `codingModelProfiles` settings provide model-keyed `mutationStrategy` and `toolExecution` overrides. Resolution order is explicit session override, matching user setting, catalog metadata when available, then the conservative native/parallel fallback. The current catalog has no coding-behavior metadata, so it does not add provider-specific rules; the resolver keeps a future catalog metadata seam.

The system prompt describes only active mutation tools. `edit` is for precise replacements in one existing file, `write` is for a new file or deliberate full-file replacement, and `apply_patch` is for coherent multi-hunk or multi-file changes. The contract also requires inspection before edits, proportionate validation after code changes, and exact reporting of checks that actually ran.

Source-controlled instructions, architecture decisions, API contracts, and validation commands belong in the repository. Local memory remains explicit project-scoped state for user preferences, corrections, local tool behavior, and temporary reminders; it is not automatically injected into the prompt and must not become a duplicate architecture or policy store.

## Bounded context

Project instructions are loaded from the global file and ancestor chain at startup. Nested instructions are loaded only for path-bearing read/edit/write/grep/find/ls/apply_patch calls within the project root. The scoped tracker bounds active scopes to 8 and scoped prompt content to 32,000 characters. It canonicalizes paths, deduplicates exact content, replaces unrelated sibling scopes, reports sibling conflicts without inferring semantic ownership, and reports omitted/oversized scopes.

The first mutation that discovers a new scope is retried after the scope is active. Read-only discovery can add the scope without that mutation retry. Paths outside the project root are rejected with a warning and are not loaded.

## Adaptive repository orientation

All-For-One includes a hidden repository-map extension in `auto` mode. It does not register a model-callable tool and performs no repository scan or prompt injection for narrow tasks. Strong deterministic signals such as whole-repository architecture analysis, cross-package tracing, broad branch review, or implementation discovery can activate one bounded, read-only orientation message for the next model request. During an initially narrow investigation, the same capability can activate after bounded cross-area exploration shows that no stable mutation target has been found.

Activation uses the current prompt and existing tool activity only; it does not call another model. Generation is limited to fixed `git` argv calls, at most 2,000 tracked paths considered, 200 ranked candidates, 30 represented files, 8 locally extracted symbol names per file, and 6,000 rendered characters. Source bodies are not copied into the map. Project trust is required, filesystem reads reject symlinks and paths outside the canonical workspace, failures fall back to normal Pi behavior, and the generated message is temporary rather than session-persistent.

Use `/repo-map auto`, `/repo-map once`, `/repo-map off`, `/repo-map status`, and `/repo-map show` to inspect or override the behavior. `status` explains activation, skip, error, cache, and size state. `once` forces consideration on the next model request but still respects project trust and repository availability. The default active model tools remain unchanged.

## Skills

Skill bodies remain on-demand. The package now ships five dependency-free first-party skills: `repository-orientation`, `systematic-debugging`, and `verify-before-completion` are available to the model by metadata; `plan-complex-change` and `review-diff` are manual-only. Model-visible metadata keeps the existing character budget, deterministic deduplication, compact fallback, and omitted-skill diagnostics. `--no-skills` disables the bundled set along with other discovered skills.

## Context ownership

Repository instructions and architecture/API contracts stay in source-controlled files. Source and tests are executable truth. Local memory is limited to preferences, repeated corrections, local tool quirks, and temporary reminders; it is not a second repository policy store. Session context is temporary and should retain only the goal, decisions, modified files, command outcomes, blockers, and next action after compaction. See [context ownership](context-ownership.md) and the [settings schema](../../packages/coding-agent/docs/settings.schema.json).

## Prompt and schema diagnostics

`baseline:allforone` measures the current composition. `doctor:allforone` checks default prompt shape, tool metadata/schema presence, empty-skill behavior, custom and no-tools prompts, execution-integrity guidance modes, nested context, and bounded skill metadata. `/context` exposes the runtime measurements through `AgentSession.getContextInfo()`.

No live model-quality or provider-cost improvement is inferred from these structural measurements.
