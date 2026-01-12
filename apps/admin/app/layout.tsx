import type { ReactNode } from "react";

export const metadata = {
  title: "wellnessnearme admin"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 16 }}>{children}</body>
    </html>
  );
}


