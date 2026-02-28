import type { Metadata } from "next";
import Link from "next/link";
import { IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const mono = IBM_Plex_Mono({
  weight: "500",
});

export const metadata: Metadata = {
  title: "the-search-thing",
  description: "Fastest search tool for your OS",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${mono.className} antialiased`}>
        <nav className="w-full px-12 pt-10 pb-6">
          <div className="max-w-6xl mx-auto flex items-center justify-between text-sm">
            <Link className="font-semibold" href="/">
              the-search-thing
            </Link>
            <div className="flex items-center gap-6">
              <a
                className="underline underline-offset-4 hover:cursor-pointer"
                href="https://github.com/amaanBilwar/the-search-thing"
                target="_blank"
                rel="noopener noreferrer"
              >
                github
              </a>
            </div>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
