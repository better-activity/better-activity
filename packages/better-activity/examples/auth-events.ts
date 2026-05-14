/**
 * Example: tracking authentication events.
 *
 * Logs sign-in / sign-out / failed-login / password-reset events from your
 * auth layer. Pair with `better-auth` hooks for end-to-end coverage.
 */

import { betterActivity } from "../src";
import { postgresAdapter } from "../src/adapters/postgres";

// Pretend pg.Pool. In real code: `new Pool({ connectionString: ... })`.
declare const pool: import("../src/adapters/postgres").PostgresPool;

export const authActivity = betterActivity({
  database: postgresAdapter({ pool }),
  entities: {
    user: {
      actions: [
        "signed_up",
        "logged_in",
        "logged_out",
        "login_failed",
        "password_reset_requested",
        "password_reset_completed",
        "two_factor_enabled",
        "two_factor_disabled",
      ],
      // Per-entity metadata typing — `metadata` argument of `save()` is checked.
      metadata: {} as {
        ip: string;
        userAgent?: string;
        method?: "password" | "oauth" | "magic_link" | "passkey";
        provider?: "google" | "github" | "azure";
      },
    },
    session: {
      actions: ["created", "refreshed", "revoked", "expired"],
      metadata: {} as { sessionId: string; ip: string; userAgent?: string },
    },
  },
  // Redact PII before persistence.
  redact: ["metadata.password", "ip"],
});

export async function onLoginSuccess(
  userId: string,
  ctx: { ip: string; userAgent: string },
): Promise<void> {
  await authActivity.save({
    entity: "user",
    entityId: userId,
    action: "logged_in",
    actorId: userId,
    actorType: "user",
    metadata: { ip: ctx.ip, userAgent: ctx.userAgent, method: "password" },
  });
}

export async function onLoginFailed(
  emailHash: string,
  ctx: { ip: string },
): Promise<void> {
  await authActivity.save({
    entity: "user",
    entityId: emailHash,
    action: "login_failed",
    metadata: { ip: ctx.ip },
  });
}

export async function recentSecurityEventsFor(userId: string) {
  return authActivity.list({
    entity: "user",
    entityId: userId,
    after: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    limit: 100,
  });
}

export async function suspiciousLoginsByIp(ip: string) {
  // Note: `redact: ["ip"]` above means raw `ip` is stored at the top level
  // as "[redacted]". In a real impl you'd hash the IP and store the hash.
  return authActivity.list({
    after: new Date(Date.now() - 24 * 60 * 60 * 1000),
    action: "login_failed",
  });
}
