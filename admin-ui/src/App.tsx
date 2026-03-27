import React, { useCallback, useEffect, useState } from 'react';
import {
  ApartmentOutlined,
  BellOutlined,
  CloudDownloadOutlined,
  CreditCardOutlined,
  DashboardOutlined,
  HomeOutlined,
  LogoutOutlined,
  MenuOutlined,
  PercentageOutlined,
  RightOutlined,
  SearchOutlined,
  ShopOutlined,
  TeamOutlined,
  UserOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import {
  Avatar,
  Badge,
  ConfigProvider,
  Drawer,
  Grid,
  Input,
  Spin,
  Tooltip,
  message,
  theme,
} from 'antd';
import {
  createCoupon,
  createPlan,
  fetchAdminMe,
  listCoupons,
  listPlans,
  listResource,
  loginAdmin,
  updateCoupon,
  updatePlan,
  updateResource,
} from './api';
import {
  clearAdminAccessToken,
  clearAdminSecurityKey,
  getAdminAccessToken,
  setAdminSecurityKey,
} from './auth';
import { DashboardPanel } from './components/DashboardPanel';
import { LoginView } from './components/LoginView';
import ResourceTablePage from './components/ResourceTablePage';
import type { AuthenticatedAdmin, ResourceKey } from './types';
import {
  brandColor,
  colorPalette,
  typography,
  spacing,
  radius,
  shadows,
  layout,
} from './theme';

const { useBreakpoint } = Grid;

type SectionKey =
  | 'dashboard'
  | 'users'
  | 'properties'
  | 'tenants'
  | 'rooms'
  | 'payments'
  | 'subscriptions'
  | 'plans'
  | 'coupons'
  | 'backups';

const SECTION_DETAILS: Record<SectionKey, { title: string; subtitle: string; idField: string }> = {
  dashboard:     { title: 'Dashboard',     subtitle: 'Global platform summary',                  idField: 'id'   },
  users:         { title: 'Users',         subtitle: 'Manage all user accounts and roles',        idField: 'id'   },
  properties:    { title: 'Properties',    subtitle: 'Manage all properties across owners',       idField: 'id'   },
  tenants:       { title: 'Tenants',       subtitle: 'Manage all tenant records',                 idField: 'id'   },
  rooms:         { title: 'Rooms',         subtitle: 'Manage all room inventories',               idField: 'id'   },
  payments:      { title: 'Payments',      subtitle: 'Monitor and edit payment entries',          idField: 'id'   },
  subscriptions: { title: 'Subscriptions', subtitle: 'Control all subscription records',          idField: 'id'   },
  plans:         { title: 'Plans',         subtitle: 'Create and edit primary pricing plans',     idField: 'name' },
  coupons:       { title: 'Coupons',       subtitle: 'Create and edit coupon codes',              idField: 'code' },
  backups:       { title: 'Backups',       subtitle: 'System snapshots and database maintenance', idField: 'id'   },
};

const USER_CONFIGS = {
  email:  { label: 'Email', required: true },
  name:   { label: 'Full Name', required: true },
  role: {
    label: 'Role',
    kind: 'select' as const,
    options: [
      { label: 'Admin',          value: 'admin'         },
      { label: 'Property Owner', value: 'propertyowner' },
      { label: 'Staff',          value: 'staff'         },
      { label: 'Tenant',         value: 'tenant'        },
    ],
  },
};

const TENANT_CONFIGS = {
  tenantStatus: {
    label: 'Status',
    kind: 'select' as const,
    options: [
      { label: 'Active',    value: 'active'    },
      { label: 'In Notice', value: 'in_notice' },
      { label: 'Moved Out', value: 'moved_out' },
    ],
  },
  rentAmount:      { label: 'Rent (paise)',    min: 0 },
  securityDeposit: { label: 'Deposit (paise)', min: 0 },
};

const PLAN_CONFIGS = {
  name:         { label: 'Plan ID',         required: true, placeholder: 'e.g. pro, premium' },
  display_name: { label: 'Display Name',    required: true, placeholder: 'e.g. Pro Plan'     },
  properties:   { label: 'Property Limit',  required: true, min: 0 },
  tenants:      { label: 'Tenant Limit',    required: true, min: 0 },
  rooms:        { label: 'Room Limit',      required: true, min: 0 },
  staff:        { label: 'Staff Limit',     required: true, min: 0 },
  periods: {
    label: 'Pricing Periods',
    kind: 'json' as const,
    extra: 'Map of months to price in paise. Example: {"1": 49900, "12": 499900}',
  },
  sort_order: { label: 'Sort Order', min: 0 },
};

const PLAN_TEMPLATE = {
  name: '', display_name: '', description: '',
  properties: 1, tenants: 50, rooms: 50, staff: 5,
  periods: { '1': 49900 }, is_active: true, sort_order: 0,
};

const COUPON_CONFIGS = {
  code:         { label: 'Coupon Code',    required: true, placeholder: 'e.g. SAVE50' },
  discountType: {
    label: 'Discount Type',
    kind: 'select' as const,
    options: [
      { label: 'Percentage (%)', value: 'percentage' },
      { label: 'Fixed Amount',   value: 'fixed'      },
    ],
  },
  discountValue:   { label: 'Value (%, or paise)', required: true, min: 0 },
  minAmount:       { label: 'Min Order Amount',    min: 0 },
  maxUsageCount:   { label: 'Max Uses',            min: 0, placeholder: 'Leave empty for unlimited' },
  applicablePlans: {
    label: 'Applicable Plans',
    kind: 'json' as const,
    extra: 'Array of plan IDs. Example: ["pro", "premium"]. Empty = all plans.',
  },
};

const COUPON_TEMPLATE = {
  code: '', discountType: 'percentage', discountValue: 10,
  description: '', maxUsageCount: null, expiresAt: null,
  minAmount: 0, applicablePlans: [], isActive: true,
};

const BOTTOM_NAV_ITEMS = [
  { key: 'dashboard',  icon: <DashboardOutlined />,  label: 'Home'    },
  { key: 'users',      icon: <UserOutlined />,        label: 'Users'   },
  { key: 'tenants',    icon: <TeamOutlined />,        label: 'Tenants' },
  { key: 'payments',   icon: <CreditCardOutlined />,  label: 'Pay'     },
  { key: '__more__',   icon: <MenuOutlined />,        label: 'More'    },
];

const NAV_GROUPS = [
  {
    label: 'OVERVIEW',
    items: [
      { key: 'dashboard', icon: <DashboardOutlined />, label: 'Dashboard' },
    ],
  },
  {
    label: 'MANAGEMENT',
    items: [
      { key: 'users',      icon: <UserOutlined />,      label: 'Users'      },
      { key: 'properties', icon: <HomeOutlined />,      label: 'Properties' },
      { key: 'tenants',    icon: <TeamOutlined />,      label: 'Tenants'    },
      { key: 'rooms',      icon: <ApartmentOutlined />, label: 'Rooms'      },
    ],
  },
  {
    label: 'BILLING',
    items: [
      { key: 'payments',      icon: <CreditCardOutlined />, label: 'Payments'      },
      { key: 'subscriptions', icon: <ShopOutlined />,       label: 'Subscriptions' },
      { key: 'plans',         icon: <ShopOutlined />,       label: 'Plans'         },
      { key: 'coupons',       icon: <PercentageOutlined />, label: 'Coupons'       },
    ],
  },
  {
    label: 'SYSTEM',
    items: [
      { key: 'backups', icon: <CloudDownloadOutlined />, label: 'Backups' },
    ],
  },
];

/* ── SidebarContent ─────────────────────────────────────────────────────────── */
function SidebarContent({
  section, collapsed, onSelect,
}: {
  section: SectionKey;
  collapsed: boolean;
  onSelect: (k: SectionKey) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Brand */}
      <div style={{
        height: layout.headerHeight,
        display: 'flex',
        alignItems: 'center',
        padding: collapsed ? '0 20px' : `0 ${spacing.lg}px`,
        gap: spacing.sm,
        borderBottom: 'rgba(255,255,255,0.07) 1px solid',
        overflow: 'hidden',
        transition: 'padding 0.22s',
        flexShrink: 0,
      }}>
        <div style={{
          width: 34, height: 34,
          borderRadius: radius.md,
          background: `linear-gradient(135deg, ${colorPalette.primary[400]}, ${colorPalette.primary[600]})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          boxShadow: `0 0 14px ${colorPalette.primary[500]}55`,
        }}>
          <HomeOutlined style={{ color: '#fff', fontSize: 16 }} />
        </div>
        {!collapsed && (
          <div style={{ overflow: 'hidden' }}>
            <div style={{
              color: '#fff', fontSize: typography.fontSize.sm,
              fontWeight: 700, letterSpacing: 0.2, whiteSpace: 'nowrap',
            }}>
              HostelManager
            </div>
            <div style={{
              color: colorPalette.primary[300],
              fontSize: 10, fontWeight: 600,
              letterSpacing: 1.2, textTransform: 'uppercase',
            }}>
              Admin Console
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <div style={{
        flex: 1, overflowY: 'auto', overflowX: 'hidden',
        padding: `${spacing.sm}px 0`,
        scrollbarWidth: 'none',
      }}>
        {NAV_GROUPS.map((group) => (
          <div key={group.label} style={{ marginBottom: spacing.xs }}>
            {!collapsed && (
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: 1.6,
                color: colorPalette.neutral[600],
                padding: `${spacing.sm}px ${spacing.lg}px ${spacing.xs}px`,
                textTransform: 'uppercase',
              }}>
                {group.label}
              </div>
            )}
            {group.items.map((item) => {
              const active = section === item.key;
              return (
                <Tooltip key={item.key} title={collapsed ? item.label : ''} placement="right">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelect(item.key as SectionKey)}
                    onKeyDown={e => e.key === 'Enter' && onSelect(item.key as SectionKey)}
                    style={{
                      display: 'flex', alignItems: 'center',
                      gap: spacing.sm,
                      padding: collapsed ? `10px 0` : `10px ${spacing.lg}px`,
                      justifyContent: collapsed ? 'center' : 'flex-start',
                      cursor: 'pointer',
                      borderRadius: radius.md,
                      margin: `1px ${spacing.sm}px`,
                      transition: 'all 0.15s',
                      background: active
                        ? `linear-gradient(90deg, ${colorPalette.primary[600]}22, transparent)`
                        : 'transparent',
                      borderLeft: active
                        ? `3px solid ${colorPalette.primary[400]}`
                        : '3px solid transparent',
                      color: active ? colorPalette.primary[300] : colorPalette.neutral[400],
                      outline: 'none',
                    }}
                    onMouseEnter={e => {
                      if (!active) {
                        (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)';
                        (e.currentTarget as HTMLElement).style.color = colorPalette.neutral[200];
                      }
                    }}
                    onMouseLeave={e => {
                      if (!active) {
                        (e.currentTarget as HTMLElement).style.background = 'transparent';
                        (e.currentTarget as HTMLElement).style.color = colorPalette.neutral[400];
                      }
                    }}
                  >
                    <span style={{ fontSize: 15, flexShrink: 0 }}>{item.icon}</span>
                    {!collapsed && (
                      <span style={{ fontSize: typography.fontSize.sm, fontWeight: active ? 600 : 400, whiteSpace: 'nowrap', flex: 1 }}>
                        {item.label}
                      </span>
                    )}
                    {!collapsed && active && (
                      <RightOutlined style={{ fontSize: 10, opacity: 0.5 }} />
                    )}
                  </div>
                </Tooltip>
              );
            })}
          </div>
        ))}
      </div>

      {/* System status pill */}
      {!collapsed && (
        <div style={{
          padding: `${spacing.md}px ${spacing.lg}px`,
          borderTop: 'rgba(255,255,255,0.06) 1px solid',
          flexShrink: 0,
        }}>
          <div style={{
            background: `${colorPalette.primary[500]}15`,
            border: `1px solid ${colorPalette.primary[500]}30`,
            borderRadius: radius.md,
            padding: `${spacing.xs}px ${spacing.sm}px`,
            display: 'flex', alignItems: 'center', gap: spacing.xs,
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: colorPalette.success[400],
              boxShadow: `0 0 6px ${colorPalette.success[400]}`,
            }} />
            <span style={{ fontSize: 11, color: colorPalette.neutral[400], fontWeight: 500 }}>
              All systems operational
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── App ────────────────────────────────────────────────────────────────────── */
export default function App() {
  const screens = useBreakpoint();
  const isMobile = !screens.lg;
  const [messageApi, contextHolder] = message.useMessage();

  const [loading, setLoading]         = useState(true);
  const [loggingIn, setLoggingIn]     = useState(false);
  const [admin, setAdmin]             = useState<AuthenticatedAdmin | null>(null);
  const [section, setSection]         = useState<SectionKey>('dashboard');
  const [collapsed, setCollapsed]     = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function bootstrap() {
      const token = getAdminAccessToken();
      if (!token) { setLoading(false); return; }
      try {
        const me = await fetchAdminMe();
        if (!mounted) return;
        if (!me?.adminAccess) {
          clearAdminAccessToken();
          throw new Error('No admin access');
        }
        setAdmin(me);
      } catch {
        if (!mounted) return;
        clearAdminAccessToken();
        clearAdminSecurityKey();
        setAdmin(null);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    bootstrap();
    return () => { mounted = false; };
  }, []);

  const handleLogin = async (values: { email: string; password: string; securityKey?: string }) => {
    setLoggingIn(true);
    try {
      if (values.securityKey?.trim()) setAdminSecurityKey(values.securityKey.trim());
      else clearAdminSecurityKey();
      await loginAdmin(values.email, values.password);
      const me = await fetchAdminMe();
      if (!me?.adminAccess) {
        clearAdminAccessToken();
        clearAdminSecurityKey();
        throw new Error('No portal access');
      }
      setAdmin(me);
      setSection('dashboard');
      messageApi.success('Signed in successfully');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = () => {
    clearAdminAccessToken();
    clearAdminSecurityKey();
    setAdmin(null);
    setSection('dashboard');
    setMobileNavOpen(false);
  };

  const handleSectionChange = useCallback((nextSection: SectionKey) => {
    setSection(nextSection);
    if (isMobile) setMobileNavOpen(false);
  }, [isMobile]);

  const renderSection = () => {
    if (section === 'dashboard') return <DashboardPanel />;
    if (section === 'backups')   return <DashboardPanel forceBackupsOnly />;

    if (section === 'plans') {
      const d = SECTION_DETAILS.plans;
      return (
        <ResourceTablePage
          key="plans"
          title={d.title} subtitle={d.subtitle} idField={d.idField}
          listData={async () => { const r = await listPlans({}); return { rows: r.rows, total: r.meta.total }; }}
          updateData={async (id, patch) => updatePlan(id, patch)}
          createData={async (payload) => createPlan(payload)}
          fieldConfigs={PLAN_CONFIGS} createTemplate={PLAN_TEMPLATE}
        />
      );
    }

    if (section === 'coupons') {
      const d = SECTION_DETAILS.coupons;
      return (
        <ResourceTablePage
          key="coupons"
          title={d.title} subtitle={d.subtitle} idField={d.idField}
          listData={async () => { const r = await listCoupons({}); return { rows: r.rows, total: r.meta.total }; }}
          updateData={async (id, patch) => updateCoupon(id, patch)}
          createData={async (payload) => createCoupon(payload)}
          fieldConfigs={COUPON_CONFIGS} createTemplate={COUPON_TEMPLATE}
        />
      );
    }

    const d = SECTION_DETAILS[section];
    let cfg: any = {};
    if (section === 'users')    cfg = USER_CONFIGS;
    if (section === 'tenants')  cfg = TENANT_CONFIGS;
    if (section === 'payments') cfg = { amount: { label: 'Amount (paise)', min: 0 } };

    return (
      <ResourceTablePage
        key={section}
        title={d.title} subtitle={d.subtitle} idField={d.idField}
        listData={async ({ page, pageSize, search }) => {
          const r = await listResource(section as ResourceKey, { page, pageSize, search });
          return { rows: r.rows, total: r.meta.total };
        }}
        updateData={async (id, patch) => updateResource(section as ResourceKey, id, patch)}
        fieldConfigs={cfg}
      />
    );
  };

  /* ── Loading ─────────────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        height: '100vh',
        background: colorPalette.neutral[950],
        gap: spacing.md,
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: radius.xl,
          background: `linear-gradient(135deg, ${colorPalette.primary[400]}, ${colorPalette.primary[600]})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 0 28px ${colorPalette.primary[500]}66`,
          fontSize: 22,
        }}>
          <HomeOutlined style={{ color: '#fff' }} />
        </div>
        <Spin size="large" />
        <span style={{ color: colorPalette.neutral[500], fontSize: typography.fontSize.sm }}>
          Authenticating…
        </span>
      </div>
    );
  }

  /* ── Login ───────────────────────────────────────────────────────────────── */
  if (!admin) {
    return (
      <>
        {contextHolder}
        <LoginView loading={loggingIn} onSubmit={handleLogin} />
      </>
    );
  }

  const siderWidth = collapsed ? layout.siderCollapsed : layout.siderWidth;
  const BOTTOM_NAV_HEIGHT = layout.bottomNavHeight;

  return (
    <>
      {contextHolder}
      <ConfigProvider
        theme={{
          token: {
            colorPrimary: brandColor,
            colorSuccess: colorPalette.success[500],
            colorWarning: colorPalette.warning[500],
            colorError:   colorPalette.danger[500],
            borderRadius: radius.md,
            fontFamily:   typography.fontFamily.regular,
          },
          algorithm: theme.defaultAlgorithm,
        }}
      >
        {/* ── Desktop Sidebar ── */}
        {!isMobile && (
          <div style={{
            position: 'fixed',
            left: 0, top: 0, bottom: 0,
            width: siderWidth,
            background: `linear-gradient(180deg, ${colorPalette.neutral[900]} 0%, ${colorPalette.neutral[950]} 100%)`,
            boxShadow: '4px 0 24px rgba(0,0,0,0.28)',
            zIndex: 20,
            transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1)',
            overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
          }}>
            <SidebarContent section={section} collapsed={collapsed} onSelect={handleSectionChange} />
            {/* Collapse toggle */}
            <button
              onClick={() => setCollapsed(c => !c)}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              style={{
                position: 'absolute', right: -12, top: layout.headerHeight / 2 - 12,
                width: 24, height: 24, borderRadius: '50%',
                background: colorPalette.neutral[800],
                border: `1px solid ${colorPalette.neutral[700]}`,
                color: colorPalette.neutral[400],
                cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                fontSize: 10, zIndex: 30,
                transition: 'all 0.2s',
                boxShadow: shadows.md,
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.background = colorPalette.primary[600];
                el.style.color = '#fff';
                el.style.borderColor = colorPalette.primary[500];
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.background = colorPalette.neutral[800];
                el.style.color = colorPalette.neutral[400];
                el.style.borderColor = colorPalette.neutral[700];
              }}
            >
              {collapsed ? '›' : '‹'}
            </button>
          </div>
        )}

        {/* ── Mobile Drawer ── */}
        {isMobile && (
          <Drawer
            placement="left"
            open={mobileNavOpen}
            onClose={() => setMobileNavOpen(false)}
            closable={false}
            width="80vw"
            styles={{
              body: { padding: 0, background: colorPalette.neutral[950], height: '100%' },
              header: { display: 'none' },
              mask: { backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' },
            }}
          >
            <button
              onClick={() => setMobileNavOpen(false)}
              style={{
                position: 'absolute', top: 14, right: 14, zIndex: 10,
                background: 'rgba(255,255,255,0.08)', border: 'none',
                borderRadius: radius.sm, color: colorPalette.neutral[300],
                cursor: 'pointer', width: 30, height: 30,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <CloseOutlined style={{ fontSize: 13 }} />
            </button>
            <SidebarContent section={section} collapsed={false} onSelect={handleSectionChange} />
          </Drawer>
        )}

        {/* ── Main area ── */}
        <div style={{
          marginLeft: isMobile ? 0 : siderWidth,
          minHeight: '100vh',
          background: colorPalette.neutral[50],
          transition: 'margin-left 0.22s cubic-bezier(0.4,0,0.2,1)',
          paddingBottom: isMobile ? BOTTOM_NAV_HEIGHT : 0,
        }}>
          {/* ── Top Header ── */}
          <div style={{
            position: 'sticky', top: 0, zIndex: 10,
            height: layout.headerHeight,
            background: 'rgba(248,250,252,0.94)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderBottom: `1px solid ${colorPalette.neutral[200]}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: isMobile ? `0 ${spacing.sm}px` : `0 ${spacing.lg}px`,
            boxShadow: '0 1px 0 rgba(0,0,0,0.04)',
            overflow: 'hidden', gap: spacing.sm,
          }}>
            {/* Left */}
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, minWidth: 0, flex: 1 }}>
              {isMobile && (
                <button
                  onClick={() => setMobileNavOpen(true)}
                  style={{
                    flexShrink: 0, background: 'none',
                    border: `1px solid ${colorPalette.neutral[200]}`,
                    borderRadius: radius.sm, color: colorPalette.neutral[600],
                    cursor: 'pointer', width: 36, height: 36,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
                  }}
                >
                  <MenuOutlined />
                </button>
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: isMobile ? typography.fontSize.md : typography.fontSize.sm,
                  fontWeight: 700, color: colorPalette.neutral[800],
                  letterSpacing: -0.2, whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {SECTION_DETAILS[section].title}
                </div>
                {!isMobile && (
                  <div style={{ fontSize: 11, color: colorPalette.neutral[400], marginTop: 1 }}>
                    {SECTION_DETAILS[section].subtitle}
                  </div>
                )}
              </div>
            </div>

            {/* Right */}
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, flexShrink: 0 }}>
              {!isMobile && (
                <Input
                  prefix={<SearchOutlined style={{ color: colorPalette.neutral[400], fontSize: 13 }} />}
                  placeholder="Quick search…"
                  style={{
                    width: 180, borderRadius: radius.full,
                    background: colorPalette.neutral[100],
                    borderColor: 'transparent', fontSize: typography.fontSize.sm,
                  }}
                  size="small"
                />
              )}

              {/* Notifications */}
              <Badge count={3} size="small" color={colorPalette.primary[500]}>
                <button style={{
                  width: 34, height: 34, borderRadius: radius.md,
                  background: colorPalette.neutral[100],
                  border: `1px solid ${colorPalette.neutral[200]}`,
                  color: colorPalette.neutral[500], cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, flexShrink: 0,
                }}>
                  <BellOutlined />
                </button>
              </Badge>

              {/* Avatar pill */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: isMobile ? '4px' : `5px 10px 5px 5px`,
                borderRadius: radius.full,
                border: `1px solid ${colorPalette.neutral[200]}`,
                background: '#fff', flexShrink: 0,
                maxWidth: isMobile ? 36 : 'none',
                overflow: 'hidden',
              }}>
                <Avatar
                  size={26}
                  style={{
                    background: `linear-gradient(135deg, ${colorPalette.primary[400]}, ${colorPalette.primary[600]})`,
                    fontSize: 11, fontWeight: 700, flexShrink: 0,
                  }}
                >
                  {admin.email?.[0]?.toUpperCase() ?? 'A'}
                </Avatar>
                {!isMobile && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: colorPalette.neutral[800], lineHeight: 1.2, whiteSpace: 'nowrap' }}>
                      {admin.name || admin.email?.split('@')[0]}
                    </div>
                    <div style={{ fontSize: 10, color: colorPalette.neutral[400], lineHeight: 1 }}>
                      {admin.role ?? 'Admin'}
                    </div>
                  </div>
                )}
              </div>

              {/* Logout */}
              <Tooltip title="Sign out">
                <button
                  onClick={handleLogout}
                  style={{
                    width: 34, height: 34, borderRadius: radius.md,
                    background: colorPalette.danger[50],
                    border: `1px solid ${colorPalette.danger[200]}`,
                    color: colorPalette.danger[500],
                    cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, flexShrink: 0, transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.background = colorPalette.danger[500];
                    el.style.color = '#fff';
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.background = colorPalette.danger[50];
                    el.style.color = colorPalette.danger[500];
                  }}
                >
                  <LogoutOutlined />
                </button>
              </Tooltip>
            </div>
          </div>

          {/* ── Content ── */}
          <div style={{
            padding: isMobile ? spacing.sm : spacing.lg,
            minHeight: `calc(100vh - ${layout.headerHeight}px)`,
          }}>
            {renderSection()}
          </div>
        </div>

        {/* ── Mobile Bottom Nav ── */}
        {isMobile && (
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0,
            height: BOTTOM_NAV_HEIGHT,
            background: colorPalette.neutral[950],
            borderTop: 'rgba(255,255,255,0.08) 1px solid',
            display: 'flex', alignItems: 'stretch',
            zIndex: 50, boxShadow: '0 -4px 20px rgba(0,0,0,0.3)',
          }}>
            {BOTTOM_NAV_ITEMS.map((item) => {
              const isMore = item.key === '__more__';
              const active = !isMore && section === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => isMore ? setMobileNavOpen(true) : handleSectionChange(item.key as SectionKey)}
                  style={{
                    flex: 1, background: 'none', border: 'none', cursor: 'pointer',
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    gap: 3,
                    color: active ? colorPalette.primary[400] : colorPalette.neutral[500],
                    transition: 'color 0.15s',
                    position: 'relative', padding: 0,
                  }}
                >
                  {active && (
                    <div style={{
                      position: 'absolute', top: 0, left: '50%',
                      transform: 'translateX(-50%)',
                      width: 28, height: 3,
                      borderRadius: '0 0 3px 3px',
                      background: colorPalette.primary[400],
                      boxShadow: `0 0 8px ${colorPalette.primary[400]}`,
                    }} />
                  )}
                  <span style={{ fontSize: 18 }}>{item.icon}</span>
                  <span style={{ fontSize: 10, fontWeight: active ? 700 : 400, letterSpacing: 0.2 }}>
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </ConfigProvider>
    </>
  );
}