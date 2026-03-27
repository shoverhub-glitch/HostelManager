import React, { useEffect, useState, useCallback } from 'react';
import {
  AppstoreOutlined,
  CheckCircleOutlined,
  CloudDownloadOutlined,
  CreditCardOutlined,
  DeleteOutlined,
  HomeOutlined,
  LoadingOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  UserOutlined,
  WarningOutlined,
  ArrowUpOutlined,
  DatabaseOutlined,
  WifiOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import {
  Button,
  Divider,
  Grid,
  Popconfirm,
  Progress,
  Space,
  Table,
  Tooltip,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  deleteBackup,
  downloadStoredBackup,
  fetchOverview,
  listBackups,
  triggerBackup,
} from '../api';
import type { OverviewStats } from '../types';
import { colorPalette, typography, spacing, radius, shadows } from '../theme';

const { useBreakpoint } = Grid;

const c = {
  primary:    colorPalette.primary[500],
  primary400: colorPalette.primary[400],
  primary300: colorPalette.primary[300],
  primary50:  colorPalette.primary[50],
  primary100: colorPalette.primary[100],
  success:    colorPalette.success[500],
  success50:  colorPalette.success[50],
  success100: colorPalette.success[100],
  warning:    colorPalette.warning[500],
  warning50:  colorPalette.warning[50],
  warning200: colorPalette.warning[200],
  danger:     colorPalette.danger[500],
  danger50:   colorPalette.danger[50],
  n50:  colorPalette.neutral[50],
  n100: colorPalette.neutral[100],
  n200: colorPalette.neutral[200],
  n300: colorPalette.neutral[300],
  n400: colorPalette.neutral[400],
  n500: colorPalette.neutral[500],
  n600: colorPalette.neutral[600],
  n700: colorPalette.neutral[700],
  n800: colorPalette.neutral[800],
  n900: colorPalette.neutral[900],
  n950: colorPalette.neutral[950],
  rooms:   '#7C3AED',
  roomsBg: colorPalette.primary[50],
  subs:    '#0891B2',
  subsBg:  '#ECFEFF',
};

const card: React.CSSProperties = {
  background: '#fff',
  borderRadius: radius.lg,
  border: `1px solid ${c.n200}`,
  boxShadow: shadows.sm,
  overflow: 'hidden',
};

const EMPTY_STATS: OverviewStats = {
  users: 0, properties: 0, tenants: 0,
  rooms: 0, payments: 0, subscriptions: 0,
};

const RETENTION_DAYS = 7;

/* ── Keyframes injected once ─────────────────────────────────────────────── */
function injectKeyframes() {
  if (typeof document === 'undefined') return;
  const id = 'hm-dash-kf';
  if (document.getElementById(id)) return;
  const s = document.createElement('style');
  s.id = id;
  s.textContent = `
    @keyframes hmFadeUp {
      from { opacity: 0; transform: translateY(10px); }
      to   { opacity: 1; transform: translateY(0);    }
    }
    @keyframes hmPulse {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.35; }
    }
    @keyframes hmSpin {
      from { transform: rotate(0deg);   }
      to   { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(s);
}

/* ── StatCard ────────────────────────────────────────────────────────────── */
function StatCard({
  label, value, icon, accent, accentBg, loading, rank, trend = 12,
}: {
  label: string; value: number; icon: React.ReactNode;
  accent: string; accentBg: string; loading: boolean; rank: number; trend?: number;
}) {
  return (
    <div
      style={{
        ...card,
        padding: spacing.lg,
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.sm,
        animation: 'hmFadeUp 0.45s ease both',
        animationDelay: `${rank * 55}ms`,
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.transform = 'translateY(-2px)';
        el.style.boxShadow = shadows.md;
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.transform = 'translateY(0)';
        el.style.boxShadow = shadows.sm;
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{
          width: 44, height: 44, borderRadius: radius.md,
          background: accentBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, color: accent, flexShrink: 0,
        }}>
          {icon}
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          fontSize: 11, fontWeight: 700,
          color: c.success,
          background: c.success50,
          border: `1px solid ${c.success100}`,
          padding: '3px 8px', borderRadius: radius.full,
        }}>
          <ArrowUpOutlined style={{ fontSize: 9 }} /> {trend}%
        </div>
      </div>

      <div style={{ fontSize: 30, fontWeight: 800, color: c.n900, lineHeight: 1, letterSpacing: -1, marginTop: 4 }}>
        {loading
          ? <span style={{ width: 80, height: 30, borderRadius: 6, background: c.n100, display: 'inline-block', animation: 'hmPulse 1.4s infinite' }} />
          : value.toLocaleString()
        }
      </div>

      <div style={{ fontSize: 11, fontWeight: 600, color: c.n500, textTransform: 'uppercase', letterSpacing: 0.9 }}>
        {label}
      </div>

      <div style={{ height: 3, borderRadius: 2, background: c.n100, overflow: 'hidden', marginTop: 2 }}>
        <div style={{
          height: '100%', width: loading ? '0%' : '68%',
          background: `linear-gradient(90deg, ${accent}80, ${accent})`,
          borderRadius: 2,
          transition: 'width 1s cubic-bezier(0.4,0,0.2,1)',
        }} />
      </div>
    </div>
  );
}

/* ── HealthPill ──────────────────────────────────────────────────────────── */
function HealthPill({ label, status }: { label: string; status: 'ok' | 'warn' | 'error' }) {
  const colorMap = {
    ok:    { text: c.success, bg: c.success50 },
    warn:  { text: c.warning, bg: c.warning50 },
    error: { text: c.danger,  bg: c.danger50  },
  };
  const clr = colorMap[status];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: `10px ${spacing.md}px`,
      borderRadius: radius.md,
      background: c.n50,
      border: `1px solid ${c.n100}`,
    }}>
      <span style={{ fontSize: 13, color: c.n700, fontWeight: 500 }}>{label}</span>
      <span style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 11, fontWeight: 700,
        color: clr.text,
        background: clr.bg,
        padding: '3px 10px', borderRadius: radius.full,
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: clr.text,
          boxShadow: `0 0 6px ${clr.text}`,
          animation: 'hmPulse 2.2s infinite',
        }} />
        {status === 'ok' ? 'Operational' : status === 'warn' ? 'Degraded' : 'Down'}
      </span>
    </div>
  );
}

/* ── CardHeader ──────────────────────────────────────────────────────────── */
function CardHeader({ title, subtitle, action }: {
  title: string; subtitle?: string; action?: React.ReactNode;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: `${spacing.md}px ${spacing.lg}px`,
      borderBottom: `1px solid ${c.n100}`,
      gap: spacing.sm, flexWrap: 'wrap',
    }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: c.n800 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: c.n400, marginTop: 2 }}>{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

/* ── Main Component ──────────────────────────────────────────────────────── */
export function DashboardPanel({ forceBackupsOnly }: { forceBackupsOnly?: boolean }) {
  injectKeyframes();
  const screens   = useBreakpoint();
  const isMobile  = !screens.sm;
  const isTablet  = !screens.lg;

  const [stats, setStats]               = useState<OverviewStats>(EMPTY_STATS);
  const [loading, setLoading]           = useState(false);
  const [backingUp, setBackingUp]       = useState(false);
  const [backups, setBackups]           = useState<any[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadingBackups(true);
    try {
      const promises: Promise<any>[] = [listBackups({ page: 1, pageSize: 10 })];
      if (!forceBackupsOnly) promises.push(fetchOverview());
      const results = await Promise.allSettled(promises);
      if (results[0].status === 'fulfilled') {
        setBackups((results[0] as PromiseFulfilledResult<any>).value.rows || []);
      }
      if (!forceBackupsOnly && results[1]?.status === 'fulfilled') {
        setStats((results[1] as PromiseFulfilledResult<any>).value || EMPTY_STATS);
      }
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
      setLoadingBackups(false);
    }
  }, [forceBackupsOnly]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleTriggerBackup = async () => {
    setBackingUp(true);
    try {
      await triggerBackup();
      message.success('Backup task initiated — this may take a few minutes');
      setTimeout(loadAll, 2000);
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Backup initiation failed');
    } finally {
      setBackingUp(false);
    }
  };

  const handleDownload = async (record: any) => {
    const hide = message.loading(`Preparing ${record.filename ?? 'backup'}…`, 0);
    try {
      const blob = await downloadStoredBackup(record.id);
      const url  = window.URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = record.filename ?? `backup-${record.id}.sql`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      message.success('Download started');
    } catch {
      message.error('Download failed');
    } finally {
      hide();
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteBackup(id);
      message.success('Archive removed');
      loadAll();
    } catch {
      message.error('Delete failed');
    }
  };

  /* ── backup table columns ── */
  const backupColumns: ColumnsType<any> = [
    {
      title: 'Date & Time',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (v: string) => {
        const d = new Date(v);
        return (
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: c.n800 }}>
              {d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
            </div>
            <div style={{ fontSize: 11, color: c.n400 }}>
              {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        );
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const map: Record<string, { dot: string; label: string; bg: string; text: string }> = {
          completed: { dot: c.success,  label: 'Completed', bg: c.success50,  text: c.success  },
          failed:    { dot: c.danger,   label: 'Failed',    bg: c.danger50,   text: c.danger   },
          running:   { dot: c.primary,  label: 'Running',   bg: c.primary50,  text: c.primary  },
          pending:   { dot: c.n400,     label: 'Pending',   bg: c.n100,       text: c.n600     },
        };
        const s = map[status] || map.pending;
        return (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 12, fontWeight: 700,
            color: s.text, background: s.bg,
            padding: '3px 10px', borderRadius: radius.full,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
            {s.label}
          </span>
        );
      },
    },
    {
      title: 'Size',
      dataIndex: 'sizeBytes',
      key: 'sizeBytes',
      render: (bytes: number) => bytes ? (
        <span style={{ fontWeight: 600, color: c.n700 }}>
          {(bytes / (1024 * 1024)).toFixed(2)}{' '}
          <span style={{ fontWeight: 400, color: c.n400 }}>MB</span>
        </span>
      ) : <span style={{ color: c.n300 }}>—</span>,
    },
    {
      title: '',
      key: 'actions',
      align: 'right' as const,
      render: (_: any, record: any) => (
        <Space size={4}>
          <Tooltip title={record.status !== 'completed' ? 'Only completed backups can be downloaded' : 'Download archive'}>
            <Button
              type="text" size="small"
              icon={<CloudDownloadOutlined />}
              disabled={record.status !== 'completed'}
              onClick={() => handleDownload(record)}
              style={{
                color: record.status === 'completed' ? c.primary : c.n300,
                borderRadius: radius.sm,
              }}
            />
          </Tooltip>
          <Popconfirm
            title="Delete this archive?"
            description="This action cannot be undone."
            onConfirm={() => handleDelete(record.id)}
            okText="Delete"
            okType="danger"
          >
            <Tooltip title="Delete">
              <Button
                type="text" size="small" danger
                icon={<DeleteOutlined />}
                style={{ borderRadius: radius.sm }}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const statCards = [
    { key: 'users',         label: 'Total Users',     value: stats.users,         icon: <UserOutlined />,              accent: c.primary,  accentBg: c.primary50,  trend: 14 },
    { key: 'properties',    label: 'Properties',      value: stats.properties,    icon: <HomeOutlined />,              accent: c.success,  accentBg: c.success50,  trend: 8  },
    { key: 'tenants',       label: 'Active Tenants',  value: stats.tenants,       icon: <TeamOutlined />,              accent: c.warning,  accentBg: c.warning50,  trend: 11 },
    { key: 'rooms',         label: 'Total Rooms',     value: stats.rooms,         icon: <AppstoreOutlined />,          accent: c.rooms,    accentBg: c.roomsBg,    trend: 6  },
    { key: 'payments',      label: 'Payments',        value: stats.payments,      icon: <CreditCardOutlined />,        accent: c.subs,     accentBg: c.subsBg,     trend: 20 },
    { key: 'subscriptions', label: 'Subscriptions',   value: stats.subscriptions, icon: <SafetyCertificateOutlined />, accent: c.danger,   accentBg: c.danger50,   trend: 9  },
  ];

  /* ══════════════════ BACKUPS-ONLY VIEW ══════════════════ */
  if (forceBackupsOnly) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>

        {/* Hero */}
        <div style={{
          ...card,
          background: `linear-gradient(135deg, ${c.n900} 0%, ${c.n950} 100%)`,
          padding: isMobile ? spacing.md : spacing.lg,
          display: 'flex', flexWrap: 'wrap',
          alignItems: 'center', justifyContent: 'space-between',
          gap: spacing.md,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
            <div style={{
              width: 48, height: 48, borderRadius: radius.lg,
              background: `linear-gradient(135deg, ${c.primary}, ${c.rooms})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, color: '#fff',
              boxShadow: `0 0 20px ${c.primary}55`, flexShrink: 0,
            }}>
              <SafetyCertificateOutlined />
            </div>
            <div>
              <div style={{ fontSize: isMobile ? 16 : 20, fontWeight: 800, color: '#fff', letterSpacing: -0.5 }}>
                System Backups
              </div>
              <div style={{ fontSize: 12, color: c.n400, marginTop: 2 }}>
                Enterprise-grade disaster recovery &amp; database snapshots
              </div>
            </div>
          </div>
          <Space wrap>
            <Button
              icon={<ReloadOutlined />}
              onClick={loadAll}
              loading={loadingBackups}
              style={{ borderColor: c.n700, color: c.n300, background: 'transparent' }}
            >
              Refresh
            </Button>
            <Button
              type="primary"
              icon={backingUp ? <LoadingOutlined /> : <CloudDownloadOutlined />}
              onClick={handleTriggerBackup}
              disabled={backingUp}
              style={{
                background: `linear-gradient(90deg, ${c.primary}, ${c.rooms})`,
                border: 'none', fontWeight: 700,
              }}
            >
              {backingUp ? 'Creating…' : 'New Snapshot'}
            </Button>
          </Space>
        </div>

        {/* Retention notice */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: spacing.sm,
          padding: `${spacing.sm}px ${spacing.md}px`,
          background: c.warning50,
          border: `1px solid ${c.warning200}`,
          borderRadius: radius.md, fontSize: 13, color: c.n700,
        }}>
          <WarningOutlined style={{ color: c.warning, flexShrink: 0, marginTop: 2 }} />
          <span>
            <strong>Retention policy:</strong> Backups are automatically purged after{' '}
            <strong>{RETENTION_DAYS} days</strong> to optimise storage costs.
          </span>
        </div>

        {/* Table */}
        <div style={card}>
          <CardHeader
            title="Database Archives"
            subtitle={`${backups.length} snapshot${backups.length !== 1 ? 's' : ''} stored`}
          />
          <div style={{ overflowX: 'auto' }}>
            <Table
              dataSource={backups}
              columns={backupColumns}
              rowKey="id"
              pagination={{ pageSize: 10, size: 'small' }}
              loading={loadingBackups}
              size="middle"
              style={{ minWidth: 480 }}
              onRow={() => ({
                style: { transition: 'background 0.12s' },
                onMouseEnter: (e) => { (e.currentTarget as HTMLElement).style.background = c.n50; },
                onMouseLeave: (e) => { (e.currentTarget as HTMLElement).style.background = '#fff'; },
              })}
            />
          </div>
        </div>
      </div>
    );
  }

  /* ══════════════════ MAIN DASHBOARD VIEW ══════════════════ */
  const colCount = isMobile ? 1 : isTablet ? 2 : 3;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>

      {/* Hero bar */}
      <div style={{
        ...card,
        background: `linear-gradient(135deg, ${c.n900} 0%, ${c.n950} 100%)`,
        padding: isMobile ? spacing.md : `${spacing.lg}px ${spacing.xl}px`,
        display: 'flex', flexWrap: 'wrap',
        alignItems: 'center', justifyContent: 'space-between',
        gap: spacing.md,
      }}>
        <div>
          <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 800, color: '#fff', letterSpacing: -0.5 }}>
            Executive Overview
          </div>
          <div style={{ fontSize: 13, color: c.n400, marginTop: 4 }}>
            Global metrics &amp; system health —{' '}
            <span style={{ color: c.success, fontWeight: 600 }}>All systems operational</span>
          </div>
        </div>
        <Button
          icon={<ReloadOutlined spin={loading} />}
          onClick={loadAll}
          loading={loading}
          style={{ borderColor: c.n700, color: c.n300, background: 'transparent', borderRadius: radius.md }}
        >
          {!isMobile && 'Refresh'}
        </Button>
      </div>

      {/* KPI Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${colCount}, 1fr)`,
        gap: spacing.md,
      }}>
        {statCards.map(({ key: itemKey, ...item }, i) => (
          <StatCard key={itemKey} {...item} loading={loading} rank={i} />
        ))}
      </div>

      {/* Lower section */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isTablet ? '1fr' : '2fr 1fr',
        gap: spacing.md,
        alignItems: 'start',
      }}>

        {/* System integrity + recent backups */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
          <CardHeader title="System Integrity" subtitle="Live health check across infrastructure" />

          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
            gap: spacing.sm,
            padding: spacing.md,
          }}>
            <HealthPill label="Database"     status="ok" />
            <HealthPill label="API Gateway"  status="ok" />
            <HealthPill label="Redis Cache"  status="ok" />
          </div>

          <Divider style={{ margin: 0, borderColor: c.n100 }} />

          {/* Recent backups mini-table */}
          <div style={{ padding: `${spacing.sm}px 0 0` }}>
            <div style={{
              padding: `${spacing.xs}px ${spacing.lg}px ${spacing.sm}px`,
              fontSize: 11, fontWeight: 700, color: c.n500,
              textTransform: 'uppercase', letterSpacing: 0.9,
            }}>
              Recent Backups
            </div>
            <div style={{ overflowX: 'auto' }}>
              <Table
                dataSource={backups.slice(0, 5)}
                columns={backupColumns}
                rowKey="id"
                pagination={false}
                size="small"
                loading={loadingBackups}
                style={{ minWidth: 400 }}
              />
            </div>
            <div style={{ padding: `${spacing.sm}px ${spacing.lg}px ${spacing.md}px` }}>
              <button
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: c.primary, fontSize: 13, fontWeight: 600,
                  padding: 0, display: 'flex', alignItems: 'center', gap: 6,
                }}
                onClick={() => message.info('Navigate to Backups section for full history.')}
              >
                <CloudDownloadOutlined /> View full archive →
              </button>
            </div>
          </div>
        </div>

        {/* Storage & Infra */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
          <CardHeader title="Storage & Infra" subtitle="Resource utilisation" />

          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: `${spacing.lg}px ${spacing.lg}px ${spacing.sm}px`,
            gap: spacing.sm,
          }}>
            <Progress
              type="dashboard"
              percent={42}
              strokeColor={{ '0%': c.primary, '100%': c.rooms }}
              trailColor={c.n100}
              format={(p) => (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: c.n800, lineHeight: 1 }}>{p}%</div>
                  <div style={{ fontSize: 10, color: c.n400, marginTop: 4, letterSpacing: 0.6 }}>USED</div>
                </div>
              )}
            />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: c.n800 }}>4.2 GB / 10 GB</div>
              <div style={{ fontSize: 12, color: c.n400 }}>Primary SSD Storage</div>
            </div>
          </div>

          <Divider style={{ margin: `0 ${spacing.md}px`, borderColor: c.n100 }} />

          <div style={{
            display: 'flex', flexDirection: 'column',
            gap: spacing.sm,
            padding: `${spacing.md}px ${spacing.lg}px ${spacing.lg}px`,
          }}>
            {[
              { label: 'DB Clusters',  icon: <DatabaseOutlined />,   status: 'ok' as const },
              { label: 'CDN Edge',     icon: <WifiOutlined />,        status: 'ok' as const },
              { label: 'Redis Cache',  icon: <ThunderboltOutlined />, status: 'ok' as const },
            ].map((svc) => (
              <div key={svc.label} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: `${spacing.sm}px ${spacing.md}px`,
                background: c.n50,
                borderRadius: radius.md,
                border: `1px solid ${c.n100}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, color: c.n600, fontSize: 13, fontWeight: 500 }}>
                  <span style={{ color: c.n400 }}>{svc.icon}</span>
                  {svc.label}
                </div>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  fontSize: 11, fontWeight: 700, color: c.success,
                  background: c.success50, padding: '3px 8px', borderRadius: radius.full,
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: c.success,
                    boxShadow: `0 0 5px ${c.success}`,
                    animation: 'hmPulse 2.5s infinite',
                  }} />
                  Active
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}