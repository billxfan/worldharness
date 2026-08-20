export interface Profile {
  readonly id: string
  readonly name: string
  readonly avatar?: string
  readonly bio?: string
}

export interface Agent {
  readonly id: string
  readonly ownerProfileId: string
  readonly provider: string
  readonly capabilities?: readonly string[]
  readonly scopes: readonly string[]
  readonly expiresAt?: string
  readonly revokedAt?: string
}

export interface World {
  readonly id: string
  readonly name: string
  readonly protocols: readonly string[]
  readonly config?: Readonly<Record<string, unknown>>
  readonly status: "active" | "closed"
}

export interface Membership {
  readonly worldId: string
  readonly profileId: string
  readonly displayName: string
  readonly avatar?: string
  readonly bio?: string
  readonly roles: readonly string[]
  readonly status: "active" | "left" | "blocked"
  readonly joinedAt: string
}

export type ActorRef =
  | { readonly type: "profile"; readonly id: string }
  | { readonly type: "agent"; readonly id: string }

export interface Action<T = unknown> {
  readonly id: string
  readonly worldId: string
  readonly actor: ActorRef
  readonly type: string
  readonly payload: T
  readonly expectedVersions?: Readonly<Record<string, number>>
}

export interface EventDraft<T = unknown> {
  readonly streamId: string
  readonly type: string
  readonly data: T
}

export interface EventActor {
  readonly type: ActorRef["type"]
  readonly id: string
  readonly profileId: string
}

export interface Event<T = unknown> extends EventDraft<T> {
  readonly id: string
  readonly worldId: string
  readonly sequence: number
  readonly position: number
  readonly actor: EventActor
  readonly causationId: string
  readonly timestamp: string
}

export interface Authorization {
  readonly profile: Profile
  readonly agent?: Agent
  readonly world: World
  readonly membership: Membership
}

export type Decision =
  | { readonly kind: "accept"; readonly events: readonly EventDraft[] }
  | {
      readonly kind: "reject"
      readonly code: string
      readonly message: string
    }

export function accept(...events: readonly EventDraft[]): Decision {
  return { kind: "accept", events }
}

export function reject(code: string, message: string): Decision {
  return { kind: "reject", code, message }
}
