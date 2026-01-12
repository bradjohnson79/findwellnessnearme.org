import type { ReactNode } from "react";
import { Logo } from "../src/components/Logo";
import { brandFont } from "../src/lib/brand";
import "./globals.css";

export const metadata = {
  title: "findwellnessnearme.org",
  description:
    "A neutral, informational directory to discover alternative and integrative wellness practitioners in the United States."
};

export default function RootLayout({
  children,
  rail,
  footer
}: {
  children: ReactNode;
  rail: ReactNode;
  footer: ReactNode;
}) {
  const hasRail = Boolean(rail);
  return (
    <html lang="en">
      <body className={brandFont.className}>
        <div className="fnm-page">
          <header className="fnm-header">
            <div className="fnm-container fnm-headerInner">
              <a className="fnm-logoLink" href="/">
                <Logo context="header" />
              </a>
              <span className="fnm-text-sm fnm-dim">read-only directory</span>
              <nav className="fnm-nav">
                <a href="/search">Search</a>
                <a href="/modalities">Modalities</a>
                <a href="/advertising">Advertising</a>
              </nav>
            </div>
          </header>

          <div className={`fnm-container ${hasRail ? "fnm-contentGrid" : "fnm-contentSingle"}`}>
            <main className="fnm-main">{children}</main>
            {hasRail ? (
              <aside className="fnm-rail" aria-label="Right rail (reserved)">
                {rail}
              </aside>
            ) : null}
          </div>

          <footer>{footer}</footer>
        </div>
      </body>
    </html>
  );
}


