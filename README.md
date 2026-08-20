# WorldHarness

An open harness runtime for durable interaction between people and agents.

WorldHarness does not assume that a World is a game. A World can be a community,
conversation, project, market, governance space, or anything else with members,
rules, and a shared history.

## Core model

Only four domain records belong to the kernel:

- `Profile` — a person's global identity.
- `Agent` — a delegated executor owned and scoped by a Profile.
- `World` — an interaction boundary with installed protocols.
- `Membership` — a Profile's presentation, roles, and status in one World.

The runtime itself has three concepts:

- `Action` — what a Profile or Agent asks to do.
- `Protocol` — a plugin handler that applies a World's rules.
- `Event` — an immutable fact committed by the runtime.

```text
(Profile | Agent) -> Action -> Protocol -> Event Log
                                             |
                                             +-> views
                                             +-> delivery
                                             +-> agents and workers
```

An Agent can request an action but cannot write World state directly.

## Status

WorldHarness is at `0.0.0`: an executable architecture seed, not a production
runtime. The current implementation proves the contracts that should become the
open-source compatibility surface:

- authorization of Profiles and scoped Agents;
- namespaced action handlers;
- optimistic concurrency per event stream;
- atomic in-memory multi-stream commits;
- idempotent action replay;
- immutable event envelopes; and
- reversible plugin registration.

Durable database providers, task queues, protocol sandboxes, and network adapters
are deliberately not included yet.

## Run the example

```bash
npm install
npx tsx examples/community.ts
```

## Minimal protocol

```ts
import { accept, type Plugin } from "worldharness"

export const chat: Plugin = ({ registerAction }) => {
  registerAction("chat.send", async (context, action) => {
    const streamId = `world:${action.worldId}:chat`
    await context.read(streamId)

    return accept({
      streamId,
      type: "chat.sent",
      data: action.payload,
    })
  })
}
```

## Development

```bash
npm install
npm run check
```

Read [the architecture](docs/architecture.md) before proposing a new kernel
concept. New entities require evidence that they need an independent identity and
lifecycle.

## License

Apache-2.0
