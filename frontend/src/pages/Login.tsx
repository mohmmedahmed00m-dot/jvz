import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import { Button, Field, Input, Card, Badge } from '../components/ui';
import { useToast } from '../components/toast';

/**
 * Login / Register screen (Section 2.1). First login prompts for a license key.
 * States: Default, Loading, Error (inline + red border), Authenticated redirect.
 */
export function LoginPage() {
  const { login, register, activateLicense, licenseStatus } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [licenseKey, setLicenseKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [activating, setActivating] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string; license?: string }>({});

  const validate = () => {
    const e: typeof errors = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Enter a valid email address';
    if (password.length < 8) e.password = 'Password must be at least 8 characters';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setErrors({});
    try {
      if (mode === 'login') await login(email, password);
      else await register(email, password);
      toast.push('success', mode === 'login' ? 'Logged in' : 'Account created');
      navigate('/');
    } catch (err: any) {
      setErrors({ form: err.message || 'Invalid credentials' });
    } finally {
      setLoading(false);
    }
  };

  const activate = async () => {
    if (!licenseKey.trim()) { setErrors({ license: 'License key required' }); return; }
    setActivating(true);
    setErrors((e) => ({ ...e, license: undefined }));
    try {
      await activateLicense(licenseKey.trim());
      toast.push('success', 'License activated');
      navigate('/');
    } catch (err: any) {
      setErrors({ license: err.message || 'Invalid license key' });
    } finally {
      setActivating(false);
    }
  };

  return (
    <div className="auth-wrap">
      <Card className="auth-card">
        <div className="logo" style={{ fontSize: 'var(--fs-24)', fontWeight: 800, color: 'var(--color-primary)', marginBottom: 'var(--space-6)' }}>
          🚀 Affiliate Launch Kit
        </div>

        <div className="auth-tabs">
          <Button variant={mode === 'login' ? 'primary' : 'secondary'} compact onClick={() => setMode('login')} style={{ flex: 1 }}>Login</Button>
          <Button variant={mode === 'register' ? 'primary' : 'secondary'} compact onClick={() => setMode('register')} style={{ flex: 1 }}>Register</Button>
        </div>

        <form onSubmit={submit}>
          <Field label="Email" htmlFor="email" error={errors.email}>
            <Input id="email" type="email" value={email} invalid={!!errors.email}
              onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
          </Field>
          <Field label="Password" htmlFor="password" error={errors.password} hint="Minimum 8 characters">
            <Input id="password" type="password" value={password} invalid={!!errors.password}
              onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </Field>
          {errors.form && <div className="error-banner" style={{ marginBottom: 'var(--space-4)' }}>{errors.form}</div>}
          <Button type="submit" loading={loading} style={{ width: '100%' }} data-testid="auth-submit">
            {mode === 'login' ? 'Login' : 'Create Account'}
          </Button>
        </form>

        {/* First-login license activation (Section 2.1 / 6.3) */}
        <div style={{ marginTop: 'var(--space-6)', paddingTop: 'var(--space-6)', borderTop: '1px solid var(--color-border)' }}>
          <div className="row between" style={{ marginBottom: 'var(--space-3)' }}>
            <strong style={{ fontSize: 'var(--fs-14)' }}>License Key</strong>
            <Badge type={licenseStatus === 'active' ? 'generated' : ''}>{licenseStatus}</Badge>
          </div>
          <Field error={errors.license} hint="Activate your license after registering (first login).">
            <Input value={licenseKey} invalid={!!errors.license}
              onChange={(e) => setLicenseKey(e.target.value)} placeholder="ALK-XXXX-XXXX-XXXX-XXXX" />
          </Field>
          <Button variant="accent" compact loading={activating} onClick={activate} style={{ width: '100%' }} data-testid="activate-btn">
            Activate License
          </Button>
        </div>
      </Card>
    </div>
  );
}
