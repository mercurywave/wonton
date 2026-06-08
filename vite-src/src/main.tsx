import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { AppProviders } from "./contexts";
import "./index.css";

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<AppProviders>
			<App />
		</AppProviders>
	</StrictMode>
);
