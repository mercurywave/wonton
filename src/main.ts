import './components/app-sidebar.js';
import './components/chat-pane.js';
import './components/settings-pane.js';

type Page = 'chat' | 'settings';

class App {
  private currentPage: Page = 'chat';
  private sidebarCollapsed = false;

  constructor() {
    this.init();
  }

  private init() {
    const sidebar = document.querySelector('app-sidebar') as HTMLElement;
    const main = document.querySelector('main');
    if (!main) return;

    // Render initial layout
    main.innerHTML = `
      <app-sidebar page="chat" collapsed="false"></app-sidebar>
      <chat-pane page="chat"></chat-pane>
    `;

    // Listen for sidebar toggle
    document.addEventListener('sidebar-toggle', (e: Event) => {
      const detail = (e as CustomEvent).detail;
      this.sidebarCollapsed = detail.collapsed;
      const sb = document.querySelector('app-sidebar') as HTMLElement;
      if (sb) {
        sb.setAttribute('collapsed', String(this.sidebarCollapsed));
      }
    });

    // Listen for page changes from sidebar
    document.addEventListener('page-change', (e: Event) => {
      const detail = (e as CustomEvent).detail;
      this.switchPage(detail.page);
    });
  }

  private switchPage(page: Page) {
    this.currentPage = page;
    const main = document.querySelector('main');
    if (!main) return;

    main.innerHTML = `
      <app-sidebar page="${page}" collapsed="${String(this.sidebarCollapsed)}"></app-sidebar>
    `;

    // Re-attach event listeners after re-render
    const sidebar = document.querySelector('app-sidebar') as HTMLElement;
    if (sidebar) {
      sidebar.setAttribute('page', page);
      sidebar.setAttribute('collapsed', String(this.sidebarCollapsed));
    }

    if (page === 'chat') {
      main.innerHTML += '<chat-pane page="chat"></chat-pane>';
    } else if (page === 'settings') {
      main.innerHTML += '<settings-pane page="settings"></settings-pane>';
    }
  }
}

// Initialize app once DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new App());
} else {
  new App();
}
