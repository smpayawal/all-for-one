/**
 * Agent loop that works with AgentMessage throughout.
 * Transforms to Message[] only at the LLM call boundary.
 */

import {
	type AssistantMessage,
	type Context,
	EventStream,
	streamSimple,
	type ToolResultMessage,
	validateToolArguments,
} from "@earendil-works/pi-ai/compat";
import { normalizeRuntimeError } from "./runtime-error.ts";
import type {
	AfterToolCallResult,
	AgentContext,
	AgentEvent,
	AgentLoopConfig,
	AgentMessage,
	AgentRunTermination,
	AgentTool,
	AgentToolCall,
	AgentToolResult,
	ExecutionLimits,
	StreamFn,
} from "./types.ts";
import { AgentEventHandlerError } from "./types.ts";

export type AgentEventSink = (event: AgentEvent) => Promise<void> | void;

const EMPTY_USAGE = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

const INVALID_TOOL_RESULT_MESSAGE = "Tool returned an invalid result: content must be an array.";
const INVALID_AFTER_TOOL_RESULT_MESSAGE =
	"afterToolCall returned an invalid result: expected undefined or an object with array content and boolean isError/terminate fields.";

function isValidToolResult(value: unknown): value is AgentToolResult<unknown> {
	return typeof value === "object" && value !== null && Array.isArray((value as { content?: unknown }).content);
}

function normalizeToolResult(value: unknown, isError: boolean): { result: AgentToolResult<unknown>; isError: boolean } {
	if (!isValidToolResult(value)) {
		return { result: createErrorToolResult(INVALID_TOOL_RESULT_MESSAGE), isError: true };
	}
	return { result: value, isError };
}

function isValidAfterToolCallResult(value: unknown): value is AfterToolCallResult {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	const candidate = value as { content?: unknown; isError?: unknown; terminate?: unknown };
	return (
		(candidate.content === undefined || Array.isArray(candidate.content)) &&
		(candidate.isError === undefined || typeof candidate.isError === "boolean") &&
		(candidate.terminate === undefined || typeof candidate.terminate === "boolean")
	);
}

function validateExecutionLimit(value: number | undefined, name: keyof ExecutionLimits): number | undefined {
	if (value === undefined) return undefined;
	if (!Number.isInteger(value) || value <= 0) {
		throw new Error(`Invalid executionLimits.${name}: expected a positive integer`);
	}
	return value;
}

function resolveExecutionLimits(limits: ExecutionLimits | undefined): ExecutionLimits {
	return {
		maxTurns: validateExecutionLimit(limits?.maxTurns, "maxTurns"),
		maxAcceptedToolCalls: validateExecutionLimit(limits?.maxAcceptedToolCalls, "maxAcceptedToolCalls"),
	};
}

function abortMessage(signal?: AbortSignal): string | undefined {
	if (!signal?.aborted || signal.reason === undefined) return undefined;
	return normalizeRuntimeError(signal.reason);
}

function terminationForFailure(error: unknown, signal?: AbortSignal): AgentRunTermination {
	if (error instanceof AgentEventHandlerError || signal?.reason instanceof AgentEventHandlerError) {
		return { reason: "error", message: normalizeRuntimeError(error) };
	}
	if (signal?.aborted) {
		const message = abortMessage(signal) ?? normalizeRuntimeError(error);
		return message ? { reason: "aborted", message } : { reason: "aborted" };
	}
	return { reason: "error", message: normalizeRuntimeError(error) };
}

function createRunFailureMessage(
	config: AgentLoopConfig,
	error: unknown,
	termination: AgentRunTermination,
): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text: "" }],
		api: config.model.api,
		provider: config.model.provider,
		model: config.model.id,
		usage: EMPTY_USAGE,
		stopReason: termination.reason === "aborted" ? "aborted" : "error",
		errorMessage: normalizeRuntimeError(error),
		timestamp: Date.now(),
	};
}

type ToolFailurePhase = "not-started" | "execution-status-unknown" | "executed-but-post-processing-failed";

type TrackedToolCall = {
	toolCall: AgentToolCall;
	phase: ToolFailurePhase;
};

function createLifecycleFailureToolResult(tracked: TrackedToolCall): ToolResultMessage {
	const phaseText =
		tracked.phase === "not-started"
			? "was not started"
			: tracked.phase === "execution-status-unknown"
				? "has an unknown execution status"
				: "executed but its result could not be finalized";
	return {
		role: "toolResult",
		toolCallId: tracked.toolCall.id,
		toolName: tracked.toolCall.name,
		content: [{ type: "text", text: `Tool execution failed: ${phaseText}.` }],
		details: { failurePhase: tracked.phase },
		isError: true,
		timestamp: Date.now(),
	};
}

