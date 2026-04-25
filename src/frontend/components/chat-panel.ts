import { chatStore } from '../stores/chat';
import { apiService } from '../services/api';
import { eventBus } from '../services/eventbus';
import type { EventType } from '../services/eventbus';
import './chat-message';

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      display: block;
      flex: 1;
      overflow: hidden;
    }

    .chat-panel {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }

    .messages-container {
      flex: 1;
      overflow-y: auto;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .welcome-screen {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      color: var(--text-muted);
      text-align: center;
      padding: 2rem;
    }

    .welcome-icon {
      font-size: 3rem;
      margin-bottom: 0.5rem;
    }

    .welcome-title {
      font-size: var(--font-size-xl);
      font-weight: 700;
      color: var(--text-primary);
    }

    .welcome-subtitle {
      font-size: var(--font-size-sm);
      max-width: 400px;
      line-height: 1.6;
    }

    .error-banner {
      background: rgba(255, 107, 107, 0.1);
      border: 1px solid rgba(255, 107, 107, 0.3);
      color: var(--danger);
      padding: 0.5rem 1rem;
      border-radius: var(--radius-md);
      font-size: var(--font-size-sm);
      margin: 0 1.5rem;
      display: none;
    }

    .error-banner.visible {
      display: block;
    }

    .streaming-indicator {
      display: inline-flex;
      gap: 4px;
      padding: 0.5rem 0;
    }

    .streaming-indicator span {
      width: 6px;
      height: 6px;
      background: var(--text-muted);
      border-radius: 50%;
      animation: pulse 1.4s infinite ease-in-out;
    }

    .streaming-indicator span:nth-child(2) {
      animation-delay: 0.2s;
    }

    .streaming-indicator span:nth-child(3) {
      animation-delay: 0.4s;
    }

    @keyframes pulse {
      0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
      40% { transform: scale(1); opacity: 1; }
    }
  </style>

  <div class="chat-panel">
    <div class="error-banner" id="errorBanner"></div>
    <div class="messages-container" id="messagesContainer">
      <div class="welcome-screen" id="welcomeScreen">
        <div class="welcome-icon">🥟</div>
        <div class="welcome-title">Welcome to Wonton</div>
        <div class="welcome-subtitle">
          Your local-first AI coding harness. Send a message to start a conversation with your local LLM.
        </div>
      </div>
    </div>
  </div>
`;

class ChatPanel extends HTMLElement {
  private messagesContainer: HTMLElement;
  private welcomeScreen: HTMLElement;
  private errorBanner: HTMLElement;
  private unsubscribe: (() => void) | null = null;
  private isStreaming = false;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.appendChild(template.content.cloneNode(true));

    this.messagesContainer = shadow!.getElementById('messagesContainer')!;
    this.welcomeScreen = shadow!.getElementById('welcomeScreen')!;
    this.errorBanner = shadow!.getElementById('errorBanner')!;
  }

  connectedCallback() {
    this.unsubscribe = chatStore.subscribe((state) => {
      this.render(state);
      this.showError(state.error);
    });

    eventBus.on(EventType.CLEAR_CHAT, () => {
      this.render(chatStore.snapshot);
    });
  }

  disconnectedCallback() {
    this.unsubscribe?.();
  }

  private render(state: typeof chatStore.snapshot): void {
    // Toggle welcome screen
    if (state.messages.length === 0 && !this.isStreaming) {
      this.welcomeScreen.style.display = 'flex';
    } else {
      this.welcomeScreen.style.display = 'none';
    }

    // Update or re-render messages
    const messageElements = this.messagesContainer.querySelectorAll('chat-message');
    const currentCount = messageElements.length;
    const expectedCount = state.messages.length;

    if (currentCount === expectedCount && expectedCount > 0) {
      // Update existing messages
      state.messages.forEach((msg, index) => {
        const el = messageElements[index] as ChatMessageElement;
        if (el) {
          el.message = msg;
        }
      });
    } else {
      // Re-render all messages
      // Keep welcome screen hidden
      this.welcomeScreen.style.display = 'none';

      // Remove old message elements
      messageElements.forEach((el) => el.remove());

      // Add new message elements
      state.messages.forEach((msg) => {
        const el = document.createElement('chat-message') as ChatMessageElement;
        el.message = msg;
        this.messagesContainer.appendChild(el);
      });
    }

    // Scroll to bottom
    this.scrollToBottom();

    // Show streaming indicator
    this.updateStreamingIndicator(state.isLoading);
  }

  private updateStreamingIndicator(isLoading: boolean): void {
    // Remove old indicator
    const old = this.messagesContainer.querySelector('.streaming-indicator');
    if (old) old.remove();

    if (isLoading) {
      this.isStreaming = true;
      const indicator = document.createElement('div');
      indicator.className = 'streaming-indicator';
      indicator.innerHTML = '<span></span><span></span><span></span>';

      const assistantMsg = this.messagesContainer.querySelector('chat-message:last-of-type');
      if (assistantMsg) {
        assistantMsg.after(indicator);
      } else {
        this.messagesContainer.appendChild(indicator);
      }
      this.scrollToBottom();
    } else {
      this.isStreaming = false;
    }
  }

  private showError(error: string | null): void {
    if (error) {
      this.errorBanner.textContent = error;
      this.errorBanner.classList.add('visible');
    } else {
      this.errorBanner.classList.remove('visible');
    }
  }

  private scrollToBottom(): void {
    requestAnimationFrame(() => {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    });
  }
}

customElements.define('chat-panel', ChatPanel);
