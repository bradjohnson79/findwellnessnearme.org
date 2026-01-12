import { Noto_Sans } from "next/font/google";

export const brandColors = {
  // Phase 9.1 — locked palette
  brandBlue: "var(--brand-blue)",
  brandBlack: "var(--brand-black)"
} as const;

// Phase 9.1 — one neutral, wide, highly-legible sans family (locked for logo + baseline typography)
export const brandFont = Noto_Sans({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap"
});


