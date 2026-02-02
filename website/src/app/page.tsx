import { Features } from "@/components/Features";

export default function Home() {
  return (
    <main className="flex flex-col items-center font-sans-code">
      {/* Hero section - full viewport, content centered */}
      <section className="min-h-screen w-full flex flex-col items-center justify-center px-12 py-16">
        <div className="max-w-2xl w-full flex flex-col items-center text-center">
          <h1 className="text-4xl font-sans-code font-bold mb-8">
            the-search-thing
          </h1>
          <p>
            <span className="font-semibold">hi everyone</span>
            <br />
            we are building 'the-search-thing' because we were tired with
            Windows search being so ass
            <br />
          </p>
          <div className="pt-6">
            download it if you want to try it out{" "}
            <a
              target="_blank"
              className="underline underline-offset-4 hover:cursor-pointer"
              href="https://github.com/amaanbilwar/the-search-thing"
            >
              here
            </a>
          </div>
        </div>
      </section>

      {/* Features section - full viewport */}
      <section
        id="features"
        className="min-h-screen w-full flex flex-col items-center justify-center"
      >
        <div className="w-full max-w-8xl px-12 py-16 grid grid-cols-1 md:grid-cols-2 gap-x-24 items-center">
          <div className="md:text-left flex flex-col">
            <h2 className="text-2xl font-bold mb-8">Features</h2>
            <Features />
          </div>
          <div className="flex justify-center md:justify-end">
            <div className="aspect-video w-full max-w-xl bg-neutral-200 dark:bg-neutral-700 rounded-lg flex items-center justify-center text-neutral-500 dark:text-neutral-400 text-sm">
              [placeholder image]
            </div>
          </div>
        </div>
      </section>

      <footer>
        everything we build is open-source, help us make it better on{" "}
        <a
          target="_blank"
          className="underline underline-offset-4 hover:cursor-pointer"
          href="https://github.com/amaanBilwar/the-search-thing/issues"
        >
          github
        </a>
      </footer>
    </main>
  );
}
