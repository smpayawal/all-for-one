import {
	type ImageContent,
	type Message,
	type Model,
	type SimpleStreamOptions,
	streamSimple,
	type TextContent,
	type ThinkingBudgets,
	type Transport,
} from "@earendil-works/pi-ai/compat";
import { runAgentLoop, runAgentLoopContinue } from "./agent-loop.ts";
import { normalizeRuntimeError } from "./runtime-error.ts";
import type {
	AfterToolCallContext,
	AfterToolCallResult,
	AgentContext,
	AgentEvent,
	AgentEventListenerFailureMode,
	AgentLoopConfig,
	AgentLoopTurnUpdate,
	AgentMessage,
	AgentRunDiagnostics,
	AgentRunTermination,
	AgentState,
	AgentTool,
	BeforeToolCallContext,
	BeforeToolCallResult,
	ExecutionLimits,
	PrepareNextTurnContext,
	QueueMode,
	StreamFn,
	ToolExecutionMode,
} from "./types.ts";
import { AgentEventHandlerError } from "./types.ts";

export type { QueueMode } from "./types.ts";

function defaultConvertToLlm(messages: AgentMessage[]): Message[] {
	return messages.filter(
		(message) => message.role === "user" || message.role === "assistant" || message.role === "toolResult",
	);
}

const EMPTY_USAGE = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

const DEFAULT_MODEL = {
	id: "unknown",
	name: "unknown",
	api: "unknown",
	provider: "unknown",
	baseUrl: "",
	reasoning: false,
	input: [],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 0,
	maxTokens: 0,
} satisfies Model<any>;

const MAX_LISTENER_ERRORS = 20;
const MAX_LISTENER_ERROR_CHARS = 500;

type MutableAgentState = Omit<AgentState, "isStreaming" | "streamingMessage" | "pendingToolCalls" | "errorMessage"> & {
	isStreaming: boolean;
	streamingMessage?: AgentMessage;
	pendingToolCalls: Set<string>;
	errorMessage?: string;
};

function createMutableAgentState(
	initialState?: Partial<Omit<AgentState, "pendingToolCalls" | "isStreaming" | "streamingMessage" | "errorMessage">>,
): MutableAgentState {
	let tools = initialState?.tools?.slice() ?? [];
	let messages = initialState?.messages?.slice() ?? [];

	return {
		systemPrompt: initialState?.systemPrompt ?? "",
		model: initialState?.model ?? DEFAULT_MODEL,
		thinkingLevel: initialState?.thinkingLevel ?? "off",
		get tools() {
			return tools;
		},
		set tools(nextTools: AgentTool<any>[]) {
			tools = nextTools.slice();
		},
		get messages() {
			return messages;
		},
		set messages(nextMessages: AgentMessage[]) {
			messages = nextMessages.slice();
		},
		isStreaming: false,
		streamingMessage: undefined,
		pendingToolCalls: new Set<string>(),
		errorMessage: undefined,
	};
}

function validateExecutionLimit(value: number | undefined, name: keyof ExecutionLimits): number | undefined {
	if (value === undefined) return undefined;
	if (!Number.isInteger(value) || value <= 0) {
		throw new Error(`Invalid executionLimits.${name}: expected a positive integer`);
	}
	return value;
}

function normalizeExecutionLimits(limits: ExecutionLimits | undefined): ExecutionLimits | undefined {
	if (!limits) return undefined;
	const normalized: ExecutionLimits = {
		maxTurns: validateExecutionLimit(limits.maxTurns, "maxTurns"),
		maxAcceptedToolCalls: validateExecutionLimit(limits.maxAcceptedToolCalls, "maxAcceptedToolCalls"),
	};
	return normalized.maxTurns === undefined && normalized.maxAcceptedToolCalls === undefined ? undefined : normalized;
}

function abortReason(signal: AbortSignal): string | undefined {
	return signal.reason === undefined ? undefined : normalizeRuntimeError(signal.reason);
}

function inferTermination(messages: AgentMessage[]): AgentRunTermination {
	for (let index = messages.length - 1; index >= 0; index--) {
		const message = messages[index];
		if (message.role !== "assistant") continue;
		if (message.stopReason === "aborted") {
			return message.errorMessage ? { reason: "aborted", message: message.errorMessage } : { reason: "aborted" };
		}
		if (message.stopReason === "error") {
			return message.errorMessage ? { reason: "error", message: message.errorMessage } : { reason: "error" };
		}
		break;
	}
	return { reason: "completed" };
}

