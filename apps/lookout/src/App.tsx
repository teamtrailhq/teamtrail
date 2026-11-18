import { useMemo } from 'react';
import {
  AppBody,
  AppBriefing,
  AppBubble,
  AppHeader,
  AppHome,
  AppSettings,
  AppTicketDrawer,
  AppTrailBar,
  MapZone,
  PhoneTabBar,
  RecordViews,
  useAppNavigation,
  useAttentionUi,
  useDocumentTitle,
  useLiveTrail,
  useMainMark,
  useNewTrail,
  useOpeningBubble,
  useProjectsUi,
  useRepoName,
  useScopedActivity,
  useSettingsPage,
  useTrailUi,
  type View,
} from './app/index';
import { SetupGuide } from './features/guide';
import { ModeSwitch } from './features/hands-off';
import { KnowledgeContext, KnowledgeView, useKnowledgeStore } from './features/knowledge';
import { PhoneProjects, ProjectSwitcher } from './features/projects';
import { FirstRun, openRulePrefilled } from './features/settings';
import { useBriefing, useBreakpoint, useLookout, useLookoutMode, useThemedPrefs } from './hooks';
import { createRuntime, trackerKind } from './lib';

/**
 * The map first. The header (with "N need you") and the bar of views under it, the map filling the page with a bubble
 * on what's selected (what it needs from you first, then the ticket), and the trail bar under it, minimal or with its
 * lists.
 * Plan, Activity and the Logbook are pages over the map; Settings and Trail stats too. On a phone the same, one view
 * at a time, the bubble a sheet under the map and the views in a bottom tab bar.
 */
export function App() {
  const rt = useMemo(() => createRuntime(trackerKind()), []);
  const api = useLookout(rt);
  const { snap, activity } = api;
  const [prefs, updatePrefs] = useThemedPrefs();
  const settings = useSettingsPage();
  const newTrail = useNewTrail(rt, api);
  const repo = useRepoName(rt.kind);
  const bp = useBreakpoint();
  const scoped = useScopedActivity(activity, api.mapId);
  useDocumentTitle(activity.pending.length, snap?.map.title);
  const nav = useAppNavigation(api);
  const trail = useTrailUi({
    snap,
    selectMap: api.actions.selectMap,
    openTicket: nav.openTicket,
    openTrailChecks: nav.openTrailChecks,
  });
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
    openRule: (rule) => openRulePrefilled(settings.open, rule),
    openFocusSettings: () => settings.open('attention'),
  });
  const view = attn.attention.view;
  const mode = useLookoutMode(view);
  const brief = useBriefing(rt, api, mode.briefing(prefs.briefing), view?.items);
  const live = useLiveTrail({ snap, sessions: scoped.sessions, view });
  const main = useMainMark(api.mapId, live.items);
  const { projects, overview, openOverview, closeOverview } = useProjectsUi(bp, nav, attn.link.request);
  const settingsPage = settings.route && (
    <AppSettings
      rt={rt}
      api={api}
      bp={bp}
      prefs={prefs}
      update={updatePrefs}
      settings={settings}
      openTicket={nav.openTicket}
      mode={mode}
    />
  );
  const records = (nav.statsOpen || nav.page) && (
    <RecordViews api={api} bp={bp} nav={nav} scoped={scoped} done={trail.done} attn={attn} />
  );
  const covered = settingsPage || overview || records;
  useOpeningBubble({ ...api, view, busy: !!(covered || api.selection || mode.handsOff), open: attn.open });

  const shown: View = nav.page ?? 'map';
  const onView = (v: View) => {
    settings.dismiss();
    closeOverview();
    if (v === 'map') nav.toMap();
    else nav.openPage(v);
  };
  const phone = bp === 'mobile';
  const map = (
    <MapZone
      api={api}
      live={live.live}
      main={main.tone}
      focus={live.focus}
      onSelect={nav.select}
      onNewTrail={newTrail.open}
      minFit={phone ? 0.7 : 0}
      docked={phone}
      trail={trail}
      bubble={(place) => (
        <AppBubble api={api} nav={nav} attn={attn} sessions={scoped.sessions} mainNeeds={main.needs} place={place} />
      )}
    />
  );
  const homeSnap = mode.homeOf(snap);
  const home = homeSnap && (
    <AppHome
      api={api}
      snap={homeSnap}
      nav={nav}
      attn={attn}
      live={live}
      trail={trail}
      brief={brief}
      sessions={scoped.sessions}
      phone={phone}
      onFullMap={() => mode.setMode('hands-on')}
      onProofSettings={() => settings.open('proof')}
    />
  );
  const trailBar = <AppTrailBar api={api} nav={nav} attn={attn} trail={live} bp={bp} brief={trail.inboxCard} />;
  const briefing = (
    <AppBriefing
      brief={brief}
      snaps={api.allSnaps}
      bp={bp}
      openTicket={nav.openTicket}
      openChat={nav.openChat}
      openDecisions={nav.openDecisions}
      openQuestion={nav.openQuestion}
      toMap={nav.toMap}
    />
  );

  return (
    <KnowledgeContext.Provider value={knowledge}>
      <div className={`app bp-${bp} view-${shown} ${mode.layout(snap)}`}>
        <AppHeader
          api={api}
          rt={rt}
          repo={<ProjectSwitcher repo={repo} projects={projects} onOverview={openOverview} />}
          brief={brief}
          attention={attn.header}
          view={settingsPage || overview ? undefined : shown}
          onView={onView}
          phone={phone}
          needs={live.items}
          elsewhere={live.elsewhere}
          onNeed={attn.open}
          onStats={() => {
            settings.dismiss();
            nav.toggleStats();
          }}
          onNewTrail={newTrail.open}
          onStartOver={() => snap && newTrail.startOver(snap.map)}
          onSettings={settings.toggle}
          onSlack={() => settings.open('slack')}
          onToggleTheme={(night) => updatePrefs({ theme: night ? 'night' : 'day' })}
          modeSwitch={<ModeSwitch mode={mode.mode} onChange={mode.setMode} />}
          handsOff={mode.layout(snap) === 'hands-off'}
        />
        <AppBody
          phone={phone}
          home={home}
          map={map}
          trailBar={trailBar}
          covered={covered}
          projects={projects.many && <PhoneProjects projects={projects} onOverview={openOverview} />}
          tabBar={
            <PhoneTabBar
              view={shown}
              covered={!!settingsPage || !!overview}
              needs={live.items.length}
              onPick={onView}
            />
          }
        />
        <AppTicketDrawer api={api} nav={nav} attn={attn} sessions={scoped.sessions} done={trail.done} />
        {briefing}
        {trail.dialog}
        {!mode.handsOff && trail.announce}
        {api.error && <div className="error-toast">{api.error}</div>}
        {newTrail.dialog}
        {!prefs.onboarded && <FirstRun prefs={prefs} update={updatePrefs} activeTracker={rt.kind} />}
        <KnowledgeView />
        <SetupGuide />
      </div>
    </KnowledgeContext.Provider>
  );
}
