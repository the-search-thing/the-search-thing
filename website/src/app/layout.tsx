import type { Metadata } from "next";
import { Google_Sans_Code, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const sanscode = Google_Sans_Code({
  variable: "--font-sans-code",
  subsets: ["latin"],
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
      <body className={`${inter.className} ${sanscode.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
