/**
 * Example: multi-tenant SaaS audit log.
 *
 * Captures changes to organizations, members, API keys, and billing actions.
 * Each event records both the *acting* user and the tenant the action
 * belongs to. Use `requestId` to correlate with HTTP traces.
 */

import { betterActivity } from "../src";
import { kyselyAdapter } from "../src/adapters/kysely";

declare const kysely: import("../src/adapters/kysely").KyselyLike;

export const audit = betterActivity({
  database: kyselyAdapter({ db: kysely, dialect: "postgres" }),
  entities: {
    organization: {
      actions: ["created", "updated", "deleted", "domain_verified", "plan_changed"],
      metadata: {} as {
        tenantId: string;
        diff?: Record<string, { from: unknown; to: unknown }>;
      },
    },
    member: {
      actions: ["invited", "joined", "role_changed", "removed"],
      metadata: {} as {
        tenantId: string;
        role?: "owner" | "admin" | "member";
        invitedEmail?: string;
      },
    },
    api_key: {
      actions: ["created", "rotated", "revoked", "used"],
      metadata: {} as {
        tenantId: string;
        scopes?: string[];
        keyPrefix?: string;
      },
    },
    billing: {
      actions: ["subscription_started", "subscription_cancelled", "invoice_paid", "invoice_failed"],
      metadata: {} as {
        tenantId: string;
        amountCents?: number;
        currency?: string;
        provider?: "stripe" | "paddle" | "lemonsqueezy";
      },
    },
  },
  redact: ["metadata.cardNumber", "metadata.ssn"],
  // Real-time fan-out: e.g. push to a websocket or write to a SIEM.
  afterSave: async ({ record }) => {
    if (record.entity === "api_key" && record.action === "revoked") {
      // wakeSecurityTeam(record.metadata)
    }
  },
});

export async function listAuditTrailForTenant(
  tenantId: string,
  cursor?: string,
) {
  // Cursor pagination, descending by createdAt — the audit log default.
  return audit.paginate({
    cursor,
    limit: 50,
    // We embed the tenantId in metadata; for tenant-wide queries we ALSO
    // store the tenantId as the `actorType` so a single `actorType` index
    // hits all events for the tenant. (Pattern: scope-as-actor-type.)
  });
}

export async function memberHistory(tenantId: string, userId: string) {
  return audit.list({
    entity: "member",
    entityId: userId,
    limit: 200,
  });
}

export async function billingEventsThisMonth() {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  return audit.between({
    entity: "billing",
    from: start,
    to: new Date(),
    limit: 10_000,
  });
}
