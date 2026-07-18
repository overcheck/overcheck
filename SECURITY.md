# Security Policy

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Email **hello@baratek.com** with:

- A description of the issue and its impact
- Steps to reproduce (a minimal repro is ideal)
- The affected version/commit

You'll get an acknowledgement within **48 hours**, and a more detailed response — including
whether the report is accepted, and an expected timeline for a fix — within **7 days**. We'll
credit you in the release notes when the fix ships, unless you'd rather stay anonymous.

## Supported versions

Overcheck is pre-1.0 and moving fast. Until a stable 1.0 release, only the latest published
release is supported — please confirm the issue reproduces on the latest `:latest` image or
`main` before reporting.

## Scope

In scope: the Overcheck server, CLI, dashboard, and public status pages as shipped in this
repository. Out of scope: third-party services you connect (Slack, SMTP providers), and
vulnerabilities that require an attacker to already have admin credentials on your instance.
