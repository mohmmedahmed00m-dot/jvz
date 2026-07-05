import { useState } from 'react';
import { useAuth } from '../lib/auth-context';
import { Card, Button, Field, Input, Badge } from '../components/ui';
import { useToast } from '../components/toast';

/**
 * Account / License screen (Section 2.0 nav item + Section 6.3).
 * Shows current license status and lets the user activate a new key.
 */
export function AccountPage() {
  const { licenseStatus, activateLicense } = useAuth();
  const toast = useToast();
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);

  const activate = async () => {
    if (!key.trim()) return;
    setLoading(true);
    try {
      await activateLicense(key.trim());
      toast.push('success', 'License activated');
      setKey('');
    } catch (err: any) {
      toast.push('error', err.message || 'Invalid license key');
    } finally { setLoading(false); }
  };

  return (
    <div>
      <h1 className="page-title">Account & License</h1>
      <p className="page-sub">Manage your license and account access.</p>

      <Card style={{ maxWidth: 560 }}>
        <div className="row between" style={{ marginBottom: 'var(--space-4)' }}>
          <strong>Current License</strong>
          <Badge type={licenseStatus === 'active' ? 'generated' : 'failed'}>{licenseStatus}</Badge>
        </div>
        {licenseStatus !== 'active' && (
          <div className="error-banner" style={{ marginBottom: 'var(--space-4)' }}>
            Your license is not active. Activate a valid license key to use all features.
          </div>
        )}
        <Field label="Activate / Change License Key" htmlFor="lk">
          <Input id="lk" value={key} onChange={(e) => setKey(e.target.value)} placeholder="ALK-XXXX-XXXX-XXXX-XXXX" />
        </Field>
        <Button variant="accent" loading={loading} onClick={activate} data-testid="activate-btn">Activate</Button>
      </Card>
    </div>
  );
}
