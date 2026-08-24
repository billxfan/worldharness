# Architecture

[Project README](../README.md) | [中文 README](../README.zh-CN.md)

## First principle

WorldHarness exists so a person, directly or through an Agent, can interact with
other people and agents inside a governed context.

```text
Protocol(current state, action) -> events | rejection
```

Transport adapters establish caller identity from credentials. The Harness owns
authorization, ordering, idempotency, and event commit. Protocol plugins own
domain meaning. Consumers own derived views and external side effects.

## Kernel boundary

The persistent domain model contains `Profile`, `Agent`, `World`, and
`Membership`. Persona is Membership presentation data. Roles are Membership
fields. Agent binding and mandate are represented by Agent ownership and scopes.

`Action` is a request envelope, and `Event` is an append-only record. Neither is
a new business aggregate. Actor is a reference inside those envelopes.

Messages, posts, threads, proposals, votes, relationships, and hosts belong to
protocol plugins. A direct conversation can be a two-member World with a chat
protocol. A community can be a multi-member World with forum and moderation
protocols.

## Dispatch path

```text
adapter
  -> Action
  -> Authorizer
  -> middleware
  -> protocol handler
  -> EventStore.commit
  -> live consumers
```

The Authorizer resolves the effective Profile from a Profile or Agent actor. It
then checks World status, Agent scopes, expiry and revocation, and Membership.
Protocol handlers receive only that verified context.

Action types are namespaced as `<protocol>.<action>`. The Harness rejects an
action unless its namespace appears in `World.protocols`; installing a plugin does
not silently enable it for every World.

A handler reads the streams needed for its decision. The Harness records their
versions and supplies them to the atomic commit. Concurrent writes return a
version conflict and can be retried from new state.

## Plugin model

Plugins can register action handlers, middleware, and live event consumers. An
installation returns a disposer that runs the plugin's registered cleanup
functions.

This follows the useful part of the DeepSeek Harness model: shared composition,
typed extension seams, and explicit lifecycle effects. These are programming
primitives, not additional domain entities.

Plugins run in-process and are trusted in the current release. Lifecycle scope is
not an authorization or sandbox boundary. Untrusted protocols will require a
restricted worker or WebAssembly boundary before they are supported.

## Events and effects

Protocol handlers must not call models, tools, payment systems, or arbitrary
network services. They only return event drafts.

External work follows this loop:

```text
committed event -> durable worker -> external operation -> new Action
```

Live consumers in the current in-memory runtime are best-effort callbacks. A
production provider must tail the EventStore with durable consumer offsets or use
a transactional outbox. A committed event is never rolled back because a
consumer fails.

## Control data and interaction data

The first production store should keep current control data in ordinary tables:

```text
profiles
agents
worlds
memberships
```

World interaction facts remain append-only:

```text
events
```

Snapshots, task records, consumer offsets, inboxes, and search documents are
operational records or projections. They are not kernel domain entities.

## Entity admission rule

A proposed kernel entity should normally have an independent identifier,
lifecycle, references, authorization, and information that cannot be derived from
existing records. Otherwise prefer a field, value, event type, configuration, or
plugin-owned projection.

Examples of intentionally deferred entities:

- Persona, until one Membership can own multiple independent identities.
- Mandate, until one Agent needs independently issued and revoked grants.
- Host, because it is an optional Agent consumer and action producer.
- Blueprint, because it is a reusable World configuration file.

## Compatibility surface

Before `0.1`, the project should stabilize only:

1. Action and Event envelopes.
2. Protocol handler contract.
3. Plugin lifecycle.
4. EventStore ordering, optimistic concurrency, and idempotency semantics.
5. Agent authorization semantics.
6. A conformance test kit for alternative providers.

Everything else should remain replaceable.
