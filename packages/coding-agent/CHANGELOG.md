# Changelog

## [Unreleased]

### Added

- Added a bounded adaptive repository map that activates from strong deterministic signals, injects temporary read-only orientation without another model call or model tool, and supports `/repo-map auto|once|off|status|show`.
- Added built-in llama.cpp router support with `/login` connection setup and `/llama` Hugging Face model search and downloads, explicit loading, unloading, and live progress. See [llama.cpp](docs/llama-cpp.md).
- Added extension registration for complete pi-ai providers, including native authentication, model refresh, filtering, and streaming behavior.
- Added auto, native, patch, and full coding-tool profiles with explicit CLI/SDK overrides, model-keyed coding behavior settings, and five bundled repository/debugging/verification skills.
- Added automatic model-profile refresh, bounded safe-mode and code-intelligence extension boundaries, settings diagnostics, and focused CI coverage for the All-For-One coding-agent features.

### Fixed

- Fixed prompt-template defaults for all arguments (`${@:-default}` and `${ARGUMENTS:-default}`) ([#6695](https://github.com/earendil-works/pi/issues/6695)).
- Fixed obsolete custom UI, custom tool, and custom editor examples in the extension documentation ([#6735](https://github.com/earendil-works/pi/issues/6735)).
- Fixed Kimi Coding sessions to show API-equivalent implied costs with the subscription indicator.
- Fixed OpenAI Responses early stream endings to trigger automatic retry instead of ending the agent run ([#6727](https://github.com/earendil-works/pi/issues/6727)).
- Fixed extension command capture to bound retained output, preserve stdout and stderr diagnostics, and distinguish timeout, cancellation, signal, and normal exit results.
- Fixed safe-mode authorization to reject shell composition and dangerous mutation forms, and to canonicalize workspace mutation paths through symlinks.

## [0.80.10] - 2026-07-16

### New Features

- **Kimi Coding thinking compatibility** — Kimi Coding models now use adaptive thinking correctly; K3 exposes its supported `max` level and supports replaying empty-signature thinking blocks. See [Kimi For Coding setup](docs/providers.md#api-keys) and [Model Options](docs/usage.md#model-options).

### Fixed

- Fixed inherited Kimi Coding requests to use Anthropic adaptive thinking effort without token budgets, and enabled empty thinking signatures for K3.
- Fixed inherited Kimi K3 pricing metadata for Moonshot AI and Moonshot AI China.
- Fixed inherited Kimi Coding K3 thinking-level metadata to expose only the supported `max` level ([#6737](https://github.com/earendil-works/pi/issues/6737)).
- Fixed inherited catalog generation restoring xAI models removed in 0.80.9 ([#6736](https://github.com/earendil-works/pi/issues/6736)).

## [0.80.9] - 2026-07-16

### New Features

- **Kimi K3 and deferred tool loading** — Use Kimi K3 across built-in providers, including progressive extension tool activation through Kimi’s native protocol. See [Dynamic Tool Loading](docs/extensions.md#dynamic-tool-loading), [OpenAI Compatibility](docs/models.md#openai-compatibility), and the [`kimi-deferred-tools.ts`](examples/extensions/kimi-deferred-tools.ts) example.

### Added

- Added inherited Kimi K3 support for Kimi Coding, Moonshot AI, Moonshot AI China, OpenRouter, and Vercel AI Gateway.
- Added Kimi deferred tool loading for extension-driven tool activation. See [Dynamic Tool Loading](docs/extensions.md#dynamic-tool-loading), [OpenAI Compatibility](docs/models.md#openai-compatibility), and the [`kimi-deferred-tools.ts`](examples/extensions/kimi-deferred-tools.ts) example.

### Changed

- Changed xAI login to use a prefilled device-authorization link labeled “Sign in with SuperGrok or X Premium,” and changed the default xAI model to Grok 4.5 ([#6734](https://github.com/earendil-works/pi-mono/pull/6734) by [@Jaaneek](https://github.com/Jaaneek)).

### Fixed

- Fixed inherited Kimi K3 output limits for Vercel AI Gateway and OpenRouter models.
- Fixed cloning or forking a session before its first assistant response to explain that the session must be saved first.

### Removed

- Removed Grok 3, Grok 3 Fast, Grok 4.20 variants, and Grok Code Fast 1 from the built-in xAI model catalog ([#6734](https://github.com/earendil-works/pi-mono/pull/6734) by [@Jaaneek](https://github.com/Jaaneek)).

## [0.80.8] - 2026-07-16

### New Features

- **Unified model runtime and provider authentication** — `ModelRuntime` centralizes model configuration, provider-owned `/login`, and dynamic provider catalogs. See [Providers](docs/providers.md).
- **Live model catalog refresh** — `/model` refreshes configured providers in the background, and `pi update --models` forces an immediate refresh. See [Install and Manage](docs/packages.md#install-and-manage).
- **xAI device-code OAuth and Grok 4.5 Responses support** — Sign in to xAI with a device code and use Grok 4.5 with low, medium, or high thinking. See [xAI](docs/providers.md#xai-grokx-subscription).

### Breaking Changes

- Replaced the SDK's `CreateAgentSessionOptions.authStorage` and `modelRegistry` options with the async `modelRuntime` option. `AuthStorage` and its storage backends are no longer exported; use `ModelRuntime` (or a custom pi-ai `CredentialStore`), or `readStoredCredential()` for one-off reads of auth.json.
- Removed redundant `ModelRuntime.getAll()`, `find()`, `getSnapshot()`, and `getAuthOptions()` projections. Use the pi-ai `Models` methods `getModels()`, `getModel()`, `getProviders()`, and `checkAuth()` directly.
- Replaced SDK request-auth assembly through `ModelRegistry.getApiKeyAndHeaders()` with `ModelRuntime.getAuth()`. Passing a provider ID returns provider-scoped auth; passing a model also resolves built-in, `models.json`, and extension model headers.
- Changed extension-facing `ModelRegistry.refresh()` from synchronous `void` to `Promise<void>` because `models.json` loading is asynchronous. Extensions must await it before making synchronous registry reads.
- Moved canonical dynamic catalog refresh to async `ModelRuntime.refresh()`/pi-ai `Models.refresh()`. Legacy extension OAuth `modifyModels` remains supported as a synchronous compatibility projection after credential initialization.

### Added

- Added opt-in execution-integrity diagnostics with grounded validation evidence, bounded hidden continuation feedback, and offline baseline/evaluation tooling.
- Added `ModelRuntime` as the canonical async SDK and internal model/auth facade while preserving the synchronous extension-facing `ModelRegistry` API. `ModelRuntime.create()` accepts any pi-ai `CredentialStore` through its `credentials` option.
- Added provider-owned `/login` discovery directly from registered pi-ai providers, including ambient auth status and informational links.
- Added file-backed dynamic catalogs in `models-store.json`, per-provider pi.dev catalog overlays, and Radius gateway support including offline migration from legacy credential-cached catalogs.
- Added extension provider `refreshModels(context)` support for dynamic model discovery with optional provider-controlled persistence.
