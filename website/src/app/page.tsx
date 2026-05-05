export default function Home() {
  return (
    <main className="flex flex-col">
      <section className="min-h-screen w-full flex flex-col px-12 py-16">
        <div className="max-w-2xl w-full flex flex-col items-start text-left">
          <h1 className="text-4xl font-sans-code font-bold mb-8">
            <code>the-search-thing</code>
          </h1>
          <p>
            <code>
              <span className="font-semibold">hi everyone,</span>
            </code>
            <br />
            <code>we are building "the-search-thing"</code>
            <br />
            <code>
              because search should be <i>fast</i> and <i>semantic</i>
            </code>
            <br />
          </p>
          <div className="pt-6">
            <code>checkout our progress:</code>{" "}
            <a
              target="_blank"
              rel="noopener noreferrer"
              href="https://github.com/amaanbilwar/the-search-thing"
              style={{ color: "blue", textDecoration: "underline" }}
            >
              https://github.com/amaanbilwar/the-search-thing
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
