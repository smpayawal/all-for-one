import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeRuntimeError } from "@earendil-works/pi-agent-core";
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
	AgentSessionEvent,
	ExtensionFactory,
	SessionBeforeForkEvent,
	SessionBeforeSwitchEvent,
	SessionShutdownEvent,
	SessionStartEvent,
} from "../src/index.ts";
import type { RpcEventListener } from "../src/modes/rpc/rpc-client.ts";
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

	it("terminalizes a critical persistence failure after a completed tool call", async () => {
		const { runtimeHost, faux, tempDir } = await createRuntimeHost(() => {}, {
			responses: [
				fauxAssistantMessage(
					fauxToolCall("edit", { path: "example.ts", edits: [{ oldText: "old", newText: "new" }] }),
					{ stopReason: "toolUse" },
				),
				fauxAssistantMessage("unexpected follow-up"),
			],
		});
		writeFileSync(join(tempDir, "example.ts"), "old\n");
		const originalAppendMessage = runtimeHost.session.sessionManager.appendMessage.bind(
			runtimeHost.session.sessionManager,
		);
		runtimeHost.session.sessionManager.appendMessage = (message) => {
			if (message.role === "toolResult") throw new Error("persistence failed");
			return originalAppendMessage(message);
		};
		const sessionEvents: AgentSessionEvent[] = [];
		const sdkEvents: AgentSessionEvent[] = [];
		const rpcListener: RpcEventListener = (event) => sdkEvents.push(event);
		runtimeHost.session.subscribe((event) => {
			if (event.type === "agent_end") {
				sessionEvents.push(event);
				rpcListener(event);
			}
		});

		await runtimeHost.session.prompt("edit the file");

		expect(faux.getPendingResponseCount()).toBe(1);
		expect(runtimeHost.session.messages.filter((message) => message.role === "toolResult")).toHaveLength(1);
		expect(sessionEvents).toHaveLength(1);
		expect(sdkEvents).toHaveLength(1);
		const sessionEnd = sessionEvents.find(
			(event): event is Extract<AgentSessionEvent, { type: "agent_end" }> => event.type === "agent_end",
		);
		const sdkEnd = sdkEvents.find(
			(event): event is Extract<AgentSessionEvent, { type: "agent_end" }> => event.type === "agent_end",
		);
		if (!sessionEnd || !sdkEnd) throw new Error("Expected an agent_end event in session and SDK event streams");
		expect(sessionEnd).toMatchObject({ termination: { reason: "error" } });
		expect(sdkEnd.termination).toEqual(sessionEnd.termination);
		expect(sessionEnd.termination).toEqual(runtimeHost.session.agent.lastRunDiagnostics?.termination);
		const sessionFile = runtimeHost.session.sessionFile;
		expect(sessionFile).toBeTruthy();
		const persistedMessages = SessionManager.open(sessionFile!).buildSessionContext().messages;
		expect(persistedMessages.filter((message) => message.role === "toolResult")).toHaveLength(0);
		expect(
			persistedMessages.filter((message) => message.role === "assistant" && message.stopReason === "error"),
		).toHaveLength(0);
	});

	it("terminalizes extension failures at message_end and turn_end", async () => {
		for (const failureEvent of ["message_end", "turn_end"] as const) {
			const { runtimeHost, faux, tempDir } = await createRuntimeHost(() => {}, {
				responses: [
					fauxAssistantMessage(
						fauxToolCall("edit", { path: "example.ts", edits: [{ oldText: "old", newText: "new" }] }),
						{ stopReason: "toolUse" },
					),
					fauxAssistantMessage("unexpected follow-up"),
				],
			});
			writeFileSync(join(tempDir, "example.ts"), "old\n");
			const runner = runtimeHost.session as unknown as {
				_extensionRunner: {
					emit: (event: { type: string; [key: string]: unknown }) => Promise<void>;
					emitMessageEnd: (event: { type: string; message?: { role?: string } }) => Promise<unknown>;
				};
			};
			const originalEmit = runner._extensionRunner.emit.bind(runner._extensionRunner);
			const originalEmitMessageEnd = runner._extensionRunner.emitMessageEnd.bind(runner._extensionRunner);
			runner._extensionRunner.emit = async (event) => {
				if (failureEvent === "turn_end" && event.type === "turn_end") throw new Error("extension turn_end failed");
				return originalEmit(event);
			};
			runner._extensionRunner.emitMessageEnd = async (event) => {
				if (failureEvent === "message_end" && event.message?.role === "toolResult") {
					throw new Error("extension message_end failed");
				}
				return originalEmitMessageEnd(event);
			};
			const events: Array<{ type: string; termination?: unknown }> = [];
			runtimeHost.session.subscribe((event) => {
				if (event.type === "agent_end") events.push(event);
			});

			await runtimeHost.session.prompt("edit the file");

			expect(faux.getPendingResponseCount()).toBe(1);
			expect(events).toHaveLength(1);
			expect(events[0]).toMatchObject({ termination: { reason: "error" } });
		}
	});

	it.each(["assistant_message_end", "tool_result_message_end", "tool_execution_end", "turn_end"] as const)(
		"persists a paired recovery transcript after %s extension failure",
		async (failureEvent) => {
			const requestedToolCall = fauxToolCall("edit", {
				path: "example.ts",
				edits: [{ oldText: "old", newText: "new" }],
			});
			const { runtimeHost, faux, tempDir } = await createRuntimeHost(() => {}, {
				responses: [
					fauxAssistantMessage(requestedToolCall, { stopReason: "toolUse" }),
					fauxAssistantMessage("recovered after reload"),
				],
			});
			writeFileSync(join(tempDir, "example.ts"), "old\n");

			const runner = runtimeHost.session as unknown as {
				_extensionRunner: {
					emit: (event: { type: string; [key: string]: unknown }) => Promise<void>;
					emitMessageEnd: (event: {
						type: string;
						message?: { role?: string; content?: Array<{ type?: string }> };
					}) => Promise<unknown>;
				};
			};
			const originalEmit = runner._extensionRunner.emit.bind(runner._extensionRunner);
			const originalEmitMessageEnd = runner._extensionRunner.emitMessageEnd.bind(runner._extensionRunner);
			runner._extensionRunner.emit = async (event) => {
				if (failureEvent === "tool_execution_end" && event.type === "tool_execution_end") {
					throw new Error("extension tool_execution_end failed");
				}
				if (failureEvent === "turn_end" && event.type === "turn_end") {
					throw new Error("extension turn_end failed");
				}
				return originalEmit(event);
			};
			runner._extensionRunner.emitMessageEnd = async (event) => {
				const message = event.message;
				const hasToolCall =
					message?.role === "assistant" && message.content?.some((block) => block.type === "toolCall");
				if (failureEvent === "assistant_message_end" && hasToolCall) {
					throw new Error("extension assistant message_end failed");
				}
				if (failureEvent === "tool_result_message_end" && message?.role === "toolResult") {
					throw new Error("extension tool-result message_end failed");
				}
				return originalEmitMessageEnd(event);
			};

			const terminalEvents: AgentSessionEvent[] = [];
			runtimeHost.session.subscribe((event) => {
				if (event.type === "agent_end") terminalEvents.push(event);
			});

			await runtimeHost.session.prompt("edit the file");

			expect(faux.getPendingResponseCount()).toBe(1);
			expect(terminalEvents).toHaveLength(1);
			expect(terminalEvents[0]).toMatchObject({ termination: { reason: "error" } });
			const agentMessages = runtimeHost.session.messages;
			const agentToolCalls = agentMessages.flatMap((message) =>
				message.role === "assistant" && Array.isArray(message.content)
					? message.content.filter((block) => block.type === "toolCall").map((block) => block.id)
					: [],
			);
			const agentResults = agentMessages.filter((message) => message.role === "toolResult");
			expect(agentToolCalls).toEqual([requestedToolCall.id]);
			expect(agentResults.filter((message) => message.toolCallId === requestedToolCall.id)).toHaveLength(1);
			expect(
				agentMessages.filter((message) => message.role === "assistant" && message.stopReason === "error"),
			).toHaveLength(1);
			const inMemoryMessages = runtimeHost.session.sessionManager.buildSessionContext().messages;
			expect(inMemoryMessages).toEqual(agentMessages);

			const sessionFile = runtimeHost.session.sessionFile;
			expect(sessionFile).toBeTruthy();
			expect(existsSync(sessionFile!)).toBe(true);
			const reloadedManager = SessionManager.open(sessionFile!);
			const reloadedMessages = reloadedManager.buildSessionContext().messages;
			expect(reloadedMessages).toEqual(inMemoryMessages);
			expect(
				reloadedMessages.filter(
					(message) => message.role === "toolResult" && message.toolCallId === requestedToolCall.id,
				),
			).toHaveLength(1);
			expect(
				reloadedMessages.filter((message) => message.role === "assistant" && message.stopReason === "error"),
			).toHaveLength(1);

			await runtimeHost.switchSession(sessionFile!);
			await runtimeHost.session.bindExtensions({});
			expect(runtimeHost.session.messages).toEqual(reloadedMessages);
			await runtimeHost.session.prompt("continue after reload");
			expect(faux.getPendingResponseCount()).toBe(0);
		},
	);

	it("normalizes runtime errors in terminal diagnostics and persisted failure messages", async () => {
		const failureText =
			"runtime failed\nAuthorization: Bearer bearer-test-value\napi_key=api-test-value\nOPENAI_API_KEY=sk-test-value";
		const requestedToolCall = fauxToolCall("edit", {
			path: "example.ts",
			edits: [{ oldText: "old", newText: "new" }],
		});
		const { runtimeHost, faux, tempDir } = await createRuntimeHost(() => {}, {
			responses: [fauxAssistantMessage(requestedToolCall, { stopReason: "toolUse" })],
		});
		writeFileSync(join(tempDir, "example.ts"), "old\n");

		const runner = runtimeHost.session as unknown as {
			_extensionRunner: {
				emitMessageEnd: (event: {
					type: string;
					message?: { role?: string; content?: Array<{ type?: string }> };
				}) => Promise<unknown>;
			};
		};
		const originalEmitMessageEnd = runner._extensionRunner.emitMessageEnd.bind(runner._extensionRunner);
		runner._extensionRunner.emitMessageEnd = async (event) => {
			const message = event.message;
			if (message?.role === "assistant" && message.content?.some((block) => block.type === "toolCall")) {
				throw new Error(failureText);
			}
			return originalEmitMessageEnd(event);
		};

		const terminalEvents: AgentSessionEvent[] = [];
		runtimeHost.session.subscribe((event) => {
			if (event.type === "agent_end") terminalEvents.push(event);
		});

		await runtimeHost.session.prompt("edit the file");

		const normalized = normalizeRuntimeError(failureText);
		expect(faux.getPendingResponseCount()).toBe(0);
		expect(terminalEvents).toHaveLength(1);
		const terminalEvent = terminalEvents[0];
		if (!terminalEvent || terminalEvent.type !== "agent_end") throw new Error("Expected an agent_end event");
		expect(terminalEvent.termination).toEqual({ reason: "error", message: normalized });
		expect(runtimeHost.session.agent.lastRunDiagnostics?.termination).toEqual({
			reason: "error",
			message: normalized,
		});
		const inMemoryFailureMessages = runtimeHost.session.messages.filter(
			(message) => message.role === "assistant" && message.stopReason === "error",
		);
		expect(inMemoryFailureMessages).toHaveLength(1);
		expect(inMemoryFailureMessages[0]).toMatchObject({ errorMessage: normalized });

		const sessionFile = runtimeHost.session.sessionFile;
		expect(sessionFile).toBeTruthy();
		const reloadedMessages = SessionManager.open(sessionFile!).buildSessionContext().messages;
		const persistedFailureMessages = reloadedMessages.filter(
			(message) => message.role === "assistant" && message.stopReason === "error",
		);
		expect(persistedFailureMessages).toHaveLength(1);
		expect(persistedFailureMessages[0]).toMatchObject({ errorMessage: normalized });
	});

	it("isolates a throwing session subscriber from internal persistence", async () => {
		const { runtimeHost, faux } = await createRuntimeHost(() => {}, {
			responses: [fauxAssistantMessage("done")],
		});
		const healthyEvents: string[] = [];
		runtimeHost.session.subscribe((event) => {
			if (event.type === "message_end") throw new Error("session observer failed");
		});
		runtimeHost.session.subscribe((event) => {
			healthyEvents.push(event.type);
		});

		await runtimeHost.session.prompt("hello");

		expect(faux.getPendingResponseCount()).toBe(0);
		expect(healthyEvents).toContain("agent_end");
		expect(runtimeHost.session.sessionManager.getEntries().filter((entry) => entry.type === "message")).toHaveLength(
			2,
		);
		expect(runtimeHost.session.agent.lastRunDiagnostics?.termination).toEqual({ reason: "completed" });
	});
});
