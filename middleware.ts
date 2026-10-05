import { NextRequest, NextResponse } from "next/server";

/**
 * This app has no login, it trusts "whoever can reach it". That is fine on 127.0.0.1,
 * but a random website you have open in another tab can still fire requests at
 * http://127.0.0.1:3000 (delete cards, overwrite data...) or use DNS-rebinding.
 * These two checks stop that without changing how you use the app.
 *
 * Need to open it from your phone on the same Wi-Fi? Add the address to .env.local:
 *   ALLOWED_HOSTS=192.168.1.20:3000
 */
const extra = (process.env.ALLOWED_HOSTS || "").split(",").map((h) => h.trim()).filter(Boolean);

function hostAllowed(host: string) {
  const name = host.replace(/:\d+$/, "").toLowerCase();
  return name === "localhost" || name === "127.0.0.1" || name === "[::1]" || extra.includes(host);
}

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") || "";
  if (!hostAllowed(host)) {
    return new NextResponse("Forbidden host", { status: 403 });
  }
  const unsafe = !["GET", "HEAD", "OPTIONS"].includes(req.method);
  const origin = req.headers.get("origin");
  if (unsafe && origin) {
    let originHost = "";
    try { originHost = new URL(origin).host; } catch {}
    if (originHost !== host) {
      return new NextResponse("Cross-site request blocked", { status: 403 });
    }
  }
  return NextResponse.next();
}

export const config = { matcher: ["/api/:path*"] };
