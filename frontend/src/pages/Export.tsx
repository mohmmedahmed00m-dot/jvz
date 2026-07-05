import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, downloadFile } from '../lib/api';
import { Button, Card, Check, Toggle, Badge, Spinner } from '../components/ui';
import { useToast } from '../components/toast';

const FORMATS = [
  { id: 'review', label: 'Review HTML' },
  { id: 'bonus', label: 'Bonus HTML' },
  { id: 'emails', label: 'Emails (JSON/TXT)' },
  { id: 'social', label: 'Social Posts (TXT)' },
  { id: 'cta', label: 'CTA (JSON)' },
];

/**
 * Export Screen (Section 2.4): format checklist, ZIP toggle, export button,
 * download link, individual downloads, export history.
 * States: Default, Exporting (spinner + progress), Success, Error.
 */
export function ExportPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();

  const [formats, setFormats] = useState<string[]>(FORMATS.map((f) => f.id));
  const [zip, setZip] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { const r = await api.listExports(id!); setHistory(r.exports); }
    catch { /* ignore */ } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [id]);

  const toggle = (fid: string) => setFormats((s) => (s.includes(fid) ? s.filter((x) => x !== fid) : [...s, fid]));

  const doExport = async () => {
    setExporting(true);
    try {
      const r = await api.createExport(id!, formats, zip);
      toast.push('info', 'Packaging your export…');
      // Poll until completed.
      for (let i = 0; i < 25; i++) {
        await new Promise((res) => setTimeout(res, 400));
        const list = await api.listExports(id!);
        const exp = list.exports.find((e) => e.id === r.export_id);
        if (exp?.status === 'completed') {
          toast.push('success', 'Your export is ready');
          await load();
          triggerDownload(r.export_id);
          setExporting(false);
          return;
        }
        if (exp?.status === 'failed') break;
      }
      toast.push('error', 'Export failed, please retry');
    } catch (err: any) {
      toast.push('error', err.message || 'Export failed, please retry');
    } finally {
      setExporting(false);
    }
  };

  const triggerDownload = async (exportId: string) => {
    try {
      await downloadFile(exportId);
    } catch {
      toast.push('error', 'Download failed');
    }
  };

  return (
    <div>
      <h1 className="page-title">Export</h1>
      <p className="page-sub">Package all generated assets into downloadable files.</p>

      <div className="grid-2">
        <Card>
          <strong style={{ display: 'block', marginBottom: 'var(--space-4)' }}>Export Formats</strong>
          <div className="grid-auto">
            {FORMATS.map((f) => (
              <Check key={f.id} checked={formats.includes(f.id)} onChange={() => toggle(f.id)} label={f.label} />
            ))}
          </div>
          <div style={{ marginTop: 'var(--space-4)' }}>
            <Toggle checked={zip} onChange={setZip} label="Bundle as ZIP" />
          </div>
          <Button variant="accent" onClick={doExport} loading={exporting} disabled={formats.length === 0} style={{ marginTop: 'var(--space-4)' }} data-testid="export-btn">
            {exporting ? 'Packaging…' : '📦 Export Now'}
          </Button>
        </Card>

        <Card>
          <strong style={{ display: 'block', marginBottom: 'var(--space-4)' }}>Export History</strong>
          {loading ? <Spinner /> : history.length === 0 ? (
            <p className="muted">No exports yet for this campaign.</p>
          ) : (
            <div>
              {history.map((e) => (
                <div className="export-row" key={e.id}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 'var(--fs-12)' }} className="mono">{e.id.slice(0, 8)}</div>
                    <div className="muted" style={{ fontSize: 'var(--fs-12)' }}>{new Date(e.created_at).toLocaleString()}</div>
                  </div>
                  <Badge type={e.status === 'completed' ? 'generated' : e.status === 'failed' ? 'failed' : ''}>{e.status}</Badge>
                  <div />
                  <Button compact variant="secondary" disabled={e.status !== 'completed'} onClick={() => triggerDownload(e.id)}>
                    ⬇ Download
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
