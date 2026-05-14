/**
 * Redaction helpers for PII. Supports dot-paths like `"user.password"`.
 */

export const REDACTED_VALUE = "[redacted]";

function setPath(target: Record<string, unknown>, path: string[]): void {
  if (path.length === 0) return;
  let cur: Record<string, unknown> | unknown = target;
  for (let i = 0; i < path.length - 1; i++) {
    if (cur && typeof cur === "object" && path[i]! in (cur as object)) {
      cur = (cur as Record<string, unknown>)[path[i]!];
    } else {
      return;
    }
  }
  const last = path[path.length - 1]!;
  if (cur && typeof cur === "object" && last in (cur as object)) {
    (cur as Record<string, unknown>)[last] = REDACTED_VALUE;
  }
}

/**
 * Returns a shallow clone of `input` with the configured paths replaced by
 * `[redacted]`. Top-level fields and nested fields inside `metadata` are
 * both supported.
 */
export function applyRedaction<T extends Record<string, unknown>>(
  input: T,
  paths: readonly string[] | undefined,
): T {
  if (!paths || paths.length === 0) return input;
  const clone: Record<string, unknown> = { ...input };
  if (clone.metadata && typeof clone.metadata === "object") {
    clone.metadata = { ...(clone.metadata as Record<string, unknown>) };
  }
  for (const p of paths) {
    const parts = p.split(".");
    setPath(clone, parts);
  }
  return clone as T;
}