/** Options for constructing an {@link Agent}. */
export interface AgentOptions {
	initialState?: Partial<Omit<AgentState, "pendingToolCalls" | "isStreaming" | "streamingMessage" | "errorMessage">>;
	convertToLlm?: (messages: AgentMessage[]) => Message[] | Promise<Message[]>;
	transformContext?: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>;
	streamFn?: StreamFn;
	getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
	onPayload?: SimpleStreamOptions["onPayload"];
	onResponse?: SimpleStreamOptions["onResponse"];
	beforeToolCall?: (context: BeforeToolCallContext, signal?: AbortSignal) => Promise<BeforeToolCallResult | undefined>;
	afterToolCall?: (context: AfterToolCallContext, signal?: AbortSignal) => Promise<AfterToolCallResult | undefined>;
	prepareNextTurn?: (
		signal?: AbortSignal,
	) => Promise<AgentLoopTurnUpdate | undefined> | AgentLoopTurnUpdate | undefined;
	prepareNextTurnWithContext?: (
		context: PrepareNextTurnContext,
		signal?: AbortSignal,
	) => Promise<AgentLoopTurnUpdate | undefined> | AgentLoopTurnUpdate | undefined;
	steeringMode?: QueueMode;
	followUpMode?: QueueMode;
	sessionId?: string;
	thinkingBudgets?: ThinkingBudgets;
	transport?: Transport;
	maxRetryDelayMs?: number;
	toolExecution?: ToolExecutionMode;
	/** Optional count-based limits. Omitted limits preserve existing behavior. */
	executionLimits?: ExecutionLimits;
}

class PendingMessageQueue {
	private messages: AgentMessage[] = [];
	public mode: QueueMode;

	constructor(mode: QueueMode) {
		this.mode = mode;
	}

	enqueue(message: AgentMessage): void {
		this.messages.push(message);
	}

	hasItems(): boolean {
		return this.messages.length > 0;
	}

	drain(): AgentMessage[] {
		if (this.mode === "all") {
			const drained = this.messages.slice();
			this.messages = [];
			return drained;
		}

		const first = this.messages[0];
		if (!first) {
			return [];
		}
		this.messages = this.messages.slice(1);
		return [first];
	}

	clear(): void {
		this.messages = [];
	}
}

export type AgentEventListener = (event: AgentEvent, signal: AbortSignal) => Promise<void> | void;

type MutableRunDiagnostics = {
	termination?: AgentRunTermination;
	turns: number;
	toolCalls: number;
	toolErrors: number;
	terminalEvents: number;
	listenerErrors: string[];
	startedAt: number;
};

type ActiveRun = {
	promise: Promise<void>;
	resolve: () => void;
	abortController: AbortController;
	failedListeners: Set<AgentEventListener>;
	criticalFailure?: AgentEventHandlerError;
	turnOpen: boolean;
	terminalEventEmitted: boolean;
	diagnostics: MutableRunDiagnostics;
};

/**
 * Stateful wrapper around the low-level agent loop.
 *
 * `Agent` owns the current transcript, emits lifecycle events, executes tools,
 * and exposes queueing APIs for steering and follow-up messages.
 */
export class Agent {
	private _state: MutableAgentState;
	private readonly listeners = new Map<AgentEventListener, AgentEventListenerFailureMode>();
	private readonly steeringQueue: PendingMessageQueue;
	private readonly followUpQueue: PendingMessageQueue;

	public convertToLlm: (messages: AgentMessage[]) => Message[] | Promise<Message[]>;
	public transformContext?: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>;
	public streamFn: StreamFn;
	public getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
	public onPayload?: SimpleStreamOptions["onPayload"];
	public onResponse?: SimpleStreamOptions["onResponse"];
	public beforeToolCall?: (
		context: BeforeToolCallContext,
		signal?: AbortSignal,
	) => Promise<BeforeToolCallResult | undefined>;
	public afterToolCall?: (
		context: AfterToolCallContext,
		signal?: AbortSignal,
	) => Promise<AfterToolCallResult | undefined>;
	public prepareNextTurn?: (
		signal?: AbortSignal,
	) => Promise<AgentLoopTurnUpdate | undefined> | AgentLoopTurnUpdate | undefined;
	public prepareNextTurnWithContext?: (
		context: PrepareNextTurnContext,
		signal?: AbortSignal,
	) => Promise<AgentLoopTurnUpdate | undefined> | AgentLoopTurnUpdate | undefined;
	private activeRun?: ActiveRun;
	private _executionLimits?: ExecutionLimits;
	private _lastRunDiagnostics?: AgentRunDiagnostics;
	/** Session identifier forwarded to providers for cache-aware backends. */
	public sessionId?: string;
	/** Optional per-level thinking token budgets forwarded to the stream function. */
	public thinkingBudgets?: ThinkingBudgets;
	/** Preferred transport forwarded to the stream function. */
	public transport: Transport;
	/** Optional cap for provider-requested retry delays. */
	public maxRetryDelayMs?: number;
	/** Tool execution strategy for assistant messages that contain multiple tool calls. */
	public toolExecution: ToolExecutionMode;

