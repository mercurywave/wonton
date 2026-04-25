import { chatStore } from '../stores/chat';
import { apiService } from '../services/api';

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      display: block;
    }

    .overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.2s ease, visibility 0.2s ease;
    }

    .overlay.open {
      opacity: 1;
      visibility: visible;
    }

    .panel {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      width: 480px;
      max-width: 90vw;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: var(--shadow-lg);
      transform: translateY(20px);
      transition: transform 0.2s ease;
    }

    .overlay.open .panel {
      transform: translateY(0);
    }

    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1.25rem 1.5rem;
      border-bottom: 1px solid var(--border-color);
    }

    .panel-title {
      font-size: var(--font-size-lg);
      font-weight: 700;
      color: var(--text-primary);
    }

    .close-btn {
      background: none;
      border: none;
      color: var(--text-muted);
      font-size: 1.2rem;
      cursor: pointer;
      width: 32px;
      height: 32px;
      border-radius: var(--radius-md);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background var(--transition-speed), color var(--transition-speed);
    }

    .close-btn:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    .panel-body {
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }

    .form-label {
      font-size: var(--font-size-sm);
      font-weight: 600;
      color: var(--text-secondary);
    }

    .form-input {
      padding: 0.6rem 0.85rem;
      background: var(--bg-input);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      color: var(--text-primary);
      font-family: var(--font-mono);
      font-size: var(--font-size-sm);
      outline: none;
      transition: border-color var(--transition-speed);
    }

    .form-input:focus {
      border-color: var(--accent);
    }

    .form-row {
      display: flex;
      gap: 1rem;
    }

    .form-row .form-group {
      flex: 1;
    }

    .range-group {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }

    .range-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .range-value {
      font-family: var(--font-mono);
      font-size: var(--font-size-sm);
      color: var(--text-accent);
    }

    input[type="range"] {
      -webkit-appearance: none;
      appearance: none;
      width: 100%;
      height: 6px;
      background: var(--bg-input);
      border-radius: var(--radius-full);
      outline: none;
      border: 1px solid var(--border-color);
    }

    input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 18px;
      height: 18px;
      background: var(--accent);
      border-radius: 50%;
      cursor: pointer;
    }

    input[type="range"]::-moz-range-thumb {
      width: 18px;
      height: 18px;
      background: var(--accent);
      border-radius: 50%;
      cursor: pointer;
      border: none;
    }

    .panel-footer {
      padding: 1rem 1.5rem;
      border-top: 1px solid var(--border-color);
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
    }

    .btn {
      padding: 0.5rem 1.25rem;
      border-radius: var(--radius-md);
      font-size: var(--font-size-sm);
      font-weight: 600;
      cursor: pointer;
      border: 1px solid var(--border-color);
      transition: background var(--transition-speed), border-color var(--transition-speed);
      font-family: inherit;
    }

    .btn-secondary {
      background: none;
      color: var(--text-secondary);
    }

    .btn-secondary:hover {
      background: var(--bg-hover);
    }

    .btn-primary {
      background: var(--accent);
      color: var(--bg-primary);
      border-color: var(--accent);
    }

    .btn-primary:hover {
      opacity: 0.85;
    }

    .status-msg {
      font-size: var(--font-size-xs);
      padding: 0.5rem;
      border-radius: var(--radius-md);
      text-align: center;
      display: none;
    }

    .status-msg.visible {
      display: block;
    }

    .status-msg.success {
      background: rgba(81, 207, 102, 0.1);
      color: var(--success);
      border: 1px solid rgba(81, 207, 102, 0.2);
    }

    .status-msg.error {
      background: rgba(255, 107, 107, 0.1);
      color: var(--danger);
      border: 1px solid rgba(255, 107, 107, 0.2);
    }
  </style>

  <div class="overlay" id="overlay">
    <div class="panel">
      <div class="panel-header">
        <span class="panel-title">Settings</span>
        <button class="close-btn" id="closeBtn">✕</button>
      </div>
      <div class="panel-body">
        <div class="form-group">
          <label class="form-label" for="baseUrl">LLM Server URL</label>
          <input
            class="form-input"
            type="text"
            id="baseUrl"
            placeholder="http://localhost:8080"
          />
        </div>
        <div class="form-group">
          <label class="form-label" for="model">Model</label>
          <input
            class="form-input"
            type="text"
            id="model"
            placeholder="qwen3:latest"
          />
        </div>
        <div class="form-row">
          <div class="form-group range-group">
            <div class="range-header">
              <label class="form-label" for="maxTokens">Max Tokens</label>
              <span class="range-value" id="maxTokensValue">2048</span>
            </div>
            <input
              type="range"
              id="maxTokens"
              min="256"
              max="8192"
              step="256"
            />
          </div>
          <div class="form-group range-group">
            <div class="range-header">
              <label class="form-label" for="temperature">Temperature</label>
              <span class="range-value" id="temperatureValue">0.7</span>
            </div>
            <input
              type="range"
              id="temperature"
              min="0"
              max="2"
              step="0.1"
            />
          </div>
        </div>
        <div class="status-msg" id="statusMsg"></div>
      </div>
      <div class="panel-footer">
        <button class="btn btn-secondary" id="cancelBtn">Cancel</button>
        <button class="btn btn-primary" id="saveBtn">Save</button>
      </div>
    </div>
  </div>
