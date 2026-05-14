/**
 * `<ActivityFeed>` — headless render-prop wrapper around `useActivity`.
 *
 * No markup. No styles. Use this when you prefer JSX composition over
 * calling the hook directly.
 *
 * @example
 * ```tsx
 * <ActivityFeed entity="project" entityId="prj_1" limit={20}>
 *   {({ data, isLoading, loadMore, hasMore }) =>
 *     isLoading ? <Spinner /> : (
 *       <>
 *         {data.map((row) => <Row key={row.id} row={row} />)}
 *         {hasMore && <button onClick={loadMore}>Load more</button>}
 *       </>
 *     )
 *   }
 * </ActivityFeed>
 * ```
 */

import * as React from "react";
import { useActivity } from "../use-activity";
import type {
  ActivityFeedRenderProps,
  DefaultActivityRecord,
  UseActivityOptions,
} from "../types";

export interface ActivityFeedProps<TRecord = DefaultActivityRecord>
  extends UseActivityOptions<TRecord> {
  children: (props: ActivityFeedRenderProps<TRecord>) => React.ReactNode;
}

export function ActivityFeed<TRecord = DefaultActivityRecord>(
  props: ActivityFeedProps<TRecord>,
): React.JSX.Element {
  const { children, ...opts } = props;
  const result = useActivity<TRecord>(opts);
  return <>{children(result)}</>;
}
