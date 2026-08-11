# Pages, Routes, Boards, and Dashboards

## Route inventory

Every route below is taken from `src/App.jsx`.

| Route(s) | Component | Access in code | Status |
|---|---|---|---|
| `/` | `DashboardSmart` | Authenticated shell | **Verified** |
| `/dashboard-classic` | `Dashboard` from `Dashboard.jsx` | Authenticated shell | **Verified** |
| `/dashboard-new` | `Dashboard` from `DashboardV2.jsx` | Authenticated shell | **Verified** |
| `/contacts`, `/contacts/:id` | `Contacts` | Authenticated shell | **Verified** |
| `/contacts/:id/detail` | `ContactDetail` | Authenticated shell | **Verified** |
| `/production`, `/production/:id` | `Production` | Authenticated shell | **Verified** |
| `/listings`, `/listings/:id` | `Listings` | Authenticated shell | **Verified** |
| `/tasks`, `/tasks/:id` | `Tasks` | Authenticated shell | **Verified** |
| `/calendar`, `/calendar/:id` | `Calendar` | Authenticated shell | **Verified** |
| `/offers`, `/offers/:id` | `Offers` | Authenticated shell | **Verified** |
| `/weekly-ad` | `WeeklyAd` | Authenticated shell | **Verified** |
| `/marketing` | `Marketing` | Authenticated shell | **Verified** |
| `/gifts`, `/gifts/:id` | `Gifts` | Authenticated shell | **Verified** |
| `/call-flow` | `CallFlow` | `calls.flow_edit` route guard | **Verified** |
| `/calls`, `/calls/:id` | `Calls` | Authenticated shell | **Verified** |
| `/openhouse`, `/openhouse/:id` | `OpenHouse` | Authenticated shell | **Verified** |
| `/social-cards` | `SocialCards` | Authenticated shell | **Verified** |
| `/analytics`, `/performance`, `/agent-activity` | `Analytics` | Authenticated shell | **Verified** |
| `/signs`, `/signs/:id` | `Signs` | Authenticated shell | **Verified** |
| `/announcements`, `/announcements/:id` | `Announcements` | Authenticated shell | **Verified** |
| `/listingprep`, `/listingprep/:id` | `ListingPrep` | Authenticated shell | **Verified** |
| `/pipeline` | `Pipeline` | Authenticated shell | **Verified** |
| `/transactions`, `/transactions/:id` | `Transactions` | Authenticated shell | **Verified** |
| `/notes`, `/notes/:id` | `Notes` | Authenticated shell | **Verified** |
| `/automations`, `/automations/:id` | `Automations` | `admin.automations` route guard | **Verified** |
| `/briefing` | `DailyBriefing` | Authenticated shell | **Verified** |
| `/email` | `Email` | Authenticated shell | **Verified** |
| `/designer`, `/designer/:id` | `EmailDesigner` | Authenticated shell | **Verified** |
| `/settings` | `Settings` | Authenticated shell | **Verified** |
| `/admin` | `Admin` | Page-level admin rejection | **Verified** |
| `/activitylog` | `ActivityLog` | Authenticated shell | **Verified** |
| `/call-diagnostics` | `CallDiagnostics` | Authenticated shell | **Verified** |
| `/mortgage` | `Mortgage` | Authenticated shell | **Verified** |
| `/website` | `WebsiteBuilder` | Authenticated shell | **Verified** |
| `/segments` | `Segments` | Authenticated shell | **Verified** |
| `/custom-fields` | `CustomFields` | `admin.customize` route guard | **Verified** |
| `/tc` | `TransactionCoordinator` | Page-level admin/secretary rejection | **Verified** |
| `/tc-settings` | `TCSettings` | `admin.customize` route guard | **Verified** |
| `/my-listings` | `MyListings` | Authenticated shell | **Verified** |
| `/reports` | `Analytics` | `reports.view` route guard | **Verified** |
| `/reportbuilder` | `Analytics` | Authenticated shell | **Verified** |
| `/notepad` | `Notepad` | Authenticated shell | **Verified** |
| authenticated catch-all | Redirect to `/` | Authenticated shell | **Verified** |
| `/tv` | `TVBoard` | Public route; query token enforced by its API feed | **Verified** |
| `/public/home` | `PublicHome` | Public | **Verified** |
| `/public/listings`, `/public/sold` | `PublicListings` | Public | **Verified** |
| `/public/listing/:id` | `PublicListingDetail` | Public | **Verified** |
| `/public/about` | `PublicAbout` | Public | **Verified** |
| `/public/contact` | `PublicContact` | Public | **Verified** |
| public catch-all | Redirect to `/public/home` | Public branch | **Verified** |

- **Security risk** — `/reportbuilder` is not guarded and renders `Analytics`, while `/reports` is guarded. This creates an alternate unguarded route to team-wide analytics queries.
- **Partially verified** — `/admin` and `/tc` lack route guards but reject unauthorized roles inside their page components. This prevents normal rendering but is weaker and less uniform than route-level enforcement.
- **Incorrect documentation** — `/performance`, `/agent-activity`, `/reports`, and `/reportbuilder` do not render their name-matched page modules; all render `Analytics`.

## Complete page-module inventory

