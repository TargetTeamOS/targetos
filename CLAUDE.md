# TargetOS V2 — Master AI Context File

> Any AI assistant reading this file has everything needed to understand, update, and deploy the TargetOS CRM for Target Team at KW Valley Realty, Rockland County NY.
> Credentials are in DEVELOPER_ACCESS.md (gitignored, stored separately).

---

## IDENTITY

- **App:** TargetOS V2 — Real estate CRM
- **Client:** Target Team, KW Valley Realty, Rockland County NY
- **Live URL:** https://app.targetreteam.com
- **GitHub:** https://github.com/TargetTeamOS/targetos (branch: `v2`, deploy: `main`)
- **Admin contact:** Yanky Lichtenstein (owner/admin)

---

## INSTANT SETUP (run once per session)

```bash
git clone https://[GITHUB_TOKEN]@github.com/TargetTeamOS/targetos.git targetos-v2-build
cd targetos-v2-build
git config user.email "targetos@targetreteam.com"
git config user.name "TargetOS"
git fetch origin
git checkout main        # ← ALWAYS use main — this is where ALL work lives
git pull origin main     # ← get the absolute latest before making any changes
npm install
```

> ⚠️ CRITICAL: The repo has two branches — `main` and `v2`. They are kept in sync.
> ALL work happens on `main`. If you accidentally start from `v2` you will lose context.
> ALWAYS run `git log --oneline -5` first to confirm you see the latest commits.
> Latest commit should be: "CLAUDE.md: complete master context" or newer.

## DEPLOY (every change)

```bash
npm run build           # MUST show "✓ built" — zero errors, zero warnings about files
git add -A
git commit -m "brief description of change"
git push origin v2:main --force
# Vercel auto-deploys → live at https://app.targetreteam.com in ~90 seconds
```

---

## STACK

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite 5 |
| Routing | React Router v6 |
| State | React Context (AppContext, AuthContext) |
| Database | Supabase (PostgreSQL + Auth) |
| Styling | CSS variables in `src/styles.css` — no Tailwind, no CSS modules |
| Icons | Inline SVG only — no icon libraries |
| API routes | `/api/*.js` — Vercel serverless, **CommonJS only** |
| Hosting | Vercel (auto-deploy on push to `main`) |
| Phone | Twilio (+18453271778) |
| Email | Resend |
| Maps | Google Maps API |
| AI | Claude Sonnet (AIAssistant floating button) |

---

## FILE STRUCTURE

```
src/
  pages/           ← One file per CRM board/page
  components/      ← Shared UI components
  context/         ← AppContext.jsx, AuthContext.jsx
  lib/             ← db.js, hooks.js, utils.js, supabase.js, constants.js
  lib/db/          ← Per-table Supabase CRUD modules
  styles.css       ← ALL CSS variables and global styles
api/               ← Vercel serverless functions (CommonJS ONLY)
public/            ← Static assets
CLAUDE.md          ← This file (always in repo)
DEVELOPER_ACCESS.md← Credentials (gitignored — stored separately)
vercel.json        ← { "rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }] }
```

---

## PAGES (src/pages/)

| File | Route | Nav Label | Roles |
|------|-------|-----------|-------|
| Dashboard.jsx | `/` | Dashboard | all |
| Contacts.jsx | `/contacts` | Contacts | all |
| ContactDetail.jsx | `/contacts/:id/detail` | — | all |
| Production.jsx | `/production` | Production | all |
| Listings.jsx | `/listings` | Listings | all |
| ListingDetail.jsx | `/listings/:id` | — | all |
| Tasks.jsx | `/tasks` | Tasks | all |
| Calendar.jsx | `/calendar` | Calendar | all |
| Calls.jsx | `/calls` | Calls | all |
| CallFlow.jsx | `/call-flow` | Call Flows | admin, secretary |
| Signs.jsx | `/signs` | Signs | admin, secretary |
| SocialCards.jsx | `/social-cards` | Social Cards | all |
| OpenHouse.jsx | `/openhouse` | Open House | all |
| Offers.jsx | `/offers` | Offers | all |
| Transactions.jsx | `/transactions` | Transactions | admin, secretary |
| Gifts.jsx | `/gifts` | Gifts | admin, secretary |
| Pipeline.jsx | `/pipeline` | Pipeline | all |
| ListingPrep.jsx | `/listingprep` | Listing Prep | all |
| Announcements.jsx | `/announcements` | Announcements | all |
| DailyBriefing.jsx | `/briefing` | Daily Briefing | all |
| AgentPerformance.jsx | `/performance` | Performance | admin, secretary |
| Automations.jsx | `/automations` | Automations | admin |
| ActivityLog.jsx | `/activitylog` | Activity Log | admin |
| Admin.jsx | `/admin` | Admin | admin |
| Settings.jsx | `/settings` | Settings | all |
| Email.jsx | `/email` | Email | admin, secretary |
| EmailDesigner.jsx | `/designer` | — | admin, secretary |
| Notes.jsx | `/notes` | — | all |
| Mortgage.jsx | `/mortgage` | — | all |
| Route.jsx | `/route` | — | all |

