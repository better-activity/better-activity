/**
 * `@better-activity/react`
 *
 * React hooks + headless components for `better-activity`.
 *
 * --- Design notes ---
 *
 * • Fetcher-agnostic.  The library never knows how data reaches it.
 *   Consumers pass an async function (`ActivityFetcher`) — REST, tRPC,
 *   GraphQL, server actions, RSC bridge, direct DB calls — and the hooks
 *   are responsible for everything that comes after the network: caching,
 *   pagination, dedup, optimistic updates, subscription fan-out.
 *
 * • Headless first.  Components like `<ActivityFeed>` and `<ActivityItem>`
 *   are render-prop wrappers.  No markup, no styles, no class names.
 *
 * • Type-safe end-to-end.  `InferActivity<typeof activity>` recovers a
 *   discriminated union of `ActivityRecord`s from the user's
 *   `betterActivity({...})` instance.  All hook generics flow from that
 *   type, so `data[i].action` and `data[i].metadata` narrow correctly
 *   when you check `data[i].entity`.
 *
 * • Zero runtime dependency on `better-activity`.  This package imports
 *   *types only* from the core package — the React layer can ship and
 *   version independently.
 *
 * • Adapter subpaths (`./tanstack`, `./swr`) expose the same public shape
 *   on top of those libraries for teams already standardized on them.
 */

// ---------------- Hooks ----------------

export { useActivity } from "./use-activity";
export { useActivityInfinite } from "./use-activity-infinite";
export { useActivitySubscription } from "./use-activity-subscription";
export { useRecordActivity } from "./use-record-activity";

// ---------------- Provider ----------------

export { ActivityProvider, useActivityContext } from "./context";

// ---------------- Headless components ----------------

export { ActivityFeed, ActivityItem } from "./components";
export type { ActivityFeedProps, ActivityItemProps } from "./components";

// ---------------- Formatters ----------------

export {
  defineFormatters,
  defaultFormatters,
  formatRelativeTime,
  groupActivity,
  resolveFormatter,
} from "./formatters";
export type { TypedFormatters, GroupBy } from "./formatters";

// ---------------- Query-key helpers ----------------

export { activityQueryKey, normalizeQuery, matchesQuery } from "./query-key";

// ---------------- Types ----------------

export type {
  ActivityFetcher,
  ActivityPage,
  ActivityProviderProps,
  ActivityQuery,
  ActivityRecordFn,
  ActivityFeedRenderProps,
  ActivityItemRenderProps,
  ActivityGroup,
  Formatters,
  FormatterContext,
  OptimisticRecord,
  SubscribeFn,
  UseActivityOptions,
  UseActivityResult,
  UseActivityInfiniteOptions,
  UseActivityInfiniteResult,
  UseActivitySubscriptionOptions,
  UseActivitySubscriptionResult,
  UseRecordActivityOptions,
  UseRecordActivityResult,
  DefaultActivityRecord,
} from "./types";

// ---------------- Inference helpers ----------------

export type {
  InferActivity,
  InferAction,
  InferEntities,
  InferEntityName,
  InferMetadata,
  InferRecord,
} from "./infer";