class AgentRunLifecycle {
	private readonly messages: AgentMessage[] = [];
	private readonly requestedToolCalls = new Map<string, TrackedToolCall>();
	private readonly stagedToolCalls = new Map<string, TrackedToolCall>();
	private readonly emittedToolResultIds = new Set<string>();
	private openMessageIndex: number | undefined;
	private turnOpen = false;
	private terminalEventEmitted = false;
	private readonly sink: AgentEventSink;

	constructor(sink: AgentEventSink) {
		this.sink = sink;
	}

	get completedMessages(): AgentMessage[] {
		return this.messages.slice();
	}

	async emit(event: AgentEvent): Promise<void> {
		this.observe(event);
		try {
			await this.sink(event);
			this.commit(event);
		} catch (error) {
			this.rollbackFailedMessage(event);
			if (event.type === "agent_end") this.terminalEventEmitted = false;
			throw error;
		}
	}

	private observe(event: AgentEvent): void {
		switch (event.type) {
			case "turn_start":
				this.turnOpen = true;
				break;
			case "message_start": {
				const lastIndex = this.messages.length - 1;
				if (lastIndex >= 0 && this.messages[lastIndex] === event.message) {
					this.openMessageIndex = lastIndex;
				} else {
					this.messages.push(event.message);
					this.openMessageIndex = this.messages.length - 1;
				}
				break;
			}
			case "message_update":
				if (this.openMessageIndex !== undefined) {
					this.messages[this.openMessageIndex] = event.message;
				}
				break;
			case "message_end":
				if (this.openMessageIndex === undefined) {
					this.messages.push(event.message);
				} else {
					this.messages[this.openMessageIndex] = event.message;
				}
				if (event.message.role === "assistant" && Array.isArray(event.message.content)) {
					for (const block of event.message.content) {
						if (block.type !== "toolCall" || this.requestedToolCalls.has(block.id)) continue;
						const tracked = { toolCall: block, phase: "not-started" as const };
						this.requestedToolCalls.set(block.id, tracked);
						this.stagedToolCalls.set(block.id, tracked);
					}
				}
				break;
			case "tool_execution_start":
				this.setToolFailurePhase(event.toolCallId, "not-started");
				break;
			case "tool_execution_update":
				this.setToolFailurePhase(event.toolCallId, "execution-status-unknown");
				break;
			case "tool_execution_end":
				this.setToolFailurePhase(event.toolCallId, "executed-but-post-processing-failed");
				break;
			case "turn_end":
				this.turnOpen = false;
				break;
			case "agent_end":
				this.terminalEventEmitted = true;
				break;
		}
	}

	private commit(event: AgentEvent): void {
		if (event.type === "message_end") {
			this.openMessageIndex = undefined;
			const finalizedToolCallIds = new Set<string>();
			if (event.message.role === "assistant" && Array.isArray(event.message.content)) {
				for (const block of event.message.content) {
					if (block.type !== "toolCall") continue;
					finalizedToolCallIds.add(block.id);
					if (!this.requestedToolCalls.has(block.id)) {
						this.requestedToolCalls.set(block.id, { toolCall: block, phase: "not-started" });
					}
				}
			}
			for (const [toolCallId, tracked] of this.stagedToolCalls) {
				if (!finalizedToolCallIds.has(toolCallId) && this.requestedToolCalls.get(toolCallId) === tracked) {
					this.requestedToolCalls.delete(toolCallId);
				}
			}
			this.stagedToolCalls.clear();
			if (event.message.role === "toolResult") {
				this.emittedToolResultIds.add(event.message.toolCallId);
			}
		}
		if (event.type === "tool_execution_start") {
			this.setToolFailurePhase(event.toolCallId, "execution-status-unknown");
		}
	}

	private setToolFailurePhase(toolCallId: string, phase: ToolFailurePhase): void {
		const tracked = this.requestedToolCalls.get(toolCallId);
		if (tracked) tracked.phase = phase;
	}

	private rollbackFailedMessage(event: AgentEvent): void {
		if (
			(event.type === "message_start" || event.type === "message_end") &&
			event.message.role === "toolResult" &&
			this.openMessageIndex !== undefined &&
			this.messages[this.openMessageIndex] === event.message
		) {
			this.messages.splice(this.openMessageIndex, 1);
		}
		if (event.type === "message_start" || event.type === "message_end") this.openMessageIndex = undefined;
	}

	private unmatchedToolResults(): ToolResultMessage[] {
		return [...this.requestedToolCalls.values()]
			.filter(({ toolCall }) => !this.emittedToolResultIds.has(toolCall.id))
			.map(createLifecycleFailureToolResult);
	}

	private async safeEmit(event: AgentEvent): Promise<void> {
		try {
			await this.emit(event);
		} catch {
			// The original failure is authoritative. Continue best-effort terminalization
			// so one critical listener cannot strand the stream.
		}
	}

