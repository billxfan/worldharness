# Security

World content, Actions, Event payloads, and data returned by external agents are
untrusted input.

The current `0.0.0` implementation is an architecture seed and is not ready for
untrusted production workloads. In-process plugins are fully trusted code. Plugin
lifecycle scopes do not provide process isolation or authority boundaries.

Please report vulnerabilities privately through GitHub's security advisory
feature rather than opening a public issue.
