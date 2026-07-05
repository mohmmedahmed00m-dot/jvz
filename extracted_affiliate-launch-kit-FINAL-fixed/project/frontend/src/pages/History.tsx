import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Button, Card, Badge, Input, Select, Modal, Spinner, EmptyState } from '../components/ui';
import { useToast } from '../components/toast';

/**
 * Campaign History (Section 2.5): searchable/filterable table, status badges,
 * row actions (Open, Duplicate, Export, Delete) with confirmation modal,
 * pagination (20/page). States: Loading, Empty, Error, Deleting overlay.
 */
export function HistoryPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const limit = 20;

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const q: Record<string, any> = { page, limit };
      if (search) q.search = search;
      if (statusFilter) q.status = statusFilter;
      const r = await api.listCampaigns(q);
      setCampaigns(r.campaigns); setTotal(r.total);
    } catch (err: any) {
      setError(err.message || 'Failed to load campaigns');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [page]);

  const runSearch = () => { setPage(1); load(); };

  const duplicate = async (cid: string) => {
    try {
      const r = await api.duplicateCampaign(cid);
      toast.push('success', 'Campaign duplicated');
      navigate(`/campaigns/${r.new_campaign_id}`);
    } catch (err: any) { toast.push('error', err.message); }
  };

  const confirmDelete = async () => {
    if (!confirmId) return;
    setDeletingId(confirmId);
    try {
      await api.deleteCampaign(confirmId);
      toast.push('success', 'Campaign deleted');
      await load();
    } catch (err: any) { toast.push('error', err.message); }
    finally { setDeletingId(null); setConfirmId(null); }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div>
      <h1 className="page-title">Campaign History</h1>
      <p className="page-sub">{total} campaign(s) total.</p>

      <Card style={{ marginBottom: 'var(--space-4)' }}>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <Input placeholder="Search by product name…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 180 }}>
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="generated">Generated</option>
            <option value="exported">Exported</option>
            <option value="failed">Failed</option>
          </Select>
          <Button onClick={runSearch}>Search</Button>
        </div>
      </Card>

      {loading && <Card>{[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 52, marginBottom: 'var(--space-2)' }} />)}</Card>}
      {!loading && error && <div className="error-banner">{error} <Button variant="ghost" compact onClick={load}>Retry</Button></div>}
      {!loading && !error && campaigns.length === 0 && (
        <EmptyState title="No campaigns found." cta={<Button onClick={() => navigate('/campaigns/new')}>Create a campaign</Button>} />
      )}

      {!loading && !error && campaigns.length > 0 && (
        <Card style={{ position: 'relative', padding: 0, overflow: 'hidden' }}>
          <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Product</th><th>Niche</th><th>Created</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} style={{ position: 'relative' }}>
                  <td style={{ fontWeight: 600 }}>{c.product_name}</td>
                  <td className="muted">{c.niche || '—'}</td>
                  <td className="muted" style={{ fontSize: 'var(--fs-12)' }}>{new Date(c.created_at).toLocaleDateString()}</td>
                  <td><Badge type={c.status}>{c.status}</Badge></td>
                  <td>
                    <div className="row" style={{ gap: 'var(--space-1)' }}>
                      <Button compact variant="secondary" onClick={() => navigate(`/campaigns/${c.id}`)}>Open</Button>
                      <Button compact variant="ghost" onClick={() => duplicate(c.id)}>Duplicate</Button>
                      <Button compact variant="ghost" onClick={() => navigate(`/campaigns/${c.id}/export`)}>Export</Button>
                      <Button compact variant="destructive" onClick={() => setConfirmId(c.id)}>Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {deletingId && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Spinner /> <span className="muted" style={{ marginLeft: 'var(--space-2)' }}>Deleting…</span>
            </div>
          )}
        </Card>
      )}

      {totalPages > 1 && (
        <div className="pagination">
          <Button compact variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
          <span className="muted" style={{ padding: '0 var(--space-3)' }}>Page {page} / {totalPages}</span>
          <Button compact variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}

      {confirmId && (
        <Modal
          title="Delete campaign?"
          onClose={() => setConfirmId(null)}
          footer={<>
            <Button variant="ghost" onClick={() => setConfirmId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete}>Delete permanently</Button>
          </>}
        >
          <p>This will permanently delete the campaign and all its generated assets and exports. This cannot be undone.</p>
        </Modal>
      )}
    </div>
  );
}
