import { CodexExec } from "./exec";
import { Thread } from "./thread";
/**
 * Codex is the main class for interacting with the Codex agent.
 *
 * Use the `startThread()` method to start a new thread or `resumeThread()` to resume a previously started thread.
 */
export class Codex {
    exec;
    options;
    constructor(options = {}) {
        const { codexPathOverride, env, config, configOverrides } = options;
        this.exec = new CodexExec(codexPathOverride, env, config, configOverrides);
        this.options = options;
    }
    /**
     * Starts a new conversation with an agent.
     * @returns A new thread instance.
     */
    startThread(options = {}) {
        return new Thread(this.exec, this.options, options);
    }
    /**
     * Resumes a conversation with an agent based on the thread id.
     * Threads are persisted in ~/.codex/sessions.
     *
     * @param id The id of the thread to resume.
     * @returns A new thread instance.
     */
    resumeThread(id, options = {}) {
        return new Thread(this.exec, this.options, options, id);
    }
}
