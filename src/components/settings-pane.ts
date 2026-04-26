export class SettingsPane extends HTMLElement {
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
    if (newValue === 'settings' && this.shadowRoot) {
      this.render();
    } else if (this.shadowRoot) {
      this.shadowRoot.innerHTML = '';
    }
  }

  private render() {
    this.shadowRoot!.innerHTML = `
      <style>
        :host {
          display: block;
          height: 100%;
        }

        .settings-pane {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: #1e1e2e;
          color: #cdd6f4;
        }

        .settings-content {
          flex: 1;
          overflow-y: auto;
          padding: 32px;
          max-width: 640px;
          margin: 0 auto;
          width: 100%;
        }

        .settings-title {
          font-size: 22px;
          font-weight: 600;
          margin: 0 0 8px 0;
          color: #cdd6f4;
        }

        .settings-subtitle {
          font-size: 13px;
          color: #585b70;
          margin: 0 0 32px 0;
        }

        .settings-section {
          margin-bottom: 28px;
        }

        .settings-section h3 {
          font-size: 13px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #a6adc8;
          margin: 0 0 16px 0;
        }

        .setting-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 0;
          border-bottom: 1px solid #313244;
        }

        .setting-item:last-child {
          border-bottom: none;
        }

        .setting-label {
          font-size: 14px;
          color: #bac2de;
        }

        .setting-description {
          font-size: 12px;
          color: #585b70;
          margin-top: 2px;
        }

        .toggle-switch {
          position: relative;
          width: 40px;
          height: 22px;
          flex-shrink: 0;
        }

        .toggle-switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }

        .toggle-slider {
          position: absolute;
          inset: 0;
          background: #45475a;
          border-radius: 11px;
          cursor: pointer;
          transition: background 0.2s ease;
        }

        .toggle-slider::before {
          content: '';
          position: absolute;
          width: 16px;
          height: 16px;
          left: 3px;
          top: 3px;
          background: #cdd6f4;
          border-radius: 50%;
          transition: transform 0.2s ease;
        }

        .toggle-switch input:checked + .toggle-slider {
          background: #89b4fa;
        }

        .toggle-switch input:checked + .toggle-slider::before {
          transform: translateX(18px);
        }

        .setting-input {
          background: #181825;
          border: 1px solid #313244;
          border-radius: 8px;
          padding: 8px 12px;
          color: #cdd6f4;
          font-size: 13px;
          font-family: inherit;
          outline: none;
          width: 200px;
          transition: border-color 0.15s ease;
        }

        .setting-input:focus {
          border-color: #89b4fa;
        }

        .setting-select {
          background: #181825;
          border: 1px solid #313244;
          border-radius: 8px;
          padding: 8px 12px;
          color: #cdd6f4;
          font-size: 13px;
          font-family: inherit;
          outline: none;
          cursor: pointer;
          transition: border-color 0.15s ease;
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23585b70' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 10px center;
          padding-right: 32px;
        }

        .setting-select:focus {
          border-color: #89b4fa;
        }

        .setting-select option {
          background: #181825;
          color: #cdd6f4;
        }
      </style>

      <div class="settings-pane">
        <div class="settings-content">
          <h1 class="settings-title">Settings</h1>
          <p class="settings-subtitle">Configure your application preferences</p>

          <div class="settings-section">
            <h3>General</h3>

            <div class="setting-item">
              <div>
                <div class="setting-label">Start with window</div>
                <div class="setting-description">Launch the app in a window instead of maximized</div>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" checked>
                <span class="toggle-slider"></span>
              </label>
            </div>

            <div class="setting-item">
              <div>
                <div class="setting-label">Show sidebar by default</div>
                <div class="setting-description">Display the sidebar when the app opens</div>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" checked>
                <span class="toggle-slider"></span>
              </label>
            </div>

            <div class="setting-item">
              <div>
                <div class="setting-label">Language</div>
                <div class="setting-description">Interface display language</div>
              </div>
              <select class="setting-select">
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="de">German</option>
              </select>
            </div>
          </div>

          <div class="settings-section">
            <h3>Chat</h3>

            <div class="setting-item">
              <div>
                <div class="setting-label">Auto-responses</div>
                <div class="setting-description">Enable placeholder responses for testing</div>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" checked>
                <span class="toggle-slider"></span>
              </label>
            </div>

            <div class="setting-item">
              <div>
                <div class="setting-label">Response delay (ms)</div>
                <div class="setting-description">Simulated delay for assistant responses</div>
              </div>
              <input class="setting-input" type="number" value="800" min="0" max="5000" step="100">
            </div>
          </div>

          <div class="settings-section">
            <h3>Appearance</h3>

            <div class="setting-item">
              <div>
                <div class="setting-label">Theme</div>
                <div class="setting-description">Color scheme for the interface</div>
              </div>
              <select class="setting-select">
                <option value="catppuccin-mocha">Catppuccin Mocha</option>
                <option value="catppuccin-macchiato">Catppuccin Macchiato</option>
                <option value="catppuccin-frappe">Catppuccin Frappe</option>
                <option value="catppuccin-latte">Catppuccin Latte</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('settings-pane', SettingsPane);
