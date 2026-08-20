import type {
  Action,
  Agent,
  Authorization,
  Membership,
  Profile,
  World,
} from "./types.js"

export interface Authorizer {
  authorize(action: Action): Promise<Authorization>
}

export class AuthorizationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = "AuthorizationError"
  }
}

export interface MemoryDirectoryOptions {
  readonly clock?: () => Date
}

export class MemoryDirectory implements Authorizer {
  readonly #profiles = new Map<string, Profile>()
  readonly #agents = new Map<string, Agent>()
  readonly #worlds = new Map<string, World>()
  readonly #memberships = new Map<string, Membership>()
  readonly #clock: () => Date

  constructor(options: MemoryDirectoryOptions = {}) {
    this.#clock = options.clock ?? (() => new Date())
  }

  addProfile(profile: Profile): this {
    this.#profiles.set(profile.id, profile)
    return this
  }

  addAgent(agent: Agent): this {
    this.#agents.set(agent.id, agent)
    return this
  }

  addWorld(world: World): this {
    this.#worlds.set(world.id, world)
    return this
  }

  addMembership(membership: Membership): this {
    this.#memberships.set(
      membershipKey(membership.worldId, membership.profileId),
      membership,
    )
    return this
  }

  async authorize(action: Action): Promise<Authorization> {
    const world = this.#worlds.get(action.worldId)
    if (!world || world.status !== "active") {
      throw new AuthorizationError("world_unavailable", "World is unavailable")
    }

    const protocol = action.type.split(".", 1)[0]
    if (!protocol || !world.protocols.includes(protocol)) {
      throw new AuthorizationError(
        "protocol_disabled",
        `World does not enable the ${protocol || "unknown"} protocol`,
      )
    }

    const { profile, agent } = this.#resolveActor(action)
    const membership = this.#memberships.get(
      membershipKey(action.worldId, profile.id),
    )

    if (!membership || membership.status !== "active") {
      throw new AuthorizationError(
        "membership_required",
        "An active membership is required",
      )
    }

    return agent
      ? { profile, agent, world, membership }
      : { profile, world, membership }
  }

  #resolveActor(action: Action): { profile: Profile; agent?: Agent } {
    if (action.actor.type === "profile") {
      const profile = this.#profiles.get(action.actor.id)
      if (!profile) {
        throw new AuthorizationError("unknown_profile", "Profile was not found")
      }
      return { profile }
    }

    const agent = this.#agents.get(action.actor.id)
    if (!agent) {
      throw new AuthorizationError("unknown_agent", "Agent was not found")
    }
    if (agent.revokedAt) {
      throw new AuthorizationError("agent_revoked", "Agent has been revoked")
    }
    if (agent.expiresAt && new Date(agent.expiresAt) <= this.#clock()) {
      throw new AuthorizationError("agent_expired", "Agent authorization expired")
    }
    if (!agent.scopes.some((scope) => scopeMatches(scope, action.type))) {
      throw new AuthorizationError(
        "scope_denied",
        `Agent is not allowed to perform ${action.type}`,
      )
    }

    const profile = this.#profiles.get(agent.ownerProfileId)
    if (!profile) {
      throw new AuthorizationError(
        "unknown_owner",
        "Agent owner profile was not found",
      )
    }

    return { profile, agent }
  }
}

function membershipKey(worldId: string, profileId: string): string {
  return `${worldId}:${profileId}`
}

function scopeMatches(scope: string, actionType: string): boolean {
  if (scope === "*" || scope === actionType) return true
  if (!scope.endsWith(".*")) return false
  return actionType.startsWith(scope.slice(0, -1))
}