---

## COMPONENTS (src/components/)

| File | Purpose |
|------|---------|
| UI.jsx | ALL shared components: Btn, Modal, Field, Input, Select, Textarea, Pill, Avatar, Tabs, Toggle, PageHeader, Loading, Empty, Confirm, Card, Divider, SearchInput, SectionTitle, ModalActions, StatCard |
| Layout.jsx | Desktop sidebar navigation |
| MobileLayout.jsx | Mobile bottom navigation |
| AddressAutocomplete.jsx | Google Places address search — returns {street, city, state, zip, lat, lng} |
| ClickToCall.jsx | Twilio outbound call button + tel: fallback |
| FilterBar.jsx | Compact filter row with search + filter pills |
| ImportExport.jsx | CSV import/export for all boards |
| AIAssistant.jsx | Floating AI chat button (Claude Sonnet) |
| VoiceCapture.jsx | Voice-to-contact (Dashboard only) |
| RecordActivityFeed.jsx | Activity timeline per record |
| FileAttachments.jsx | File upload/download per record |
| NotificationBell.jsx | In-app notifications |

---

## DATABASE — SUPABASE

**Connection:** `src/lib/supabase.js`
**All CRUD:** `src/lib/db.js` + `src/lib/db/*.js` modules
**All hooks:** `src/lib/hooks.js`

### Tables

| Table | Key Columns | Hook |
|-------|-------------|------|
| agents | id, auth_user_id, name, email, phone, role, color, active | useAgents() |
| contacts | id, first_name, last_name, phone, email, address, city, state, zip, status, source, type, budget_max, notes, agent_id | useContacts() |
| deals | id, addr, unit, stage, side, sale_type, production, gci, ao_date, close_date, agent_id, client_legal_name, client_phone, contact_id | useDeals() |
| listings | id, addr, city, state, zip, status, list_price, property_type, deal_type, beds, baths, sqft, lat, lng, agent_id, mls_link, ivr_enabled | useListings() |
| tasks | id, title, notes, priority, status, due_date, agent_id, contact_id, listing_id, deal_id | useTasks() |
| calls | id, contact_id, contact_name, direction, outcome, duration, notes, called_at, to_number, from_number, agent_id, status | useCalls() |
| signs | id, addr, city, state, zip, lat, lng, order_status, upper_rider, lower_rider, date_installed, date_removed, agent_id | useSigns() |
| calendar_events | id, title, start_date, start_time, end_date, all_day, location, type, agent_id, contact_id | useCalendar() |
| open_houses | id, listing_id, listing_addr, date, start_time, end_time, agent_id | useOpenHouses() |
| oh_visitors | id, open_house_id, first_name, last_name, phone, email, interest | — |
| gifts | id, contact_id, item, amount, occasion, date, agent_id, sent | useGifts() |
| offers | id, addr, buyer, seller, price, status, agent_id, contact_id, listing_id | useOffers() |
| transactions | id, deal_id, type, amount, date, notes | useTransactions() |
| announcements | id, title, body, pinned, agent_id | useAnnouncements() |
| phone_ivr | id, name, flow_nodes, flow_edges, greeting_text, menu_options, is_active | — |
| phone_extensions | id, agent_id, extension, forward_to | — |
| voicemails | id, from_number, recording_url, transcript, duration, agent_id, listened | — |
| automations | id, name, description, active, nodes, connections | useAutomations() |
| audit_log | id, agent_id, table_name, record_id, action, before_val, after_val, created_at | useAuditLog() |
| briefing_prefs | id, agent_name, enabled, sections | — |
| listing_prep | id, listing_id, category, task, done, notes | useListingPrep() |
| notes | id, content, agent_id, contact_id, listing_id, deal_id | — |

### CRUD Pattern

```javascript
// All via db.js
const contact = await db.contacts.create({ first_name, last_name, phone, ... })
const contacts = await db.contacts.list({ status: 'Hot' })
await db.contacts.update(id, { status: 'Warm' })
await db.contacts.delete(id, agentId)

// Or use hooks in components:
const { contacts, loading, refetch } = useContacts()
const { deals } = useDeals({ stage: 'Closed' })
```

---

## SERVICES

### Twilio (Phone)
- **Account SID:** See DEVELOPER_ACCESS.md
- **Number:** +1 (845) 327-1778 (in Vercel env: TWILIO_PHONE_NUMBER)
- **API files:** `api/twilio-*.js` — all CommonJS, create Supabase client inside handler
- **Inbound flow:** twilio-inbound.js → twilio-menu.js → agent extension
- **Outbound:** `api/twilio-outbound.js` — POSTed from ClickToCall component

### Resend (Email)
- **API key:** See DEVELOPER_ACCESS.md (Vercel env: RESEND_API_KEY)
- **Used in:** `api/send-email.js`

