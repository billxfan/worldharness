import {
  Harness,
  MemoryDirectory,
  MemoryEventStore,
  accept,
  reject,
  type Plugin,
} from "../src/index.js"

interface PostPayload {
  readonly text: string
}

export const communityProtocol: Plugin = ({ registerAction }) => {
  registerAction("community.post", async (context, action) => {
    const payload = action.payload as Partial<PostPayload>
    const text = payload.text?.trim()

    if (!text) return reject("invalid_post", "Post text is required")

    const streamId = `world:${action.worldId}:feed`
    await context.read(streamId)

    return accept({
      streamId,
      type: "community.posted",
      data: {
        postId: action.id,
        author: context.authorization.membership.displayName,
        text,
      },
    })
  })
}

const directory = new MemoryDirectory()
  .addProfile({ id: "profile:kobe", name: "Kobe" })
  .addAgent({
    id: "agent:codex",
    ownerProfileId: "profile:kobe",
    provider: "codex",
    scopes: ["community.*"],
  })
  .addWorld({
    id: "builders",
    name: "World Builders",
    protocols: ["community"],
    status: "active",
  })
  .addMembership({
    worldId: "builders",
    profileId: "profile:kobe",
    displayName: "Runtime Maintainer",
    roles: ["member"],
    status: "active",
    joinedAt: new Date().toISOString(),
  })

const harness = new Harness({
  authorizer: directory,
  eventStore: new MemoryEventStore(),
})

harness.install(communityProtocol)

const result = await harness.dispatch({
  id: "action:first-post",
  worldId: "builders",
  actor: { type: "agent", id: "agent:codex" },
  type: "community.post",
  payload: { text: "People and agents share the same interaction runtime." },
})

console.log(JSON.stringify(result, null, 2))
