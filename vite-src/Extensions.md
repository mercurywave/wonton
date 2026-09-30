# Extensions

Extensions let you define custom workflows (called **Flows**) that guide the AI through multi-step processes using YAML configuration files. Each flow can embed JavaScript hooks that run at specific points in the conversation lifecycle. These hooks receive a `won` object that provides an API for reading and modifying the chat, running tools, and controlling workflow state.

## Flow YAML Schema

A flow is defined in a `.yaml` file. Here's the full schema:

### Top-Level Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Display name of the flow |
| `id` | `string` | Yes | Unique identifier for the flow |
| `description` | `string` | Yes | Description of what the flow does |
| `initialState` | `string` | Yes | The key of the first state to enter |
| `schemaVersion` | `number` | Yes | Schema version (currently `1`) |
| `states` | `Record<string, FlowState>` | Yes | Map of state names to state definitions |
| `command` | `string` | No | JavaScript code to run when invoked as a command |
| `commandName` | `string` | No | Name used when invoking as a command |
| `tools` | `FlowCustomTool[]` | No | Custom tool definitions available within the flow |

### State Object (`FlowState`)

Each state within `states` can define:

| Field | Type | Description |
|-------|------|-------------|
| `message` | `string` | Prompt shown to the user for this state |
| `onEnter` | `string` | JavaScript code executed when entering the state |
| `hookAdjustPrompt` | `string` | JavaScript that transforms the user's prompt before sending it to the LLM. Receives `userContent` as a parameter. Must return a string. |
| `onSendPrompt` | `string` | JavaScript executed just before the user's prompt is sent to the LLM |
| `onChatResponse` | `string` | JavaScript executed when the LLM responds |
| `onActionButton` | `string` | JavaScript executed when an action button is clicked. Receives `idx` (the button's index) as a parameter |
| `actionButtons` | `FlowActionButton[]` | Array of buttons shown for this state |

### Action Button (`FlowActionButton`)

| Field | Type | Description |
|-------|------|-------------|
| `label` | `string` | Display text on the button |
| `idx` | `number` | Numeric identifier passed to `onActionButton` |

## YAML Example

Workflow `.yaml` files contain some basic identification information, as well as a state machine that can be transitioned between programatically.

```yaml
name: Mini-Feature
id: mini-feature-v1.0
description: Implement a new feature
initialState: design
schemaVersion: 1
states:
    design:
        message: Describe the feature
        hookAdjustPrompt: |
            return `
                Evaluate what development would be required to complete the following request.
                Start by exploring the code base.
                Reply with a summary of changes to demonstrate understanding of the request to the user.
                Don't make any code changes until the user approves the plan.
                > ${userContent}`;
        onChatResponse: |
            await won.advance("review");
    review:
        message: Ready to implement?
        actionButtons:
            -   label: Go (minor changes)
                idx: 1
        onActionButton: |
            if(idx === 1) {
                let prompt = won.getChatDraft();
                if(prompt !== ""){
                    prompt = `
                        Implement the changes, but revise it in this way:
                        ${prompt}
                    `;
                } else {
                    prompt = `Implement the changes`;
                }
                await won.advance("implement");
                await won.submitPrompt(prompt);
            }
    implement:
        message: Implementing...
        onChatResponse: |
            won.finishWorkflow();
```

## The `won` Object API

All JavaScript hooks receive a `won` object. Below is the complete API surface:

### Workflow Control

| Method | Signature | Description |
|--------|-----------|-------------|
| `advance` | `(nextStateKey: string) => Promise<void>` | Transition to the next state by key |
| `finishWorkflow` | `() => Promise<void>` | End the workflow and return to normal chat mode |

### Workflow Data

| Method | Signature | Description |
|--------|-----------|-------------|
| `set` | `(key: string, value: unknown) => Promise<void>` | Store a value in the workflow's persistent data |
| `get` | `(key: string) => unknown` | Retrieve a value previously stored via `set` |
| `setWorkflowData` | `(partial: Record<string, unknown>) => Promise<void>` | Merge partial data into the workflow data store |

### Chat Interaction

| Method | Signature | Description |
|--------|-----------|-------------|
| `submitPrompt` | `(prompt: string) => Promise<void>` | Send a prompt to the chat (triggers the LLM) |
| `pushMessage` | `(entry: { role: string; content: string }) => Promise<void>` | Manually append a message to the chat history |
| `getChatHistory` | `() => ChatHistoryEntry[]` | Get the current chat log as `{ role, content }` entries |
| `getChatName` | `() => string` | Get the current chat's name |
| `setChatName` | `(name: string) => Promise<void>` | Set the current chat's name |
| `getChatDraft` | `() => string` | Get the text the user has typed but not yet sent |
| `setChatDraft` | `(draft: string) => Promise<void>` | Set the text in the input field |

### LLM Queries

| Method | Signature | Description |
|--------|-----------|-------------|
| `runQuery` | `(messages: string \| ChatHistoryEntry[], options?: { systemPrompt?: string; model?: string }) => Promise<string>` | Make an LLM query and return the response text |

### User Interaction

| Method | Signature | Description |
|--------|-----------|-------------|
| `alert` | `(message: string) => Promise<void>` | Show an alert dialog to the user |
| `select` | `(question: string, choices: string[]) => Promise<number>` | Show a selection prompt; returns the index of the chosen option, or `-1` if cancelled |
| `prompt` | `(question: string, options?: { placeholder?: string }) => Promise<string>` | Show a text input prompt; returns the user's typed text, or `undefined` if cancelled |
| `toast` | `(message: string, severity?: "info" \| "success" \| "warning" \| "error") => void` | Show a toast notification |
| `setStatus` | `(message?: string) => void` | Set a status message |

### File Operations

| Method | Signature | Description |
|--------|-----------|-------------|
| `readFile` | `(path: string) => Promise<string>` | Read a file from the project folder. Supports paths to project files and temp files |
| `reserveTempFile` | `(baseName?: string) => Promise<string>` | Reserve a unique temporary file name. Returns the unique file name |
| `openFile` | `(uniqueName: string) => void` | Request the editor to open the given file (by temp file name) |

### Command Execution

| Method | Signature | Description |
|--------|-----------|-------------|
| `runCommand` | `(command: string) => Promise<{ stdout: string; stderr: string; code: number }>` | Execute a shell command in the project folder |

### Chat Versioning

| Method | Signature | Description |
|--------|-----------|-------------|
| `createNewVersion` | `() => Promise<void>` | Create a new version of the current chat log |

### Subagent Management

| Method | Signature | Description |
|--------|-----------|-------------|
| `createSubagent` | `(options?: SubagentOptions) => Promise<string>` | Create a new subagent. Options: `agent` (agent name), `model`, `thinking` (true/false/low/medium/high). Returns the subagent's log ID |
| `runAgent` | `(logId: string, userMessage: string) => Promise<string>` | Run the subagent with the given log ID and message. Returns the subagent's response text |

### SubagentOptions

| Field | Type | Description |
|-------|------|-------------|
| `agent` | `string` | Name of the agent to use |
| `model` | `string` | Model to use for the subagent |
| `thinking` | `boolean \| "low" \| "medium" \| "high"` | Reasoning effort level |

## Notes

- All JavaScript hooks are executed in an `async` function scope, so `await` is available throughout.
- `onEnter`, `onSendPrompt`, `onChatResponse`, and `onActionButton` hooks receive the `won` object as their first argument.
- `hookAdjustPrompt` receives both `won` and `userContent` and must return a string.
- `onActionButton` receives `won` and the button's `idx` (number).
- `runQuery` and `pushMessage` are the primary ways to interact with the LLM from hooks.
- The `won` object persists data across state transitions via `set`/`get` within the workflow's data store.
- `runCommand`, `alert`, `select`, and `prompt` provide a bridge between the AI workflow and the user's environment.
