import { cp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("../../migrations/", import.meta.url));
const destination = fileURLToPath(new URL("../migrations/", import.meta.url));

await rm(destination, { recursive: true, force: true });
await cp(source, destination, { recursive: true });