	constructor(options: AgentOptions = {}) {
		this._state = createMutableAgentState(options.initialState);
		this.convertToLlm = options.convertToLlm ?? defaultConvertToLlm;
		this.transformContext = options.transformContext;
		this.streamFn = options.streamFn ?? streamSimple;
		this.getApiKey = options.getApiKey;
		this.onPayload = options.onPayload;
		this.onResponse = options.onResponse;
		this.beforeToolCall = options.beforeToolCall;
		this.afterToolCall = options.afterToolCall;
		this.prepareNextTurn = options.prepareNextTurn;
		this.prepareNextTurnWithContext = options.prepareNextTurnWithContext;
		this.steeringQueue = new PendingMessageQueue(options.steeringMode ?? "one-at-a-time");
		this.followUpQueue = new PendingMessageQueue(options.followUpMode ?? "one-at-a-time");
		this.sessionId = options.sessionId;
		this.thinkingBudgets = options.thinkingBudgets;
		this.transport = options.transport ?? "auto";
		this.maxRetryDelayMs = options.maxRetryDelayMs;
		this.toolExecution = options.toolExecution ?? "parallel";
		this._executionLimits = normalizeExecutionLimits(options.executionLimits);
	}

	/**
	 * Subscribe to agent lifecycle events.
	 *
	 * Listener promises are awaited in subscription order and are included in
	 * the current run's settlement. Listeners also receive the active abort
	 * signal for the current run.
	 *
	 * `agent_end` is the final emitted event for a run, but the agent does not
	 * become idle until all awaited listeners for that event have settled.
	 */
	subscribe(listener: AgentEventListener, options: { failureMode?: AgentEventListenerFailureMode } = {}): () => void {
		this.listeners.set(listener, options.failureMode ?? "isolate");
		return () => this.listeners.delete(listener);
	}

	/**
	 * Current agent state.
	 *
	 * Assigning `state.tools` or `state.messages` copies the provided top-level array.
	 */
	get state(): AgentState {
		return this._state;
	}

	/** Read-only diagnostics for the most recently settled run. */
	get lastRunDiagnostics(): AgentRunDiagnostics | undefined {
		const diagnostics = this._lastRunDiagnostics;
		return diagnostics ? { ...diagnostics, listenerErrors: diagnostics.listenerErrors.slice() } : undefined;
	}

	get executionLimits(): ExecutionLimits | undefined {
		return this._executionLimits ? { ...this._executionLimits } : undefined;
	}

	set executionLimits(limits: ExecutionLimits | undefined) {
		this._executionLimits = normalizeExecutionLimits(limits);
	}

	/** Controls how queued steering messages are drained. */
	set steeringMode(mode: QueueMode) {
		this.steeringQueue.mode = mode;
	}

	get steeringMode(): QueueMode {
		return this.steeringQueue.mode;
	}

	/** Controls how queued follow-up messages are drained. */
	set followUpMode(mode: QueueMode) {
		this.followUpQueue.mode = mode;
	}

	get followUpMode(): QueueMode {
		return this.followUpQueue.mode;
	}

	/** Queue a message to be injected after the current assistant turn finishes. */
	steer(message: AgentMessage): void {
		this.steeringQueue.enqueue(message);
	}

	/** Queue a message to run only after the agent would otherwise stop. */
	followUp(message: AgentMessage): void {
		this.followUpQueue.enqueue(message);
	}

	/** Remove all queued steering messages. */
	clearSteeringQueue(): void {
		this.steeringQueue.clear();
	}

	/** Remove all queued follow-up messages. */
	clearFollowUpQueue(): void {
		this.followUpQueue.clear();
	}

	/** Remove all queued steering and follow-up messages. */
	clearAllQueues(): void {
		this.clearSteeringQueue();
		this.clearFollowUpQueue();
	}

