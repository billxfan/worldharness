# WorldHarness

[English](README.md) | [简体中文](README.zh-CN.md)

[![CI](https://github.com/billxfan/worldharness/actions/workflows/ci.yml/badge.svg)](https://github.com/billxfan/worldharness/actions/workflows/ci.yml)

**A small, open runtime for governed interaction between people and agents.**

Most agent frameworks answer how an agent reasons, calls tools, and completes a
task. WorldHarness addresses a different problem: how people and their agents
share state, follow the rules of a context, and build a trustworthy history
together.

A **World** is that context. It may be a community, conversation, project,
market, governance space, or game. WorldHarness does not assume that a World has
a Host Agent, or that it is a game at all.

> A person or Agent proposes an Action. A World's Protocol decides what that
> Action means. The Harness commits the resulting Events as shared facts.

## Why WorldHarness?

Connecting an Agent to an API is easy. Letting it participate safely in a shared
environment is harder:

- an Agent must act on behalf of a known person and within explicit scopes;
- people and agents must pass through the same rules;
- a request must not become a fact until it is authorized and committed;
- concurrent actions need clear ordering and conflict behavior; and
- model calls, notifications, and other external work must not corrupt shared
  state when they fail.

WorldHarness keeps that contract in one small runtime instead of embedding it in
every community, bot, workflow, or game.

## Mental model

```text
Human client ─┐
              ├─> Action -> Authorize -> Protocol -> Commit Events
User Agent ───┘                                    |
                                                   +-> views
                                                   +-> delivery
                                                   +-> agents and workers
```

An Agent can propose an Action. It cannot write World state directly.

The kernel has four domain records:

| Record | Meaning |
| --- | --- |
| `Profile` | A person's global identity. |
| `Agent` | A delegated executor owned and scoped by a Profile. |
| `World` | An interaction boundary and its enabled Protocols. |
| `Membership` | A Profile's presentation, roles, and status in one World. |

The runtime adds only three concepts:

| Concept | Meaning |
| --- | --- |
| `Action` | What a Profile or Agent asks to do. |
| `Protocol` | Plugin code that applies a World's rules. |
| `Event` | An append-only fact committed by the Harness. |

There is no kernel `Character`, `Persona`, `Host`, `Message`, or `Thread`
entity. A Membership already carries a Profile's World-specific presentation and
roles. Messages, threads, votes, hosts, and other domain objects belong to the
Protocol that needs them.

## What works today

WorldHarness is currently `0.0.0`: an executable architecture seed, not a
production runtime. The TypeScript implementation has no runtime dependencies
and already demonstrates:

- authorization for Profiles and scoped Agents;
- attribution of both the executing Agent and represented Profile;
- Protocol namespaces enabled per World;
- idempotent Action replay keyed by actor and `Action.id`, so retrying the same
  logical Action does not commit twice;
- optimistic concurrency per event stream;
- atomic in-memory commits across multiple streams;
- append-only Event records with stream and global ordering;
- middleware and Event consumers; and
- disposable Plugin registrations.

The included `MemoryDirectory` and `MemoryEventStore` are for examples and tests.
Persistent storage, durable workers, network adapters, and isolation for
untrusted Plugins are not implemented yet.

## Try it

Requirements: Node.js 22 or newer.

```bash
git clone https://github.com/billxfan/worldharness.git
cd worldharness
npm install
npm run example
```

The example creates one Profile, an Agent acting for that Profile, a World, and a
Membership. The Agent submits `community.post`; the Harness authorizes it and
commits `community.posted` with actor attribution and a causation ID.

An `Action.id` must identify one logical Action for a given actor and must not be
reused with a different World, type, or payload. A replay returns the result of
the first committed Action with that ID.

Run every local check with:

```bash
npm run check
```

## Write a Protocol

A Protocol is a Plugin that registers namespaced Action handlers. Handlers read
current streams and return Event drafts. They do not write storage or call
external services directly.

```ts
import { accept, reject, type Plugin } from "worldharness"

interface SendPayload {
  text: string
}

export const chatProtocol: Plugin = ({ registerAction }) => {
  registerAction("chat.send", async (context, action) => {
    const payload = action.payload as Partial<SendPayload>
    const text = payload.text?.trim()

    if (!text) return reject("invalid_message", "Message text is required")

    const streamId = `world:${action.worldId}:chat`
    await context.read(streamId)

    return accept({
      streamId,
      type: "chat.sent",
      data: {
        messageId: action.id,
        author: context.authorization.membership.displayName,
        text,
      },
    })
  })
}
```

Install it into a Harness:

```ts
const dispose = harness.install(chatProtocol)

// Later: runs the Plugin's registered cleanup functions.
await dispose()
```

## How Agent authorization works

An Agent belongs to one Profile and carries explicit Action scopes:

```ts
const agent = {
  id: "agent:codex",
  ownerProfileId: "profile:kobe",
  provider: "codex",
  scopes: ["chat.*"],
}
```

When that Agent submits an Action, the Authorizer verifies the Agent, its expiry
and revocation state, its scopes, the target World, the enabled Protocol, and the
owner's active Membership. A committed Event records both identities:

```ts
actor: {
  type: "agent",
  id: "agent:codex",
  profileId: "profile:kobe",
}
```

This keeps “whose action is it?” separate from “what executed it?”.

## Plugin surface

Plugins currently have three extension points:

```text
registerAction  handle one namespaced Action type
use             wrap the Action pipeline with middleware
onEvent         observe committed Events
```

In-process Plugins are trusted code. Plugin lifecycle cleanup is not a security
boundary. Support for untrusted Protocols requires a separate process or
WebAssembly sandbox and will not be claimed until it exists.

## Direction

The next milestones are intentionally narrow:

1. Stabilize the Action and Event envelopes.
2. Specify EventStore ordering, concurrency, and replay semantics.
3. Add a persistent EventStore provider and durable consumer loop.
4. Publish a conformance test kit for alternative providers.
5. Add the first network adapter and end-to-end example.

Features such as forums, chat, governance, moderation, discovery, and Host Agents
should be Protocols or consumers, not new kernel concepts.

## Project map

```text
src/types.ts          domain records and Action/Event envelopes
src/authorization.ts  Profile, Agent, World, and Membership authorization
src/harness.ts        dispatch pipeline and Plugin lifecycle
src/store.ts          EventStore contract and in-memory implementation
examples/             runnable Protocol examples
test/                 executable runtime semantics
docs/architecture.md  boundaries and design rationale
```

## Documentation

- [Architecture](docs/architecture.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [中文 README](README.zh-CN.md)

## Contributing

WorldHarness is early enough that precise counterexamples are more useful than
large abstractions. Before adding a kernel entity, explain why the requirement
cannot be represented by an existing field, Event, Plugin, or provider.

Start with [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[Apache License 2.0](LICENSE)
