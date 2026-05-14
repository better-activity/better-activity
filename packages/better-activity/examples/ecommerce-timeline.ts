/**
 * Example: e-commerce order timeline.
 *
 * Tracks the lifecycle of an order across systems (cart, payment, fulfilment,
 * customer service) and renders a chronological timeline in your dashboard.
 */

import { betterActivity, defineEntity } from "../src";
import { drizzleAdapter } from "../src/adapters/drizzle";

declare const drizzleDb: unknown;
declare const activityTable: unknown;

export const shop = betterActivity({
  database: drizzleAdapter({
    db: drizzleDb,
    table: activityTable,
    dialect: "postgres",
  }),
  entities: {
    cart: defineEntity({
      actions: [
        "created",
        "item_added",
        "item_removed",
        "discount_applied",
        "abandoned",
      ],
      metadata: {} as {
        itemId?: string;
        quantity?: number;
        priceCents?: number;
        couponCode?: string;
      },
    }),
    order: defineEntity({
      actions: [
        "placed",
        "payment_pending",
        "payment_captured",
        "payment_failed",
        "fulfilled",
        "shipped",
        "delivered",
        "returned",
        "refunded",
        "cancelled",
      ],
      metadata: {} as {
        amountCents: number;
        currency: string;
        carrier?: "ups" | "fedex" | "usps" | "dhl";
        trackingNumber?: string;
        gateway?: "stripe" | "adyen" | "paypal";
      },
    }),
    support: defineEntity({
      actions: [
        "ticket_opened",
        "agent_replied",
        "ticket_closed",
        "satisfaction_rated",
      ],
      metadata: {} as {
        ticketId: string;
        rating?: 1 | 2 | 3 | 4 | 5;
        firstResponseMs?: number;
      },
    }),
  },
});

export async function orderTimeline(orderId: string) {
  // Pull every event referencing this order across entities.
  // Combine `order` events + any `support` event whose metadata.ticketId
  // was linked to the order. We model the latter via `requestId`.
  const orderEvents = await shop.list({
    entity: "order",
    entityId: orderId,
    sortBy: "asc",
    limit: 500,
  });
  const supportEvents = await shop.list({
    entity: "support",
    sortBy: "asc",
    limit: 500,
  });
  return [
    ...orderEvents,
    ...supportEvents.filter((e) => e.requestId === orderId),
  ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

export async function recordPaymentCaptured(
  orderId: string,
  amountCents: number,
  gateway: "stripe" | "adyen" | "paypal",
) {
  await shop.save({
    entity: "order",
    entityId: orderId,
    action: "payment_captured",
    metadata: { amountCents, currency: "USD", gateway },
    requestId: orderId,
  });
}

export async function recordShipped(
  orderId: string,
  carrier: "ups" | "fedex" | "usps" | "dhl",
  trackingNumber: string,
) {
  await shop.save({
    entity: "order",
    entityId: orderId,
    action: "shipped",
    metadata: { amountCents: 0, currency: "USD", carrier, trackingNumber },
    requestId: orderId,
  });
}

/** Funnel analytics: how many carts make it to "placed" each day? */
export async function cartConversionThisWeek() {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [carts, orders] = await Promise.all([
    shop.count({ entity: "cart", action: "created", after: weekAgo }),
    shop.count({ entity: "order", action: "placed", after: weekAgo }),
  ]);
  return {
    carts,
    orders,
    conversionRate: carts === 0 ? 0 : orders / carts,
  };
}