	async terminalizeFailure(config: AgentLoopConfig, error: unknown, signal?: AbortSignal): Promise<void> {
		if (this.terminalEventEmitted) return;

		const termination = terminationForFailure(error, signal);
		const failureMessage = createRunFailureMessage(config, error, termination);
		if (!this.turnOpen) await this.safeEmit({ type: "turn_start" });
		const unmatchedToolResults = this.unmatchedToolResults();
		for (const toolResult of unmatchedToolResults) {
			await this.safeEmit({ type: "message_start", message: toolResult });
			await this.safeEmit({ type: "message_end", message: toolResult });
		}
		await this.safeEmit({ type: "message_start", message: failureMessage });
		await this.safeEmit({ type: "message_end", message: failureMessage });
		if (this.turnOpen) {
			await this.safeEmit({ type: "turn_end", message: failureMessage, toolResults: unmatchedToolResults });
		}
		await this.safeEmit({ type: "agent_end", messages: this.completedMessages, termination });
	}
}

function settleAgentStreamFailure(
	stream: EventStream<AgentEvent, AgentMessage[]>,
	config: AgentLoopConfig,
	error: unknown,
	signal?: AbortSignal,
): void {
	const termination = terminationForFailure(error, signal);
	const message = createRunFailureMessage(config, error, termination);
	stream.push({ type: "message_start", message });
	stream.push({ type: "message_end", message });
	stream.push({ type: "turn_end", message, toolResults: [] });
	stream.push({
		type: "agent_end",
		messages: [message],
		termination,
	});
}

/**
 * Start an agent loop with a new prompt message.
 * The prompt is added to the context and events are emitted for it.
 */
export function agentLoop(
	prompts: AgentMessage[],
	context: AgentContext,
	config: AgentLoopConfig,
	signal?: AbortSignal,
	streamFn?: StreamFn,
): EventStream<AgentEvent, AgentMessage[]> {
	const stream = createAgentStream();

	void runAgentLoop(
		prompts,
		context,
		config,
		async (event) => {
			stream.push(event);
		},
		signal,
		streamFn,
	)
		.then((messages) => {
			stream.end(messages);
		})
		.catch((error) => {
			settleAgentStreamFailure(stream, config, error, signal);
		});

	return stream;
}

/**
 * Continue an agent loop from the current context without adding a new message.
 * Used for retries - context already has user message or tool results.
 *
 * **Important:** The last message in context must convert to a `user` or `toolResult` message
 * via `convertToLlm`. If it doesn't, the LLM provider will reject the request.
 * This cannot be validated here since `convertToLlm` is only called once per turn.
 */
export function agentLoopContinue(
	context: AgentContext,
	config: AgentLoopConfig,
	signal?: AbortSignal,
	streamFn?: StreamFn,
): EventStream<AgentEvent, AgentMessage[]> {
	if (context.messages.length === 0) {
		throw new Error("Cannot continue: no messages in context");
	}

	if (context.messages[context.messages.length - 1].role === "assistant") {
		throw new Error("Cannot continue from message role: assistant");
	}

	const stream = createAgentStream();

	void runAgentLoopContinue(
		context,
		config,
		async (event) => {
			stream.push(event);
		},
		signal,
		streamFn,
	)
		.then((messages) => {
			stream.end(messages);
		})
		.catch((error) => {
			settleAgentStreamFailure(stream, config, error, signal);
		});

	return stream;
}

export async function runAgentLoop(
	prompts: AgentMessage[],
	context: AgentContext,
	config: AgentLoopConfig,
	emit: AgentEventSink,
	signal?: AbortSignal,
	streamFn?: StreamFn,
): Promise<AgentMessage[]> {
	const newMessages: AgentMessage[] = [...prompts];
	const currentContext: AgentContext = {
		...context,
		messages: [...context.messages, ...prompts],
	};
	const lifecycle = new AgentRunLifecycle(emit);

	try {
		await lifecycle.emit({ type: "agent_start" });
		await lifecycle.emit({ type: "turn_start" });
		for (const prompt of prompts) {
			await lifecycle.emit({ type: "message_start", message: prompt });
			await lifecycle.emit({ type: "message_end", message: prompt });
		}

		await runLoop(currentContext, newMessages, config, signal, lifecycle.emit.bind(lifecycle), streamFn);
	} catch (error) {
		await lifecycle.terminalizeFailure(config, error, signal);
		newMessages.splice(0, newMessages.length, ...lifecycle.completedMessages);
	}
	return newMessages;
}

export async function runAgentLoopContinue(
	context: AgentContext,
	config: AgentLoopConfig,
	emit: AgentEventSink,
	signal?: AbortSignal,
	streamFn?: StreamFn,
): Promise<AgentMessage[]> {
	if (context.messages.length === 0) {
		throw new Error("Cannot continue: no messages in context");
	}

	if (context.messages[context.messages.length - 1].role === "assistant") {
		throw new Error("Cannot continue from message role: assistant");
	}

	const newMessages: AgentMessage[] = [];
	const currentContext: AgentContext = { ...context };
	const lifecycle = new AgentRunLifecycle(emit);

	try {
		await lifecycle.emit({ type: "agent_start" });
		await lifecycle.emit({ type: "turn_start" });

		await runLoop(currentContext, newMessages, config, signal, lifecycle.emit.bind(lifecycle), streamFn);
	} catch (error) {
		await lifecycle.terminalizeFailure(config, error, signal);
		newMessages.splice(0, newMessages.length, ...lifecycle.completedMessages);
	}
	return newMessages;
}

