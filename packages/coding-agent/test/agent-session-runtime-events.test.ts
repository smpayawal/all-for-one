import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxToolCall } from "@earendil-works/pi-ai";
import { type FauxResponseStep, fauxAssistantMessage, registerFauxProvider } from "@earendil-works/pi-ai/compat";
import { afterEach, describe, expect, it } from "vitest";
import {
	type CreateAgentSessionRuntimeFactory,
	createAgentSessionFromServices,
	createAgentSessionRuntime,
	createAgentSessionServices,
} from "../src/core/agent-session-runtime.ts";
import { AuthStorage } from "../src/core/auth-storage.ts";
import type { ExecutionIntegritySettings } from "../src/core/execution-integrity.ts";
import { ModelRuntime } from "../src/core/model-runtime.ts";
import { SessionManager } from "../src/core/session-manager.ts";
import { SettingsManager } from "../src/core/settings-manager.ts";
import type {
	ExtensionFactory,
	SessionBeforeForkEvent,
	SessionBeforeSwitchEvent,
	SessionShutdownEvent,
	SessionStartEvent,
} from "../src/index.ts";
import { getMessageText } from "./suite/harness.ts";

type RecordedSessionEvent =
	| SessionBeforeSwitchEvent
	| SessionBeforeForkEvent
	| SessionShutdownEvent
	| SessionStartEvent;

