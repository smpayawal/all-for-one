# Security Policy

All-For-One is an independent coding harness based on Pi. It runs locally inside the security boundary of the current user. The harness retains technical Pi identifiers such as the `pi` CLI, `@earendil-works/pi-*` package names, the `.pi` configuration directory, and `PI_*` environment variables; those identifiers do not make this the official Pi distribution.

The harness can read, write, and execute anything permitted to the user and process that launched it, including shell commands. Approval prompts authorize individual actions but are not a security sandbox. Use a container, virtual machine, or other sandbox for stronger isolation.

Treat repositories, project instructions such as `AGENTS.md`, extensions, skills, shell commands, local configuration, and credentials as trusted inputs only when they have been reviewed. Untrusted content can prompt-inject the agent or cause user-authorized local actions. Do not use the harness with sensitive credentials or untrusted code unless the environment is isolated appropriately.

The local user account and files writable by that account are inside the same trust boundary as the harness. If an attacker can already modify the user's home directory, workspace, shell startup files, environment, `.pi` state, or other local configuration, they can generally influence the harness or other local developer tools. Reports that depend on that prior local write access are not vulnerabilities unless they show that All-For-One grants the access or crosses an operating-system privilege boundary.

## Reporting a Vulnerability

Report suspected vulnerabilities privately through [GitHub Security Advisories for `smpayawal/all-for-one`](https://github.com/smpayawal/all-for-one/security/advisories/new). Do not open a public issue for a security-sensitive report.

Include, when available:

- a description of the issue and its impact;
- reproduction steps, a proof of concept, or relevant logs;
- the affected package, version, commit, or configuration; and
- known mitigations.

For downstream issues, reproduce against the latest `main` branch when possible and include the exact commit SHA. Vulnerabilities in unchanged upstream Pi code may also need to be reported privately to the upstream Pi maintainers through the channel documented by that project.

## Scope

Security issues in this repository, All-For-One-specific changes, Pi-compatible package and CLI code, and their APIs or extension interfaces are in scope when they demonstrate an unexpected privilege boundary crossing, unauthorized access, or unintended disclosure.

The following are expected boundaries or are generally out of scope on their own:

- shell access and local code execution that stay within the current user's permissions;
- prompt injection or malicious instructions from an untrusted repository, project file, extension, or skill;
- behavior that requires prior control of user-managed files, configuration, environment variables, or credentials;
- user-approved or user-initiated local actions; and
- third-party credentials or services not affected by a defect in this repository.

These boundaries do not exclude a report that demonstrates All-For-One itself crossing an operating-system privilege boundary, bypassing an intended authorization check, or exposing data beyond the permissions granted by the user.