function createAgentStream(): EventStream<AgentEvent, AgentMessage[]> {
	return new EventStream<AgentEvent, AgentMessage[]>(
		(event: AgentEvent) => event.type === "agent_end",
		(event: AgentEvent) => (event.type === "agent_end" ? event.messages : []),
	);
}

async function emitAgentEnd(
	emit: AgentEventSink,
	messages: AgentMessage[],
	termination: AgentRunTermination,
): Promise<void> {
	await emit({ type: "agent_end", messages, termination });
}

function terminationForAssistant(message: AssistantMessage): AgentRunTermination {
	const errorMessage = message.errorMessage ? normalizeRuntimeError(message.errorMessage) : undefined;
	if (message.stopReason === "aborted") {
		return errorMessage ? { reason: "aborted", message: errorMessage } : { reason: "aborted" };
	}
	if (message.stopReason === "error") {
		return errorMessage ? { reason: "error", message: errorMessage } : { reason: "error" };
	}
	return { reason: "completed" };
}

function normalizeAssistantFailure(message: AssistantMessage): AssistantMessage {
	if ((message.stopReason !== "error" && message.stopReason !== "aborted") || !message.errorMessage) return message;
	return { ...message, errorMessage: normalizeRuntimeError(message.errorMessage) };
}

/**
 * Main loop logic shared by agentLoop and agentLoopContinue.
 */
async function runLoop(
	initialContext: AgentContext,
	newMessages: AgentMessage[],
	initialConfig: AgentLoopConfig,
	signal: AbortSignal | undefined,
	emit: AgentEventSink,
	streamFn?: StreamFn,
): Promise<void> {
	let currentContext = initialContext;
	let config = initialConfig;
	const executionLimits = resolveExecutionLimits(initialConfig.executionLimits);
	let turnsStarted = 1;
	let toolCallsAccepted = 0;
	let firstTurn = true;
	// Check for steering messages at start (user may have typed while waiting)
	let pendingMessages: AgentMessage[] = (await config.getSteeringMessages?.()) || [];

	// Outer loop: continues when queued follow-up messages arrive after agent would stop
	while (true) {
		let hasMoreToolCalls = true;

		// Inner loop: process tool calls and steering messages
		while (hasMoreToolCalls || pendingMessages.length > 0) {
			if (signal?.aborted && pendingMessages.length === 0) {
				const message = abortMessage(signal);
				await emitAgentEnd(emit, newMessages, message ? { reason: "aborted", message } : { reason: "aborted" });
				return;
			}

			if (!firstTurn) {
				if (executionLimits.maxTurns !== undefined && turnsStarted >= executionLimits.maxTurns) {
					await emitAgentEnd(emit, newMessages, {
						reason: "limit",
						limit: "turns",
						max: executionLimits.maxTurns,
					});
					return;
				}
				turnsStarted++;
				await emit({ type: "turn_start" });
			} else {
				firstTurn = false;
			}

			// Process pending messages (inject before next assistant response)
			if (pendingMessages.length > 0) {
				for (const message of pendingMessages) {
					await emit({ type: "message_start", message });
					await emit({ type: "message_end", message });
					currentContext.messages.push(message);
					newMessages.push(message);
				}
				pendingMessages = [];
			}

			// Stream assistant response
			const message = await streamAssistantResponse(currentContext, config, signal, emit, streamFn);
			newMessages.push(message);

			if (message.stopReason === "error" || message.stopReason === "aborted") {
				await emit({ type: "turn_end", message, toolResults: [] });
				await emitAgentEnd(emit, newMessages, terminationForAssistant(message));
				return;
			}

			// Check for tool calls
			const toolCalls = message.content.filter((c) => c.type === "toolCall");

			const toolResults: ToolResultMessage[] = [];
			hasMoreToolCalls = false;
			let toolCallLimitReached: number | undefined;
			if (toolCalls.length > 0) {
				let executedToolBatch: ExecutedToolCallBatch;
				if (
					executionLimits.maxAcceptedToolCalls !== undefined &&
					toolCallsAccepted + toolCalls.length > executionLimits.maxAcceptedToolCalls
				) {
					executedToolBatch = await failToolCallsFromLimit(toolCalls, executionLimits.maxAcceptedToolCalls, emit);
					toolCallLimitReached = executionLimits.maxAcceptedToolCalls;
				} else {
					toolCallsAccepted += toolCalls.length;
					// A "length" stop means the output was cut off by the token limit, so
					// every tool call in the message may carry truncated arguments. Fail
					// them all instead of executing potentially borked calls.
					executedToolBatch =
						message.stopReason === "length"
							? await failToolCallsFromTruncatedMessage(toolCalls, emit)
							: await executeToolCalls(currentContext, message, config, signal, emit);
				}
				toolResults.push(...executedToolBatch.messages);
				hasMoreToolCalls = !executedToolBatch.terminate;

				for (const result of toolResults) {
					currentContext.messages.push(result);
					newMessages.push(result);
				}
			}

			await emit({ type: "turn_end", message, toolResults });

			if (toolCallLimitReached !== undefined) {
				await emitAgentEnd(emit, newMessages, {
					reason: "limit",
					limit: "acceptedToolCalls",
					max: toolCallLimitReached,
				});
				return;
			}

			const nextTurnContext = {
				message,
				toolResults,
				context: currentContext,
				newMessages,
			};
			const nextTurnSnapshot = await config.prepareNextTurn?.(nextTurnContext);
			if (nextTurnSnapshot) {
				currentContext = nextTurnSnapshot.context ?? currentContext;
				config = {
					...config,
					model: nextTurnSnapshot.model ?? config.model,
					reasoning:
						nextTurnSnapshot.thinkingLevel === undefined
							? config.reasoning
							: nextTurnSnapshot.thinkingLevel === "off"
								? undefined
								: nextTurnSnapshot.thinkingLevel,
				};
			}

			if (
				await config.shouldStopAfterTurn?.({
					message,
					toolResults,
					context: currentContext,
					newMessages,
				})
			) {
				await emitAgentEnd(emit, newMessages, { reason: "completed" });
				return;
			}

			pendingMessages = (await config.getSteeringMessages?.()) || [];
		}

		// Agent would stop here. Check for follow-up messages.
		const followUpMessages = (await config.getFollowUpMessages?.()) || [];
		if (followUpMessages.length > 0) {
			// Set as pending so inner loop processes them
			pendingMessages = followUpMessages;
			continue;
		}

		// No more messages, exit
		break;
	}

	if (signal?.aborted) {
		const message = abortMessage(signal);
		await emitAgentEnd(emit, newMessages, message ? { reason: "aborted", message } : { reason: "aborted" });
		return;
	}

	await emitAgentEnd(emit, newMessages, { reason: "completed" });
}

