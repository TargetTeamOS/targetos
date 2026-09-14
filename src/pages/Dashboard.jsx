// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Dashboard (Complete Rebuild)
//
// Features:
// • Every widget clickable → opens detail popup with all records
// • Drag to reorder — saves to Supabase, persists across devices
// • Widget size control: half / full width
// • Widget accent color picker
// • Per-agent goals stored in DB — each agent sees only their own
// • Admin can update any agent's goal
// • Admin controls what each agent can see
// • Year and agent filters
// ═══════════════════════════════════════════════════════════════

import { ClickToCall } from '../components/ClickToCall'
import { MarketWidget } from '../components/MarketWidget'
import { DashboardListingTiles } from '../components/DashboardListingTiles'
import { DashboardPins } from '../components/DashboardPins'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { BOARD_OPTIONS } from '../lib/boardOptions'
import {
  loadDashPrefs, saveDashPrefs,
  loadAgentGoals, saveAgentGoal,
  loadTeamGoal, saveTeamGoal,
  switchToNewDashLayout, restoreOldDashLayout,
  DEFAULT_WIDGETS
} from '../lib/dashboardPrefs'
import {
  fmt$, fmtDate, parseNum, pct, initials,
  isOverdue, isDueToday, getDaysUntil
} from '../lib/utils'
import { DEAL_STAGES } from '../lib/constants'
import { Avatar, Pill, Btn, Loading, Spinner, Field, Input, Confirm } from '../components/UI'
import { usePageView } from '../components/PageViewTracking'
import { getFieldCatalog } from '../lib/fieldCatalog'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

PLACEHOLDER_MARKER_DO_NOT_PUSH