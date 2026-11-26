import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { checkRateLimit } from "@/lib/rate-limit";

interface DecodedTokenPayload {
  userId: string;
  email: string;
  role: "USER" | "ADMIN";
  exp: number;
}

const ACCESS_SECRET_RAW =
  process.env.JWT_ACCESS_SECRET ||
  process.env.JWT_SECRET ||
  "fallback_access_secret_cospace_2026";
const ACCESS_SECRET_KEY = new TextEncoder().encode(ACCESS_SECRET_RAW);

async function verifyJwtToken(token: string): Promise<DecodedTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, ACCESS_SECRET_KEY);
    if (
      typeof payload.userId !== "string" ||
      typeof payload.email !== "string" ||
      (payload.role !== "USER" && payload.role !== "ADMIN")
    ) {
      return null;
    }

    return {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
      exp: typeof payload.exp === "number" ? payload.exp : 0,
    };
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // 1. Control de Rate Limiting por IP (100 peticiones por minuto)
  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0] ||
    request.headers.get("x-real-ip") ||
    "127.0.0.1";

  const { isAllowed } = checkRateLimit(clientIp, 100, 60 * 1000);
  if (!isAllowed) {
    return new NextResponse(
      JSON.stringify({ error: "Demasiadas peticiones. Intenta de nuevo en un momento." }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
  }

  const accessToken = request.cookies.get("access_token")?.value;
  const refreshToken = request.cookies.get("refresh_token")?.value;

  const userPayload = accessToken ? await verifyJwtToken(accessToken) : null;
  const hasValidSession = Boolean(userPayload);
  const hasStaleCookies = Boolean(accessToken || refreshToken) && !hasValidSession;

  const clearExpiredCookies = (res: NextResponse): NextResponse => {
    if (hasStaleCookies) {
      res.cookies.delete("access_token");
      res.cookies.delete("refresh_token");
    }
    return res;
  };

  // 2. Si retrocede a login o registro estando autenticado (JWT válido), enviarlo directo al Dashboard
  const isAuthRoute = pathname.startsWith("/login") || pathname.startsWith("/register");
  if (isAuthRoute && hasValidSession) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // 3. Rutas exclusivas para el Administrador
  const isAdminRoute = pathname.startsWith("/admin");
  if (isAdminRoute) {
    if (!hasValidSession) {
      return clearExpiredCookies(
        NextResponse.redirect(new URL("/login", request.url))
      );
    }
    if (userPayload?.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  // 4. Rutas protegidas estándar
  const isPrivateRoute =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/reservas") ||
    pathname.startsWith("/perfil");

  if (isPrivateRoute && !hasValidSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return clearExpiredCookies(NextResponse.redirect(loginUrl));
  }

  // 5. Configurar cabeceras de no almacenamiento en caché para evitar vistas estáticas al retroceder
  const response = NextResponse.next();
  if (isAuthRoute && hasStaleCookies) {
    clearExpiredCookies(response);
  }
  if (isPrivateRoute || isAdminRoute) {
    response.headers.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate"
    );
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
  }

  return response;
}

// Compatibilidad simétrica con convención middleware de Next.js
export const middleware = proxy;

export const config = {
  matcher: [
    "/login",
    "/register",
    "/admin/:path*",
    "/dashboard/:path*",
    "/reservas/:path*",
    "/perfil/:path*",
  ],
};

