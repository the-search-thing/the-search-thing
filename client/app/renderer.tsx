import React from "react";
import ReactDOM from "react-dom/client";
import { WindowContextProvider } from "@/app/components/window";
import { ErrorBoundary } from "./components/ErrorBoundary";
import App from "./app";

ReactDOM.createRoot(document.getElementById("app") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <WindowContextProvider>
        <App />
      </WindowContextProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
