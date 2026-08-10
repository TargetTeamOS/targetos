# Pre-launch Safety Lockdown

Status date: 2026-07-31
Program phase: Phase 0
Environment: current pre-launch Supabase development project

## Backup baseline

- **Verified** - Supabase exposes a restorable physical database backup dated `2026-07-31 09:48:27 UTC`.
- **Verified** - Supabase database backups do not include Storage object bodies.
- **Verified** - All 13 Storage objects were downloaded outside the repository with their original bucket and folder paths.
- **Verified** - The extracted Storage backup contains exactly `22,963,515` bytes.
- **Verified** - The external archive is `C:\Users\User\Documents\TargetOS-Storage-Backup-2026-07-31.zip` (`21,466,627` bytes).
- **Verified** - Archive SHA-256: `1c2fc4eb0f48d096d727d0c230a3f79bf581c2fb31af763e7b8727ecb2ce5506`.
- **Verified** - A per-object SHA-256 manifest and a sibling archive-checksum file are stored outside Git. No backup object or archive exists in the repository.

## Reversible database lockdown baseline

The following records were enabled immediately before lockdown. No secrets, tokens, account addresses, or customer data are reproduced here.

### Automations

| ID | Previous state | Name |
|---|---|---|
| `a0000000-0000-4000-8000-000000000005` | active | Sold to Gift board |
| `a0000000-0000-4000-8000-000000000004` | active | Under Contract to Gift board |
| `a0000000-0000-4000-8000-000000000202` | active | Agent behind goal weekly alert |
| `a0000000-0000-4000-8000-000000000003` | active | Sold to secretary task list |
| `a0000000-0000-4000-8000-000000000007` | active | New contact assignment |
| `a0000000-0000-4000-8000-000000000201` | active | Outstanding commission weekly alert |
| `a0000000-0000-4000-8000-000000000006` | active | One week to closing commission bill |
| `a0000000-0000-4000-8000-000000000002` | active | Under Contract to secretary task list |
| `a0000000-0000-4000-8000-000000000203` | active | Uncontacted new leads daily alert |
| `a0000000-0000-4000-8000-000000000101` | active | Deal-stage email alert |
| `a0000000-0000-4000-8000-000000000102` | active | Listing-status email alert |
| `a0000000-0000-4000-8000-000000000001` | active | Voicemail email alert |
| `a0000000-0000-4000-8000-000000000008` | active | Photography scheduled alert |
| `69f7a0ac-a71c-471e-90b2-9ad1a4f3aad3` | active | New lead |
| `10c6c32c-f5fe-476e-90ab-ef067c8c4e43` | active | Under contract |

### Scheduled and connected state

| Record | Identifier | Previous state | Lockdown reason |
|---|---|---|---|
| Briefing preference | agent `0a722216-00eb-4370-94c3-7c0a000d4860` | enabled | Prevent system-mail delivery during construction |
| Briefing preference | agent `b204ba0f-1346-46bc-a6a0-eebee933bc27` | enabled | Prevent system-mail delivery during construction |
| Report definitions | all | zero enabled | No state change required |
| Outlook integration account | `74649472-cd3f-47ce-87f3-5e1c5e34d99f` | connected | Prevent delegated external email activity |
| Email connections | all | zero active | No state change required |
| Organization display integration | `display` | connected | Retained; it is an internal display connector, not an external communication path |

## Applied lockdown controls

- **Verified** - All 15 automation records were changed from `active=true` to `active=false` in one atomic statement.
- **Verified** - Both enabled briefing preferences were changed to `enabled=false` in the same atomic statement.
- **Verified** - The connected Outlook integration account was changed from `connected` to `quarantined` without deleting its configuration or credentials.
- **Verified** - Post-change counts are: zero active automations, zero enabled briefing preferences, zero enabled report definitions, zero connected Outlook accounts, one quarantined Outlook account, zero active email connections, zero actionable campaigns, and zero pending custom reminder records.
- **Verified** - Vercel project `TargetTeam / targetos` had Cron Jobs enabled immediately before infrastructure lockdown.
- **Verified** - The project-level Vercel Cron Jobs control was changed to `Disabled` on 2026-07-31. Vercel confirmed that scheduled execution is prevented while the three schedule definitions remain intact.
- **Verified** - The disabled schedules are `/api/daily-briefing-cron`, `/api/report-cron`, and `/api/task-reminders`. Their manual Run controls are disabled.
- **Verified** - Disabling Cron Jobs did not redeploy or modify the Production deployment.
- **Verified** - Vercel custom firewall rule `Pre-launch external effects quarantine` is active with action `Deny` for Production only. Preview deployments are not in scope.
- **Verified** - The rule blocks the following API families without redeployment: calendar push, connector send, contact automations, scheduled briefings/reports/reminders, Gmail watch/PubSub callbacks, Mailchimp sync, Google/Microsoft OAuth and Outlook account management, report send-now, campaigns, email, SMS, Sheets export, team notifications, all Twilio routes, and generic inbound webhooks.
- **Verified** - A safe unauthenticated `GET /api/send-email` probe against the Production custom domain returned Vercel `403 Forbidden`; the application handler and email provider were not reached.
- All 15 automation records must remain inactive until their triggers, recipients, idempotency, and external effects have acceptance tests.
- Both briefing preferences must remain disabled until test-only recipients and the system mailbox are verified.
- Campaigns currently have no actionable scheduled records; campaign sending remains prohibited.
- Task and transaction-coordinator reminder records currently have no pending custom reminder sends; Vercel scheduled execution is now paused at project level.
- Direct Resend, Microsoft Graph, connector, webhook, Twilio, and SMS routes are quarantined on Production by the Vercel firewall. A shared application-level guard is still required before the firewall can eventually be removed.
- Twilio provider callbacks and credentials have not been changed. Twilio tests remain prohibited.

The database and infrastructure lockdown is reversible. Production provider-effect routes are denied at the Vercel edge, and scheduled execution is disabled. Preview remains available for controlled tests; its environment and test-recipient safeguards must be verified before any external-effect test.

## Restoration procedure

1. Complete Phase 1 security, migration, RLS, build, and acceptance gates.
2. Confirm every recipient/account is staging-only or intentionally approved for go-live.
3. Restore each automation by ID only after its individual acceptance test passes.
4. Restore the two briefing preferences only after a test-only system-mail send succeeds.
5. Restore the Outlook integration account to `connected` only after ownership, token encryption, callback URLs, and test recipients are verified.
6. Keep the Vercel firewall rule active until equivalent application guards pass tests and every provider callback is intentionally approved.
7. Re-enable the Vercel project-level Cron Jobs control only after all three endpoints pass non-communication authentication and idempotency tests.
8. Restore scheduled jobs and provider callbacks one group at a time, recording the approver, deployment, smoke test, and rollback point.

## Configuration required before reactivation

- A repository-wide external-effects kill switch enforced by every outbound API and scheduled job.
- Test-only Microsoft, Google, Resend, Twilio, Zapier/API Nation, and webhook destinations.
- Verified Preview/future Production environment separation.
- Idempotency and audit evidence for scheduled email, automation, webhook, and reminder paths.
- Explicit approval before any real recipient or live provider is contacted.
