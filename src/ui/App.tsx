import { useEffect } from 'react';
import { SceneView } from '../scene/SceneView';
import { DemoBar, Legend, SceneToolbar, TopBar } from './Chrome';
import { EvidenceDialog, NewsDrawer, RedirectDialog } from './Dialogs';
import { SidePanel } from './SidePanel';
import { capacityOut } from '../core/selectors';
import { store, ui, useWorkshop } from './store';

function LightsOutBanner() {
  const out = useWorkshop(capacityOut);
  const conn = useWorkshop((s) => s.connection);
  if (!out || conn === 'reconnecting') return null;
  return (
    <div className="stale stale--dark" role="status">
      Lights out: every AI provider scope reports unavailable. Work stays queued until capacity resets.{' '}
      <button className="link" onClick={() => ui.setPrefs({ tab: 'capacity' })}>
        View capacity
      </button>
    </div>
  );
}

function StaleBanner() {
  const conn = useWorkshop((s) => s.connection);
  if (conn !== 'reconnecting') return null;
  return (
    <div className="stale" role="alert">
      Stream interrupted - reconnecting. Workers are shown as unknown until a fresh snapshot arrives; nothing is assumed to have finished.
    </div>
  );
}

export function App() {
  useEffect(() => {
    store.start(ui.get().prefs.source, ui.get().prefs);
    return () => store.adapter?.stop();
  }, []);
  return (
    <div className="app">
      <a className="skip" href="#panel-body">
        Skip to details panel
      </a>
      <TopBar />
      <DemoBar />
      <main className="main">
        <div className="stage">
          <SceneView />
          <StaleBanner />
          <LightsOutBanner />
          <div className="stage__bottom">
            <SceneToolbar />
            <Legend />
          </div>
        </div>
        <SidePanel />
      </main>
      <RedirectDialog />
      <EvidenceDialog />
      <NewsDrawer />
    </div>
  );
}
