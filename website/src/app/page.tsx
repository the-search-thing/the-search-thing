export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="text-center pt-10">
        <h1 className="text-4xl font-sans-code">the-search-thing</h1>
      </div>
      <div className="text-center flex-1 flex flex-col items-center justify-center p-12  pt-2">
        <p>
          hi everyone,
          <br />
          we built<span className="font-sans-code"> "the-search-thing" </span>
          because we were tired with <span className="font-bold">
            Windows
          </span>{" "}
          search being so sad
          <br />
        </p>
        <div className="text-center">
          download it if you want to try it out{" "}
          <a className="underline hover:cursor-pointer">here</a>
        </div>
        <p className="text-center">add app screenshot here</p>
      </div>
      <footer>
        everything we built is open-source, help us make it better on{" "}
        <a
          className="underline hover:cursor-pointer"
          href="https://github.com/amaanbilwar/the-search-thing"
        >
          github
        </a>
      </footer>
    </main>
  );
}
