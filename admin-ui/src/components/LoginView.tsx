import React, { useState } from 'react';
import { message } from 'antd';
import { brandColor, colorPalette, typography, spacing, radius, shadows, styles } from '../theme';

interface LoginViewProps {
  loading: boolean;
  onSubmit: (values: { email: string; password: string; securityKey?: string }) => Promise<void>;
}

// Input style helper
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: radius.md,
  border: `1.5px solid ${colorPalette.neutral[200]}`,
  fontSize: typography.fontSize.sm,
  color: colorPalette.neutral[900],
  background: '#fff',
  outline: 'none',
  transition: 'border-color 0.15s, box-shadow 0.15s',
  boxSizing: 'border-box',
  fontFamily: "'Inter', sans-serif",
};

function FormField({
  label, name, type = 'text', placeholder, required = false, tooltip,
  value, onChange,
}: {
  label: string; name: string; type?: string; placeholder: string;
  required?: boolean; tooltip?: string; value: string; onChange: (v: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  const [show, setShow] = useState(false);
  const isPassword = type === 'password';

  return (
    <div style={{ marginBottom: spacing.md }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <label style={{
          fontSize: typography.fontSize.sm,
          fontWeight: 600,
          color: colorPalette.neutral[700],
        }}>
          {label}
          {required && <span style={{ color: colorPalette.danger[500], marginLeft: 3 }}>*</span>}
        </label>
        {tooltip && (
          <span style={{
            fontSize: 10, color: colorPalette.neutral[400],
            background: colorPalette.neutral[100],
            padding: '1px 6px', borderRadius: radius.full,
            cursor: 'help',
          }} title={tooltip}>
            optional
          </span>
        )}
      </div>
      <div style={{ position: 'relative' }}>
        <input
          name={name}
          type={isPassword && !show ? 'password' : 'text'}
          placeholder={placeholder}
          required={required}
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            ...inputStyle,
            borderColor: focused ? colorPalette.primary[400] : colorPalette.neutral[200],
            boxShadow: focused ? `0 0 0 3px ${colorPalette.primary[100]}` : 'none',
            paddingRight: isPassword ? 44 : 14,
          }}
          autoComplete={isPassword ? 'current-password' : 'email'}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow(s => !s)}
            style={{
              position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: colorPalette.neutral[400], fontSize: 13, padding: 4,
              display: 'flex', alignItems: 'center',
            }}
            tabIndex={-1}
          >
            {show ? '🙈' : '👁️'}
          </button>
        )}
      </div>
    </div>
  );
}

export function LoginView({ loading, onSubmit }: LoginViewProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [securityKey, setSecKey]    = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      messageApi.error('Email and password are required');
      return;
    }
    try {
      await onSubmit({ email: email.trim(), password, securityKey: securityKey.trim() || undefined });
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : 'Unable to sign in');
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: `radial-gradient(ellipse at 60% 0%, ${colorPalette.primary[50]} 0%, ${colorPalette.neutral[100]} 55%, ${colorPalette.neutral[50]} 100%)`,
      padding: spacing.md,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {contextHolder}

      {/* Background decoration */}
      <div style={{
        position: 'absolute', top: -80, right: -80,
        width: 320, height: 320,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${colorPalette.primary[100]}60, transparent 70%)`,
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: -60, left: -60,
        width: 240, height: 240,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${colorPalette.primary[50]}80, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      <div style={{
        width: '100%',
        maxWidth: 420,
        background: '#fff',
        borderRadius: radius.xl,
        boxShadow: shadows.xl,
        border: `1px solid ${colorPalette.neutral[200]}`,
        overflow: 'hidden',
        position: 'relative',
        zIndex: 1,
      }}>
        {/* Header band */}
        <div style={{
          background: `linear-gradient(135deg, ${colorPalette.primary[600]} 0%, ${colorPalette.primary[800]} 100%)`,
          padding: `${spacing.xl}px ${spacing.xl}px ${spacing.lg}px`,
          textAlign: 'center',
        }}>
          {/* Logo mark */}
          <div style={{
            width: 52, height: 52,
            borderRadius: radius.lg,
            background: 'rgba(255,255,255,0.15)',
            border: '1.5px solid rgba(255,255,255,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 14px',
            fontSize: 22,
            backdropFilter: 'blur(8px)',
          }}>
            🏠
          </div>
          <div style={{
            fontSize: typography.fontSize.xl,
            fontWeight: 800,
            color: '#fff',
            letterSpacing: -0.5,
            lineHeight: 1.2,
          }}>
            HostelManager
          </div>
          <div style={{
            fontSize: typography.fontSize.xs,
            color: colorPalette.primary[200],
            fontWeight: 600,
            letterSpacing: 2,
            textTransform: 'uppercase',
            marginTop: 4,
          }}>
            Admin Console
          </div>
        </div>

        {/* Form body */}
        <div style={{ padding: `${spacing.xl}px` }}>
          <div style={{
            fontSize: typography.fontSize.sm,
            color: colorPalette.neutral[500],
            marginBottom: spacing.lg,
            textAlign: 'center',
            lineHeight: 1.5,
          }}>
            Restricted access — authorised administrators only.
          </div>

          <form onSubmit={handleSubmit} noValidate>
            <FormField
              label="Admin Email"
              name="email"
              type="email"
              placeholder="admin@company.com"
              required
              value={email}
              onChange={setEmail}
            />
            <FormField
              label="Password"
              name="password"
              type="password"
              placeholder="Your password"
              required
              value={password}
              onChange={setPassword}
            />
            <FormField
              label="Admin Security Key"
              name="securityKey"
              type="password"
              placeholder="Enter extra security key if configured"
              tooltip="Required only if backend enables ADMIN_REQUIRE_API_KEY"
              value={securityKey}
              onChange={setSecKey}
            />

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px 20px',
                borderRadius: radius.md,
                border: 'none',
                background: loading
                  ? colorPalette.neutral[300]
                  : `linear-gradient(135deg, ${colorPalette.primary[500]}, ${colorPalette.primary[700]})`,
                color: '#fff',
                fontSize: typography.fontSize.md,
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                boxShadow: loading ? 'none' : `0 4px 12px ${colorPalette.primary[500]}40`,
                letterSpacing: 0.2,
                fontFamily: "'Inter', sans-serif",
                marginTop: spacing.sm,
              }}
              onMouseEnter={e => {
                if (!loading) (e.currentTarget as HTMLButtonElement).style.opacity = '0.9';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.opacity = '1';
              }}
            >
              {loading ? 'Signing in…' : 'Sign In →'}
            </button>
          </form>

          <div style={{
            display: 'flex', alignItems: 'center', gap: spacing.sm,
            marginTop: spacing.lg, padding: `${spacing.sm}px ${spacing.md}px`,
            background: colorPalette.neutral[50],
            border: `1px solid ${colorPalette.neutral[200]}`,
            borderRadius: radius.md,
          }}>
            <span style={{ fontSize: 14 }}>🔒</span>
            <span style={{ fontSize: typography.fontSize.xs, color: colorPalette.neutral[500], lineHeight: 1.4 }}>
              This panel is for platform administrators only. All actions are logged.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}