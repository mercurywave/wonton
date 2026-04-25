import { eventBus, EventType } from '../services/eventbus';
import { chatStore } from '../stores/chat';
import { apiService } from '../services/api';

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }

    .sidebar {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--bg-sidebar);
      border-right: 1px solid var(--border-color);
      overflow: hidden;
    }

    .sidebar-header {
      padding: 1rem;
      border-bottom: 1px solid var(--border-color);
    }

    .sidebar-title {
      font-size: var(--font-size-md);
      font-weight: 700;
      color: var(--text-primary);
      margin-bottom: 0.25rem;
    }

    .sidebar-subtitle {
      font-size: var(--font-size-xs);
      color: var(--text-muted);
    }

    .sidebar-actions {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      padding: 0.75rem 1rem;
    }

    .action-btn {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.5rem 0.75rem;
      background: none;
      border: 1px solid transparent;
      color: var(--text-secondary);
      border-radius: var(--radius-md);
      cursor: pointer;
      font-size: var(--font-size-sm);
      font-family: inherit;
      text-align: left;
      width: 100%;
      transition: background var(--transition-speed), border-color var(--transition-speed), color var(--transition-speed);
    }

    .action-btn:hover {
      background: var(--bg-hover);
      border-color: var(--border-color);
      color: var(--text-primary);
    }

    .action-btn .icon {
      font-size: 1rem;
      width: 1.25rem;
      text-align: center;
    }

    .sidebar-section {
      padding: 0.5rem 1rem;
      flex: 1;
      overflow-y: auto;
    }

    .section-label {
      font-size: var(--font-size-xs);
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 0.5rem;
    }

    .config-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.35rem 0;
      font-size: var(--font-size-sm);
    }

    .config-label {
      color: var(--text-secondary);
    }

    .config-value {
      color: var(--text-accent);
      font-family: var(--font-mono);
      font-size: var(--font-size-xs);
    }

    .sidebar-footer {
      padding: 0.75rem 1rem;
      border-top: 1px solid var(--border-color);
      font-size: var(--font-size-xs);
      color: var(--text-muted);
      text-align: center;
    }
  </style>

  <div class="sidebar">
    <div class="sidebar-header">
      <div class="sidebar-title">Wonton</div>
      <div class="sidebar-subtitle">AI Agent Harness</div>
    </div>

    <div class="sidebar-actions">
      <button class="action-btn" id="newChat">
        <span class="icon">+</span>
        <span>New Chat</span>
      </button>
      <button class="action-btn" id="clearChat">
        <span class="icon">🗑</span>
        <span>Clear Chat</span>
      </button>
      <button class="action-btn" id="openSettings">
        <span class="icon">⚙</span>
        <span>Settings</span>
      </button>
    </div>

    <div class="sidebar-section">
      <div class="section-label">Configuration</div>
      <div class="config-item">
        <span class="config-label">Model</span>
        <span class="config-value" id="configModel">--</span>
      </div>
      <div class="config-item">
        <span class="config-label">Server</span>
        <span class="config-value" id="configServer">--</span>
      </div>
      <div class="config-item">
        <span class="config-label">Max Tokens</span>
        <span class="config-value" id="configMaxTokens">--</span>
      </div>
    </div>

    <div class="sidebar-footer">
      Wonton v1.0.0
    </div>
  </div>
`;

class Sidebar extends HTMLElement {
  private modelEl: HTMLElement;
  private serverEl: HTMLElement;
  private maxTokensEl: HTMLElement;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.appendChild(template.content.cloneNode(true));

    this.modelEl = shadow!.getElementById('configModel')!;
    this.serverEl = shadow!.getElementById('configServer')!;
    this.maxTokensEl = shadow!.getElementById('configMaxTokens')!;
  }

  connectedCallback() {
    this.shadowRoot!.getElementById('newChat')?.addEventListener('click', () => {
      chatStore.clearMessages();
    });

    this.shadowRoot!.getElementById('clearChat')?.addEventListener('click', () => {
      chatStore.clearMessages();
    });

    this.shadowRoot!.getElementById('openSettings')?.addEventListener('click', () => {
      const settingsPanel = document.querySelector('settings-panel') as SettingsPanel;
      if (settingsPanel) {
        settingsPanel.open();
      } else {
        const el = document.createElement('settings-panel');
        document.body.appendChild(el);
        el.open();
      }
    });

    this.loadConfig();
    this.subscribeToConfig();
  }

  private async loadConfig(): Promise<void> {
    try {
      const config = await apiService.getConfig();
      chatStore.setConfig(config);
      this.updateConfigDisplay(config);
    } catch {
      // Backend not available yet, will retry
    }
  }

  private subscribeToConfig(): void {
    chatStore.subscribe((state) => {
      this.updateConfigDisplay(state.config);
    });
  }

  private updateConfigDisplay(config: typeof chatStore.snapshot.config): void {
    this.modelEl.textContent = config.model;
    this.serverEl.textContent = config.baseUrl.split('://')[1] ?? config.baseUrl;
    this.maxTokensEl.textContent = config.maxTokens.toString();
  }
}

customElements.define('sidebar', Sidebar);
