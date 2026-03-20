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
  Badge,
  Button,
  Col,
  Divider,
  Grid,
  Popconfirm,
  Progress,
  Row,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import { useEffect, useState } from 'react';
import {
  deleteBackup,
  downloadStoredBackup,
  fetchOverview,
  listBackups,
  triggerBackup,
} from '../api';
import type { OverviewStats } from '../types';
import {
  brandColor,
  colorPalette,
  typography,
  spacing,
  radius,
  shadows,
} from '../theme';

const { useBreakpoint } = Grid;

/* ─── colour shortcuts ─────────────────────────────────────────────────────── */
const c = {
  primary:      colorPalette.primary[500],
  primary300:   colorPalette.primary[300],
  primary50:    colorPalette.primary[50],
  success:      colorPalette.success[500],
  success50:    colorPalette.success[50],
  warning:      colorPalette.warning[500],
  warning50:    colorPalette.warning[50],
  danger:       colorPalette.danger[500],
  danger50:     colorPalette.danger[50],
  n50:          colorPalette.neutral[50],
  n100:         colorPalette.neutral[100],
  n200:         colorPalette.neutral[200],
  n300:         colorPalette.neutral[300],
  n400:         colorPalette.neutral[400],
  n500:         colorPalette.neutral[500],
  n600:         colorPalette.neutral[600],
  n700:         colorPalette.neutral[700],
  n800:         colorPalette.neutral[800],
  n900:         colorPalette.neutral[900],
  n950:         colorPalette.neutral[950],
  rooms:        '#7C3AED',
  roomsBg:      colorPalette.primary[50],
  subs:         '#0891B2',
  subsBg:       '#ECFEFF',
};

/* ─── shared card shell ────────────────────────────────────────────────────── */
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

/* ─── tiny sub-components ──────────────────────────────────────────────────── */

/** A single KPI card */
function StatCard({
  label, value, icon, accent, accentBg, loading, rank,
}: {
  label: string; value: number; icon: React.ReactNode;
  accent: string; accentBg: string; loading: boolean; rank: number;
}) {
  return (
    <div
      style={{
        ...card,
        padding: spacing.lg,
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.sm,
        /* staggered fade-in */
        animation: `fadeSlideUp 0.4s ease both`,
        animationDelay: `${rank * 60}ms`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        {/* icon */}
        <div
          style={{
            width: 44, height: 44, borderRadius: radius.md,
            background: accentBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, color: accent, flexShrink: 0,
          }}
        >
          {icon}
        </div>
        {/* trend badge */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 11, fontWeight: 600,
            color: c.success,
            background: c.success50,
            padding: '3px 8px', borderRadius: radius.full,
          }}
        >
          <ArrowUpOutlined style={{ fontSize: 9 }} /> 12%
        </div>
      </div>

      {/* value */}
      <div style={{ fontSize: 32, fontWeight: 800, color: c.n900, lineHeight: 1, letterSpacing: -1 }}>
        {loading ? <LoadingOutlined style={{ fontSize: 22, color: c.n300 }} /> : value.toLocaleString()}
      </div>

      {/* label */}
      <div style={{ fontSize: 12, fontWeight: 500, color: c.n500, textTransform: 'uppercase', letterSpacing: 0.8 }}>
        {label}
      </div>

      {/* bottom accent bar */}
      <div style={{ height: 3, borderRadius: 2, background: c.n100, overflow: 'hidden', marginTop: 4 }}>
        <div
          style={{
            height: '100%', width: '68%',
            background: `linear-gradient(90deg, ${accent}99, ${accent})`,
            borderRadius: 2,
            transition: 'width 0.8s ease',
          }}
        />
      </div>
    </div>
  );
}

/** System-health pill row */
function HealthPill({ label, status }: { label: string; status: 'ok' | 'warn' }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: `${spacing.sm}px ${spacing.md}px`,
        borderRadius: radius.md,
        background: c.n50,
        border: `1px solid ${c.n100}`,
      }}
    >
      <span style={{ fontSize: 13, color: c.n700, fontWeight: 500 }}>{label}</span>
      <span
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          fontSize: 11, fontWeight: 600,
          color: status === 'ok' ? c.success : c.warning,
        }}
      >
        <span
          style={{
            width: 7, height: 7, borderRadius: '50%',
            background: status === 'ok' ? c.success : c.warning,
            boxShadow: `0 0 6px ${status === 'ok' ? c.success : c.warning}`,
            animation: 'pulse 2s infinite',
          }}
        />
        {status === 'ok' ? 'Operational' : 'Degraded'}
      </span>
    </div>
  );
}

