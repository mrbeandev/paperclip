import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { Router, type Request } from "express";
import type { Db } from "@paperclipai/db";
import { authAccounts, authSessions, authUsers } from "@paperclipai/db";
import { and, eq } from "drizzle-orm";
import type { Config } from "../config.js";

const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 } as const;
function scryptAsync(password: string, salt: string, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, SCRYPT_OPTS, (err, derived) => {
      if (err) reject(err); else resolve(derived);
    });
  });
}
const COOKIE_NAME = "pcauth";
const SESSION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

export type BetterAuthSessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
};

export type BetterAuthSessionResult = {
  session: { id: string; userId: string } | null;
  user: BetterAuthSessionUser | null;
};

export type BetterAuthInstance = { db: Db; config: Config };

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = await scryptAsync(password, salt, 32);
  return `scrypt:${salt}:${hash.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hashHex] = parts;
  const hash = await scryptAsync(password, salt!, 32);
  const storedHash = Buffer.from(hashHex!, "hex");
  if (hash.length !== storedHash.length) return false;
  return timingSafeEqual(hash, storedHash);
}

function parseCookies(header: string | null | undefined): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(";").map((pair) => {
      const idx = pair.indexOf("=");
      if (idx === -1) return [pair.trim(), ""];
      return [pair.slice(0, idx).trim(), decodeURIComponent(pair.slice(idx + 1).trim())];
    }),
  );
}

function getTokenFromRequest(req: Request): string | null {
  return parseCookies(req.headers["cookie"])[COOKIE_NAME] ?? null;
}

function getTokenFromHeaders(headers: Headers): string | null {
  return parseCookies(headers.get("cookie"))[COOKIE_NAME] ?? null;
}

function buildSetCookie(token: string, expiresAt: Date, secure: boolean): string {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${expiresAt.toUTCString()}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

async function lookupSession(db: Db, token: string): Promise<BetterAuthSessionResult | null> {
  const row = await db
    .select({
      sid: authSessions.id,
      userId: authSessions.userId,
      expiresAt: authSessions.expiresAt,
      name: authUsers.name,
      email: authUsers.email,
    })
    .from(authSessions)
    .innerJoin(authUsers, eq(authUsers.id, authSessions.userId))
    .where(eq(authSessions.token, token))
    .then((rows) => rows[0] ?? null);

  if (!row || row.expiresAt < new Date()) return null;
  return {
    session: { id: row.sid, userId: row.userId },
    user: { id: row.userId, email: row.email, name: row.name },
  };
}

export function deriveAuthTrustedOrigins(config: Config): string[] {
  const origins = new Set<string>();
  if (config.authBaseUrlMode === "explicit" && config.authPublicBaseUrl) {
    try {
      origins.add(new URL(config.authPublicBaseUrl).origin);
    } catch {
      // invalid URL — ignore
    }
  }
  if (config.deploymentMode === "authenticated") {
    for (const hostname of config.allowedHostnames) {
      const trimmed = hostname.trim().toLowerCase();
      if (!trimmed) continue;
      origins.add(`https://${trimmed}`);
      origins.add(`http://${trimmed}`);
    }
  }
  return Array.from(origins);
}

export function createBetterAuthInstance(db: Db, config: Config): BetterAuthInstance {
  return { db, config };
}

export function createBetterAuthHandler(auth: BetterAuthInstance): ReturnType<typeof Router> {
  const { db, config } = auth;
  const router = Router();

  const publicUrl = config.authBaseUrlMode === "explicit" ? config.authPublicBaseUrl : undefined;
  const useSecureCookies = !(publicUrl?.startsWith("http://") ?? false);

  router.post("/sign-in/email", async (req, res) => {
    try {
      const { email, password } = req.body as { email?: string; password?: string };
      if (!email || !password) {
        res.status(400).json({ error: { message: "Email and password required" } });
        return;
      }
      const norm = email.toLowerCase().trim();
      const user = await db
        .select()
        .from(authUsers)
        .where(eq(authUsers.email, norm))
        .then((r) => r[0] ?? null);
      if (!user) {
        res.status(401).json({ error: { message: "Invalid email or password" } });
        return;
      }
      const account = await db
        .select()
        .from(authAccounts)
        .where(and(eq(authAccounts.userId, user.id), eq(authAccounts.providerId, "credential")))
        .then((r) => r[0] ?? null);
      if (!account?.password || !(await verifyPassword(password, account.password))) {
        res.status(401).json({ error: { message: "Invalid email or password" } });
        return;
      }
      const token = randomBytes(32).toString("hex");
      const now = new Date();
      const expiresAt = new Date(now.getTime() + SESSION_EXPIRY_MS);
      await db.insert(authSessions).values({
        id: randomBytes(12).toString("hex"),
        token,
        userId: user.id,
        expiresAt,
        createdAt: now,
        updatedAt: now,
      });
      res.setHeader("Set-Cookie", buildSetCookie(token, expiresAt, useSecureCookies));
      res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
    } catch (err) {
      res.status(500).json({ error: { message: "Internal server error" } });
    }
  });

  router.post("/sign-up/email", async (req, res) => {
    try {
      if (config.authDisableSignUp) {
        res.status(403).json({ error: { message: "Sign up is disabled" } });
        return;
      }
      const { email, password, name } = req.body as {
        email?: string;
        password?: string;
        name?: string;
      };
      if (!email || !password || !name) {
        res.status(400).json({ error: { message: "Name, email, and password required" } });
        return;
      }
      const norm = email.toLowerCase().trim();
      const existing = await db
        .select({ id: authUsers.id })
        .from(authUsers)
        .where(eq(authUsers.email, norm))
        .then((r) => r[0] ?? null);
      if (existing) {
        res.status(422).json({ error: { message: "An account with that email already exists" } });
        return;
      }
      const hashedPassword = await hashPassword(password);
      const now = new Date();
      const userId = randomBytes(12).toString("hex");
      await db.insert(authUsers).values({
        id: userId,
        name: name.trim(),
        email: norm,
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(authAccounts).values({
        id: randomBytes(12).toString("hex"),
        accountId: norm,
        providerId: "credential",
        userId,
        password: hashedPassword,
        createdAt: now,
        updatedAt: now,
      });
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(now.getTime() + SESSION_EXPIRY_MS);
      await db.insert(authSessions).values({
        id: randomBytes(12).toString("hex"),
        token,
        userId,
        expiresAt,
        createdAt: now,
        updatedAt: now,
      });
      res.setHeader("Set-Cookie", buildSetCookie(token, expiresAt, useSecureCookies));
      res.status(201).json({ user: { id: userId, email: norm, name: name.trim() } });
    } catch (err) {
      res.status(500).json({ error: { message: "Internal server error" } });
    }
  });

  router.post("/sign-out", async (req, res) => {
    try {
      const token = getTokenFromRequest(req);
      if (token) {
        await db.delete(authSessions).where(eq(authSessions.token, token));
      }
      res.setHeader(
        "Set-Cookie",
        `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: { message: "Internal server error" } });
    }
  });

  return router;
}

export async function resolveBetterAuthSession(
  auth: BetterAuthInstance,
  req: Request,
): Promise<BetterAuthSessionResult | null> {
  const token = getTokenFromRequest(req);
  if (!token) return null;
  return lookupSession(auth.db, token);
}

export async function resolveBetterAuthSessionFromHeaders(
  auth: BetterAuthInstance,
  headers: Headers,
): Promise<BetterAuthSessionResult | null> {
  const token = getTokenFromHeaders(headers);
  if (!token) return null;
  return lookupSession(auth.db, token);
}