/**
 * Stream an assistant response from the LLM.
 * This is where AgentMessage[] gets transformed to Message[] for the LLM.
 */
async function streamAssistantResponse(
	context: AgentContext,
	config: AgentLoopConfig,
	signal: AbortSignal | undefined,
	emit: AgentEventSink,
	streamFn?: StreamFn,
): Promise<AssistantMessage> {
	// Apply context transform if configured (AgentMessage[] → AgentMessage[])
	let messages = context.messages;
	if (config.transformContext) {
		messages = await config.transformContext(messages, signal);
	}

	// Convert to LLM-compatible messages (AgentMessage[] → Message[])
	const llmMessages = await config.convertToLlm(messages);

	// Build LLM context
	const llmContext: Context = {
		systemPrompt: context.systemPrompt,
		messages: llmMessages,
		tools: context.tools,
	};

	const streamFunction = streamFn || streamSimple;

	// Resolve API key (important for expiring tokens)
	const resolvedApiKey =
		(config.getApiKey ? await config.getApiKey(config.model.provider) : undefined) || config.apiKey;

	const response = await streamFunction(config.model, llmContext, {
		...config,
		apiKey: resolvedApiKey,
		signal,
	});

	let partialMessage: AssistantMessage | null = null;
	let addedPartial = false;

	for await (const event of response) {
		switch (event.type) {
			case "start":
				partialMessage = event.partial;
				context.messages.push(partialMessage);
				addedPartial = true;
				await emit({ type: "message_start", message: { ...partialMessage } });
				break;

			case "text_start":
			case "text_delta":
			case "text_end":
			case "thinking_start":
			case "thinking_delta":
			case "thinking_end":
			case "toolcall_start":
			case "toolcall_delta":
			case "toolcall_end":
				if (partialMessage) {
					partialMessage = event.partial;
					context.messages[context.messages.length - 1] = partialMessage;
					await emit({
						type: "message_update",
						assistantMessageEvent: event,
						message: { ...partialMessage },
					});
				}
				break;

			case "done":
			case "error": {
				const finalMessage = normalizeAssistantFailure(await response.result());
				if (addedPartial) {
					context.messages[context.messages.length - 1] = finalMessage;
				} else {
					context.messages.push(finalMessage);
				}
				if (!addedPartial) {
					await emit({ type: "message_start", message: { ...finalMessage } });
				}
				await emit({ type: "message_end", message: finalMessage });
				return finalMessage;
			}
		}
	}

	const finalMessage = normalizeAssistantFailure(await response.result());
	if (addedPartial) {
		context.messages[context.messages.length - 1] = finalMessage;
	} else {
		context.messages.push(finalMessage);
		await emit({ type: "message_start", message: { ...finalMessage } });
	}
	await emit({ type: "message_end", message: finalMessage });
	return finalMessage;
}

