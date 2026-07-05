import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Button, Card, Tabs, Badge, Textarea, Field, Input, Spinner, EmptyState } from '../components/ui';
import { useToast } from '../components/toast';

const TABS = [
  { id: 'review', label: 'Review Page', fmt: 'html' },
  { id: 'bonus', label: 'Bonus Page', fmt: 'html' },
  { id: 'email_sequence', label: 'Email Sequence', fmt: 'json' },
  { id: 'social_posts', label: 'Social Posts', fmt: 'json' },
  { id: 'cta', label: 'CTA', fmt: 'json' },
] as const;

type TabId = typeof TABS[number]['id'];

/**
 * Editor Screen (Section 2.3): 5 tabs, live preview, rich/code editor,
 * per-asset regenerate with custom instruction, copy, save, revert.
 * States: Default, Loading (regenerate skeleton), After Generation (toast),
 * Error (toast, content untouched), Unsaved changes (badge), Saved (toast).
 */
export function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [assets, setAssets] = useState<Record<string, any>>({});
  const [campaign, setCampaign] = useState<any>(null);
  const [active, setActive] = useState<TabId>('review');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // working copies for editing + dirty tracking
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savedVersions, setSavedVersions] = useState<Record<string, string>>({});
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [customInstruction, setCustomInstruction] = useState('');
  // Mobile pane switch: on small screens show only Edit OR Preview at a time.
  const [mobilePane, setMobilePane] = useState<'edit' | 'preview'>('edit');

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [c, a] = await Promise.all([
        api.getCampaign(id!),
        api.getAssets(id!),
      ]);
      setCampaign(c.campaign);
      setAssets(a.assets);
      const d: Record<string, string> = {};
      const sv: Record<string, string> = {};
      for (const t of TABS) {
        const content = a.assets[t.id]?.content ?? '';
        d[t.id] = content;
        sv[t.id] = content;
      }
      setDrafts(d);
      setSavedVersions(sv);
    } catch (err: any) {
      setError(err.message || 'Failed to load campaign');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const dirtyTabs = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const t of TABS) m[t.id] = drafts[t.id] !== savedVersions[t.id];
    return m;
  }, [drafts, savedVersions]);

  const fmt = TABS.find((t) => t.id === active)!.fmt;
  const currentDraft = drafts[active] ?? '';

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.updateAsset(id!, active, currentDraft);
      setAssets((s) => ({ ...s, [active]: r.asset }));
      setSavedVersions((s) => ({ ...s, [active]: currentDraft }));
      toast.push('success', 'Saved');
    } catch (err: any) {
      toast.push('error', 'Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const regenerate = async () => {
    setRegenerating(active);
    try {
      const r = await api.regenerateAsset(id!, active, customInstruction.trim() || undefined);
      setAssets((s) => ({ ...s, [active]: r.asset }));
      setDrafts((s) => ({ ...s, [active]: r.asset.content }));
      setSavedVersions((s) => ({ ...s, [active]: r.asset.content }));
      toast.push('success', 'Section updated');
      setCustomInstruction('');
    } catch (err: any) {
      toast.push('error', 'Regeneration failed');
    } finally {
      setRegenerating(null);
    }
  };

  const revert = () => {
    setDrafts((s) => ({ ...s, [active]: savedVersions[active] }));
    toast.push('info', 'Reverted to saved version');
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(currentDraft); toast.push('success', 'Copied to clipboard'); }
    catch { toast.push('error', 'Copy failed'); }
  };

  if (loading) return <div><Spinner /> <span className="muted">Loading editor…</span></div>;
  if (error) return (
    <div className="error-banner">{error} <Button variant="ghost" compact onClick={load}>Retry</Button></div>
  );

  return (
    <div>
      <div className="row between" style={{ flexWrap: 'wrap' }}>
        <div>
          <h1 className="page-title">{campaign?.product_name}</h1>
          <p className="page-sub">{campaign?.niche} · {campaign?.tone} tone <Badge type={campaign?.status}>{campaign?.status}</Badge></p>
        </div>
        <Button variant="secondary" onClick={() => navigate(`/campaigns/${id}/export`)}>📦 Export</Button>
      </div>

      <Tabs
        tabs={TABS.map((t) => ({ id: t.id, label: t.label, unsaved: dirtyTabs[t.id] }))}
        active={active}
        onChange={(v) => setActive(v as TabId)}
      />

      <div style={{ marginTop: 'var(--space-4)' }} className="editor-wrap">
        {/* Mobile: toggle between Edit and Preview panes (avoids endless scrolling). */}
        <div className="row" style={{ justifyContent: 'center', marginBottom: 0 }}>
          <div className="pane-toggle" role="tablist" aria-label="Switch pane">
            <Button variant={mobilePane === 'edit' ? 'primary' : 'secondary'} compact onClick={() => setMobilePane('edit')}>✏️ Edit</Button>
            <Button variant={mobilePane === 'preview' ? 'primary' : 'secondary'} compact onClick={() => setMobilePane('preview')} style={{ marginLeft: 'var(--space-2)' }}>👁 Preview</Button>
          </div>
        </div>

        {/* Editor pane (left / bottom) */}
        <div className={`editor-pane ${mobilePane === 'edit' ? '' : 'is-mobile-hidden'}`}>
          <div className="row between">
            <strong>Editor {dirtyTabs[active] && <Badge type="">Unsaved changes</Badge>}</strong>
            <div className="row" style={{ gap: 'var(--space-2)' }}>
              <Button variant="ghost" compact onClick={copy}>📋 Copy</Button>
              <Button variant="ghost" compact onClick={revert} disabled={!dirtyTabs[active]}>↺ Revert</Button>
            </div>
          </div>
          <Textarea
            className="code-editor"
            value={currentDraft}
            disabled={!!regenerating}
            onChange={(e) => setDrafts((s) => ({ ...s, [active]: e.target.value }))}
            aria-label={`${active} content editor`}
          />
          <Button onClick={save} loading={saving} disabled={!dirtyTabs[active]} data-testid="save-btn">Save</Button>

          <Card style={{ marginTop: 'var(--space-2)' }}>
            <Field label="Regenerate with instructions (optional)" htmlFor="ci">
              <Input id="ci" value={customInstruction} onChange={(e) => setCustomInstruction(e.target.value)}
                placeholder="e.g. make the tone more urgent" disabled={!!regenerating} />
            </Field>
            <Button variant="secondary" compact loading={regenerating === active} onClick={regenerate} data-testid="regenerate-btn">
              🔁 Regenerate {active.replace('_', ' ')}
            </Button>
          </Card>
        </div>

        {/* Preview pane (right / top) */}
        <div className={`editor-pane ${mobilePane === 'preview' ? '' : 'is-mobile-hidden'}`}>
          <strong>Live Preview</strong>
          {regenerating === active ? (
            <Card><div className="skeleton" style={{ height: 300 }} /><p className="muted" style={{ marginTop: 'var(--space-3)' }}>Regenerating…</p></Card>
          ) : fmt === 'html' ? (
            <div className="preview-frame" dangerouslySetInnerHTML={{ __html: sanitizePreviewHtml(currentDraft) || '<p class="muted">No content</p>' }} />
          ) : (
            <pre className="json-preview">{prettyJson(currentDraft)}</pre>
          )}
        </div>
      </div>
    </div>
  );
}

