import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ActivityFeed } from "../src/components/activity-feed";
import { ActivityItem } from "../src/components/activity-item";
import { ActivityProvider } from "../src/context";
import { makeFetcher, makeRecord, page, type Activity } from "./test-utils";

describe("<ActivityFeed>", () => {
  it("invokes the children function with the hook result", async () => {
    const fetcher = makeFetcher([
      page([makeRecord({ id: "a" }), makeRecord({ id: "b" })]),
    ]);
    render(
      <ActivityProvider fetcher={fetcher}>
        <ActivityFeed<Activity> entity="user">
          {({ data, isLoading }) =>
            isLoading ? (
              <p>loading</p>
            ) : (
              <ul>
                {data.map((r) => (
                  <li key={r.id}>{r.id}</li>
                ))}
              </ul>
            )
          }
        </ActivityFeed>
      </ActivityProvider>,
    );
    expect(screen.getByText("loading")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("a")).toBeInTheDocument());
    expect(screen.getByText("b")).toBeInTheDocument();
  });
});

describe("<ActivityItem>", () => {
  it("resolves formatter context for a record", () => {
    const r = makeRecord({
      entity: "user",
      action: "logged_in",
      actorId: "alice",
      entityId: "u1",
    });
    render(
      <ActivityItem<Activity> record={r} now={new Date(2024, 11, 1)}>
        {({ title, timeAgo }) => (
          <div>
            <span data-testid="title">{title}</span>
            <span data-testid="time">{timeAgo}</span>
          </div>
        )}
      </ActivityItem>,
    );
    expect(screen.getByTestId("title").textContent).toMatch(/alice/);
    expect(screen.getByTestId("time").textContent).toBeTruthy();
  });
});
