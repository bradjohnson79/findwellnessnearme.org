import { NextRequest, NextResponse } from "next/server";

function unauthorized() {
  return new NextResponse("Unauthorized", {
    status: 401,
    headers: {
      // Browser-friendly prompt.
      "WWW-Authenticate": 'Basic realm="wellnessnearme admin"'
    }
  });
}

function timingSafeEqual(a: string, b: string) {
  // Minimal timing-safe compare (sufficient for small shared secrets here).
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export function middleware(req: NextRequest) {
  // Only gate admin routes.
  if (!req.nextUrl.pathname.startsWith("/admin")) return NextResponse.next();

  // Option 1: secret header (useful behind a reverse proxy).
  const adminSecret = process.env.ADMIN_SECRET;
  const providedSecret = req.headers.get("x-admin-secret");
  if (adminSecret && providedSecret && timingSafeEqual(providedSecret, adminSecret)) {
    return NextResponse.next();
  }

  // Option 2: Basic auth (browser-friendly).
  const basic = process.env.ADMIN_BASIC_AUTH; // "user:pass"
  const auth = req.headers.get("authorization");
  if (basic && auth?.startsWith("Basic ")) {
    try {
      // Middleware runs in the edge runtime (no Node Buffer).
      const decoded = globalThis.atob(auth.slice("Basic ".length));
      if (timingSafeEqual(decoded, basic)) return NextResponse.next();
    } catch {
      // fall through
    }
  }

  return unauthorized();
}

export const config = {
  matcher: ["/admin/:path*"]
};


