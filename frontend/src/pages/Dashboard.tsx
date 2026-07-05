import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Card, Button, Badge, Spinner, EmptyState } from '../components/ui';

/**
 * Dashboard (Section 2.1): recent campaigns (max 5), usage widget, new-campaign CTA.
 * States: Loading (skeleton), Error (banner + retry), Empty (illustration + CTA).
 */
export function DashboardPage() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const r = await api.listCampaigns({ page: 1, limit: 5 });
      setCampaigns(r.campaigns);
    } catch (err: any) {
      setError(err.message || 'Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-sub">Welcome back — here's your latest launch activity.</p>

      <div className="grid-auto" style={{ marginBottom: 'var(--space-6)' }}>
        <Card><div className="stat-card"><span className="num">{loading ? '–' : campaigns.length}</span><span className="lbl">Recent Campaigns</span></div></Card>
        <Card><div className="stat-card"><span className="num">{loading ? '–' : '∞'}</span><span className="lbl">Plan Limit (unlimited)</span></div></Card>
        <Card interactive onClick={() => navigate('/campaigns/new')} status="generated">
          <div className="stat-card"><span className="num" style={{ fontSize: 'var(--fs-24)' }}>✨ New</span><span className="lbl">Create a campaign</span></div>
        </Card>
      </div>

      <h2 style={{ fontSize: 'var(--fs-20)', marginBottom: 'var(--space-4)' }}>Recent Campaigns</h2>

      {loading && (
        <Card>
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 48, marginBottom: 'var(--space-3)' }} />
          ))}
        </Card>
      )}

      {!loading && error && (
        <div className="error-banner">
          {error} <Button variant="ghost" compact onClick={load}>Retry</Button>
        </div>
      )}

      {!loading && !error && campaigns.length === 0 && (
        <EmptyState title="No campaigns yet. Create your first campaign to get started."
          cta={<Button onClick={() => navigate('/campaigns/new')}>Create your first campaign</Button>} />
      )}

      {!loading && !error && campaigns.length > 0 && (
        <Card>
          {campaigns.map((c) => (
            <div className="campaign-row" key={c.id}>
              <div>
                <div style={{ fontWeight: 600 }}>{c.product_name}</div>
                <div className="muted" style={{ fontSize: 'var(--fs-12)' }}>{c.niche || '—'} · {new Date(c.created_at).toLocaleDateString()}</div>
              </div>
              <Badge type={c.status}>{c.status}</Badge>
              <div />
              <Button compact onClick={() => navigate(`/campaigns/${c.id}`)}>Open</Button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
