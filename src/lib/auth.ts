import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "dev-secret-change-in-production");
const COOKIE_NAME = "pmo-auth";

export async function verifyPassword(password: string): Promise<boolean> {
  const stored = process.env.SHARED_PASSWORD || "";
  // Support both plain text (for setup) and bcrypt hashes
  if (stored.startsWith("$2")) {
    return bcrypt.compare(password, stored);
  }
  return password === stored;
}

export async function createToken(): Promise<string> {
  return new SignJWT({ authenticated: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(SECRET);
}

export async function verifyToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, SECRET);
    return true;
  } catch {
    return false;
  }
}

export async function getAuthToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value;
}

export async function isAuthenticated(): Promise<boolean> {
  const token = await getAuthToken();
  if (!token) return false;
  return verifyToken(token);
}

export { COOKIE_NAME };
