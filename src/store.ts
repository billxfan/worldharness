import { randomUUID } from "node:crypto"

import type { ActorRef, Event, EventDraft } from "./types.js"

export interface StreamSlice {
  readonly events: readonly Event[]
  readonly version: number
}

export interface CommitInput {
  readonly idempotencyKey: string
  readonly actionId: string
  readonly worldId: string
  readonly actor: {
    readonly ref: ActorRef
    readonly profileId: string
  }
  readonly expectedVersions: Readonly<Record<string, number>>
  readonly events: readonly EventDraft[]
}

export interface CommitResult {
  readonly events: readonly Event[]
  readonly replayed: boolean
}

export interface EventStore {
  read(streamId: string): Promise<StreamSlice>
  scan(afterPosition?: number, limit?: number): Promise<readonly Event[]>
  findByIdempotencyKey(key: string): Promise<readonly Event[] | undefined>
  commit(input: CommitInput): Promise<CommitResult>
}

export class VersionConflictError extends Error {
  constructor(
    readonly streamId: string,
    readonly expected: number,
    readonly actual: number,
  ) {
    super(
      `Version conflict on ${streamId}: expected ${expected}, actual ${actual}`,
    )
    this.name = "VersionConflictError"
  }
}

export interface MemoryEventStoreOptions {
  readonly clock?: () => Date
  readonly createId?: () => string
}

export class MemoryEventStore implements EventStore {
  readonly #streams = new Map<string, Event[]>()
  readonly #commits = new Map<string, Event[]>()
  readonly #allEvents: Event[] = []
  readonly #clock: () => Date
  readonly #createId: () => string

  constructor(options: MemoryEventStoreOptions = {}) {
    this.#clock = options.clock ?? (() => new Date())
    this.#createId = options.createId ?? randomUUID
  }

  async read(streamId: string): Promise<StreamSlice> {
    const events = this.#streams.get(streamId) ?? []
    return { events: [...events], version: events.length }
  }

  async scan(afterPosition = 0, limit = 100): Promise<readonly Event[]> {
    return this.#allEvents
      .filter((event) => event.position > afterPosition)
      .slice(0, limit)
  }

  async findByIdempotencyKey(
    key: string,
  ): Promise<readonly Event[] | undefined> {
    const events = this.#commits.get(key)
    return events ? [...events] : undefined
  }

  async commit(input: CommitInput): Promise<CommitResult> {
    const previous = this.#commits.get(input.idempotencyKey)
    if (previous) {
      return { events: [...previous], replayed: true }
    }

    const touchedStreams = new Set(input.events.map((event) => event.streamId))

    for (const streamId of touchedStreams) {
      const actual = this.#streams.get(streamId)?.length ?? 0
      const expected = input.expectedVersions[streamId]

      if (expected === undefined) {
        throw new Error(`Missing expected version for stream ${streamId}`)
      }

      if (actual !== expected) {
        throw new VersionConflictError(streamId, expected, actual)
      }
    }

    const nextVersions = new Map<string, number>()
    const timestamp = this.#clock().toISOString()
    const firstPosition = this.#allEvents.length + 1
    const committed = input.events.map<Event>((draft, index) => {
      const current =
        nextVersions.get(draft.streamId) ??
        (this.#streams.get(draft.streamId)?.length ?? 0)
      const sequence = current + 1
      nextVersions.set(draft.streamId, sequence)

      return {
        ...draft,
        id: this.#createId(),
        worldId: input.worldId,
        sequence,
        position: firstPosition + index,
        actor: {
          ...input.actor.ref,
          profileId: input.actor.profileId,
        },
        causationId: input.actionId,
        timestamp,
      }
    })

    for (const event of committed) {
      const stream = this.#streams.get(event.streamId) ?? []
      stream.push(event)
      this.#streams.set(event.streamId, stream)
      this.#allEvents.push(event)
    }

    this.#commits.set(input.idempotencyKey, committed)
    return { events: [...committed], replayed: false }
  }
}
