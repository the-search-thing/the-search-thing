import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGeneralSettings } from "@/app/hooks/use-general-settings";
import SettingsSidebar from "../components/settings/SettingsSidebar";
import SettingsContent from "../components/settings/SettingsContent";

const SETTINGS_ITEMS = ["General", "Keybinds", "About"] as const;
type SettingsItem = (typeof SETTINGS_ITEMS)[number];

export default function Settings() {
  const navigate = useNavigate();
  const { settings } = useGeneralSettings();
  const [selectedItem, setSelectedItem] = useState<SettingsItem>("General");
  const [activePane, setActivePane] = useState<"sidebar" | "content">("sidebar");
  const sidebarPaneRef = useRef<HTMLDivElement | null>(null);
  const contentPaneRef = useRef<HTMLDivElement | null>(null);
  const awaitingCtrlWRef = useRef(false);
  const ctrlWTimeoutRef = useRef<number | null>(null);

  const handleSelect = (item: string) => {
    if (SETTINGS_ITEMS.includes(item as SettingsItem)) {
      setSelectedItem(item as SettingsItem);
    }
  };

  const clearCtrlWPrefix = useCallback(() => {
    awaitingCtrlWRef.current = false;
    if (ctrlWTimeoutRef.current !== null) {
      window.clearTimeout(ctrlWTimeoutRef.current);
      ctrlWTimeoutRef.current = null;
    }
  }, []);

  const armCtrlWPrefix = useCallback(() => {
    clearCtrlWPrefix();
    awaitingCtrlWRef.current = true;
    ctrlWTimeoutRef.current = window.setTimeout(() => {
      awaitingCtrlWRef.current = false;
      ctrlWTimeoutRef.current = null;
    }, 1200);
  }, [clearCtrlWPrefix]);

  const focusSidebar = useCallback(() => {
    const selectedTab = sidebarPaneRef.current?.querySelector<HTMLButtonElement>(
      '[role="tab"][aria-selected="true"]',
    );
    selectedTab?.focus();
  }, []);

  const focusContent = useCallback(() => {
    const content = contentPaneRef.current;
    if (!content) return;

    const firstFocusable = content.querySelector<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );

    if (firstFocusable) {
      firstFocusable.focus();
      return;
    }

    content.focus();
  }, []);

  const moveSelection = useCallback((step: number) => {
    setSelectedItem((prev) => {
      const currentIndex = SETTINGS_ITEMS.indexOf(prev);
      const nextIndex = (currentIndex + step + SETTINGS_ITEMS.length) % SETTINGS_ITEMS.length;
      return SETTINGS_ITEMS[nextIndex];
    });
  }, []);

  const getContentFocusableElements = useCallback((): HTMLElement[] => {
    const content = contentPaneRef.current;
    if (!content) return [];
    return Array.from(
      content.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => {
      const style = window.getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden";
    });
  }, []);

  const moveContentFocus = useCallback(
    (step: number) => {
      const focusable = getContentFocusableElements();
      if (focusable.length === 0) return;

      const active = document.activeElement as HTMLElement | null;
      const currentIndex = active ? focusable.indexOf(active) : -1;

      if (currentIndex === -1) {
        const fallbackIndex = step > 0 ? 0 : focusable.length - 1;
        focusable[fallbackIndex]?.focus();
        return;
      }

      const nextIndex = (currentIndex + step + focusable.length) % focusable.length;
      focusable[nextIndex]?.focus();
    },
    [getContentFocusableElements],
  );

  const openFocusedSelect = useCallback(() => {
    const active = document.activeElement as HTMLElement | null;
    if (!(active instanceof HTMLSelectElement)) return false;

    const selectWithPicker = active as HTMLSelectElement & { showPicker?: () => void };
    if (typeof selectWithPicker.showPicker === "function") {
      selectWithPicker.showPicker();
      return true;
    }

    active.click();
    return true;
  }, []);

  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (sidebarPaneRef.current?.contains(target)) {
        setActivePane("sidebar");
        return;
      }
      if (contentPaneRef.current?.contains(target)) {
        setActivePane("content");
      }
    };

    window.addEventListener("focusin", onFocusIn);
    return () => window.removeEventListener("focusin", onFocusIn);
  }, []);

  useEffect(() => {
    if (settings["input-mode"] !== "vim") {
      clearCtrlWPrefix();
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.repeat) {
        return;
      }
      if (document.body.dataset.keybindRecording === "true") {
        return;
      }

      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      const isTextEditable = tagName === "input" || tagName === "textarea" || target?.isContentEditable;

      if (isTextEditable) {
        return;
      }

      if (
        event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        event.key.toLowerCase() === "w"
      ) {
        event.preventDefault();
        armCtrlWPrefix();
        return;
      }

      if (!awaitingCtrlWRef.current) {
        const key = event.key.toLowerCase();
        const hasModifiers =
          event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.repeat;

        if (activePane === "content" && !hasModifiers) {
          if (key === "j" || key === "k") {
            event.preventDefault();
            moveContentFocus(key === "j" ? 1 : -1);
            return;
          }

          if (key === "enter" && openFocusedSelect()) {
            event.preventDefault();
            return;
          }
        }

        return;
      }

      const key = event.key.toLowerCase();

      if (key === "escape") {
        clearCtrlWPrefix();
        return;
      }

      if (key === "h") {
        event.preventDefault();
        clearCtrlWPrefix();
        setActivePane("sidebar");
        focusSidebar();
        return;
      }

      if (key === "l") {
        event.preventDefault();
        clearCtrlWPrefix();
        setActivePane("content");
        focusContent();
        return;
      }

      if (key === "j" || key === "k") {
        event.preventDefault();
        clearCtrlWPrefix();
        setActivePane("sidebar");
        moveSelection(key === "j" ? 1 : -1);
        requestAnimationFrame(() => focusSidebar());
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      clearCtrlWPrefix();
    };
  }, [
    activePane,
    armCtrlWPrefix,
    clearCtrlWPrefix,
    focusContent,
    focusSidebar,
    moveContentFocus,
    moveSelection,
    openFocusedSelect,
    settings,
  ]);

  return (
    <div className="flex flex-col h-screen">
      <div
        className={cn(
          "flex flex-row items-center flex-none min-h-[35px]",
          "bg-zinc-800/60 px-4",
          "shadow-[0_0_0_1px_rgba(255,255,255,0.03)]",
        )}
      >
        <button
          onClick={() => navigate("/")}
          className={cn(
            "flex items-center justify-center",
            "h-6 w-6 rounded-md",
            "text-zinc-400 hover:text-zinc-100",
            "hover:bg-zinc-700/60",
            "transition-colors duration-150",
          )}
          aria-label="Back to search"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      </div>

      <div
        className={cn(
          "flex flex-1 min-h-0 flex-row items-stretch ",
          "border-1 border-zinc-700/80 bg-zinc-800/60",
          "shadow-[0_0_0_1px_rgba(255,255,255,0.03)]",
        )}
      >
        <div ref={sidebarPaneRef} data-vim-pane="sidebar" className="contents">
          <SettingsSidebar selectedItem={selectedItem} onSelect={handleSelect} />
        </div>
        <div
          ref={contentPaneRef}
          data-vim-pane="content"
          tabIndex={-1}
          className={cn(
            "flex flex-1 min-h-0 border-l border-zinc-700/80",
            activePane === "content" && "outline-none",
          )}
        >
          <SettingsContent item={selectedItem} />
        </div>
      </div>
    </div>
  );
}
