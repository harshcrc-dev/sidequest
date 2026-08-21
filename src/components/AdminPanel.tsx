import { useEffect, useState, type FormEvent } from "react";
import { fetchSiteSettings, fetchTrafficSummary, updateSiteSettings, type SiteSettings, type TrafficSummary } from "../services/analytics";
import { useAuth } from "../context/AuthContext";

const emptyTraffic: TrafficSummary = {
  views: 0,
  visitors: 0,
  signups: 0,
  savedTrips: 0,
  generations: 0,
  topPaths: [],
  recentViews: [],
};

export function AdminPanel() {
  const { user } = useAuth();
  const [traffic, setTraffic] = useState(emptyTraffic);
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user?.isAdmin) return;
    Promise.all([fetchTrafficSummary(), fetchSiteSettings()])
      .then(([nextTraffic, nextSettings]) => {
        setTraffic(nextTraffic);
        setSettings(nextSettings);
      })
      .catch(() => setError("We couldn't load the admin data right now."))
      .finally(() => setLoading(false));
  }, [user?.isAdmin]);

  if (!user?.isAdmin) {
    return <main className="admin-page container"><p className="admin-empty">Admin access required.</p></main>;
  }

  const saveSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!settings) return;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      setSettings(await updateSiteSettings({
        site_name: settings.site_name,
        announcement: settings.announcement,
        maintenance_mode: settings.maintenance_mode,
      }));
      setMessage("Settings saved.");
    } catch {
      setError("Settings could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="admin-page container">
      <div className="admin-heading">
        <div>
          <p className="eyebrow">Operations</p>
          <h1>Admin dashboard</h1>
          <p className="admin-lead">A quiet view of the people, places, and requests moving through Sidequest.</p>
        </div>
        <button className="btn btn--ghost" onClick={() => window.location.reload()}>Refresh</button>
      </div>

      {error && <p className="admin-notice admin-notice--error">{error}</p>}
      {loading ? <p className="admin-empty">Loading dashboard...</p> : (
        <>
          <section className="admin-metrics" aria-label="Traffic summary">
            <div className="admin-metric"><span>Page views</span><strong>{traffic.views}</strong></div>
            <div className="admin-metric"><span>Unique visitors</span><strong>{traffic.visitors}</strong></div>
            <div className="admin-metric"><span>Accounts</span><strong>{traffic.signups}</strong></div>
            <div className="admin-metric"><span>Saved sidequests</span><strong>{traffic.savedTrips}</strong></div>
            <div className="admin-metric"><span>AI generations</span><strong>{traffic.generations}</strong></div>
          </section>

          <div className="admin-grid">
            <section className="admin-section">
              <p className="eyebrow">Traffic</p>
              <h2>Popular paths</h2>
              {traffic.topPaths.length ? <ul className="admin-list">{traffic.topPaths.map((item) => <li key={item.path}><span>{item.path}</span><b>{item.views}</b></li>)}</ul> : <p className="admin-muted">Traffic will appear after the first visit.</p>}
              <h2 className="admin-subheading">Recent visits</h2>
              {traffic.recentViews.length ? <ul className="admin-list admin-list--muted">{traffic.recentViews.map((item, index) => <li key={`${item.created_at}-${index}`}><span>{item.path}</span><time>{new Date(item.created_at).toLocaleString()}</time></li>)}</ul> : <p className="admin-muted">No visits recorded yet.</p>}
            </section>

            <section className="admin-section">
              <p className="eyebrow">Website</p>
              <h2>Site settings</h2>
              {settings && <form className="admin-form" onSubmit={(event) => void saveSettings(event)}>
                <label>Site name<input value={settings.site_name} maxLength={80} onChange={(event) => setSettings({ ...settings, site_name: event.target.value })} /></label>
                <label>Announcement<textarea value={settings.announcement} maxLength={240} rows={4} onChange={(event) => setSettings({ ...settings, announcement: event.target.value })} /></label>
                <label className="admin-toggle"><input type="checkbox" checked={settings.maintenance_mode} onChange={(event) => setSettings({ ...settings, maintenance_mode: event.target.checked })} /><span>Maintenance mode</span></label>
                <button className="btn btn--accent" disabled={saving}>{saving ? "Saving..." : "Save settings"}</button>
                {message && <p className="admin-notice">{message}</p>}
              </form>}
            </section>
          </div>
        </>
      )}
    </main>
  );
}
