# Contributing

WorldHarness welcomes focused proposals, protocol examples, storage providers,
adapters, and conformance tests.

Before adding a kernel concept, open an issue describing the concrete use case and
why the requirement cannot be represented by an existing field, event, plugin, or
provider. The project follows a strict "no entity without necessity" rule.

## Local checks

```bash
npm install
npm run check
```

## Design changes

Changes to Action or Event envelopes, commit semantics, authorization semantics,
or the plugin lifecycle should begin as a short RFC under `docs/rfcs/`.

Keep protocol-specific concepts outside the kernel. A forum provider may own
threads and replies; the Harness should not.
