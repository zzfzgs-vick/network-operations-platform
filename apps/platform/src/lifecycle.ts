export function waitForShutdown() {
  return new Promise<"SIGINT" | "SIGTERM">((resolve) => {
    const keepAlive = setInterval(() => undefined, 60_000);

    const finish = (signal: "SIGINT" | "SIGTERM") => {
      clearInterval(keepAlive);
      process.off("SIGINT", onSigint);
      process.off("SIGTERM", onSigterm);
      resolve(signal);
    };
    const onSigint = () => finish("SIGINT");
    const onSigterm = () => finish("SIGTERM");

    process.once("SIGINT", onSigint);
    process.once("SIGTERM", onSigterm);
  });
}
