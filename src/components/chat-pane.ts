export class ChatPane extends HTMLElement {
  private messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  private input = '';
  private isTyping = false;

  static get observedAttributes() {
    return ['page'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback(_name: string, _oldValue: string | null, newValue: string | null) {
    if (newValue === 'chat' && this.shadowRoot) {
      this.render();
    } else if (this.shadowRoot) {
      this.shadowRoot.innerHTML = '';
    }
  }

  private handleInput(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    this.input = target.value;
  }

  private handleSubmit() {
    if (!this.input.trim() || this.isTyping) return;

    const message = this.input.trim();
    this.messages.push({ role: 'user', content: message });
    this.input = '';
    this.isTyping = true;
    this.render();

    // Simulate assistant response after a short delay
    setTimeout(() => {
      this.messages.push({
        role: 'assistant',
        content: 'This is a placeholder response. The chat backend is not yet connected.',
      });
      this.isTyping = false;
      this.render();
    }, 800);
  }

  private handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.handleSubmit();
    }
  }

  private render() {
    const hasMessages = this.messages.length > 0;

    this.shadowRoot!.innerHTML = `
      <style>
        :host {
          display: block;
          height: 100%;
        }

        .chat-pane {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: #1e1e2e;
          color: #cdd6f4;
        }

        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .empty-state {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: #585b70;
          gap: 12px;
        }

        .empty-state svg {
          width: 48px;
          height: 48px;
          opacity: 0.5;
        }

        .empty-state p {
          margin: 0;
          font-size: 16px;
        }

        .empty-state span {
          font-size: 13px;
          color: #45475a;
        }

        .message {
          display: flex;
          gap: 12px;
          max-width: 720px;
          margin: 0 auto;
          width: 100%;
        }

        .message-avatar {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          font-size: 14px;
          font-weight: 600;
        }

        .message.user .message-avatar {
          background: #89b4fa;
          color: #1e1e2e;
        }

        .message.assistant .message-avatar {
          background: #a6e3a1;
          color: #1e1e2e;
        }

        .message-content {
          flex: 1;
          padding-top: 4px;
          font-size: 14px;
          line-height: 1.6;
        }

        .message-content p {
          margin: 0 0 8px 0;
        }

        .message-content p:last-child {
          margin-bottom: 0;
        }

        .chat-input-area {
          padding: 16px 24px 24px;
          max-width: 720px;
          margin: 0 auto;
          width: 100%;
        }

        .chat-input-wrapper {
          display: flex;
          gap: 8px;
          align-items: flex-end;
          background: #181825;
          border: 1px solid #313244;
          border-radius: 12px;
          padding: 8px 12px;
          transition: border-color 0.15s ease;
        }

        .chat-input-wrapper:focus-within {
          border-color: #89b4fa;
        }

        .chat-input {
          flex: 1;
          background: none;
          border: none;
          outline: none;
          color: #cdd6f4;
          font-size: 14px;
          font-family: inherit;
          resize: none;
          min-height: 24px;
          max-height: 160px;
          line-height: 1.5;
        }

        .chat-input::placeholder {
          color: #585b70;
        }

        .send-btn {
          background: #89b4fa;
          border: none;
          border-radius: 8px;
          padding: 8px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.15s ease, opacity 0.15s ease;
          opacity: 1;
          flex-shrink: 0;
        }

        .send-btn:hover {
          background: #74c7ec;
        }

        .send-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .send-btn svg {
          width: 16px;
          height: 16px;
          color: #1e1e2e;
        }

        .typing-indicator {
          display: flex;
          gap: 4px;
          padding: 8px 0;
        }

        .typing-indicator span {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #585b70;
          animation: typing 1.4s infinite;
        }

        .typing-indicator span:nth-child(2) {
          animation-delay: 0.2s;
        }

        .typing-indicator span:nth-child(3) {
          animation-delay: 0.4s;
        }

        @keyframes typing {
          0%, 60%, 100% {
            opacity: 0.3;
            transform: translateY(0);
          }
          30% {
            opacity: 1;
            transform: translateY(-4px);
          }
        }
      </style>

      <div class="chat-pane">
        <div class="chat-messages">
          ${!hasMessages && !this.isTyping ? `
            <div class="empty-state">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
              <p>Start a conversation</p>
              <span>Type a message below to get started</span>
            </div>
          ` : ''}

          ${this.messages.map((msg) => `
            <div class="message ${msg.role}">
              <div class="message-avatar">${msg.role === 'user' ? 'U' : 'W'}</div>
              <div class="message-content">
                <p>${this.escapeHtml(msg.content)}</p>
              </div>
            </div>
          `).join('')}

          ${this.isTyping ? `
            <div class="message assistant">
              <div class="message-avatar">W</div>
              <div class="message-content">
                <div class="typing-indicator">
                  <span></span><span></span><span></span>
                </div>
              </div>
            </div>
          ` : ''}
        </div>

        <div class="chat-input-area">
          <div class="chat-input-wrapper">
            <textarea
              class="chat-input"
              placeholder="Type a message..."
              rows="1"
              .value="${this.input}"
              @input="${(e: Event) => this.handleInput(e)}"
              @keydown="${(e: KeyboardEvent) => this.handleKeydown(e)}"
            ></textarea>
            <button class="send-btn" ?disabled="${this.isTyping || !this.input.trim()}" @click="${() => this.handleSubmit()}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;

    const textarea = this.shadowRoot!.querySelector('.chat-input') as HTMLTextAreaElement;
    if (textarea) {
      textarea.value = this.input;
      textarea.addEventListener('input', (e) => this.handleInput(e));
      textarea.addEventListener('keydown', (e) => this.handleKeydown(e));

      // Auto-resize textarea
      textarea.addEventListener('input', () => {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 160) + 'px';
      });
    }

    const sendBtn = this.shadowRoot!.querySelector('.send-btn');
    if (sendBtn) {
      sendBtn.addEventListener('click', () => this.handleSubmit());
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

customElements.define('chat-pane', ChatPane);