| Page module | Actual use | Status |
|---|---|---|
| `ActivityLog` | `/activitylog` | **Verified** |
| `Admin` | `/admin` | **Verified** |
| `AgentActivity` | Imported but not routed; included in render-smoke | **Verified** |
| `AgentPerformance` | Imported but not routed | **Verified** |
| `Analytics` | Five route paths listed above | **Verified** |
| `Announcements` | `/announcements[/:id]` | **Verified** |
| `Automations` | `/automations[/:id]` | **Verified** |
| `Calendar` | `/calendar[/:id]` | **Verified** |
| `CallDiagnostics` | `/call-diagnostics` | **Verified** |
| `CallFlow` | `/call-flow` | **Verified** |
| `Calls` | `/calls[/:id]` | **Verified** |
| `ContactDetail` | `/contacts/:id/detail` | **Verified** |
| `Contacts` | `/contacts[/:id]` | **Verified** |
| `CustomFields` | `/custom-fields` | **Verified** |
| `DailyBriefing` | `/briefing` | **Verified** |
| `Dashboard` | `/dashboard-classic` | **Verified** |
| `DashboardSmart` | `/` | **Verified** |
| `DashboardV2` | `/dashboard-new` | **Verified** |
| `DesignStudio` | Embedded in `Marketing` | **Verified** |
| `Email` | `/email` | **Verified** |
| `EmailBlast` | Embedded in `Marketing` | **Verified** |
| `EmailDesigner` | `/designer[/:id]` | **Verified** |
| `Gifts` | `/gifts[/:id]` | **Verified** |
| `ListingPrep` | `/listingprep[/:id]` | **Verified** |
| `Listings` | `/listings[/:id]` | **Verified** |
| `Login` | Authenticated-shell gate when no user or agent is resolved | **Verified** |
| `Marketing` | `/marketing` | **Verified** |
| `MarketUpdateCard` | Embedded in `Marketing` | **Verified** |
| `Mortgage` | `/mortgage` | **Verified** |
| `MyListings` | `/my-listings` | **Verified** |
| `Notepad` | `/notepad` | **Verified** |
| `Notes` | `/notes[/:id]` | **Verified** |
| `Offers` | `/offers[/:id]` | **Verified** |
| `OpenHouse` | `/openhouse[/:id]` | **Verified** |
| `Pipeline` | `/pipeline` | **Verified** |
| `Production` | `/production[/:id]` | **Verified** |
| `PublicSite` | Six public paths through five exported page components | **Verified** |
| `ReportBuilder` | Imported but not routed | **Verified** |
| `Reports` | Imported but not routed | **Verified** |
| `Segments` | `/segments` | **Verified** |
| `Settings` | `/settings` | **Verified** |
| `Signs` | `/signs[/:id]` | **Verified** |
| `SocialCards` | `/social-cards` and embedded in `Marketing` | **Verified** |
| `Tasks` | `/tasks[/:id]` | **Verified** |
| `TCSettings` | `/tc-settings` | **Verified** |
| `TestimonialCard` | Embedded in `Marketing` | **Verified** |
| `TransactionCoordinator` | `/tc` | **Verified** |
| `Transactions` | `/transactions[/:id]` | **Verified** |
| `TVBoard` | `/tv` | **Verified** |
| `WebsiteBuilder` | `/website` | **Verified** |
| `WeeklyAd` | `/weekly-ad` and embedded in `Marketing` | **Verified** |

## Dashboards and boards

| Surface | Primary data and behavior | Status |
|---|---|---|
| Smart dashboard (`/`) | `react-grid-layout`; widget preferences in `briefing_prefs`; configurable widgets query the board named by `BOARD_OPTIONS`; viewing context and pins are supported | **Verified** |
| Classic dashboard | Direct queries to deals, contacts, tasks, listings, open houses, announcements, agents, and gifts | **Verified** |
| V2 dashboard | A separate dashboard implementation at `/dashboard-new` | **Verified** |
| Smart-widget boards | Contacts, deals, tasks, listings, calls/SMS, gifts, offers, open houses, and calendar appointments | **Verified** |
| Production board | `deals`; production widgets through `app_*production_widgets*` RPCs; totals through `production_totals` | **Partially verified** — `production_totals` has no committed function definition |
| Pipeline | Shared `deals`; stage movement is button/click based, not drag-and-drop | **Verified** |
| Listings | `listings`, showing-related data, and TC linkage | **Verified** |
| My Listings | Listings plus agents, audit/activity, showings, open houses, and TC linkage | **Verified** |
| Tasks | `tasks` through shared hooks, with calendar relationships | **Verified** |
| Offers | `offers` plus contacts, deals, listings, and showings; acceptance can create/update linked records | **Verified** |
| Transaction Coordinator | `tc_deals`, `tc_tasks`, participants, documents, photography, comments, correspondence, and linked CRM records | **Partially verified** — base `tc_deals` and `tc_tasks` creation SQL is missing |
| Transactions | `transactions` through the shared hook/data layer | **Verified** |
| Signs | `signs` | **Partially verified** — no committed base table definition |
| Analytics | Large client-side downloads from deals, offers, calls, contacts, showings, tasks, activity, TC, listings, sources, interactions, and relationship tables | **Verified** |
| TV board | Public `/tv` UI; `/api/tv-data` reads deals, announcements, and playlist using a display token | **Verified** |
| Marketing hub | Property cards, design studio, weekly ad, market update, testimonial, and email blast tabs | **Verified** |

## Cross-page synchronization

- **Verified** — `src/lib/db.js` maps deal-stage changes to linked listing status and TC phase.
- **Verified** — Listing address and price updates propagate to linked deals and TC records through application-side writes.
- **Verified** — The TC page and TC components also perform direct linked-record updates.
- **Verified** — `TCSyncHealth` detects selected drift between `tc_deals`, `deals`, and `listings` and offers repair actions.
- **Security risk** — Several synchronization writes are best-effort and catch errors without a transaction. Partial failure can leave pages inconsistent.
- **Missing implementation** — No database transaction/RPC or durable outbox guarantees atomic synchronization across deals, listings, and TC records.
- **Partially verified** — Row visibility on boards depends on a combination of client filtering and live RLS. The live policy state is **Unknown**.