function prettyJson(s: string): string {
  try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s || '—'; }
}

/**
 * Client-side HTML sanitization for the LIVE preview only (audit fix #12).
 * Mirrors the server sanitizer's allowed tag list so the preview matches what
 * will be persisted/exported (script/iframe/style/on* are stripped). The server
 * remains authoritative — this just makes the editor WYSIWYG with the saved result.
 */
const PREVIEW_ALLOWED = new Set([
  'h1','h2','h3','h4','p','ul','ol','li','div','span','a','strong','em','b','i','br','blockquote',
]);
function sanitizePreviewHtml(html: string): string {
  if (typeof window === 'undefined') return html;
  const tpl = document.createElement('div');
  tpl.innerHTML = html;
  // Walk and remove disallowed tags + any event-handler attributes / style.
  const walker = document.createTreeWalker(tpl, NodeFilter.SHOW_ELEMENT);
  const toRemove: HTMLElement[] = [];
  let node: Node | null = walker.currentNode;
  while (node) {
    const el = node as HTMLElement;
    if (el.nodeType === 1) {
      if (!PREVIEW_ALLOWED.has(el.tagName.toLowerCase())) {
        toRemove.push(el);
      } else {
        // strip all attributes except href/class on <a> and class elsewhere
        [...el.attributes].forEach((attr) => {
          const name = attr.name.toLowerCase();
          const allow = name === 'class' || (el.tagName.toLowerCase() === 'a' && name === 'href');
          if (!allow || name.startsWith('on')) el.removeAttribute(attr.name);
          if (name === 'href' && /^(javascript|data):/i.test(attr.value)) el.removeAttribute(attr.name);
        });
      }
    }
    node = walker.nextNode();
  }
  toRemove.forEach((el) => {
    // unwrap by keeping text content where possible (script/iframe dropped entirely)
    if (el.parentNode) el.parentNode.removeChild(el);
  });
  return tpl.innerHTML;
}
