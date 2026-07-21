import { cn } from "@/lib/utils";
import logo from "../../../../branding/logo-no-bg.webp";

export default function About() {
  return (
    <div
      className={cn(
        "flex flex-1 min-h-0 flex-col items-center justify-center gap-3 w-full h-full",
        "bg-background p-4",
      )}
    >
      <img src={logo} alt="Logo" className="w-[175px] h-[175px]" />
      <div className="items-center flex flex-col">
        <p className="text-lg text-foreground">the-search-thing</p>
        <p className="text-sm text-foreground font-semibold">v0.0.1</p>
        <p className="text-xs text-foreground py-2">by The Search Company</p>
      </div>
    </div>
  );
}
