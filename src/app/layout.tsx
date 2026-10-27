import type { Metadata } from "next";
import { Atkinson_Hyperlegible, Fraunces, IBM_Plex_Mono } from "next/font/google";
import { syncBank } from "./actions";
import { Nav } from "@/components/nav";
import { connectionStatus } from "@/core/service";
import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-fraunces",
  style: ["normal", "italic"],
});

const sans = Atkinson_Hyperlegible({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
  variable: "--font-atkinson",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-plex",
});

export const metadata: Metadata = {
  title: "spendable",
  description: "How much money can I spend right now?",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const status = connectionStatus();
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <header className="site-header">
          <a className="wordmark" href="/">
            spendable
          </a>
          <Nav />
          <div className="header-actions">
            {status.demo ? <span className="kicker">Sample</span> : null}
            {status.connected ? (
              <form action={syncBank}>
                <button type="submit">Sync bank</button>
              </form>
            ) : (
              <a className="button" href="/bank">
                Connect
              </a>
            )}
          </div>
        </header>
        <main id="main">{children}</main>
      </body>
    </html>
  );
}
