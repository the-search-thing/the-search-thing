import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

type RoadmapItem = {
  title: string;
  status: string;
  description?: string;
  link?: string;
};

type RoadmapColumn = {
  id: string;
  title: string;
  subtitle?: string;
  items: RoadmapItem[];
};

type RoadmapBugSection = {
  title: string;
  items: RoadmapItem[];
};

type RoadmapContent = {
  meta: {
    title: string;
    intro: string;
    last_updated?: string;
    issues_url?: string;
  };
  columns: RoadmapColumn[];
  bugs?: RoadmapBugSection;
};

const badgeStyles: Record<string, string> = {
  shipped: "bg-neutral-900 text-white border-neutral-900",
  "in-progress": "bg-amber-100 text-amber-900 border-amber-200",
  planned: "bg-neutral-50 text-neutral-700 border-neutral-200",
  researching: "bg-neutral-50 text-neutral-700 border-neutral-200",
  investigating: "bg-neutral-50 text-neutral-700 border-neutral-200",
  blocked: "bg-rose-100 text-rose-900 border-rose-200",
  bug: "bg-neutral-900 text-white border-neutral-900",
};

const badgeLabel: Record<string, string> = {
  shipped: "Shipped",
  "in-progress": "In progress",
  planned: "Planned",
  researching: "Researching",
  investigating: "Investigating",
  blocked: "Blocked",
  bug: "Bug",
};

function loadRoadmap(): RoadmapContent {
  const roadmapPath = path.join(
    process.cwd(),
    "src",
    "content",
    "roadmap.yaml",
  );
  const file = fs.readFileSync(roadmapPath, "utf-8");
  const parsed = yaml.load(file) as RoadmapContent;
  return parsed;
}

function StatusBadge({ status }: { status: string }) {
  const label = badgeLabel[status] ?? status.replaceAll("-", " ");
  const styles = badgeStyles[status] ?? "bg-neutral-100 text-neutral-600";
  return (
    <span
      className={`text-xs font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${styles}`}
    >
      {label}
    </span>
  );
}

export default function RoadmapPage() {
  const roadmap = loadRoadmap();

  return (
    <main className="flex flex-col items-center font-sans-code">
      <section className="min-h-[50vh] w-full flex flex-col items-center justify-center px-12 py-16">
        <div className="max-w-4xl w-full flex flex-col items-start text-left">
          {roadmap.meta.last_updated ? (
            <div className="text-xs uppercase tracking-[0.3em] text-neutral-500">
              {roadmap.meta.last_updated}
            </div>
          ) : null}
          <h1 className="text-4xl font-sans-code font-bold mt-4 mb-6">
            {roadmap.meta.title}
          </h1>
          <p className="text-base text-neutral-700 max-w-3xl">
            {roadmap.meta.intro}
          </p>
          {roadmap.meta.issues_url ? (
            <div className="pt-6 text-sm">
              report bugs and follow investigations on{" "}
              <a
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4 hover:cursor-pointer"
                href={roadmap.meta.issues_url}
              >
                github issues
              </a>
              .
            </div>
          ) : null}
        </div>
      </section>

      <section className="w-full flex flex-col items-center px-12 pb-16">
        <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-12">
          {roadmap.columns.map((column) => (
            <div key={column.id} className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <h2 className="text-2xl font-bold">{column.title}</h2>
                {column.subtitle ? (
                  <div className="text-xs uppercase tracking-[0.3em] text-neutral-500">
                    {column.subtitle}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-col gap-4">
                {column.items.map((item) => (
                  <div
                    key={item.title}
                    className="rounded-xl border border-neutral-200 bg-white/60 px-5 py-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex flex-col gap-2">
                        <h3 className="text-lg font-semibold">{item.title}</h3>
                        {item.description ? (
                          <p className="text-sm text-neutral-600">
                            {item.description}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <StatusBadge status={item.status} />
                        {item.link ? (
                          <a
                            href={item.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs underline underline-offset-4"
                          >
                            link
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {roadmap.bugs ? (
        <section className="w-full flex flex-col items-center px-12 pb-16">
          <div className="w-full max-w-6xl flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">{roadmap.bugs.title}</h2>
              <span className="text-xs uppercase tracking-wide text-neutral-500">
                {roadmap.bugs.items.length} items
              </span>
            </div>
            <div className="flex flex-col gap-4">
              {roadmap.bugs.items.map((item) => (
                <div
                  key={item.title}
                  className="rounded-xl border border-neutral-200 bg-white/60 px-5 py-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex flex-col gap-2">
                      <h3 className="text-lg font-semibold">{item.title}</h3>
                      {item.description ? (
                        <p className="text-sm text-neutral-600">
                          {item.description}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <StatusBadge status={item.status} />
                      {item.link ? (
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs underline underline-offset-4"
                        >
                          link
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <footer className="pb-12">
        everything we build is open-source, help us make it better on{" "}
        <a
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-4 hover:cursor-pointer"
          href={roadmap.meta.issues_url}
        >
          github
        </a>
      </footer>
    </main>
  );
}
