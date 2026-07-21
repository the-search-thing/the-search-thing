import { cn } from "@/lib/utils";
import { useEffect, useRef, type ComponentType, type KeyboardEvent } from "react";
import { Settings, Command, Info } from "lucide-react";

const items = ["General", "Keybinds", "About"] as const;

type IconSpec =
  | { type: "lucide"; Icon: ComponentType<{ className?: string }> }
  | { type: "image"; src: string; alt: string };

const icons: Record<(typeof items)[number], IconSpec> = {
  General: { type: "lucide", Icon: Settings },
  About: { type: "lucide", Icon: Info },
  Keybinds: { type: "lucide", Icon: Command },
};

type SettingsSideBarProps = {
  selectedItem: string;
  onSelect: (item: string) => void;
};

export default function SettingsSidebar({ selectedItem, onSelect }: SettingsSideBarProps) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const rafId = window.requestAnimationFrame(() => {
      buttonRefs.current[0]?.focus();
    });

    return () => window.cancelAnimationFrame(rafId);
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number, label: string) => {
    const lastIndex = items.length - 1;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      const nextIndex = index === lastIndex ? 0 : index + 1;
      const nextLabel = items[nextIndex];
      onSelect(nextLabel);
      buttonRefs.current[nextIndex]?.focus();
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      const prevIndex = index === 0 ? lastIndex : index - 1;
      const prevLabel = items[prevIndex];
      onSelect(prevLabel);
      buttonRefs.current[prevIndex]?.focus();
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      onSelect(items[0]);
      buttonRefs.current[0]?.focus();
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      onSelect(items[lastIndex]);
      buttonRefs.current[lastIndex]?.focus();
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(label);
    }
  };

  return (
    <div className="flex flex-col gap-2 w-56 flex-none bg-background p-3">
      <div className="text-xs uppercase tracking-wider text-foreground px-1">Settings</div>
      <nav className="flex flex-col gap-1" role="tablist" aria-label="Settings sections">
        {items.map((label, index) => {
          const icon = icons[label];
          const selected = selectedItem === label;

          return (
            <button
              key={label}
              type="button"
              ref={(el) => {
                buttonRefs.current[index] = el;
              }}
              onClick={() => onSelect(label)}
              onKeyDown={(event) => handleKeyDown(event, index, label)}
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              className={cn(
                "flex items-center justify-start gap-2",
                "h-9 w-full rounded-md px-2",
                selected
                  ? "bg-accent text-accent-foreground"
                  : "bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
                "transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              )}
            >
              {icon.type === "lucide" ? (
                <icon.Icon className="h-4 w-4" />
              ) : (
                <img src={icon.src} alt={icon.alt} className="w-4 h-4" />
              )}
              {label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