/**
 * Fail all tool calls from an assistant message that was truncated by the
 * output token limit. Streamed tool-call arguments are finalized with a
 * best-effort JSON salvage parser, so a truncated message can yield tool calls
 * whose arguments parse and validate but are silently incomplete. None of them
 * are safe to execute; report each as an error so the model can re-issue them.
 */
async function failToolCallsFromLimit(
	toolCalls: AgentToolCall[],
	maxAcceptedToolCalls: number,
	emit: AgentEventSink,
): Promise<ExecutedToolCallBatch> {
	return failToolCalls(
		toolCalls,
		(toolCall) =>
			`Tool call "${toolCall.name}" was not executed: this batch would exceed the configured maximum of ${maxAcceptedToolCalls} accepted tool calls for the run.`,
		emit,
		true,
	);
}

async function failToolCallsFromTruncatedMessage(
	toolCalls: AgentToolCall[],
	emit: AgentEventSink,
): Promise<ExecutedToolCallBatch> {
	return failToolCalls(
		toolCalls,
		(toolCall) =>
			`Tool call "${toolCall.name}" was not executed: the response hit the output token limit, so its arguments may be truncated. Re-issue the tool call with complete arguments.`,
		emit,
		false,
	);
}

async function failToolCalls(
	toolCalls: AgentToolCall[],
	messageFor: (toolCall: AgentToolCall) => string,
	emit: AgentEventSink,
	terminate: boolean,
): Promise<ExecutedToolCallBatch> {
	const messages: ToolResultMessage[] = [];
	for (const toolCall of toolCalls) {
		await emit({
			type: "tool_execution_start",
			toolCallId: toolCall.id,
			toolName: toolCall.name,
			args: toolCall.arguments,
		});
		const finalized: FinalizedToolCallOutcome = {
			toolCall,
			result: createErrorToolResult(messageFor(toolCall)),
			isError: true,
		};
		await emitToolExecutionEnd(finalized, emit);
		const toolResultMessage = createToolResultMessage(finalized);
		await emitToolResultMessage(toolResultMessage, emit);
		messages.push(toolResultMessage);
	}
	return { messages, terminate };
}

/**
 * Execute tool calls from an assistant message.
 */
async function executeToolCalls(
	currentContext: AgentContext,
	assistantMessage: AssistantMessage,
	config: AgentLoopConfig,
	signal: AbortSignal | undefined,
	emit: AgentEventSink,
): Promise<ExecutedToolCallBatch> {
	const toolCalls = assistantMessage.content.filter((c) => c.type === "toolCall");
	const hasSequentialToolCall = toolCalls.some(
		(tc) => currentContext.tools?.find((t) => t.name === tc.name)?.executionMode === "sequential",
	);
	if (config.toolExecution === "sequential" || hasSequentialToolCall) {
		return executeToolCallsSequential(currentContext, assistantMessage, toolCalls, config, signal, emit);
	}
	return executeToolCallsParallel(currentContext, assistantMessage, toolCalls, config, signal, emit);
}

type ExecutedToolCallBatch = {
	messages: ToolResultMessage[];
	terminate: boolean;
};

function abortedToolOutcome(toolCall: AgentToolCall, signal: AbortSignal | undefined): FinalizedToolCallOutcome {
	const reason = abortMessage(signal);
	return {
		toolCall,
		result: createErrorToolResult(reason ? `Operation aborted: ${reason}` : "Operation aborted"),
		isError: true,
	};
}

async function executeToolCallsSequential(
	currentContext: AgentContext,
	assistantMessage: AssistantMessage,
	toolCalls: AgentToolCall[],
	config: AgentLoopConfig,
	signal: AbortSignal | undefined,
	emit: AgentEventSink,
): Promise<ExecutedToolCallBatch> {
	const finalizedCalls: FinalizedToolCallOutcome[] = [];
	const messages: ToolResultMessage[] = [];

	for (const toolCall of toolCalls) {
		await emit({
			type: "tool_execution_start",
			toolCallId: toolCall.id,
			toolName: toolCall.name,
			args: toolCall.arguments,
		});

		let finalized: FinalizedToolCallOutcome;
		if (signal?.aborted) {
			finalized = abortedToolOutcome(toolCall, signal);
		} else {
			const preparation = await prepareToolCall(currentContext, assistantMessage, toolCall, config, signal);
			if (preparation.kind === "immediate") {
				finalized = {
					toolCall,
					result: preparation.result,
					isError: preparation.isError,
				};
			} else {
				const executed = await executePreparedToolCall(preparation, signal, emit);
				finalized = await finalizeExecutedToolCall(
					currentContext,
					assistantMessage,
					preparation,
					executed,
					config,
					signal,
				);
			}
		}

		await emitToolExecutionEnd(finalized, emit);
		const toolResultMessage = createToolResultMessage(finalized);
		await emitToolResultMessage(toolResultMessage, emit);
		finalizedCalls.push(finalized);
		messages.push(toolResultMessage);
	}

	return { messages, terminate: shouldTerminateToolBatch(finalizedCalls) };
}

