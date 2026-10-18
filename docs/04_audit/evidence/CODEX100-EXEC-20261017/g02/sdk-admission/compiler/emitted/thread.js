import { createOutputSchemaFile } from "./outputSchemaFile";
/** Represent a thread of conversation with the agent. One thread can have multiple consecutive turns. */
export class Thread {
    _exec;
    _options;
    _id;
    _threadOptions;
    /** Returns the ID of the thread. Populated after the first turn starts. */
    get id() {
        return this._id;
    }
    /* @internal */
    constructor(exec, options, threadOptions, id = null) {
        this._exec = exec;
        this._options = options;
        this._id = id;
        this._threadOptions = threadOptions;
    }
    /** Provides the input to the agent and streams events as they are produced during the turn. */
    async runStreamed(input, turnOptions = {}) {
        return { events: this.runStreamedInternal(input, turnOptions) };
    }
    async *runStreamedInternal(input, turnOptions = {}) {
        const { schemaPath, cleanup } = await createOutputSchemaFile(turnOptions.outputSchema);
        const options = this._threadOptions;
        const { prompt, images } = normalizeInput(input);
        const generator = this._exec.run({
            input: prompt,
            baseUrl: this._options.baseUrl,
            apiKey: this._options.apiKey,
            threadId: this._id,
            images,
            model: options?.model,
            threadSource: options?.threadSource,
            sandboxMode: options?.sandboxMode,
            workingDirectory: options?.workingDirectory,
            skipGitRepoCheck: options?.skipGitRepoCheck,
            outputSchemaFile: schemaPath,
            cyberAccessProgram: turnOptions.cyberAccessProgram,
            modelReasoningEffort: options?.modelReasoningEffort,
            signal: turnOptions.signal,
            networkAccessEnabled: options?.networkAccessEnabled,
            webSearchMode: options?.webSearchMode,
            webSearchEnabled: options?.webSearchEnabled,
            approvalPolicy: options?.approvalPolicy,
            additionalDirectories: options?.additionalDirectories,
        });
        try {
            for await (const item of generator) {
                let parsed;
                try {
                    parsed = JSON.parse(item);
                }
                catch (error) {
                    throw new Error(`Failed to parse item: ${item}`, { cause: error });
                }
                if (parsed.type === "thread.started") {
                    this._id = parsed.thread_id;
                }
                else if (parsed.type === "turn.completed") {
                    parsed.usage.cache_write_input_tokens ??= 0;
                }
                yield parsed;
            }
        }
        finally {
            await cleanup();
        }
    }
    /** Provides the input to the agent and returns the completed turn. */
    async run(input, turnOptions = {}) {
        const generator = this.runStreamedInternal(input, turnOptions);
        const items = [];
        let finalResponse = "";
        let usage = null;
        let turnFailure = null;
        for await (const event of generator) {
            if (event.type === "item.completed") {
                if (event.item.type === "agent_message") {
                    finalResponse = event.item.text;
                }
                items.push(event.item);
            }
            else if (event.type === "turn.completed") {
                usage = event.usage;
            }
            else if (event.type === "turn.failed") {
                turnFailure = event.error;
                break;
            }
        }
        if (turnFailure) {
            throw new Error(turnFailure.message);
        }
        return { items, finalResponse, usage };
    }
}
function normalizeInput(input) {
    if (typeof input === "string") {
        return { prompt: input, images: [] };
    }
    const promptParts = [];
    const images = [];
    for (const item of input) {
        if (item.type === "text") {
            promptParts.push(item.text);
        }
        else if (item.type === "local_image") {
            images.push(item.path);
        }
    }
    return { prompt: promptParts.join("\n\n"), images };
}
