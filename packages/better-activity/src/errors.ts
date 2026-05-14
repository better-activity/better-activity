/**
 * Public error types. Thrown by the SDK; never by adapters directly
 * (adapters surface plain `Error`s and the SDK wraps them).
 */

export class BetterActivityError extends Error {
  override readonly name = "BetterActivityError";
  constructor(message: string, readonly code: string = "BETTER_ACTIVITY_ERROR") {
    super(message);
  }
}

export class UnknownEntityError extends BetterActivityError {
  constructor(entity: string) {
    super(
      `Entity "${entity}" is not declared in betterActivity({ entities }).`,
      "UNKNOWN_ENTITY",
    );
  }
}

export class UnknownActionError extends BetterActivityError {
  constructor(entity: string, action: string, allowed: readonly string[]) {
    super(
      `Action "${action}" is not declared for entity "${entity}". ` +
        `Allowed actions: ${allowed.map((a) => `"${a}"`).join(", ")}.`,
      "UNKNOWN_ACTION",
    );
  }
}

export class HookAbortedError extends BetterActivityError {
  constructor(reason: string) {
    super(`save() aborted by hook: ${reason}`, "HOOK_ABORTED");
  }
}
