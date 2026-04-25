import { eventBus, EventType } from '../services/eventbus';
import { chatStore } from '../stores/chat';
import { apiService } from '../services/api';

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      display: block;
      width: 100%;
      flex-shrink: 0;
    }

    .input-area {
      padding: 1rem 1.5rem;
      background: var(--bg-secondary);
      border-top: 1px solid var(--border-color);
    }

    .input-container {
      display: flex;
      gap: 0.5rem;
      max-width: 800px;
      margin: 0 auto;
      align-items: flex-end;
    }

    .input-wrapper {
      flex: 1;
      position: relative;
    }

    .input-field {
      width: 100%;
      min-height: 44px;
      max-height: 160px;
      padding: 0.75rem 1rem;
      background: var(--bg-input);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      color: var(--text-primary);
      font-family: var(--font-sans);
      font-size: var(--font-size-base);
      line-height: 1.5;
      resize: none;
      outline: none;
      transition: border-color var(--transition-speed);
    }

    .input-field:focus {
      border-color: var(--accent);
    }

    .input-field::placeholder {
      color: var(--text-muted);
    }

    .send-btn {
      width: 44px;
      height: 44px;
      border-radius: var(--radius-lg);
      border: none;
      background: var(--accent);
      color: var(--bg-primary);
      font-size: 1.2rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: opacity var(--transition-speed), transform var(--transition-speed);
      flex-shrink: 0;
    }

    .send-btn:hover:not(:disabled) {
      opacity: 0.85;
      transform: scale(1.05);
    }

    .send-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .send-btn:active:not(:disabled) {
      transform: scale(0.95);
    }

    .input-hint {
      text-align: center;
      font-size: var(--font-size-xs);
      color: var(--text-muted);
      margin-top: 0.5rem;
    }

    .input-hint kbd {
      background: var(--bg-input);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-sm);
      padding: 0.1em 0.4em;
      font-family: var(--font-mono);
      font-size: var(--font-size-xs);
    }
  </style>

  <div class="input-area">
    <div class="input-container">
      <div class="input-wrapper">
        <textarea
          class="input-field"
          id="messageInput"
          placeholder="Message..."
          rows="1"
        ></textarea>
      </div>
      <button class="send-btn" id="sendBtn" title="Send">➤</button>
    </div>
    <div class="input-hint">
      <kbd>Enter</kbd> to send · <kbd>Shift+Enter</kbd> for new line
    </div>
  </div>
`;

class ChatInput extends HTMLElement {
  private input: HTMLTextAreaElement;
  private sendBtn: HTMLButtonElement;
  private isSending = false;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.appendChild(template.content.cloneNode(true));

    this.input = shadow!.getElementById('messageInput')! as HTMLTextAreaElement;
    this.sendBtn = shadow!.getElementById('sendBtn')!;
  }

  connectedCallback() {
    this.input.addEventListener('keydown', (e) => this.handleKeyDown(e));
    this.sendBtn.addEventListener('click', () => this.handleSend());
    this.input.addEventListener('input', () => this.autoResize());

    // Initial resize
    requestAnimationFrame(() => this.autoResize());
  }

  private autoResize(): void {
    this.input.style.height = 'auto';
    const newHeight = Math.min(this.input.scrollHeight, 160);
    this.input.style.height = `${newHeight}px`;
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.handleSend();
    }
  }

  private async handleSend(): Promise<void> {
    const text = this.input.value.trim();
    if (!text || this.isSending) return;

    this.isSending = true;
    this.sendBtn.disabled = true;
    this.input.value = '';
    this.input.style.height = 'auto';

    // Get current messages from store
    const state = chatStore.snapshot;
    const messages = [...state.messages, { role: 'user' as const, content: text }];
    chatStore.addMessage({ role: 'user', content: text });

    // Create placeholder for assistant response
    const assistantMsg: ChatMessage = { role: 'assistant', content: '' };
    chatStore.addMessage(assistantMsg);
    chatStore.setStreaming(true);

    try {
      await apiService.sendChat(messages, (chunk, done) => {
        if (!done) {
          chatStore.appendToAssistant(chunk);
        } else {
          chatStore.setStreaming(false);
          this.isSending = false;
          this.sendBtn.disabled = false;
          this.input.focus();
        }
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to get response';
      chatStore.setStreaming(false);
      chatStore.setError(error);
      this.isSending = false;
      this.sendBtn.disabled = false;
      this.input.focus();
    }
  }
}

customElements.define('chat-input', ChatInput);
