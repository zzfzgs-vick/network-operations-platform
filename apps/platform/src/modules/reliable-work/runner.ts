import { setTimeout as delay } from "node:timers/promises";

import type { PoolClient } from "pg";

import { type InboxMessage, ReliableWorkStore } from "./public.js";

export type InboxHandler = (
  client: PoolClient,
  message: InboxMessage,
) => Promise<unknown>;

const probeMessageKind = "reliable-work.probe";

export class ReliableWorkRunner {
  private stopping = false;

  constructor(
    private readonly store: ReliableWorkStore,
    private readonly handler: InboxHandler = (client, inbox) =>
      store.appendOutbox(client, {
        destination: probeMessageKind,
        idempotencyKey: `inbox:${inbox.inboxMessageId}`,
        payloadReference: inbox.payloadReference,
      }),
    private readonly pollIntervalMs = 250,
    private readonly messageKind = probeMessageKind,
  ) {}

  stop() {
    this.stopping = true;
  }

  runOnce() {
    return this.store.processNextInbox(this.messageKind, this.handler);
  }

  async run() {
    while (!this.stopping) {
      const processed = await this.runOnce();
      if (!processed && !this.stopping) {
        await delay(this.pollIntervalMs);
      }
    }
  }
}
