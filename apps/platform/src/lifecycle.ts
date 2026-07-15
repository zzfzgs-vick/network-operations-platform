export class RuntimeLifecycle {
  private stateValue: "RUNNING" | "DRAINING" | "STOPPED" = "RUNNING";
  private activeWork = 0;
  private readonly idleWaiters = new Set<(idle: boolean) => void>();

  get state() {
    return this.stateValue;
  }

  acceptWork(): (() => void) | undefined {
    if (this.stateValue !== "RUNNING") return undefined;
    this.activeWork += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.activeWork -= 1;
      if (this.activeWork === 0) {
        for (const resolve of this.idleWaiters) resolve(true);
        this.idleWaiters.clear();
      }
    };
  }

  beginDrain() {
    if (this.stateValue !== "RUNNING") return false;
    this.stateValue = "DRAINING";
    return true;
  }

  markStopped() {
    this.stateValue = "STOPPED";
  }

  async waitForIdle(timeoutMs: number): Promise<boolean> {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
      throw new Error("timeoutMs must be a positive integer");
    }
    if (this.activeWork === 0) return true;

    return new Promise<boolean>((resolve) => {
      const finish = (idle: boolean) => {
        clearTimeout(timeout);
        this.idleWaiters.delete(finish);
        resolve(idle);
      };
      const timeout = setTimeout(() => finish(false), timeoutMs);
      this.idleWaiters.add(finish);
    });
  }
}

export async function withinDeadline<T>(
  operation: Promise<T>,
  deadline: number,
  description: string,
): Promise<T> {
  const remainingMs = deadline - Date.now();
  if (remainingMs < 1) throw new Error(`${description} timed out`);

  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`${description} timed out`)),
          remainingMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function waitForShutdown() {
  return new Promise<"SIGINT" | "SIGTERM">((resolve) => {
    const keepAlive = setInterval(() => undefined, 60_000);

    const finish = (signal: "SIGINT" | "SIGTERM") => {
      clearInterval(keepAlive);
      resolve(signal);
    };
    const onSigint = () => finish("SIGINT");
    const onSigterm = () => finish("SIGTERM");

    process.once("SIGINT", onSigint);
    process.once("SIGTERM", onSigterm);
  });
}
