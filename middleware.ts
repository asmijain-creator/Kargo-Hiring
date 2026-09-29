import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, authRequired, isValidToken } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  if (!authRequired()) return NextResponse.next();
  if (await isValidToken(req.cookies.get(AUTH_COOKIE)?.value)) return NextResponse.next();

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except the login page and static assets.
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico).*)"],
};
