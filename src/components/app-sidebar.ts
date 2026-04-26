export type SidebarPage = 'chat' | 'settings';

export class AppSidebar extends HTMLElement {
  private collapsed = false;
  private currentPage: SidebarPage = 'chat';

  static get observedAttributes() {
    return ['collapsed', 'page'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
    if (name === 'collapsed') {
      this.collapsed = newValue === 'true';
    }
    if (name === 'page') {
      this.currentPage = newValue as SidebarPage;
    }
    if (this.shadowRoot) {
      this.render();
    }
  }

  private toggleCollapse() {
    this.collapsed = !this.collapsed;
    this.dispatchEvent(new CustomEvent('sidebar-toggle', {
      bubbles: true,
      composed: true,
      detail: { collapsed: this.collapsed },
    }));
  }

  private navigateTo(page: SidebarPage) {
    this.currentPage = page;
    this.dispatchEvent(new CustomEvent('page-change', {
      bubbles: true,
      composed: true,
      detail: { page },
    }));
  }

  private render() {
    const width = this.collapsed ? '48px' : '260px';

    this.shadowRoot!.innerHTML = `
      <style>
        :host {
          display: block;
          height: 100%;
        }

        .sidebar {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: #1e1e2e;
          color: #cdd6f4;
          transition: width 0.25s ease;
          width: ${width};
          overflow: hidden;
          border-right: 1px solid #313244;
        }

        .sidebar-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-bottom: 1px solid #313244;
          min-height: 48px;
        }

        .sidebar-header h2 {
          margin: 0;
          font-size: 14px;
          font-weight: 600;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          color: #a6adc8;
          white-space: nowrap;
          opacity: ${this.collapsed ? '0' : '1'};
          transition: opacity 0.2s ease;
        }

        .collapse-btn {
          background: none;
          border: none;
          color: #a6adc8;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.15s ease, color 0.15s ease;
        }

        .collapse-btn:hover {
          background: #313244;
          color: #cdd6f4;
        }

        .collapse-btn svg {
          width: 18px;
          height: 18px;
          transition: transform 0.25s ease;
        }

        .sidebar-nav {
          flex: 1;
          padding: 8px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .nav-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.15s ease;
          text-decoration: none;
          color: #bac2de;
          font-size: 14px;
          white-space: nowrap;
          border: none;
          background: none;
          width: 100%;
          text-align: left;
          font-family: inherit;
        }

        .nav-item:hover {
          background: #313244;
        }

        .nav-item.active {
          background: #45475a;
          color: #cdd6f4;
        }

        .nav-item svg {
          width: 18px;
          height: 18px;
          flex-shrink: 0;
          opacity: 0.7;
        }

        .nav-item.active svg {
          opacity: 1;
        }

        .nav-item-label {
          opacity: ${this.collapsed ? '0' : '1'};
          transition: opacity 0.2s ease;
        }

        .sidebar-footer {
          padding: 12px 16px;
          border-top: 1px solid #313244;
          font-size: 11px;
          color: #585b70;
          white-space: nowrap;
        }
      </style>

      <nav class="sidebar">
        <div class="sidebar-header">
          <h2>Wonton</h2>
          <button class="collapse-btn" aria-label="Toggle sidebar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>
        </div>

        <div class="sidebar-nav">
          <button class="nav-item ${this.currentPage === 'chat' ? 'active' : ''}" data-page="chat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            <span class="nav-item-label">Chat</span>
          </button>

          <button class="nav-item ${this.currentPage === 'settings' ? 'active' : ''}" data-page="settings">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
            <span class="nav-item-label">Settings</span>
          </button>
        </div>

        <div class="sidebar-footer">
          Wonton v1.0
        </div>
      </nav>
    `;

    this.shadowRoot!.querySelector('.collapse-btn')!.addEventListener('click', () => this.toggleCollapse());
    this.shadowRoot!.querySelectorAll('.nav-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const page = btn.getAttribute('data-page') as SidebarPage;
        this.navigateTo(page);
      });
    });
  }
}

customElements.define('app-sidebar', AppSidebar);
