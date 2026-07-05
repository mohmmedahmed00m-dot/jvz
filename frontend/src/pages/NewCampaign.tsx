import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Button, Field, Input, Select, Check, Accordion, Card, Steps, Badge } from '../components/ui';
import { useToast } from '../components/toast';

const NICHES = ['Make Money Online', 'Health', 'SaaS Tools', 'Crypto', 'E-commerce', 'Education'];
const TONES = ['professional', 'casual', 'hype', 'trust-based'];
const GEN_TYPES = [
  { id: 'review', label: 'Review Page' },
  { id: 'bonus', label: 'Bonus Page' },
  { id: 'email_sequence', label: 'Email Sequence' },
  { id: 'social_posts', label: 'Social Posts' },
  { id: 'cta', label: 'CTA' },
];

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Claude',
  openai: 'GPT',
  gemini: 'Gemini',
};

/**
 * Input Screen / New Campaign (Section 2.2): capture product + options, trigger
 * generation. States: Default, Validating, Loading/Generating (5-step progress),
 * Partial Success, Error (toast + retry), Success (redirect to Editor).
 */
export function NewCampaignPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const [productName, setProductName] = useState('');
  const [productUrl, setProductUrl] = useState('');
  const [niche, setNiche] = useState('Make Money Online');
  const [tone, setTone] = useState('professional');
  const [audience, setAudience] = useState('');
  const [selected, setSelected] = useState<string[]>(GEN_TYPES.map((g) => g.id));

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiProvider, setAiProvider] = useState<string>('anthropic');

  // Fetch active AI provider on mount
  useEffect(() => {
    api.getAiProvider().then((r: any) => setAiProvider(r.provider)).catch(() => {});
  }, []);

  const valid = productName.trim().length >= 2;
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const generate = async () => {
    if (!valid) return;
    setGenerating(true);
    setError(null);
    try {
      const r = await api.createCampaign({
        product_name: productName.trim(),
        product_url: productUrl.trim() || undefined,
        niche,
        tone,
        target_audience: audience.trim() || undefined,
        generators_selected: selected,
      });
      toast.push('success', 'Campaign generated — opening editor');
      navigate(`/campaigns/${r.campaign_id}`);
    } catch (err: any) {
      setError(err.message || 'Generation failed, please retry');
      toast.push('error', 'Generation failed, please retry');
    } finally {
      setGenerating(false);
    }
  };

  if (generating) {
    return (
      <div>
        <h1 className="page-title">Generating…</h1>
        <p className="page-sub">Building your launch kit for “{productName}”.</p>
        <Card>
          <Steps steps={GEN_TYPES.map((g) => ({ id: g.id, label: g.label, state: 'active' as const }))} />
          <p className="muted" style={{ marginTop: 'var(--space-4)' }}>Packaging all selected assets. This usually takes a few seconds…</p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-title">New Campaign</h1>
      <p className="page-sub">Enter your affiliate product details to generate a full launch kit. &nbsp;🤖 AI: {PROVIDER_LABELS[aiProvider] || aiProvider}</p>

      {error && (
        <div className="error-banner" style={{ marginBottom: 'var(--space-4)' }}>
          {error} <Button variant="ghost" compact onClick={generate}>Retry</Button>
        </div>
      )}

      <Card style={{ maxWidth: 640 }}>
        <Field label="Product Name" htmlFor="pn" hint="Minimum 2 characters">
          <Input
            id="pn"
            value={productName}
            invalid={!!productName && productName.length < 2}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="e.g. TrafficBlaster Pro"
          />
        </Field>
        <Field label="Product URL (optional)" htmlFor="pu">
          <Input id="pu" value={productUrl} onChange={(e) => setProductUrl(e.target.value)} placeholder="https://example.com/product" />
        </Field>
        <div className="grid-2">
          <Field label="Niche / Category" htmlFor="niche">
            <Select id="niche" value={niche} onChange={(e) => setNiche(e.target.value)}>
              {NICHES.map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
          </Field>
          <Field label="Tone" htmlFor="tone">
            <Select id="tone" value={tone} onChange={(e) => setTone(e.target.value)}>
              {TONES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Target Audience (optional)" htmlFor="aud">
          <Input id="aud" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="e.g. beginner marketers" />
        </Field>

        <Accordion items={[{
          id: 'adv',
          head: <span>Advanced Options&nbsp;&nbsp;<Badge>{selected.length}/5 generators</Badge></span>,
          body: (
            <div className="grid-auto">
              {GEN_TYPES.map((g) => (
                <Check key={g.id} checked={selected.includes(g.id)} onChange={() => toggle(g.id)} label={g.label} />
              ))}
            </div>
          ),
        }]} />

        <Button onClick={generate} disabled={!valid} style={{ marginTop: 'var(--space-4)', width: '100%' }} data-testid="generate-btn">
          Generate {selected.length} Assets
        </Button>
      </Card>
    </div>
  );
}
