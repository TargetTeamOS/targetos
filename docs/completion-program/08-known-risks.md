# Known Risks

- External-effect APIs and scheduled jobs do not yet share one enforced pre-launch kill switch.
- Fifteen active automation records and two briefing preferences existed before lockdown.
- One credential-bearing Outlook integration account was connected before lockdown.
- Managed database backups exclude 13 Storage objects; the separate backup must be retained.
- The live schema and committed SQL/migrations are not yet authoritative equivalents.
- Seven of nine agent profiles are not linked to Auth users.
- Existing CRM records are significant enough that destructive testing is prohibited.
- Twilio callbacks and provider configuration remain unverified and untested.