`;

class SettingsPanel extends HTMLElement {
  private overlay: HTMLElement;
  private baseUrlInput: HTMLInputElement;
  private modelInput: HTMLInputElement;
  private maxTokensInput: HTMLInputElement;
  private maxTokensValue: HTMLElement;
  private temperatureInput: HTMLInputElement;
  private temperatureValue: HTMLElement;
  private statusMsg: HTMLElement;
  private unsubscribe: (() => void) | null = null;

  open(): void {
    this.overlay.classList.add('open');
    this.loadCurrentConfig();
  }

  close(): void {
    this.overlay.classList.remove('open');
  }

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.appendChild(template.content.cloneNode(true));

    this.overlay = shadow!.getElementById('overlay')!;
    this.baseUrlInput = shadow!.getElementById('baseUrl')! as HTMLInputElement;
    this.modelInput = shadow!.getElementById('model')! as HTMLInputElement;
    this.maxTokensInput = shadow!.getElementById('maxTokens')! as HTMLInputElement;
    this.maxTokensValue = shadow!.getElementById('maxTokensValue')!;
    this.temperatureInput = shadow!.getElementById('temperature')! as HTMLInputElement;
    this.temperatureValue = shadow!.getElementById('temperatureValue')!;
    this.statusMsg = shadow!.getElementById('statusMsg')!;
  }

  connectedCallback() {
    this.shadowRoot!.getElementById('closeBtn')?.addEventListener('click', () => this.close());
    this.shadowRoot!.getElementById('cancelBtn')?.addEventListener('click', () => this.close());
    this.shadowRoot!.getElementById('saveBtn')?.addEventListener('click', () => this.saveConfig());

    // Close on overlay click
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    // Range input live updates
    this.maxTokensInput.addEventListener('input', () => {
      this.maxTokensValue.textContent = this.maxTokensInput.value;
    });

    this.temperatureInput.addEventListener('input', () => {
      this.temperatureValue.textContent = parseFloat(this.temperatureInput.value).toFixed(1);
    });

    // Keyboard
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.overlay.classList.contains('open')) {
        this.close();
      }
    });
  }

  private loadCurrentConfig(): void {
    const config = chatStore.snapshot.config;
    this.baseUrlInput.value = config.baseUrl;
    this.modelInput.value = config.model;
    this.maxTokensInput.value = config.maxTokens.toString();
    this.maxTokensValue.textContent = config.maxTokens.toString();
    this.temperatureInput.value = config.temperature.toString();
    this.temperatureValue.textContent = config.temperature.toFixed(1);
    this.hideStatus();
  }

  private async saveConfig(): Promise<void> {
    const newConfig = {
      baseUrl: this.baseUrlInput.value.trim(),
      model: this.modelInput.value.trim(),
      maxTokens: parseInt(this.maxTokensInput.value, 10),
      temperature: parseFloat(this.temperatureInput.value),
      stream: true,
    };

    try {
      const saved = await apiService.updateConfig(newConfig);
      chatStore.setConfig(saved);
      this.showStatus('Settings saved successfully', 'success');
      setTimeout(() => this.close(), 800);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save settings';
      this.showStatus(message, 'error');
    }
  }

  private showStatus(message: string, type: 'success' | 'error'): void {
    this.statusMsg.textContent = message;
    this.statusMsg.className = `status-msg visible ${type}`;
  }

  private hideStatus(): void {
    this.statusMsg.className = 'status-msg';
  }
}

customElements.define('settings-panel', SettingsPanel);