	/** Returns true when either queue still contains pending messages. */
	hasQueuedMessages(): boolean {
		return this.steeringQueue.hasItems() || this.followUpQueue.hasItems();
	}

	/** Active abort signal for the current run, if any. */
	get signal(): AbortSignal | undefined {
		return this.activeRun?.abortController.signal;
	}

	/** Abort the current run, if one is active. */
	abort(reason?: unknown): void {
		this.activeRun?.abortController.abort(reason);
	}

	/**
	 * Resolve when the current run and all awaited event listeners have finished.
	 *
	 * This resolves after `agent_end` listeners settle.
	 */
	waitForIdle(): Promise<void> {
		return this.activeRun?.promise ?? Promise.resolve();
	}

	/** Clear transcript state, runtime state, and queued messages. */
	reset(): void {
		this._state.messages = [];
		this._state.isStreaming = false;
		this._state.streamingMessage = undefined;
		this._state.pendingToolCalls = new Set<string>();
		this._state.errorMessage = undefined;
		this._lastRunDiagnostics = undefined;
		this.clearFollowUpQueue();
		this.clearSteeringQueue();
	}

	/** Start a new prompt from text, a single message, or a batch of messages. */
	async prompt(message: AgentMessage | AgentMessage[]): Promise<void>;
	async prompt(input: string, images?: ImageContent[]): Promise<void>;
	async prompt(input: string | AgentMessage | AgentMessage[], images?: ImageContent[]): Promise<void> {
		if (this.activeRun) {
			throw new Error(
				"Agent is already processing a prompt. Use steer() or followUp() to queue messages, or wait for completion.",
			);
		}
		const messages = this.normalizePromptInput(input, images);
		await this.runPromptMessages(messages);
	}

	/** Continue from the current transcript. The last message must be a user or tool-result message. */
	async continue(): Promise<void> {
		if (this.activeRun) {
			throw new Error("Agent is already processing. Wait for completion before continuing.");
		}

		const lastMessage = this._state.messages[this._state.messages.length - 1];
		if (!lastMessage) {
			throw new Error("No messages to continue from");
		}

		if (lastMessage.role === "assistant") {
			const queuedSteering = this.steeringQueue.drain();
			if (queuedSteering.length > 0) {
				await this.runPromptMessages(queuedSteering, {
					skipInitialSteeringPoll: true,
				});
				return;
			}

			const queuedFollowUps = this.followUpQueue.drain();
			if (queuedFollowUps.length > 0) {
				await this.runPromptMessages(queuedFollowUps);
				return;
			}

			throw new Error("Cannot continue from message role: assistant");
		}

		await this.runContinuation();
	}

	private normalizePromptInput(
		input: string | AgentMessage | AgentMessage[],
		images?: ImageContent[],
	): AgentMessage[] {
		if (Array.isArray(input)) {
			return input;
		}

		if (typeof input !== "string") {
			return [input];
		}

		const content: Array<TextContent | ImageContent> = [{ type: "text", text: input }];
		if (images && images.length > 0) {
			content.push(...images);
		}
		return [{ role: "user", content, timestamp: Date.now() }];
	}

	private async runPromptMessages(
		messages: AgentMessage[],
		options: { skipInitialSteeringPoll?: boolean } = {},
	): Promise<void> {
		await this.runWithLifecycle(async (signal) => {
			await runAgentLoop(
				messages,
				this.createContextSnapshot(),
				this.createLoopConfig(options),
				(event) => this.processEvents(event),
				signal,
				this.streamFn,
			);
		});
	}

	private async runContinuation(): Promise<void> {
		await this.runWithLifecycle(async (signal) => {
			await runAgentLoopContinue(
				this.createContextSnapshot(),
				this.createLoopConfig(),
				(event) => this.processEvents(event),
				signal,
				this.streamFn,
			);
		});
	}

	private createContextSnapshot(): AgentContext {
		return {
			systemPrompt: this._state.systemPrompt,
			messages: this._state.messages.slice(),
			tools: this._state.tools.slice(),
		};
	}