async function executeToolCallsParallel(
	currentContext: AgentContext,
	assistantMessage: AssistantMessage,
	toolCalls: AgentToolCall[],
	config: AgentLoopConfig,
	signal: AbortSignal | undefined,
	emit: AgentEventSink,
): Promise<ExecutedToolCallBatch> {
	const finalizedCalls: FinalizedToolCallEntry[] = [];

	for (const toolCall of toolCalls) {
		await emit({
			type: "tool_execution_start",
			toolCallId: toolCall.id,
			toolName: toolCall.name,
			args: toolCall.arguments,
		});

		if (signal?.aborted) {
			const finalized = abortedToolOutcome(toolCall, signal);
			await emitToolExecutionEnd(finalized, emit);
			finalizedCalls.push(finalized);
			continue;
		}

		const preparation = await prepareToolCall(currentContext, assistantMessage, toolCall, config, signal);
		if (preparation.kind === "immediate") {
			const finalized = {
				toolCall,
				result: preparation.result,
				isError: preparation.isError,
			} satisfies FinalizedToolCallOutcome;
			await emitToolExecutionEnd(finalized, emit);
			finalizedCalls.push(finalized);
			continue;
		}

		finalizedCalls.push(async () => {
			if (signal?.aborted) {
				const finalized = abortedToolOutcome(toolCall, signal);
				await emitToolExecutionEnd(finalized, emit);
				return finalized;
			}
			const executed = await executePreparedToolCall(preparation, signal, emit);
			const finalized = await finalizeExecutedToolCall(
				currentContext,
				assistantMessage,
				preparation,
				executed,
				config,
				signal,
			);
			await emitToolExecutionEnd(finalized, emit);
			return finalized;
		});
	}

	const orderedFinalizedCalls = await Promise.all(
		finalizedCalls.map((entry) => (typeof entry === "function" ? entry() : Promise.resolve(entry))),
	);
	const messages: ToolResultMessage[] = [];
	for (const finalized of orderedFinalizedCalls) {
		const toolResultMessage = createToolResultMessage(finalized);
		await emitToolResultMessage(toolResultMessage, emit);
		messages.push(toolResultMessage);
	}

	return {
		messages,
		terminate: shouldTerminateToolBatch(orderedFinalizedCalls),
	};
}

type PreparedToolCall = {
	kind: "prepared";
	toolCall: AgentToolCall;
	tool: AgentTool<any>;
	args: unknown;
};

type ImmediateToolCallOutcome = {
	kind: "immediate";
	result: AgentToolResult<any>;
	isError: boolean;
};

type ExecutedToolCallOutcome = {
	result: AgentToolResult<any>;
	isError: boolean;
};

type FinalizedToolCallOutcome = {
	toolCall: AgentToolCall;
	result: AgentToolResult<any>;
	isError: boolean;
};

type FinalizedToolCallEntry = FinalizedToolCallOutcome | (() => Promise<FinalizedToolCallOutcome>);

function shouldTerminateToolBatch(finalizedCalls: FinalizedToolCallOutcome[]): boolean {
	return finalizedCalls.length > 0 && finalizedCalls.every((finalized) => finalized.result.terminate === true);
}

function prepareToolCallArguments(tool: AgentTool<any>, toolCall: AgentToolCall): AgentToolCall {
	if (!tool.prepareArguments) {
		return toolCall;
	}
	const preparedArguments = tool.prepareArguments(toolCall.arguments);
	if (preparedArguments === toolCall.arguments) {
		return toolCall;
	}
	return {
		...toolCall,
		arguments: preparedArguments as Record<string, any>,
	};
}

