# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 2.1.x   | ✅        |
| 2.0.x   | ✅        |
| < 2.0   | ❌        |

## Reporting a Vulnerability

If you believe you have found a security vulnerability in `playwright-summary-reporter`, please
report it privately — **do not open a public issue** for a security issue.

### Preferred: GitHub Security Advisories

Use the repository's private advisory form, which routes the report directly to the maintainer:

1. Go to [Security Advisories](https://github.com/salekinnewaz/playwright-summary-reporter/security/advisories/new)
2. Click **Report a vulnerability**
3. Describe the issue, the affected version, and the impact

### Alternative: Public Issue

If you are unable to use the advisory form, open a regular issue at
[github.com/salekinnewaz/playwright-summary-reporter/issues](https://github.com/salekinnewaz/playwright-summary-reporter/issues)
with a `[security]` prefix in the title. Please do not include exploit details in a public issue —
ask to move it into a private advisory.

## What to Include

- Type of issue (e.g. path traversal, injection, information disclosure)
- Affected package version(s)
- Steps to reproduce, ideally with a minimal Playwright config
- Impact and suggested remediation

## Response Expectations

- **Acknowledgement:** within 5 business days
- **Assessment:** within 10 business days, including severity and whether a fix is planned
- **Fix:** critical and high severity issues are prioritised; a release is published and credited
  in the [CHANGELOG](./CHANGELOG.md)

## Scope

This package runs entirely inside your own Playwright process and has **zero runtime
dependencies**. It reads test results, writes a Markdown file, and — only when the
`GITHUB_STEP_SUMMARY` environment variable is present — appends to that file. It performs no
network requests and executes no remote code.

Note that vulnerabilities in Playwright itself, or in the environment hosting your CI, should be
reported to the respective upstream projects.
