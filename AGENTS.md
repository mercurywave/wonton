This is an Electron app built with TypeScript and Vite.

You are running in Windows. To type check the build use
```node node_modules\typescript\bin\tsc --noEmit 2>&1```

The app uses Electron with a preload script for IPC communication between the renderer (React/Vite) and main (Node.js) processes. The renderer never has direct access to Node.js APIs - all filesystem, OS, and computer operations go through `window.electronAPI`.

This project uses a Context-Hook Bridge pattern: pure custom hooks in src/hooks/ encapsulate all state and logic (they're React-tree-independent and never import contexts), while thin React Context wrappers in src/contexts/ instantiate those hooks inside Provider components and expose them via consumer hooks. Components consume their own contexts directly — App.tsx is a page router, not a data hub. Cross-context dependencies flow through Provider nesting (e.g., ChatsProvider consumes useProjects()), not through props threaded via App.tsx. When an action needs to trigger effects across modules, App.tsx provides a callback prop; read state is always pulled directly from the owning context.