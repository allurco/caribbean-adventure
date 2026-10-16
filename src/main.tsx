import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { PreviewMarker } from "./online/PreviewMarker";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    {/* Preview deployments only (#107): which database this build talks to. */}
    <PreviewMarker />
  </StrictMode>
);
