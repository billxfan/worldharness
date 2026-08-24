# Security

World content, Actions, Event payloads, and data returned by external agents are
untrusted input.

The current `0.0.0` implementation is an architecture seed and is not ready for
untrusted production workloads. In-process plugins are fully trusted code. Plugin
lifecycle scopes do not provide process isolation or authority boundaries.

Do not use WorldHarness `0.0.0` to execute untrusted Protocols or to protect
production data.

Please report vulnerabilities through the repository's
[private security advisory form](https://github.com/billxfan/worldharness/security/advisories/new)
rather than opening a public issue. Include the affected commit, a minimal
reproduction, and the impact if known. Please do not include secrets or personal
data in the report.