	private createLoopConfig(options: { skipInitialSteeringPoll?: boolean } = {}): AgentLoopConfig {
		let skipInitialSteeringPoll = options.skipInitialSteeringPoll === true;
		return {
			model: this._state.model,
			reasoning: this._state.thinkingLevel === "off" ? undefined : this._state.thinkingLevel,
			sessionId: this.sessionId,
			onPayload: this.onPayload,
			onResponse: this.onResponse,
			transport: this.transport,
			thinkingBudgets: this.thinkingBudgets,
			maxRetryDelayMs: this.maxRetryDelayMs,
			toolExecution: this.toolExecution,
			executionLimits: this._executionLimits,
			beforeToolCall: this.beforeToolCall,
			afterToolCall: this.afterToolCall,
			prepareNextTurn:
				this.prepareNextTurnWithContext || this.prepareNextTurn
					? async (context) => {
							if (this.prepareNextTurnWithContext) {
								return await this.prepareNextTurnWithContext(context, this.signal);
							}
							return await this.prepareNextTurn?.(this.signal);
						}
					: undefined,
			convertToLlm: this.convertToLlm,
			transformContext: this.transformContext,
			getApiKey: this.getApiKey,
			getSteeringMessages: async () => {
				if (skipInitialSteeringPoll) {
					skipInitialSteeringPoll = false;
					return [];
				}
				return this.steeringQueue.drain();
			},
			getFollowUpMessages: async () => this.followUpQueue.drain(),
		};
	}

	private async runWithLifecycle(executor: (signal: AbortSignal) => Promise<void>): Promise<void> {
		if (this.activeRun) {
			throw new Error("Agent is already processing.");
		}

		const abortController = new AbortController();
		let resolvePromise = () => {};
		const promise = new Promise<void>((resolve) => {
			resolvePromise = resolve;
		});
		this.activeRun = {
			promise,
			resolve: resolvePromise,
			abortController,
			failedListeners: new Set(),
			criticalFailure: undefined,
			turnOpen: false,
			terminalEventEmitted: false,
			diagnostics: {
				turns: 0,
				toolCalls: 0,
				toolErrors: 0,
				terminalEvents: 0,
				listenerErrors: [],
				startedAt: Date.now(),
			},
		};

		this._state.isStreaming = true;
		this._state.streamingMessage = undefined;
		this._state.errorMessage = undefined;

		try {
			await executor(abortController.signal);
		} catch (error) {
			await this.handleRunFailure(error, abortController.signal.aborted);
		} finally {
			this.finishRun();
		}
	}

	private recordListenerError(listener: AgentEventListener, error: unknown): void {
		const activeRun = this.activeRun;
		if (!activeRun) return;

		activeRun.failedListeners.add(listener);
		const message = normalizeRuntimeError(error).slice(0, MAX_LISTENER_ERROR_CHARS);
		if (activeRun.diagnostics.listenerErrors.length < MAX_LISTENER_ERRORS) {
			activeRun.diagnostics.listenerErrors.push(message);
		}
	}

	private async processFailureEvent(event: AgentEvent): Promise<void> {
		try {
			await this.processEvents(event);
		} catch {
			// Listener errors are already recorded. Terminalization must continue.
		}
	}

	private async handleRunFailure(error: unknown, aborted: boolean): Promise<void> {
		const activeRun = this.activeRun;
		if (!activeRun || activeRun.terminalEventEmitted) return;

		const criticalFailure = error instanceof AgentEventHandlerError || activeRun.criticalFailure;
		const message = criticalFailure
			? normalizeRuntimeError(error)
			: aborted
				? (abortReason(activeRun.abortController.signal) ?? normalizeRuntimeError(error))
				: normalizeRuntimeError(error);
		const termination: AgentRunTermination = criticalFailure
			? { reason: "error", message }
			: aborted
				? message
					? { reason: "aborted", message }
					: { reason: "aborted" }
				: { reason: "error", message };
		const failureMessage = {
			role: "assistant",
			content: [{ type: "text", text: "" }],
			api: this._state.model.api,
			provider: this._state.model.provider,
			model: this._state.model.id,
			usage: EMPTY_USAGE,
			stopReason: termination.reason === "aborted" ? "aborted" : "error",
			errorMessage: message,
			timestamp: Date.now(),
		} satisfies AgentMessage;
		if (!activeRun.turnOpen) {
			await this.processFailureEvent({ type: "turn_start" });
		}
		await this.processFailureEvent({
			type: "message_start",
			message: failureMessage,
		});
		await this.processFailureEvent({
			type: "message_end",
			message: failureMessage,
		});
		await this.processFailureEvent({
			type: "turn_end",
			message: failureMessage,
			toolResults: [],
		});
		await this.processFailureEvent({
			type: "agent_end",
			messages: this._state.messages.slice(),
			termination,
		});
	}

