import { useAppContext } from "../AppContext";

const phaseLabels: Record<string, string> = {
  scan_text: "Scanning text files",
  index_text: "Indexing text files",
  scan_video: "Scanning videos",
  index_video: "Indexing videos",
  scan_image: "Scanning images",
  index_image: "Indexing images",
  done: "Done",
};

export default function Footer() {
  const { currentJobId, indexingLocation, jobStatus } = useAppContext();

  const renderStatus = () => {
    if (indexingLocation !== "footer" || !jobStatus || !currentJobId) {
      return null;
    }

    const phaseText = phaseLabels[jobStatus.phase] || jobStatus.phase;

    if (jobStatus.status === "failed") {
      return (
        <span className="text-red-400 text-xs truncate max-w-[300px]">
          Failed{jobStatus.error ? `: ${jobStatus.error}` : ""}
        </span>
      );
    }

    if (jobStatus.status === "completed") {
      return (
        <span className="text-green-400 text-xs">{jobStatus.message || "Indexing complete"}</span>
      );
    }

    return (
      <span className="text-zinc-400 text-xs truncate max-w-[300px]">
        {phaseText}
        {jobStatus.message && <span className="text-zinc-500 ml-1.5">- {jobStatus.message}</span>}
      </span>
    );
  };

  return (
    <div className="flex flex-row justify-center items-center w-full h-full">
      <div className="text-sm flex items-center px-4">{renderStatus()}</div>
    </div>
  );
}
