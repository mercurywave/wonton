import './components/app-root';
import './components/sidebar';
import './components/chat-panel';
import './components/chat-input';
import './components/chat-message';
import './components/settings-panel';
import { chatStore } from './stores/chat';
import { apiService } from './services/api';

async function bootstrap(): Promise<void> {
  // Load LLM config from backend
  try {
    const config = await apiService.getConfig();
    chatStore.setConfig(config);
  } catch {
    // Backend not available in dev mode with neutralino static serving
    // Use defaults from store
    console.warn('Backend not available, using default config');
  }

  // Ensure app root is ready
  const appRoot = document.querySelector('app-root') as AppRoot;
  if (appRoot) {
    appRoot.sidebarCollapsed = false;
  }

  console.log('Wonton initialized');
}

bootstrap();
