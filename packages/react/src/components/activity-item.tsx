/**
 * `<ActivityItem>` — headless wrapper that runs a single record through
 * the formatter pipeline and hands the result to a render-prop.
 *
 * @example
 * ```tsx
 * <ActivityItem record={r} formatters={myFormatters}>
 *   {({ title, timeAgo, icon }) => (
 *     <li>{icon} {title} <span className="muted">{timeAgo}</span></li>
 *   )}
 * </ActivityItem>
 * ```
 */

import * as React from "react";
import { resolveFormatter } from "../formatters";
import type {
  ActivityItemRenderProps,
  DefaultActivityRecord,
  Formatters,
} from "../types";

export interface ActivityItemProps<TRecord = DefaultActivityRecord> {
  record: TRecord;
  /** Per-entity / per-action formatter map. */
  formatters?: Formatters<TRecord>;
  /** Override the relative-time reference (testing/SSR). */
  now?: Date;
  children: (props: ActivityItemRenderProps<TRecord>) => React.ReactNode;
}

export function ActivityItem<TRecord = DefaultActivityRecord>(
  props: ActivityItemProps<TRecord>,
): React.JSX.Element {
  const ctx = React.useMemo(
    () => resolveFormatter(props.record, props.formatters, props.now),
    [props.record, props.formatters, props.now],
  );
  return <>{props.children(ctx)}</>;
}
