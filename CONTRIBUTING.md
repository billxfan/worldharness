# Contributing to WorldHarness

WorldHarness is still defining its compatibility surface. Focused examples,
failing tests, storage providers, adapters, and precise design arguments are more
valuable than broad framework layers.

## Set up the repository

Requirements: Git and Node.js 22 or newer.

```bash
git clone https://github.com/billxfan/worldharness.git
cd worldharness
npm install
npm run check
```

`npm run check` runs TypeScript type checking, the Node test suite, and the
package build. Run the community example with `npm run example`.

## Find the right extension point

| You want to add | Where it belongs |
| --- | --- |
| A new World behavior such as chat or voting | A Protocol Plugin and its tests |
| Authentication and caller identity | A transport adapter and/or `Authorizer` implementation |
| Post-authentication policy, rate limits, auditing, or observability | Action middleware |
| Notifications, indexing, or Agent reactions | An Event consumer |
| PostgreSQL or another event backend | An `EventStore` implementation |
| HTTP, WebSocket, A2A, or another transport | An adapter outside the kernel |
| A new kernel concept | An issue with a concrete counterexample first |

Protocol-specific objects stay outside the kernel. A forum may own threads and
replies; WorldHarness should not.

## The entity admission rule

Before proposing a kernel entity, show that it needs most of the following:

- an independent identifier;
- an independent lifecycle;
- long-lived references from other records;
- separate authorization or revocation; and
- information that cannot be derived from current records.

If it does not, prefer a field, value, Event type, configuration, Plugin, or
provider. This is why Persona, Mandate, Host, Message, and Thread are not kernel
entities today.

## Change the runtime contracts carefully

Changes to any of these areas require an issue describing the use case and
compatibility impact before implementation:

- Action or Event envelopes;
- EventStore ordering, replay, or concurrency semantics;
- Agent authorization semantics;
- Protocol handler behavior; and
- Plugin installation or disposal.

Include tests that make the intended behavior executable. Alternative EventStore
providers should eventually pass the same conformance suite as the in-memory
implementation.

## Pull requests

Keep each pull request centered on one behavior. Include:

1. the user or contributor problem being solved;
2. why the chosen extension point is the smallest sufficient one;
3. tests for success, rejection, retries, and conflicts where relevant; and
4. documentation changes when a public contract changes.

Before opening a pull request:

```bash
npm run check
git diff --check
```

Do not commit `node_modules`, `dist`, credentials, or generated local data.
