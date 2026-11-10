import { useEffect, useMemo, useState } from 'react';
import {
  AppBriefing,
  AppHeader,
  AppInbox,
  AppNewTrail,
  AppSettings,
  LaptopSide,
  MapZone,
  PhoneTabBar,
  PhoneView,
  useAppNavigation,
  useDocumentTitle,
  useRepoName,
  useScopedActivity,
  useTrailUi,
  useAttentionUi,
  useProjectsUi,
  useSettingsPage,
  RecordViews,
} from './app/index';
import { StepZone, LogZone, ActivityStack } from './features/activity';
import { Inspector } from './features/inspector';
import { KnowledgeContext, KnowledgeView, useKnowledgeStore } from './features/knowledge';
import { MapSections } from './features/plan';
import { PhoneProjects, ProjectSwitcher } from './features/projects';
import { Onboarding } from './features/settings';
import { useBriefing, useBreakpoint, usePrefs, useLookout } from './hooks';
import { applyTheme, createRuntime, trackerKind } from './lib';

/**
 * Progressive disclosure. Layers by priority:
 *   1 inbox + answer · 2 title + destination · 3 up next (frontier/claimed) · 4 map graph
 *   5 ticket inspector · 6 activity + sessions · 7 plan sections (not yet specified, decisions, out of scope)
 * mobile (<1024): 1–3 on the home view; 4–7 behind a fixed bottom tab bar.
 * laptop (1024–1439): adds 4 in the center and 5 on the right; 6–7 are tabs in that same right zone.
 * wide (≥1440): 6 and 7 get their own zones under the map and the ticket. Nothing visible moves.
 */
export function App() {
  const rt = useMemo(() => createRuntime(trackerKind()), []);
  const api = useLookout(rt);
  const { snap, activity, selection, actions } = api;
  const [prefs, updatePrefs] = usePrefs();
  useEffect(() => applyTheme(prefs.theme), [prefs.theme]);
  const settings = useSettingsPage();
  const [newTrail, setNewTrail] = useState(false);
  const repo = useRepoName(rt.kind);
  const bp = useBreakpoint();
  const pending = activity.pending.length;
  const scoped = useScopedActivity(activity, api.mapId);
  useDocumentTitle(pending, snap?.map.title);
  const nav = useAppNavigation(api, bp);
  const trail = useTrailUi(snap, actions.selectMap);
  const knowledge = useKnowledgeStore(trail.briefText);
  const attn = useAttentionUi({
    api,
    nav,
    knowledge,
    reviewBrief: trail.review,
    openReroute: (item) => trail.openReroute(item.mapId, item.ref),
    openGuides: () => settings.open('guides'),
    openConnector: (channel) => settings.open(channel),
    openApprovals: () => settings.open('approvals'),
    openFocusSettings: () => settings.open('attention'),
  });
  const brief = useBriefing(rt, api, prefs.briefing, attn.attention.view?.items);

  const inbox = <AppInbox api={api} nav={nav} bp={bp} scoped={scoped} attn={attn} above={trail.inboxCard} />;
  const map = (
    <MapZone
      api={api}
      sessions={scoped.sessions}
      onSelect={nav.select}
      onNewTrail={() => setNewTrail(true)}
      compact={bp === 'mobile'}
      minFit={bp === 'mobile' ? 0.7 : 0}
      trail={trail}
    />
  );
  const inspector = (bare: boolean) => (
    <Inspector
      api={api}
      sessions={scoped.sessions}
      bare={bare}
      onOpenChat={(id) => nav.openChat(id)}
      onOpenDecision={nav.openDecisions}
    />
  );
  const zoneProps = {
    activity: scoped,
    snap,
    leases: api.leases,
    onTicket: (id: string) => nav.select({ kind: 'ticket', id }),
    onOpenChat: (id: string) => nav.openChat(id),
  };
  const plan = (bare: boolean) => (
    <MapSections
      snap={snap}
      selection={selection}
      onSelect={nav.select}
      bare={bare}
      onAudit={() => nav.openDecisions()}
      activity={scoped}
    />
  );
  const { projects, overview, openOverview } = useProjectsUi(bp, nav, attn.link.request);
  const settingsPage = settings.route && (
    <AppSettings rt={rt} api={api} bp={bp} prefs={prefs} update={updatePrefs} settings={settings} />
  );
  const records = (nav.statsOpen || nav.decisionsView) && <RecordViews api={api} bp={bp} nav={nav} />;
  const decisions = settingsPage || overview || records;
  const briefing = brief.shown && (
    <AppBriefing
      brief={brief}
      snaps={api.allSnaps}
      bp={bp}
      openTicket={nav.openTicket}
      openChat={nav.openChat}
      openDecisions={nav.openDecisions}
      closeDecisions={() => nav.setDecisionsView(null)}
      showPhoneHome={() => nav.setPhoneTab('home')}
    />
  );

  return (
    <KnowledgeContext.Provider value={knowledge}>
      <div className={`app bp-${bp}`}>
        <AppHeader
          api={api}
          rt={rt}
          repo={<ProjectSwitcher repo={repo} projects={projects} onOverview={openOverview} />}
          brief={brief}
          attention={attn.header}
          decisionsOpen={!!nav.decisionsView}
          onDecisions={() => {
            settings.close();
            if (nav.decisionsView) nav.setDecisionsView(null);
            else nav.openDecisions();
          }}
          onStats={() => {
            settings.close();
            nav.toggleStats();
          }}
          onNewTrail={() => setNewTrail(true)}
          onSettings={settings.toggle}
          onSlack={() => settings.open('slack')}
          onToggleTheme={(night) => updatePrefs({ theme: night ? 'night' : 'day' })}
        />
        {bp === 'wide' && (
          <>
            {inbox}
            {map}
            {inspector(false)}
            <StepZone {...zoneProps} />
            <LogZone {...zoneProps} />
            {plan(false)}
            {decisions}
          </>
        )}
        {bp === 'laptop' && (
          <>
            {inbox}
            {map}
            <LaptopSide
              tab={nav.sideTab}
              onTab={nav.setSideTab}
              unspecified={snap?.map.sections.unspecified.length}
              ticket={inspector(true)}
              activity={<ActivityStack {...zoneProps} />}
              plan={plan(true)}
            />
            {decisions}
          </>
        )}
        {bp === 'mobile' && (
          <>
            <PhoneView
              tab={nav.phoneTab}
              decisions={decisions}
              inbox={inbox}
              projects={projects.many && <PhoneProjects projects={projects} onOverview={openOverview} />}
              map={map}
              ticket={inspector(true)}
              activity={<ActivityStack {...zoneProps} />}
              plan={plan(true)}
            />
            <PhoneTabBar
              tab={nav.phoneTab}
              covered={!!decisions}
              pending={pending}
              onPick={(id) => {
                settings.close();
                nav.setPhoneTab(id);
                nav.setDecisionsView(null);
              }}
            />
          </>
        )}

        {briefing}
        {trail.dialog}
        {api.error && <div className="error-toast">{api.error}</div>}
        {newTrail && (
          <AppNewTrail rt={rt} onClose={() => setNewTrail(false)} onCreated={(id) => actions.selectMap(id)} />
        )}
        {!prefs.onboarded && <Onboarding prefs={prefs} update={updatePrefs} activeTracker={rt.kind} />}
        <KnowledgeView />
      </div>
    </KnowledgeContext.Provider>
  );
}
