import { ChatMessage, MessageRole } from '../../backend/types';

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      display: block;
      width: 100%;
      max-width: 800px;
      margin: 0 auto;
    }

    .message {
      display: flex;
      gap: 0.75rem;
      padding: 0.75rem 0;
      animation: fadeIn 0.2s ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .message.user {
      flex-direction: row-reverse;
    }

    .avatar {
      width: 32px;
      height: 32px;
      border-radius: var(--radius-full);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.85rem;
      flex-shrink: 0;
      font-weight: 600;
    }

    .message.user .avatar {
      background: var(--bg-tertiary);
      color: var(--text-accent);
    }

    .message.assistant .avatar {
      background: var(--accent-dim);
      color: var(--accent);
    }

    .message.system .avatar {
      background: var(--bg-hover);
      color: var(--text-secondary);
    }

    .bubble {
      max-width: 85%;
      padding: 0.75rem 1rem;
      border-radius: var(--radius-lg);
      font-size: var(--font-size-base);
      line-height: 1.6;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }

    .message.user .bubble {
      background: var(--bg-user-msg);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg) var(--radius-lg) 4px var(--radius-lg);
      color: var(--text-primary);
    }

    .message.assistant .bubble {
      background: var(--bg-assistant-msg);
      border: 1px solid var(--border-light);
      border-radius: var(--radius-lg) var(--radius-lg) var(--radius-lg) 4px;
      color: var(--text-primary);
    }

    .message.system .bubble {
      background: transparent;
      border: 1px dashed var(--border-color);
      color: var(--text-muted);
      font-size: var(--font-size-sm);
    }

    .msg-content {
      font-size: inherit;
      line-height: inherit;
    }

    .msg-content p {
      margin-bottom: 0.5em;
    }

    .msg-content p:last-child {
      margin-bottom: 0;
    }

    .msg-content code {
      font-family: var(--font-mono);
      font-size: 0.85em;
      background: var(--bg-primary);
      padding: 0.15em 0.4em;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border-light);
    }

    .msg-content pre {
      background: var(--bg-primary);
      padding: 0.75em 1em;
      border-radius: var(--radius-md);
      overflow-x: auto;
      margin: 0.5em 0;
      border: 1px solid var(--border-light);
      font-size: var(--font-size-sm);
      line-height: 1.5;
    }

    .msg-content pre code {
      background: none;
      padding: 0;
      border: none;
    }

    .msg-content blockquote {
      border-left: 3px solid var(--accent);
      padding-left: 0.75em;
      color: var(--text-secondary);
      margin: 0.5em 0;
    }

    .msg-content ul,
    .msg-content ol {
      padding-left: 1.5em;
      margin: 0.5em 0;
    }

    .msg-content li {
      margin-bottom: 0.25em;
    }

    .msg-content table {
      border-collapse: collapse;
      width: 100%;
      margin: 0.5em 0;
      font-size: var(--font-size-sm);
    }

    .msg-content th,
    .msg-content td {
      border: 1px solid var(--border-light);
      padding: 0.4em 0.75em;
      text-align: left;
    }

    .msg-content th {
      background: var(--bg-secondary);
    }

    .msg-content h1,
    .msg-content h2,
    .msg-content h3 {
      margin: 0.75em 0 0.4em;
      font-weight: 600;
    }

    .msg-content h1 { font-size: 1.3em; }
    .msg-content h2 { font-size: 1.15em; }
    .msg-content h3 { font-size: 1.05em; }

    .msg-content hr {
      border: none;
      border-top: 1px solid var(--border-color);
      margin: 0.75em 0;
    }

    .msg-content a {
      color: var(--text-accent);
      text-decoration: underline;
    }

    .msg-content strong {
      font-weight: 600;
      color: var(--text-primary);
    }

    .msg-content em {
      font-style: italic;
    }

    .timestamp {
      font-size: var(--font-size-xs);
      color: var(--text-muted);
      margin-top: 0.35rem;
      opacity: 0.7;
    }

    .message.user .timestamp {
      text-align: right;
    }
  </style>

  <div class="message" id="messageRow">
    <div class="avatar" id="avatar"></div>
    <div>
      <div class="bubble">
        <div class="msg-content" id="msgContent"></div>
      </div>
      <div class="timestamp" id="timestamp"></div>
    </div>
  </div>
`;

export class ChatMessageElement extends HTMLElement {
  private messageRow: HTMLElement;
  private avatar: HTMLElement;
  private msgContent: HTMLElement;
  private timestamp: HTMLElement;

  static get observedAttributes() {
    return ['role'];
  }

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.appendChild(template.content.cloneNode(true));

    this.messageRow = shadow!.getElementById('messageRow')!;
    this.avatar = shadow!.getElementById('avatar')!;
    this.msgContent = shadow!.getElementById('msgContent')!;
    this.timestamp = shadow!.getElementById('timestamp')!;
  }

  get message(): ChatMessage {
    const role = this.getAttribute('role') as MessageRole;
    const content = this.getAttribute('content') ?? '';
    return { role, content };
  }

  set message(msg: ChatMessage) {
    this.setAttribute('role', msg.role);
    this.setAttribute('content', msg.content);
    this.render(msg);
  }

  attributeChangedCallback(_name: string, _old: string | null, value: string | null) {
    if (!value) return;
    const role = this.getAttribute('role') as MessageRole;
    const content = this.getAttribute('content') ?? '';
    this.render({ role, content });
  }

  private render(msg: ChatMessage): void {
    this.messageRow.className = `message ${msg.role}`;

    // Avatar
    if (msg.role === 'user') {
      this.avatar.textContent = 'U';
    } else if (msg.role === 'assistant') {
      this.avatar.textContent = 'AI';
    } else {
      this.avatar.textContent = 'S';
    }

    // Content (simple markdown-like rendering)
    this.msgContent.innerHTML = this.renderContent(msg.content);

    // Timestamp
    if (msg.role !== 'system') {
      const now = new Date();
      this.timestamp.textContent = now.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
    } else {
      this.timestamp.textContent = '';
    }
  }

  private renderContent(content: string): string {
    // Escape HTML
    let escaped = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Code blocks
    escaped = escaped.replace(
      /```(\w*)\n([\s\S]*?)```/g,
      '<pre><code>$2</code></pre>',
    );

    // Inline code
    escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold
    escaped = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Italic
    escaped = escaped.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Headers
    escaped = escaped.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    escaped = escaped.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    escaped = escaped.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Horizontal rule
    escaped = escaped.replace(/^---$/gm, '<hr>');

    // Blockquote
    escaped = escaped.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

    // Unordered list items
    escaped = escaped.replace(/^- (.+)$/gm, '<li>$1</li>');
    escaped = escaped.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

    // Ordered list items
    escaped = escaped.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

    // Links
    escaped = escaped.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>',
    );

    // Paragraphs (double newlines)
    escaped = escaped.replace(/\n\n/g, '</p><p>');

    // Single newlines to <br>
    escaped = escaped.replace(/\n/g, '<br>');

    // Wrap in paragraph
    if (!escaped.startsWith('<')) {
      escaped = `<p>${escaped}</p>`;
    }

    return escaped;
  }
}

customElements.define('chat-message', ChatMessageElement);
