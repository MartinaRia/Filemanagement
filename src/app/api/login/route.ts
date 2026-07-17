import { NextRequest, NextResponse } from "next/server";
import { createSessionCookieValue, Role, SESSION_COOKIE_NAME, SESSION_MAX_AGE } from "@/lib/session";

export async function POST(req: NextRequest) {
  const { password } = await req.json();

  if (!process.env.APP_PASSWORD) {
    return NextResponse.json(
      { error: "APP_PASSWORD non configurata sul server" },
      { status: 500 }
    );
  }

  let role: Role;
  if (password === process.env.APP_PASSWORD) {
    role = "admin";
  } else if (process.env.VIEWER_PASSWORD && password === process.env.VIEWER_PASSWORD) {
    role = "viewer";
  } else {
    return NextResponse.json({ error: "Password errata" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, await createSessionCookieValue(role), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
  return res;
}
