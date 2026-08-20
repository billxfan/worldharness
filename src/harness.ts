import { AuthorizationError, type Authorizer } from "./authorization.js"
import {
  VersionConflictError,
  type EventStore,
  type StreamSlice,
} from "./store.js"
import type {
  Action,
  Authorization,
  Decision,
  Event,
} from "./types.js"
import { reject } from "./types.js"

export interface ActionContext {
  readonly action: Action
  readonly authorization: Authorization
  read(streamId: string): Promise<StreamSlice>
}

export type ActionHandler = (
  context: ActionContext,
  action: Action,
) => Promise<Decision> | Decision

export type Next = () => Promise<Decision>

export type Middleware = (
  context: ActionContext,
  next: Next,
) => Promise<Decision> | Decision

export type EventConsumer = (
  event: Event,
) => Promise<void> | void

export type Dispose = () => Promise<void> | void

export interface PluginContext {
  registerAction(type: string, handler: ActionHandler): Dispose
  use(middleware: Middleware): Dispose
  onEvent(type: string | "*", consumer: EventConsumer): Dispose
}

export type Plugin = (context: PluginContext) => Dispose | void

export type DispatchResult =
  | {
      readonly accepted: true
      readonly events: readonly Event[]
      readonly replayed: boolean
      readonly consumerErrors: readonly unknown[]
    }
  | {
      readonly accepted: false
      readonly code: string
      readonly message: string
    }

export interface HarnessOptions {
  readonly authorizer: Authorizer
  readonly eventStore: EventStore
}

export class Harness {
  readonly #authorizer: Authorizer
  readonly #eventStore: EventStore
  readonly #handlers = new Map<string, ActionHandler>()
  readonly #middlewares: Middleware[] = []
  readonly #consumers = new Map<string, Set<EventConsumer>>()

  constructor(options: HarnessOptions) {
    this.#authorizer = options.authorizer
    this.#eventStore = options.eventStore
  }

  install(plugin: Plugin): Dispose {
    const effects: Dispose[] = []
    const track = (effect: Dispose): Dispose => {
      effects.push(effect)
      return effect
    }

    try {
      const pluginEffect = plugin({
        registerAction: (type, handler) =>
          track(this.registerAction(type, handler)),
        use: (middleware) => track(this.use(middleware)),
        onEvent: (type, consumer) => track(this.onEvent(type, consumer)),
      })
      if (pluginEffect) effects.push(pluginEffect)
    } catch (error) {
      for (const effect of effects.reverse()) void effect()
      throw error
    }

    let disposed = false
    return async () => {
      if (disposed) return
      disposed = true
      for (const effect of effects.reverse()) await effect()
    }
  }

  registerAction(type: string, handler: ActionHandler): Dispose {
    if (this.#handlers.has(type)) {
      throw new Error(`Action handler already registered for ${type}`)
    }
    this.#handlers.set(type, handler)
    return () => {
      if (this.#handlers.get(type) === handler) this.#handlers.delete(type)
    }
  }

  use(middleware: Middleware): Dispose {
    this.#middlewares.push(middleware)
    return () => {
      const index = this.#middlewares.indexOf(middleware)
      if (index >= 0) this.#middlewares.splice(index, 1)
    }
  }

  onEvent(type: string | "*", consumer: EventConsumer): Dispose {
    const consumers = this.#consumers.get(type) ?? new Set<EventConsumer>()
    consumers.add(consumer)
    this.#consumers.set(type, consumers)
    return () => {
      consumers.delete(consumer)
      if (consumers.size === 0) this.#consumers.delete(type)
    }
  }

  async dispatch(action: Action): Promise<DispatchResult> {
    let authorization: Authorization
    try {
      authorization = await this.#authorizer.authorize(action)
    } catch (error) {
      if (error instanceof AuthorizationError) {
        return { accepted: false, code: error.code, message: error.message }
      }
      throw error
    }

    const idempotencyKey = `${action.actor.type}:${action.actor.id}:${action.id}`
    const replay = await this.#eventStore.findByIdempotencyKey(idempotencyKey)
    if (replay) {
      return {
        accepted: true,
        events: replay,
        replayed: true,
        consumerErrors: [],
      }
    }

    const versions = new Map<string, number>()
    const context: ActionContext = {
      action,
      authorization,
      read: async (streamId) => {
        const slice = await this.#eventStore.read(streamId)
        versions.set(streamId, slice.version)
        return slice
      },
    }

    const handler = this.#handlers.get(action.type)
    const terminal: Next = handler
      ? async () => handler(context, action)
      : async () =>
          reject(
            "unsupported_action",
            `No handler is registered for ${action.type}`,
          )

    const pipeline = this.#middlewares.reduceRight<Next>(
      (next, middleware) => async () => middleware(context, next),
      terminal,
    )
    const decision = await pipeline()

    if (decision.kind === "reject") {
      return {
        accepted: false,
        code: decision.code,
        message: decision.message,
      }
    }
    if (decision.events.length === 0) {
      return {
        accepted: false,
        code: "empty_decision",
        message: "An accepted action must produce at least one event",
      }
    }

    const expectedVersions: Record<string, number> = {}
    for (const event of decision.events) {
      expectedVersions[event.streamId] =
        action.expectedVersions?.[event.streamId] ??
        versions.get(event.streamId) ??
        0
    }

    try {
      const commit = await this.#eventStore.commit({
        idempotencyKey,
        actionId: action.id,
        worldId: action.worldId,
        actor: {
          ref: action.actor,
          profileId: authorization.profile.id,
        },
        expectedVersions,
        events: decision.events,
      })

      if (commit.replayed) {
        return {
          accepted: true,
          events: commit.events,
          replayed: true,
          consumerErrors: [],
        }
      }

      const consumerErrors = await this.#notify(commit.events)
      return {
        accepted: true,
        events: commit.events,
        replayed: false,
        consumerErrors,
      }
    } catch (error) {
      if (error instanceof VersionConflictError) {
        return {
          accepted: false,
          code: "version_conflict",
          message: error.message,
        }
      }
      throw error
    }
  }

  async #notify(events: readonly Event[]): Promise<readonly unknown[]> {
    const tasks = events.flatMap((event) => [
      ...[...(this.#consumers.get(event.type) ?? [])].map((consumer) =>
        Promise.resolve().then(() => consumer(event)),
      ),
      ...[...(this.#consumers.get("*") ?? [])].map((consumer) =>
        Promise.resolve().then(() => consumer(event)),
      ),
    ])
    const results = await Promise.allSettled(tasks)
    return results
      .filter((result) => result.status === "rejected")
      .map((result) => result.reason)
  }
}
