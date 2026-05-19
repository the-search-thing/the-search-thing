import { useEffect } from "react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import Home from "@/app/home/Home";
import Settings from "@/app/settings/Settings";
import "./styles/app.css";
import { AppProvider } from "./AppContext";
import { useKeybinds } from "./hooks/use-keybinds";
import { useGeneralSettings } from "./hooks/use-general-settings";
import { matchesCombo } from "@/lib/storage/keybind-store";

function GlobalHotkeys() {
  const navigate = useNavigate();
  const location = useLocation();
  const { keybinds } = useKeybinds();
  const { settings } = useGeneralSettings();

  useEffect(() => {
    const runAfterRouteChange = (action: () => void) => {
      requestAnimationFrame(() => requestAnimationFrame(action));
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      if (document.body.dataset.keybindRecording === "true") {
        return;
      }
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      const isEditable =
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        target?.isContentEditable;
      const isSearchInput = !!target?.closest?.('[data-search-input="true"]');
      const vimModeEnabled = settings["input-mode"] === "vim";

      if (
        vimModeEnabled &&
        location.pathname === "/" &&
        !isEditable &&
        !event.isComposing &&
        !event.repeat &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        event.key === "/"
      ) {
        event.preventDefault();
        const input = document.querySelector<HTMLInputElement>('[data-search-input="true"]');
        if (input) {
          input.focus();
          input.select();
        }
        return;
      }

      if (matchesCombo(event, keybinds.search)) {
        event.preventDefault();
        navigate("/");
        runAfterRouteChange(() => {
          const input = document.querySelector<HTMLInputElement>('[data-search-input="true"]');
          if (input) {
            input.focus();
            input.select();
          }
        });
        return;
      }

      if (matchesCombo(event, keybinds.index)) {
        // Allow indexing from the search bar even while typing.
        if (isEditable && !isSearchInput) return;
        event.preventDefault();
        navigate("/");
        runAfterRouteChange(() => {
          const indexButton = document.querySelector<HTMLButtonElement>(
            '[data-index-button="true"]',
          );
          if (indexButton) {
            indexButton.click();
          }
        });
        return;
      }

      if (matchesCombo(event, keybinds.settings)) {
        event.preventDefault();
        navigate("/settings");
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [navigate, location.pathname, keybinds, settings]);

  return null;
}

function GlobalAppearancePreference() {
  const { settings } = useGeneralSettings();

  useEffect(() => {
    const root = document.documentElement;
    const isDark = settings.theme === "dark";

    root.classList.toggle("dark", isDark);
    root.classList.toggle("light", !isDark);
    document.body.dataset.font = settings.font;

    return () => {
      root.classList.remove("dark", "light");
      delete document.body.dataset.font;
    };
  }, [settings.font, settings.theme]);

  return null;
}

export default function App() {
  return (
    <AppProvider>
      <MemoryRouter initialEntries={["/"]} initialIndex={0}>
        <GlobalAppearancePreference />
        <GlobalHotkeys />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </MemoryRouter>
    </AppProvider>
  );
}
