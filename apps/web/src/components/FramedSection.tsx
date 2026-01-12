import type { ReactNode } from "react";

type Props = {
  title: string;
  children: ReactNode;
};

/**
 * Phase 9.7 — Framed Section contract (Wikipedia-style reference section)
 * - Rectangular border (subtle)
 * - Blue header bar (brand blue)
 * - White body, standard padding
 */
export function FramedSection({ title, children }: Props) {
  return (
    <section className="fnm-refSection">
      <div className="fnm-refSectionHeader">
        <h2 className="fnm-h2">{title}</h2>
      </div>
      <div className="fnm-refSectionBody">{children}</div>
    </section>
  );
}


