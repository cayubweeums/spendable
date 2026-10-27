import type { Metadata } from "next";
import { Atkinson_Hyperlegible, Fraunces, IBM_Plex_Mono } from "next/font/google";
import { signOut } from "./actions";
import { signedIn } from "./auth";
import { AutoSync } from "@/components/auto-sync";
import { Nav } from "@/components/nav";
import { SubmitButton } from "@/components/submit-button";
import { SyncForm } from "@/components/sync-form";
import { connectionStatus, needsOnboarding, passwordIsSet, syncIsStale } from "@/core/service";
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

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const authed = await signedIn();
  const onboarding = authed && needsOnboarding();
  const status = authed ? connectionStatus() : null;
  const stale = status != null && !onboarding && status.connected && !status.demo && syncIsStale(status.syncedAt);
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <header className="site-header">
          <a className="wordmark" href={!authed ? (passwordIsSet() ? "/login" : "/onboarding") : onboarding ? "/onboarding" : "/"}>
            spendable
          </a>
          {authed && !onboarding ? <Nav /> : null}
          {authed ? (
            <div className="header-actions">
              {onboarding || !status?.demo ? null : <span className="kicker">Sample</span>}
              {onboarding ? null : status?.connected ? (
                <SyncForm />
              ) : (
                <a className="button" href="/bank">
                  Connect
                </a>
              )}
              <form action={signOut} className="inline">
                <SubmitButton pending="Signing out…" quiet>
                  Sign out
                </SubmitButton>
              </form>
            </div>
          ) : null}
        </header>
        <main id="main">
          {stale ? <AutoSync stale /> : null}
          {children}
        </main>
      </body>
    </html>
  );
}
