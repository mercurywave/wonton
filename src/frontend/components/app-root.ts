import { eventBus } from '../services/eventbus';
import type { EventType } from '../services/eventbus';
import './sidebar';
import './chat-panel';
import './chat-input';

export interface AppRootElement extends HTMLElement {
  sidebarCollapsed: boolean;
}

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }

    .layout {
      display: flex;
      height: 100%;
      width: 100%;
      overflow: hidden;
    }

    .sidebar-wrapper {
      width: var(--sidebar-width);
      min-width: var(--sidebar-width);
      transition: width var(--transition-speed) ease,
                  min-width var(--transition-speed) ease,
                  opacity var(--transition-speed) ease;
      overflow: hidden;
      flex-shrink: 0;
    }

    .sidebar-wrapper.collapsed {
      width: var(--sidebar-collapsed);
      min-width: var(--sidebar-collapsed);
      opacity: 0;
    }

    .main-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
      position: relative;
    }

    .toolbar {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
      height: 44px;
      flex-shrink: 0;
    }

    .toolbar-btn {
      background: none;
      border: 1px solid var(--border-color);
      color: var(--text-secondary);
      width: 32px;
      height: 32px;
      border-radius: var(--radius-md);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1rem;
      transition: background var(--transition-speed), color var(--transition-speed);
    }

    .toolbar-btn:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    .toolbar-title {
      flex: 1;
      text-align: center;
      font-size: var(--font-size-sm);
      font-weight: 600;
      color: var(--text-secondary);
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--text-muted);
      transition: background var(--transition-speed);
    }

    .status-dot.connected {
      background: var(--success);
    }

    .status-dot.error {
      background: var(--danger);
    }

    .content-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
  </style>

  <div class="layout">
    <div class="sidebar-wrapper" id="sidebarWrapper">
      <sidebar></sidebar>
    </div>
    <div class="main-area">
      <div class="toolbar">
        <button class="toolbar-btn" id="toggleSidebar" title="Toggle sidebar">☰</button>
        <span class="toolbar-title">Wonton</span>
        <div class="status-dot" id="statusDot"></div>
      </div>
      <div class="content-area">
        <chat-panel></chat-panel>
        <chat-input></chat-input>
      </div>
    </div>
  </div>
`;

class AppRoot extends HTMLElement {
  private wrapper: HTMLElement;
  private toggleBtn: HTMLButtonElement;
  private statusDot: HTMLElement;
  private connected = false;

  static get observedAttributes() {
    return ['sidebar-collapsed'];
  }

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.appendChild(template.content.cloneNode(true));

    this.wrapper = shadow!.getElementById('sidebarWrapper')!;
    this.toggleBtn = shadow!.getElementById('toggleSidebar')!;
    this.statusDot = shadow!.getElementById('statusDot')!;
  }

  connectedCallback() {
    this.toggleBtn.addEventListener('click', () => this.toggleSidebar());

    const collapsed = this.getAttribute('sidebar-collapsed') === 'true';
    if (collapsed) this.wrapper.classList.add('collapsed');

    this.checkBackendHealth();
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null) {
    if (name === 'sidebar-collapsed') {
      if (value === 'true') {
        this.wrapper.classList.add('collapsed');
      } else {
        this.wrapper.classList.remove('collapsed');
      }
    }
  }

  get sidebarCollapsed(): boolean {
    return this.getAttribute('sidebar-collapsed') === 'true';
  }

  set sidebarCollapsed(value: boolean) {
    this.setAttribute('sidebar-collapsed', String(value));
  }

  private toggleSidebar(): void {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    eventBus.emit(EventType.TOGGLE_SIDEBAR);
  }

  private async checkBackendHealth(): Promise<void> {
    try {
      const res = await fetch('http://localhost:3001/health');
      if (res.ok) {
        this.connected = true;
        this.statusDot.classList.add('connected');
      } else {
        throw new Error('Not ok');
      }
    } catch {
      this.connected = false;
      this.statusDot.classList.add('error');
    }
  }
}

customElements.define('app-root', AppRoot);