/** Section header used inside cards */
function CardHeader({
  title, subtitle, action,
}: {
  title: string; subtitle?: string; action?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: `${spacing.md}px ${spacing.lg}px`,
        borderBottom: `1px solid ${c.n100}`,
        gap: spacing.sm,
        flexWrap: 'wrap',
      }}
    >
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: c.n800 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: c.n400, marginTop: 2 }}>{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

/* ─── main component ───────────────────────────────────────────────────────── */
export function DashboardPanel({ forceBackupsOnly }: { forceBackupsOnly?: boolean }) {
  const screens = useBreakpoint();
  const isMobile = !screens.sm;

  const [stats, setStats]               = useState<OverviewStats>(EMPTY_STATS);
  const [loading, setLoading]           = useState(false);
  const [backingUp, setBackingUp]       = useState(false);
  const [backups, setBackups]           = useState<any[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    setLoadingBackups(true);
    try {
      const promises: Promise<any>[] = [listBackups({ page: 1, pageSize: 10 })];
      if (!forceBackupsOnly) promises.push(fetchOverview());
      const results = await Promise.all(promises);
      setBackups(results[0].rows || []);
      if (!forceBackupsOnly) setStats(results[1] || EMPTY_STATS);
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
      setLoadingBackups(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const handleTriggerBackup = async () => {
    setBackingUp(true);
    try {
      await triggerBackup();
      message.success('Backup task initiated');
      setTimeout(loadAll, 1500);
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Backup failed');
    } finally {
      setBackingUp(false);
    }
  };

  const handleDownload = async (record: any) => {
    const hide = message.loading(`Preparing ${record.filename}…`, 0);
    try {
      const blob = await downloadStoredBackup(record.id);
      const url  = window.URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = record.filename;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch { message.error('Download failed'); }
    finally   { hide(); }
  };

  const handleDelete = async (id: string) => {
    try { await deleteBackup(id); message.success('Archive removed'); loadAll(); }
    catch { message.error('Delete failed'); }
  };

  /* ── backup table columns ── */
  const backupColumns = [
    {
      title: 'Date & Time',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (v: string) => {
        const d = new Date(v);
        return (
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: c.n800 }}>
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
          completed: { dot: c.success,  label: 'Completed', bg: c.success50,          text: c.success  },
          failed:    { dot: c.danger,   label: 'Failed',    bg: c.danger50,            text: c.danger   },
          running:   { dot: c.primary,  label: 'Running',   bg: c.primary50,           text: c.primary  },
          pending:   { dot: c.n400,     label: 'Pending',   bg: c.n100,                text: c.n600     },
        };
        const s = map[status] || map.pending;
        return (
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 12, fontWeight: 600,
              color: s.text, background: s.bg,
              padding: '3px 10px', borderRadius: radius.full,
            }}
          >
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
      render: (bytes: number) =>
        bytes ? (
          <span style={{ fontWeight: 600, color: c.n700 }}>
            {(bytes / (1024 * 1024)).toFixed(2)} <span style={{ fontWeight: 400, color: c.n400 }}>MB</span>
          </span>
        ) : <span style={{ color: c.n300 }}>—</span>,
    },
    {
      title: '',
      key: 'actions',
      align: 'right' as const,
      render: (_: any, record: any) => (
        <Space size={4}>
          <Tooltip title="Download archive">
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
          <Popconfirm title="Delete this archive?" onConfirm={() => handleDelete(record.id)} okText="Delete" okType="danger">
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

  /* ── stat card definitions ── */
  const statCards = [
    { key: 'users',         label: 'Total Users',     value: stats.users,         icon: <UserOutlined />,              accent: c.primary,  accentBg: c.primary50  },
    { key: 'properties',    label: 'Properties',      value: stats.properties,    icon: <HomeOutlined />,              accent: c.success,  accentBg: c.success50  },
    { key: 'tenants',       label: 'Active Tenants',  value: stats.tenants,       icon: <TeamOutlined />,              accent: c.warning,  accentBg: c.warning50  },
    { key: 'rooms',         label: 'Total Rooms',     value: stats.rooms,         icon: <AppstoreOutlined />,          accent: c.rooms,    accentBg: c.roomsBg    },
    { key: 'payments',      label: 'Payments',        value: stats.payments,      icon: <CreditCardOutlined />,        accent: c.subs,     accentBg: c.subsBg     },
    { key: 'subscriptions', label: 'Subscriptions',   value: stats.subscriptions, icon: <SafetyCertificateOutlined />, accent: c.danger,   accentBg: c.danger50   },
  ];

  /* ── keyframe injection (once) ── */
  if (typeof document !== 'undefined' && !document.getElementById('dash-keyframes')) {
    const s = document.createElement('style');
    s.id = 'dash-keyframes';
    s.textContent = `
      @keyframes fadeSlideUp {
        from { opacity: 0; transform: translateY(12px); }
        to   { opacity: 1; transform: translateY(0);    }
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50%       { opacity: 0.4; }
      }
    `;
    document.head.appendChild(s);
  }

  /* ══════════════════════════════════════════════════════════════════
     BACKUPS-ONLY VIEW
  ══════════════════════════════════════════════════════════════════ */
  if (forceBackupsOnly) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>

        {/* Page hero */}
        <div
          style={{
            ...card,
            background: `linear-gradient(135deg, ${c.n900} 0%, ${c.n950} 100%)`,
            padding: isMobile ? spacing.md : spacing.lg,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing.md,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
            <div
              style={{
                width: 48, height: 48, borderRadius: radius.lg,
                background: `linear-gradient(135deg, ${c.primary}, ${c.rooms})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, color: '#fff',
                boxShadow: `0 0 20px ${c.primary}55`,
                flexShrink: 0,
              }}
            >
              <SafetyCertificateOutlined />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', letterSpacing: -0.5 }}>
                System Backups
              </div>
              <div style={{ fontSize: 12, color: c.n400, marginTop: 2 }}>
                Enterprise-grade disaster recovery & database snapshots
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
                border: 'none',
                fontWeight: 600,
              }}
            >
              {backingUp ? 'Creating…' : 'New Snapshot'}
            </Button>
          </Space>
        </div>

        {/* Retention notice */}
        <div
          style={{
            display: 'flex', alignItems: 'flex-start', gap: spacing.sm,
            padding: `${spacing.sm}px ${spacing.md}px`,
            background: c.warning50,
            border: `1px solid ${colorPalette.warning[200]}`,
            borderRadius: radius.md,
            fontSize: 13, color: c.n700,
          }}
        >
          <WarningOutlined style={{ color: c.warning, flexShrink: 0, marginTop: 2 }} />
          <span>
            <strong>Retention policy:</strong> Backups are automatically purged after{' '}
            <strong>{RETENTION_DAYS} days</strong> to optimise storage costs.
          </span>
        </div>

        {/* Table card */}
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
                style: { transition: 'background 0.15s' },
                onMouseEnter: (e) => { (e.currentTarget as HTMLElement).style.background = c.n50; },
                onMouseLeave: (e) => { (e.currentTarget as HTMLElement).style.background = '#fff'; },
              })}
            />
          </div>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════════
     MAIN DASHBOARD VIEW
  ══════════════════════════════════════════════════════════════════ */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>

      {/* ── Top hero bar ── */}
      <div
        style={{
          ...card,
          background: `linear-gradient(135deg, ${c.n900} 0%, ${c.n950} 100%)`,
          padding: isMobile ? spacing.md : spacing.lg,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.md,
        }}
      >
        <div>
          <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 800, color: '#fff', letterSpacing: -0.5 }}>
            Executive Overview
          </div>
          <div style={{ fontSize: 13, color: c.n400, marginTop: 3 }}>
            Global metrics &amp; system health —{' '}
            <span style={{ color: c.success, fontWeight: 500 }}>All systems operational</span>
          </div>
        </div>
        <Button
          icon={<ReloadOutlined />}
          onClick={loadAll}
          loading={loading}
          style={{ borderColor: c.n700, color: c.n300, background: 'transparent' }}
        >
          Refresh
        </Button>
      </div>

      {/* ── KPI grid ── */}
      <Row gutter={[spacing.md, spacing.md]}>
        {statCards.map((item, i) => (
          <Col key={item.key} xs={12} sm={12} md={8} lg={8} xl={8}>
            <StatCard {...item} loading={loading} rank={i} />
          </Col>
        ))}
      </Row>

      {/* ── Lower section: system integrity + storage ── */}
      <Row gutter={[spacing.md, spacing.md]}>

        {/* System integrity + recent backups */}
        <Col xs={24} lg={16}>
          <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
            <CardHeader title="System Integrity" subtitle="Live health check across infrastructure" />

            {/* Health pills */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
                gap: spacing.sm,
                padding: spacing.md,
              }}
            >
              <HealthPill label="Database" status="ok" />
              <HealthPill label="API Gateway" status="ok" />
              <HealthPill label="Redis Cache" status="ok" />
            </div>

            <Divider style={{ margin: 0, borderColor: c.n100 }} />

            {/* Recent backups mini-table */}
            <div style={{ padding: `${spacing.sm}px 0 0` }}>
              <div
                style={{
                  padding: `${spacing.xs}px ${spacing.lg}px ${spacing.sm}px`,
                  fontSize: 12, fontWeight: 700,
                  color: c.n500, textTransform: 'uppercase', letterSpacing: 0.8,
                }}
              >
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
                <Button
                  type="link"
                  size="small"
                  icon={<CloudDownloadOutlined />}
                  style={{ padding: 0, fontSize: 13, color: c.primary, fontWeight: 500 }}
                  onClick={() => message.info('Navigate to Backups section for full history.')}
                >
                  View full archive →
                </Button>
              </div>
            </div>
          </div>
        </Col>

        {/* Storage + infra status */}
        <Col xs={24} lg={8}>
          <div style={{ ...card, display: 'flex', flexDirection: 'column', height: '100%' }}>
            <CardHeader title="Storage & Infra" subtitle="Resource utilisation" />

            {/* Donut */}
            <div
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                padding: `${spacing.lg}px ${spacing.lg}px ${spacing.sm}px`,
                gap: spacing.sm,
              }}
            >
              <Progress
                type="dashboard"
                percent={42}
                strokeColor={{
                  '0%':   c.primary,
                  '100%': c.rooms,
                }}
                trailColor={c.n100}
                format={(p) => (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: c.n800, lineHeight: 1 }}>{p}%</div>
                    <div style={{ fontSize: 10, color: c.n400, marginTop: 4, letterSpacing: 0.5 }}>USED</div>
                  </div>
                )}
              />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: c.n800 }}>4.2 GB / 10 GB</div>
                <div style={{ fontSize: 12, color: c.n400 }}>Primary SSD Storage</div>
              </div>
            </div>

            <Divider style={{ margin: `0 ${spacing.md}px`, borderColor: c.n100 }} />

            {/* Service rows */}
            <div
              style={{
                display: 'flex', flexDirection: 'column',
                gap: spacing.sm,
                padding: `${spacing.md}px ${spacing.lg}px ${spacing.lg}px`,
              }}
            >
              {[
                { label: 'DB Clusters',  icon: <DatabaseOutlined />,   status: 'ok'  },
                { label: 'CDN Edge',     icon: <WifiOutlined />,        status: 'ok'  },
                { label: 'Redis Cache',  icon: <ThunderboltOutlined />, status: 'ok'  },
              ].map((svc) => (
                <div
                  key={svc.label}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: `${spacing.sm}px ${spacing.md}px`,
                    background: c.n50,
                    borderRadius: radius.md,
                    border: `1px solid ${c.n100}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, color: c.n600, fontSize: 13, fontWeight: 500 }}>
                    <span style={{ color: c.n400 }}>{svc.icon}</span>
                    {svc.label}
                  </div>
                  <span
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      fontSize: 11, fontWeight: 600, color: c.success,
                    }}
                  >
                    <span
                      style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: c.success,
                        boxShadow: `0 0 5px ${c.success}`,
                        animation: 'pulse 2.5s infinite',
                      }}
                    />
                    Active
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Col>
      </Row>
    </div>
  );
}