### Google Maps
- **Key:** Vercel env `VITE_GOOGLE_MAPS_KEY`
- **Used in:** AddressAutocomplete.jsx, Signs.jsx, Route.jsx

### Monday.com Boards
- Production Sheet: `2032924987`
- Sign Inventory: `5425751646`
- Target Team Listings: `2445753704`

---

## TEAM

| Name | Role | Color | Notes |
|------|------|-------|-------|
| Yanky Lichtenstein | admin | #10B981 | Owner |
| Avraham Weinberger | admin | #8B5CF6 | — |
| Lazer Farkas | agent | #CC2200 | — |
| Mendy Jankovits | agent | #0EA5E9 | — |
| Isaac Leibowitz | agent | #F5A623 | — |
| Gitty Fogel | secretary | #7C3AED | — |
| Joel Rottenstein | agent | #E8650A | — |
| Eli Hoffman | agent | #14B8A6 | — |

---

## CRITICAL RULES — VIOLATIONS CRASH THE APP

### 1. JSX Safety (esbuild parser bugs)

```
NEVER use backticks (template literals) in JSX render paths
NEVER use regex literals /pattern/g in JSX expressions  
NEVER use { ...spread } in JSX style props

INSTEAD use:
  'Hello ' + name           (not `Hello ${name}`)
  str.split('_').join(' ')  (not str.replace(/_/g, ' '))
  { color: x, background: y } (not { ...baseStyle, color: x })
```

### 2. API Files

```
All /api/*.js MUST be CommonJS:
  module.exports = async function handler(req, res) { ... }
  const { createClient } = require('@supabase/supabase-js')

NEVER use ES modules (import/export) in /api/ directory
ALWAYS create Supabase client INSIDE the handler function (not at module level)
```

### 3. Component Imports

```
Every component used in JSX must have a matching import at top of file
When adding: add the import
When removing from JSX: also remove the import
```

### 4. vercel.json (NEVER change this)

```json
{ "rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }] }
```

---

## BEFORE EVERY PUSH — VERIFICATION CHECKLIST

```bash
# 1. Build must pass
npm run build   # must show "✓ built" — if ERROR stop and fix

# 2. Check modified files for backticks
grep -c '`' src/pages/YOURFILE.jsx   # must be 0

# 3. Verify imports match usage (paste into node)
node -e "
const fs = require('fs')
const src = fs.readFileSync('src/pages/YOURFILE.jsx', 'utf8')
const bt = (src.match(/\`/g)||[]).length
console.log('Backticks:', bt, bt===0?'OK':'FAIL')
"

# 4. Push
git push origin v2:main --force
```

---

## PATTERN: HOW TO ADD A NEW FEATURE

1. **New page:** Create `src/pages/NewPage.jsx` → add import + Route in `src/App.jsx` → add nav entry in `src/components/Layout.jsx`
2. **New component:** Create `src/components/NewComp.jsx` → import it in the page that uses it
3. **New DB table:** Add SQL in Supabase dashboard → add CRUD module in `src/lib/db/` → add hook in `src/lib/hooks.js` → add to `db` export in `src/lib/db.js`
4. **New API endpoint:** Create `api/new-endpoint.js` as CommonJS → access via `/api/new-endpoint`
5. **New theme/style:** Add CSS variable to `:root` in `src/styles.css` → use as `var(--new-var)` in components

---

## PATTERN: HOW TO SAFELY EDIT AN EXISTING PAGE

```python
# Safe Python edit pattern (avoids heredoc issues with special chars)
with open('src/pages/Contacts.jsx') as f:
    c = f.read()

old = """exact old string"""
new = """exact new string"""
c = c.replace(old, new)
assert 'backticks' not in [line for line in c.split('\n') if '`' in line and not line.strip().startswith('//')], "Backtick found!"

with open('src/pages/Contacts.jsx', 'w') as f:
    f.write(c)
```

---

## HISTORY OF RECURRING ISSUES (learn from these)

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| Contacts board crash | Template literals in JSX render path | String concatenation only |
| Contacts board crash | Component used in JSX but not imported | Always add import when adding component |
| CallFlow "unterminated regex" | Regex literal `/pattern/g` in JSX | `.split().join()` pattern |
| Signs map no pins | `mapReady` missing from useEffect deps | Always include all deps |
| Number inputs reset while typing | `value={x \|\| ''}` converts 0 to '' | Use `value={x ?? ''}` |
| Contacts board crash | External component file missing React import | Always verify imports |

---

## CREDENTIALS LOCATION

All live credentials are in `DEVELOPER_ACCESS.md` (gitignored).
To get credentials: ask Yanky Lichtenstein or check the secure storage.

Key credentials needed for full access:
- GitHub token (for clone/push)
- Supabase service role key (for admin operations)  
- Twilio auth token (for phone system)
- Vercel token (for deployment management)
- Google Maps API key (for address/maps features)

---

*This file is auto-read by Claude and other AI assistants. Keep it up to date when making architectural changes.*