	private finishRun(): void {
		const activeRun = this.activeRun;
		if (!activeRun) return;

		const endedAt = Date.now();
		const reason = abortReason(activeRun.abortController.signal);
		const termination =
			activeRun.diagnostics.termination ??
			(activeRun.criticalFailure
				? { reason: "error" as const, message: normalizeRuntimeError(activeRun.criticalFailure) }
				: activeRun.abortController.signal.aborted
					? reason
						? { reason: "aborted" as const, message: reason }
						: { reason: "aborted" as const }
					: { reason: "completed" as const });
		this._lastRunDiagnostics = {
			termination,
			turns: activeRun.diagnostics.turns,
			toolCalls: activeRun.diagnostics.toolCalls,
			toolErrors: activeRun.diagnostics.toolErrors,
			terminalEvents: activeRun.diagnostics.terminalEvents,
			listenerErrors: activeRun.diagnostics.listenerErrors.slice(),
			startedAt: activeRun.diagnostics.startedAt,
			endedAt,
			durationMs: Math.max(0, endedAt - activeRun.diagnostics.startedAt),
		};

		this._state.isStreaming = false;
		this._state.streamingMessage = undefined;
		this._state.pendingToolCalls = new Set<string>();
		activeRun.resolve();
		this.activeRun = undefined;
	}

	private async processEvents(event: AgentEvent): Promise<void> {
		const activeRun = this.activeRun;
		if (!activeRun) {
			throw new Error("Agent listener invoked outside active run");
		}

		switch (event.type) {
			case "turn_start":
				activeRun.diagnostics.turns++;
				activeRun.turnOpen = true;
				break;
			case "message_start":
				this._state.streamingMessage = event.message;
				break;
			case "message_update":
				this._state.streamingMessage = event.message;
				break;
			case "message_end":
				this._state.streamingMessage = undefined;
				if (event.message.role === "toolResult") {
					const toolCallId = event.message.toolCallId;
					const existingToolResultIndex = this._state.messages.findIndex(
						(message) => message.role === "toolResult" && message.toolCallId === toolCallId,
					);
					if (existingToolResultIndex >= 0) {
						this._state.messages[existingToolResultIndex] = event.message;
						break;
					}
				}
				this._state.messages.push(event.message);
				break;
			case "tool_execution_start": {
				activeRun.diagnostics.toolCalls++;
				const pendingToolCalls = new Set(this._state.pendingToolCalls);
				pendingToolCalls.add(event.toolCallId);
				this._state.pendingToolCalls = pendingToolCalls;
				break;
			}
			case "tool_execution_end": {
				if (event.isError) activeRun.diagnostics.toolErrors++;
				const pendingToolCalls = new Set(this._state.pendingToolCalls);
				pendingToolCalls.delete(event.toolCallId);
				this._state.pendingToolCalls = pendingToolCalls;
				break;
			}
			case "turn_end":
				activeRun.turnOpen = false;
				if (!activeRun.criticalFailure && event.message.role === "assistant" && event.message.errorMessage) {
					this._state.errorMessage = event.message.errorMessage;
				}
				break;
			case "agent_end":
				this._state.streamingMessage = undefined;
				break;
		}

		const listenerEntries = [...this.listeners.entries()];
		const orderedListeners =
			event.type === "agent_end"
				? [
						...listenerEntries.filter(([, failureMode]) => failureMode === "fatal"),
						...listenerEntries.filter(([, failureMode]) => failureMode === "isolate"),
					]
				: listenerEntries;
		let fatalError: AgentEventHandlerError | undefined;
		for (const [listener, failureMode] of orderedListeners) {
			if (activeRun.failedListeners.has(listener)) continue;
			if (fatalError && failureMode === "isolate") continue;
			try {
				await listener(event, activeRun.abortController.signal);
			} catch (error) {
				this.recordListenerError(listener, error);
				if (failureMode === "fatal") {
					const listenerError =
						error instanceof AgentEventHandlerError ? error : new AgentEventHandlerError(error);
					activeRun.criticalFailure ??= listenerError;
					fatalError ??= listenerError;
					activeRun.failedListeners.add(listener);
					if (!activeRun.abortController.signal.aborted) activeRun.abortController.abort(listenerError);
				}
			}
		}
		if (fatalError) throw fatalError;

		if (event.type === "agent_end") {
			activeRun.terminalEventEmitted = true;
			activeRun.diagnostics.terminalEvents++;
			activeRun.diagnostics.termination = event.termination ?? inferTermination(event.messages);
		}
	}
}
