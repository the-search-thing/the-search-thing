import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import SettingsSidebar from "../components/settings/SettingsSidebar";
import SettingsContent from "../components/settings/SettingsContent";

export default function Settings() {
  const navigate = useNavigate();
  const [selectedItem, setSelectedItem] = useState<string>("General");

  const handleSelect = (item: string) => {
    setSelectedItem(item);
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <div className="flex flex-row items-center flex-none min-h-[35px] bg-background px-4">
        <button
          onClick={() => navigate("/")}
          className={cn(
            "flex items-center justify-center",
            "h-6 w-6 rounded-md",
            "text-foreground hover:bg-accent hover:text-accent-foreground",
            "transition-colors duration-150",
          )}
          aria-label="Back to search"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-1 min-h-0 flex-row items-stretch bg-background">
        <SettingsSidebar selectedItem={selectedItem} onSelect={handleSelect} />
        <SettingsContent item={selectedItem} />
      </div>
    </div>
  );
}
