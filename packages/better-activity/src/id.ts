/**
 * Default id generator: `act_<ts36>_<rand>`.
 *
 * - Sortable lexicographically by time (base-36 millis).
 * - 64 bits of entropy in the random suffix.
 * - Zero external dependencies (uses `crypto.getRandomValues` if available,
 *   falls back to `Math.random`).
 */

const PREFIX = "act_";

function randomHex(bytes: number): string {
  const c: any = (globalThis as any).crypto;
  if (c?.getRandomValues) {
    const arr = new Uint8Array(bytes);
    c.getRandomValues(arr);
    return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  let out = "";
  for (let i = 0; i < bytes; i++) {
    out += Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, "0");
  }
  return out;
}

export function generateActivityId(): string {
  const ts = Date.now().toString(36);
  const rand = randomHex(8);
  return `${PREFIX}${ts}_${rand}`;
}

/**
 * Encode a `{ id, createdAt }` pair as an opaque base64 cursor. Used by
 * `paginate()` for stable cursor pagination.
 */
export function encodeCursor(record: {
  id: string;
  createdAt: Date;
}): string {
  const payload = `${record.createdAt.getTime()}:${record.id}`;
  return Buffer.from(payload, "utf8").toString("base64url");
}

export function decodeCursor(
  cursor: string,
): { ts: number; id: string } | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const idx = raw.indexOf(":");
    if (idx < 0) return null;
    const ts = Number(raw.slice(0, idx));
    const id = raw.slice(idx + 1);
    if (!Number.isFinite(ts) || !id) return null;
    return { ts, id };
  } catch {
    return null;
  }
}
