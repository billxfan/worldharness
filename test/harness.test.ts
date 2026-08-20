import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  Harness,
  MemoryDirectory,
  MemoryEventStore,
  accept,
  type ActionContext,
  type Plugin,
} from "../src/index.js"

function setup(scopes: readonly string[] = ["community.*"]) {
  const directory = new MemoryDirectory()
    .addProfile({ id: "profile:1", name: "Kobe" })
    .addAgent({
      id: "agent:1",
      ownerProfileId: "profile:1",
      provider: "test",
      scopes,
    })
    .addWorld({
      id: "world:1",
      name: "Builders",
      protocols: ["community"],
      status: "active",
    })
    .addMembership({
      worldId: "world:1",
      profileId: "profile:1",
      displayName: "Maintainer",
      roles: ["member"],
      status: "active",
      joinedAt: "2026-08-21T00:00:00.000Z",
    })

  const eventStore = new MemoryEventStore({
    clock: () => new Date("2026-08-21T00:00:00.000Z"),
    createId: (() => {
      let id = 0
      return () => `event:${++id}`
    })(),
  })
  const harness = new Harness({ authorizer: directory, eventStore })

  return { directory, eventStore, harness }
}

const postPlugin: Plugin = ({ registerAction }) => {
  registerAction("community.post", async (context, action) => {
    const streamId = `world:${action.worldId}:feed`
    await context.read(streamId)
    return accept({
      streamId,
      type: "community.posted",
      data: action.payload,
    })
  })
}

describe("Harness", () => {
  it("commits an authorized profile action", async () => {
    const { harness } = setup()
    harness.install(postPlugin)

    const result = await harness.dispatch({
      id: "action:1",
      worldId: "world:1",
      actor: { type: "profile", id: "profile:1" },
      type: "community.post",
      payload: { text: "hello" },
    })

    assert.equal(result.accepted, true)
    if (!result.accepted) return
    assert.equal(result.events.length, 1)
    assert.deepEqual(result.events[0]?.actor, {
      type: "profile",
      id: "profile:1",
      profileId: "profile:1",
    })
    assert.equal(result.events[0]?.sequence, 1)
  })

  it("records the agent and represented profile", async () => {
    const { harness } = setup()
    harness.install(postPlugin)

    const result = await harness.dispatch({
      id: "action:agent",
      worldId: "world:1",
      actor: { type: "agent", id: "agent:1" },
      type: "community.post",
      payload: { text: "hello from an agent" },
    })

    assert.equal(result.accepted, true)
    if (!result.accepted) return
    assert.deepEqual(result.events[0]?.actor, {
      type: "agent",
      id: "agent:1",
      profileId: "profile:1",
    })
  })

  it("rejects an agent outside its scopes", async () => {
    const { harness } = setup(["chat.*"])
    harness.install(postPlugin)

    const result = await harness.dispatch({
      id: "action:denied",
      worldId: "world:1",
      actor: { type: "agent", id: "agent:1" },
      type: "community.post",
      payload: { text: "not allowed" },
    })

    assert.deepEqual(result, {
      accepted: false,
      code: "scope_denied",
      message: "Agent is not allowed to perform community.post",
    })
  })

  it("replays an idempotent action without notifying twice", async () => {
    const { harness } = setup()
    harness.install(postPlugin)
    let deliveries = 0
    harness.onEvent("community.posted", () => {
      deliveries += 1
    })

    const action = {
      id: "action:same",
      worldId: "world:1",
      actor: { type: "profile" as const, id: "profile:1" },
      type: "community.post",
      payload: { text: "only once" },
    }

    const first = await harness.dispatch(action)
    const replay = await harness.dispatch(action)

    assert.equal(first.accepted && first.replayed, false)
    assert.equal(replay.accepted && replay.replayed, true)
    assert.equal(deliveries, 1)
  })

  it("detects concurrent writes after both handlers read the same version", async () => {
    const { harness } = setup()
    let arrivals = 0
    let release!: () => void
    const bothArrived = new Promise<void>((resolve) => {
      release = resolve
    })

    const readTogether = async (context: ActionContext) => {
      const streamId = "world:1:feed"
      await context.read(streamId)
      arrivals += 1
      if (arrivals === 2) release()
      await bothArrived
      return accept({ streamId, type: "community.posted", data: {} })
    }
    harness.registerAction("community.post", readTogether)

    const [first, second] = await Promise.all([
      harness.dispatch({
        id: "action:concurrent-1",
        worldId: "world:1",
        actor: { type: "profile", id: "profile:1" },
        type: "community.post",
        payload: {},
      }),
      harness.dispatch({
        id: "action:concurrent-2",
        worldId: "world:1",
        actor: { type: "profile", id: "profile:1" },
        type: "community.post",
        payload: {},
      }),
    ])

    assert.deepEqual(
      [first, second].map((result) =>
        result.accepted ? "accepted" : result.code,
      ).sort(),
      ["accepted", "version_conflict"],
    )
  })

  it("assigns a unique global position to every event in one commit", async () => {
    const { harness } = setup()
    harness.registerAction("community.post", async (context) => {
      await context.read("world:1:feed")
      return accept(
        {
          streamId: "world:1:feed",
          type: "community.posted",
          data: { part: 1 },
        },
        {
          streamId: "world:1:feed",
          type: "community.indexRequested",
          data: { part: 2 },
        },
      )
    })

    const result = await harness.dispatch({
      id: "action:multi-event",
      worldId: "world:1",
      actor: { type: "profile", id: "profile:1" },
      type: "community.post",
      payload: {},
    })

    assert.equal(result.accepted, true)
    if (!result.accepted) return
    assert.deepEqual(
      result.events.map((event) => [event.sequence, event.position]),
      [
        [1, 1],
        [2, 2],
      ],
    )
  })

  it("rejects actions from protocols the World has not enabled", async () => {
    const { harness } = setup(["chat.*"])
    harness.registerAction("chat.send", () =>
      accept({ streamId: "chat:1", type: "chat.sent", data: {} }),
    )

    const result = await harness.dispatch({
      id: "action:disabled-protocol",
      worldId: "world:1",
      actor: { type: "agent", id: "agent:1" },
      type: "chat.send",
      payload: {},
    })

    assert.deepEqual(result, {
      accepted: false,
      code: "protocol_disabled",
      message: "World does not enable the chat protocol",
    })
  })

  it("removes all registrations when a plugin is disposed", async () => {
    const { harness } = setup()
    const dispose = harness.install(postPlugin)
    await dispose()

    const result = await harness.dispatch({
      id: "action:disposed",
      worldId: "world:1",
      actor: { type: "profile", id: "profile:1" },
      type: "community.post",
      payload: {},
    })

    assert.equal(result.accepted, false)
    if (result.accepted) return
    assert.equal(result.code, "unsupported_action")
  })
})