async function prepareToolCall(
	currentContext: AgentContext,
	assistantMessage: AssistantMessage,
	toolCall: AgentToolCall,
	config: AgentLoopConfig,
	signal: AbortSignal | undefined,
): Promise<PreparedToolCall | ImmediateToolCallOutcome> {
	const tool = currentContext.tools?.find((t) => t.name === toolCall.name);
	if (!tool) {
		return {
			kind: "immediate",
			result: createErrorToolResult(`Tool ${toolCall.name} not found`),
			isError: true,
		};
	}

	try {
		const preparedToolCall = prepareToolCallArguments(tool, toolCall);
		const validatedArgs = validateToolArguments(tool, preparedToolCall);
		if (config.beforeToolCall) {
			const beforeResult = await config.beforeToolCall(
				{
					assistantMessage,
					toolCall,
					args: validatedArgs,
					context: currentContext,
				},
				signal,
			);
			if (signal?.aborted) {
				return {
					kind: "immediate",
					result: abortedToolOutcome(toolCall, signal).result,
					isError: true,
				};
			}
			if (beforeResult?.block) {
				return {
					kind: "immediate",
					result: createErrorToolResult(beforeResult.reason || "Tool execution was blocked"),
					isError: true,
				};
			}
		}
		if (signal?.aborted) {
			return {
				kind: "immediate",
				result: abortedToolOutcome(toolCall, signal).result,
				isError: true,
			};
		}
		return {
			kind: "prepared",
			toolCall,
			tool,
			args: validatedArgs,
		};
	} catch (error) {
		return {
			kind: "immediate",
			result: createErrorToolResult(normalizeRuntimeError(error)),
			isError: true,
		};
	}
}

async function executePreparedToolCall(
	prepared: PreparedToolCall,
	signal: AbortSignal | undefined,
	emit: AgentEventSink,
): Promise<ExecutedToolCallOutcome> {
	const updateEvents: Promise<void>[] = [];
	let acceptingUpdates = true;

	try {
		const result = await prepared.tool.execute(
			prepared.toolCall.id,
			prepared.args as never,
			signal,
			(partialResult) => {
				if (!acceptingUpdates) return;
				updateEvents.push(
					Promise.resolve(
						emit({
							type: "tool_execution_update",
							toolCallId: prepared.toolCall.id,
							toolName: prepared.toolCall.name,
							args: prepared.toolCall.arguments,
							partialResult,
						}),
					),
				);
			},
		);
		acceptingUpdates = false;
		await Promise.all(updateEvents);
		return { result, isError: false };
	} catch (error) {
		acceptingUpdates = false;
		await Promise.all(updateEvents);
		return {
			result: createErrorToolResult(normalizeRuntimeError(error)),
			isError: true,
		};
	} finally {
		acceptingUpdates = false;
	}
}

async function finalizeExecutedToolCall(
	currentContext: AgentContext,
	assistantMessage: AssistantMessage,
	prepared: PreparedToolCall,
	executed: ExecutedToolCallOutcome,
	config: AgentLoopConfig,
	signal: AbortSignal | undefined,
): Promise<FinalizedToolCallOutcome> {
	// JavaScript extensions can violate the typed AgentToolResult contract before
	// the afterToolCall hook runs. Keep every downstream hook and event on the
	// same normalized array boundary used by the final tool-result message.
	const normalized = normalizeToolResult(executed.result, executed.isError);
	let result = normalized.result;
	let isError = normalized.isError;

	if (config.afterToolCall) {
		try {
			const afterResult = await config.afterToolCall(
				{
					assistantMessage,
					toolCall: prepared.toolCall,
					args: prepared.args,
					result,
					isError,
					context: currentContext,
				},
				signal,
			);
			if (afterResult !== undefined) {
				if (!isValidAfterToolCallResult(afterResult)) {
					result = createErrorToolResult(INVALID_AFTER_TOOL_RESULT_MESSAGE);
					isError = true;
				} else {
					result = {
						...result,
						content: afterResult.content ?? result.content,
						details: afterResult.details ?? result.details,
						terminate: afterResult.terminate ?? result.terminate,
					};
					isError = afterResult.isError ?? isError;
				}
			}
		} catch (error) {
			result = createErrorToolResult(normalizeRuntimeError(error));
			isError = true;
		}
	}

	return {
		toolCall: prepared.toolCall,
		result,
		isError,
	};
}

function createErrorToolResult(message: string): AgentToolResult<any> {
	return {
		content: [{ type: "text", text: message }],
		details: {},
	};
}

async function emitToolExecutionEnd(finalized: FinalizedToolCallOutcome, emit: AgentEventSink): Promise<void> {
	await emit({
		type: "tool_execution_end",
		toolCallId: finalized.toolCall.id,
		toolName: finalized.toolCall.name,
		result: finalized.result,
		isError: finalized.isError,
	});
}

function createToolResultMessage(finalized: FinalizedToolCallOutcome): ToolResultMessage {
	return {
		role: "toolResult",
		toolCallId: finalized.toolCall.id,
		toolName: finalized.toolCall.name,
		// Untyped tools (JS extensions) can return results without content; normalize
		// so the null never enters session history or provider payloads.
		content: finalized.result.content ?? [],
		details: finalized.result.details,
		...(finalized.result.addedToolNames?.length ? { addedToolNames: finalized.result.addedToolNames } : {}),
		isError: finalized.isError,
		timestamp: Date.now(),
	};
}

async function emitToolResultMessage(toolResultMessage: ToolResultMessage, emit: AgentEventSink): Promise<void> {
	await emit({ type: "message_start", message: toolResultMessage });
	await emit({ type: "message_end", message: toolResultMessage });
}