describe("AgentSessionRuntime session lifecycle events", () => {
	const cleanups: Array<() => Promise<void> | void> = [];

	afterEach(async () => {
		while (cleanups.length > 0) {
			await cleanups.pop()?.();
		}
	});

	async function createRuntimeHost(
		extensionFactory: ExtensionFactory,
		options: {
			executionIntegrity?: ExecutionIntegritySettings;
			validationScript?: string;
			responses?: FauxResponseStep[];
		} = {},
	) {
		const tempDir = join(tmpdir(), `pi-runtime-events-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(tempDir, { recursive: true });
		if (options.validationScript !== undefined) {
			writeFileSync(join(tempDir, "package.json"), JSON.stringify({ scripts: { test: options.validationScript } }));
			writeFileSync(join(tempDir, "package-lock.json"), "{}");
		}

		const faux = registerFauxProvider();
		faux.setResponses(
			options.responses ?? [fauxAssistantMessage("one"), fauxAssistantMessage("two"), fauxAssistantMessage("three")],
		);

		const authStorage = AuthStorage.inMemory();
		await authStorage.modify(faux.getModel().provider, async () => ({ type: "api_key", key: "faux-key" }));
		const modelRuntime = await ModelRuntime.create({
			credentials: authStorage,
			modelsPath: join(tempDir, "models.json"),
		});
		const model = faux.getModel();
		modelRuntime.registerProvider(model.provider, {
			baseUrl: model.baseUrl,
			api: model.api,
			models: [
				{
					id: model.id,
					name: model.name,
					api: model.api,
					reasoning: model.reasoning,
					input: model.input,
					cost: model.cost,
					contextWindow: model.contextWindow,
					maxTokens: model.maxTokens,
					baseUrl: model.baseUrl,
				},
			],
		});

		const runtimeOptions = {
			agentDir: tempDir,
			modelRuntime,
			model: faux.getModel(),
			settingsManager:
				options.executionIntegrity === undefined
					? undefined
					: SettingsManager.inMemory({ executionIntegrity: options.executionIntegrity }),
			resourceLoaderOptions: {
				extensionFactories: [extensionFactory],
				noSkills: true,
				noPromptTemplates: true,
				noThemes: true,
			},
		};
		const createRuntime: CreateAgentSessionRuntimeFactory = async ({ cwd, sessionManager, sessionStartEvent }) => {
			const services = await createAgentSessionServices({
				...runtimeOptions,
				cwd,
			});
			return {
				...(await createAgentSessionFromServices({
					services,
					sessionManager,
					sessionStartEvent,
					model: faux.getModel(),
				})),
				services,
				diagnostics: services.diagnostics,
			};
		};
		const runtimeHost = await createAgentSessionRuntime(createRuntime, {
			cwd: tempDir,
			agentDir: tempDir,
			sessionManager: SessionManager.create(tempDir),
		});
		await runtimeHost.session.bindExtensions({});

		cleanups.push(async () => {
			await runtimeHost.dispose();
			faux.unregister();
			if (existsSync(tempDir)) {
				rmSync(tempDir, { recursive: true, force: true });
			}
		});

		return { runtimeHost, faux, tempDir };
	}

	it("emits session_before_switch and session_start for new and resume flows", async () => {
		const events: RecordedSessionEvent[] = [];
		const { runtimeHost } = await createRuntimeHost((pi) => {
			pi.on("session_before_switch", (event) => {
				events.push(event);
			});
			pi.on("session_shutdown", (event) => {
				events.push(event);
			});
			pi.on("session_start", (event) => {
				events.push(event);
			});
		});

		expect(events).toEqual([{ type: "session_start", reason: "startup" }]);
		events.length = 0;

		await runtimeHost.session.prompt("hello");
		const originalSessionFile = runtimeHost.session.sessionFile;
		expect(originalSessionFile).toBeTruthy();

		const newSessionResult = await runtimeHost.newSession();
		expect(newSessionResult.cancelled).toBe(false);
		await runtimeHost.session.bindExtensions({});
		const secondSessionFile = runtimeHost.session.sessionFile;
		expect(events).toEqual([
			{ type: "session_before_switch", reason: "new", targetSessionFile: undefined },
			{ type: "session_shutdown", reason: "new", targetSessionFile: secondSessionFile },
			{ type: "session_start", reason: "new", previousSessionFile: originalSessionFile },
		]);

		events.length = 0;
		expect(secondSessionFile).toBeTruthy();

		const switchResult = await runtimeHost.switchSession(originalSessionFile!);
		expect(switchResult.cancelled).toBe(false);
		await runtimeHost.session.bindExtensions({});
		expect(events).toEqual([
			{ type: "session_before_switch", reason: "resume", targetSessionFile: originalSessionFile },
			{ type: "session_shutdown", reason: "resume", targetSessionFile: originalSessionFile },
			{ type: "session_start", reason: "resume", previousSessionFile: secondSessionFile },
		]);
	});

	it("honors session_before_switch cancellation", async () => {
		const events: RecordedSessionEvent[] = [];
		const { runtimeHost } = await createRuntimeHost((pi) => {
			pi.on("session_before_switch", (event) => {
				events.push(event);
				return { cancel: true };
			});
			pi.on("session_start", (event) => {
				events.push(event);
			});
		});

		expect(events).toEqual([{ type: "session_start", reason: "startup" }]);
		events.length = 0;

		await runtimeHost.session.prompt("hello");
		const originalSessionFile = runtimeHost.session.sessionFile;

		const result = await runtimeHost.newSession();
		expect(result.cancelled).toBe(true);
		expect(runtimeHost.session.sessionFile).toBe(originalSessionFile);
		expect(events).toEqual([{ type: "session_before_switch", reason: "new", targetSessionFile: undefined }]);
	});

	it("runs beforeSessionInvalidate after session_shutdown and before rebindSession", async () => {
		const phases: string[] = [];
		const { runtimeHost } = await createRuntimeHost((pi) => {
			pi.on("session_shutdown", () => {
				phases.push("session_shutdown");
			});
		});
		const oldSession = runtimeHost.session;
		runtimeHost.setBeforeSessionInvalidate(() => {
			phases.push("beforeSessionInvalidate");
			expect(oldSession.extensionRunner.createContext().cwd).toBe(oldSession.sessionManager.getCwd());
		});
		runtimeHost.setRebindSession(async () => {
			phases.push("rebindSession");
		});

		await runtimeHost.newSession();

		expect(phases).toEqual(["session_shutdown", "beforeSessionInvalidate", "rebindSession"]);
		expect(() => oldSession.extensionRunner.createContext().cwd).toThrow(
			"This extension ctx is stale after session replacement or reload. Do not use a captured pi or command ctx after ctx.newSession(), ctx.fork(), ctx.switchSession(), or ctx.reload(). For newSession, fork, and switchSession, move post-replacement work into withSession and use the ctx passed to withSession. For reload, do not use the old ctx after await ctx.reload().",
		);
		runtimeHost.setBeforeSessionInvalidate(undefined);
		runtimeHost.setRebindSession(undefined);
	});

	it("emits session_before_fork and session_start and honors cancellation", async () => {
		const events: RecordedSessionEvent[] = [];
		let cancelNextFork = false;
		const { runtimeHost } = await createRuntimeHost((pi) => {
			pi.on("session_before_fork", (event) => {
				events.push(event);
				if (cancelNextFork) {
					cancelNextFork = false;
					return { cancel: true };
				}
			});
			pi.on("session_shutdown", (event) => {
				events.push(event);
			});
			pi.on("session_start", (event) => {
				events.push(event);
			});
		});

		expect(events).toEqual([{ type: "session_start", reason: "startup" }]);
		events.length = 0;

		await runtimeHost.session.prompt("hello");
		const userMessage = runtimeHost.session.getUserMessagesForForking()[0];
		const previousSessionFile = runtimeHost.session.sessionFile;

		const successResult = await runtimeHost.fork(userMessage.entryId);
		expect(successResult.cancelled).toBe(false);
		expect(successResult.selectedText).toBe("hello");
		await runtimeHost.session.bindExtensions({});
		expect(events).toEqual([
			{ type: "session_before_fork", entryId: userMessage.entryId, position: "before" },
			{ type: "session_shutdown", reason: "fork", targetSessionFile: runtimeHost.session.sessionFile },
			{ type: "session_start", reason: "fork", previousSessionFile },
		]);

		events.length = 0;
		cancelNextFork = true;
		const cancelResult = await runtimeHost.fork(userMessage.entryId);
		expect(cancelResult).toEqual({ cancelled: true });
		expect(events).toEqual([{ type: "session_before_fork", entryId: userMessage.entryId, position: "before" }]);

		events.length = 0;
		cancelNextFork = true;
		const cancelAtResult = await runtimeHost.fork("missing-entry", { position: "at" });
		expect(cancelAtResult).toEqual({ cancelled: true });
		expect(events).toEqual([{ type: "session_before_fork", entryId: "missing-entry", position: "at" }]);
	});

	it("keeps execution integrity off by default and does not queue feedback", async () => {
		const { runtimeHost, faux, tempDir } = await createRuntimeHost(() => {}, {
			responses: [
				fauxAssistantMessage(
					fauxToolCall("edit", { path: "example.ts", edits: [{ oldText: "old", newText: "new" }] }),
					{
						stopReason: "toolUse",
					},
				),
				fauxAssistantMessage("done"),
			],
		});
		writeFileSync(join(tempDir, "example.ts"), "old\n");

		await runtimeHost.session.prompt("edit the file");

		expect(runtimeHost.session.getContextInfo().executionIntegrity).toMatchObject({
			mode: "off",
			mutationCount: 0,
			continuationAttempts: 0,
		});
		expect(runtimeHost.session.messages.filter((message) => message.role === "custom")).toHaveLength(0);
		expect(faux.getPendingResponseCount()).toBe(0);
	});

	it("queues one bounded hidden continuation in enforce mode", async () => {
		const { runtimeHost, faux, tempDir } = await createRuntimeHost(() => {}, {
			executionIntegrity: { mode: "enforce", maxContinuationAttempts: 1 },
			validationScript: 'node -e "process.exit(0)"',
			responses: [
				fauxAssistantMessage(
					fauxToolCall("edit", { path: "example.ts", edits: [{ oldText: "old", newText: "new" }] }),
					{
						stopReason: "toolUse",
					},
				),
				fauxAssistantMessage("done"),
				fauxAssistantMessage("reported limitation"),
			],
		});
		writeFileSync(join(tempDir, "example.ts"), "old\n");

		await runtimeHost.session.prompt("edit the file");

		const snapshot = runtimeHost.session.getContextInfo().executionIntegrity;
		const feedbackMessages = runtimeHost.session.messages.filter(
			(message): message is Extract<typeof message, { role: "custom" }> =>
				message.role === "custom" && message.customType === "execution-integrity-feedback",
		);
		expect(snapshot).toMatchObject({ mode: "enforce", mutationCount: 1, continuationAttempts: 1 });
		expect(feedbackMessages).toHaveLength(1);
		expect(feedbackMessages[0]).toMatchObject({ display: false });
		expect(feedbackMessages[0]?.content).not.toEqual(expect.stringContaining("fake visible user"));
		expect(runtimeHost.session.messages.filter((message) => message.role === "user")).toHaveLength(1);
		expect(faux.getPendingResponseCount()).toBe(0);
	});

	it("does not queue in observe mode", async () => {
		const { runtimeHost, faux, tempDir } = await createRuntimeHost(() => {}, {
			executionIntegrity: { mode: "observe", maxContinuationAttempts: 2 },
			validationScript: 'node -e "process.exit(0)"',
			responses: [
				fauxAssistantMessage(
					fauxToolCall("edit", { path: "example.ts", edits: [{ oldText: "old", newText: "new" }] }),
					{
						stopReason: "toolUse",
					},
				),
				fauxAssistantMessage("done"),
			],
		});
		writeFileSync(join(tempDir, "example.ts"), "old\n");

		await runtimeHost.session.prompt("edit the file");

		expect(runtimeHost.session.getContextInfo().executionIntegrity).toMatchObject({
			mode: "observe",
			mutationCount: 1,
			continuationAttempts: 0,
		});
		expect(runtimeHost.session.messages.filter((message) => message.role === "custom")).toHaveLength(0);
		expect(faux.getPendingResponseCount()).toBe(0);
	});

	it("lets a fresh model-requested validation prevent continuation", async () => {
		const { runtimeHost, faux, tempDir } = await createRuntimeHost(() => {}, {
			executionIntegrity: { mode: "enforce", maxContinuationAttempts: 1 },
			validationScript: 'node -e "process.exit(0)"',
			responses: [
				fauxAssistantMessage(
					fauxToolCall("edit", { path: "example.ts", edits: [{ oldText: "old", newText: "new" }] }),
					{
						stopReason: "toolUse",
					},
				),
				fauxAssistantMessage(fauxToolCall("bash", { command: "npm test" }), { stopReason: "toolUse" }),
				fauxAssistantMessage("done"),
			],
		});
		writeFileSync(join(tempDir, "example.ts"), "old\n");

		await runtimeHost.session.prompt("edit and validate");

		expect(runtimeHost.session.getContextInfo().executionIntegrity).toMatchObject({
			mode: "enforce",
			mutationCount: 1,
			freshPassingValidationCount: 1,
			continuationAttempts: 0,
		});
		expect(runtimeHost.session.messages.filter((message) => message.role === "custom")).toHaveLength(0);
		expect(faux.getPendingResponseCount()).toBe(0);
	});

	it("preserves a real queued follow-up over internal feedback", async () => {
		const { runtimeHost, faux, tempDir } = await createRuntimeHost(() => {}, {
			executionIntegrity: { mode: "enforce", maxContinuationAttempts: 1 },
			validationScript: 'node -e "process.exit(0)"',
			responses: [
				fauxAssistantMessage(
					fauxToolCall("edit", { path: "example.ts", edits: [{ oldText: "old", newText: "new" }] }),
					{
						stopReason: "toolUse",
					},
				),
				fauxAssistantMessage("done"),
				fauxAssistantMessage(fauxToolCall("bash", { command: "npm test" }), { stopReason: "toolUse" }),
				fauxAssistantMessage("real follow-up handled"),
			],
		});
		writeFileSync(join(tempDir, "example.ts"), "old\n");
		let queued = false;
		const unsubscribe = runtimeHost.session.subscribe((event) => {
			if (queued || event.type !== "turn_end" || event.toolResults.length > 0) return;
			queued = true;
			void runtimeHost.session.followUp("real follow-up");
		});

		await runtimeHost.session.prompt("edit the file");
		unsubscribe();

		expect(runtimeHost.session.getContextInfo().executionIntegrity.continuationAttempts).toBe(0);
		expect(runtimeHost.session.messages.filter((message) => message.role === "custom")).toHaveLength(0);
		expect(
			runtimeHost.session.messages.some(
				(message) => message.role === "user" && getMessageText(message) === "real follow-up",
			),
		).toBe(true);
		expect(faux.getPendingResponseCount()).toBe(0);
	});
});
