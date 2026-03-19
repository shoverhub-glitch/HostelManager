import {
  ApartmentOutlined,
  CreditCardOutlined,
  DashboardOutlined,
  HomeOutlined,
  LogoutOutlined,
  MenuOutlined,
  PercentageOutlined,
  ShopOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Avatar, Button, Drawer, Grid, Layout, Menu, Space, Spin, Typography, message } from 'antd';
import { useEffect, useMemo, useState } from 'react';
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
import { DashboardPanel, LoginView, ResourceTablePage } from './components';
import type { AuthenticatedAdmin, ResourceKey } from './types';

const { Header, Content, Sider } = Layout;
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
  | 'coupons';

const SECTION_DETAILS: Record<SectionKey, { title: string; subtitle: string; idField: string }> = {
  dashboard: {
    title: 'Dashboard',
    subtitle: 'Global platform summary',
    idField: 'id',
  },
  users: {
    title: 'Users',
    subtitle: 'Manage all user accounts and roles',
    idField: 'id',
  },
  properties: {
    title: 'Properties',
    subtitle: 'Manage all properties across owners',
    idField: 'id',
  },
  tenants: {
    title: 'Tenants',
    subtitle: 'Manage all tenant records',
    idField: 'id',
  },
  rooms: {
    title: 'Rooms',
    subtitle: 'Manage all room inventories',
    idField: 'id',
  },
  payments: {
    title: 'Payments',
    subtitle: 'Monitor and edit payment entries',
    idField: 'id',
  },
  subscriptions: {
    title: 'Subscriptions',
    subtitle: 'Control all subscription records',
    idField: 'id',
  },
  plans: {
    title: 'Plans',
    subtitle: 'Create and edit primary pricing plans',
    idField: 'name',
  },
  coupons: {
    title: 'Coupons',
    subtitle: 'Create and edit coupon codes',
    idField: 'code',
  },
};

export default function App() {
  const screens = useBreakpoint();
  const isMobile = !screens.lg;
  const [messageApi, contextHolder] = message.useMessage();
  const [loading, setLoading] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);
  const [admin, setAdmin] = useState<AuthenticatedAdmin | null>(null);
  const [section, setSection] = useState<SectionKey>('dashboard');
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      const token = getAdminAccessToken();
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const me = await fetchAdminMe();
        if (!mounted) return;
        if (!me?.adminAccess) {
          clearAdminAccessToken();
          throw new Error('This account does not have admin access');
        }
        setAdmin(me);
      } catch {
        if (!mounted) return;
        clearAdminAccessToken();
        clearAdminSecurityKey();
        setAdmin(null);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    bootstrap();
    return () => {
      mounted = false;
    };
  }, []);

  const menuItems = useMemo(
    () => [
      { key: 'dashboard', icon: <DashboardOutlined />, label: 'Overview' },
      { key: 'users', icon: <UserOutlined />, label: 'Users' },
      { key: 'properties', icon: <HomeOutlined />, label: 'Properties' },
      { key: 'tenants', icon: <TeamOutlined />, label: 'Tenants' },
      { key: 'rooms', icon: <ApartmentOutlined />, label: 'Rooms' },
      { key: 'payments', icon: <CreditCardOutlined />, label: 'Payments' },
      { key: 'subscriptions', icon: <ShopOutlined />, label: 'Subscriptions' },
      { key: 'plans', icon: <ShopOutlined />, label: 'Plans' },
      { key: 'coupons', icon: <PercentageOutlined />, label: 'Coupons' },
    ],
    []
  );

  const handleLogin = async (values: { email: string; password: string; securityKey?: string }) => {
    setLoggingIn(true);
    try {
      if (values.securityKey?.trim()) {
        setAdminSecurityKey(values.securityKey.trim());
      } else {
        clearAdminSecurityKey();
      }

      await loginAdmin(values.email, values.password);
      const me = await fetchAdminMe();
      if (!me?.adminAccess) {
        clearAdminAccessToken();
        clearAdminSecurityKey();
        throw new Error('This account does not have admin portal access');
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

  const handleSectionChange = (nextSection: SectionKey) => {
    setSection(nextSection);
    if (isMobile) {
      setMobileNavOpen(false);
    }
  };

  const renderSection = () => {
    if (section === 'dashboard') {
      return <DashboardPanel />;
    }

    if (section === 'plans') {
      const details = SECTION_DETAILS.plans;
      return (
        <ResourceTablePage
          key="plans"
          title={details.title}
          subtitle={details.subtitle}
          idField={details.idField}
          listData={async () => {
            const result = await listPlans({});
            return { rows: result.rows, total: result.meta.total };
          }}
          updateData={async (id: string, patch: Record<string, unknown>) => updatePlan(id, patch)}
          createData={async (payload: Record<string, unknown>) => createPlan(payload)}
        />
      );
    }

    if (section === 'coupons') {
      const details = SECTION_DETAILS.coupons;
      return (
        <ResourceTablePage
          key="coupons"
          title={details.title}
          subtitle={details.subtitle}
          idField={details.idField}
          listData={async () => {
            const result = await listCoupons({});
            return { rows: result.rows, total: result.meta.total };
          }}
          updateData={async (id: string, patch: Record<string, unknown>) => updateCoupon(id, patch)}
          createData={async (payload: Record<string, unknown>) => createCoupon(payload)}
        />
      );
    }

    const details = SECTION_DETAILS[section];
    return (
      <ResourceTablePage
        key={section}
        title={details.title}
        subtitle={details.subtitle}
        idField={details.idField}
        listData={async ({ page, pageSize, search }: { page: number; pageSize: number; search: string }) => {
          const result = await listResource(section as ResourceKey, { page, pageSize, search });
          return { rows: result.rows, total: result.meta.total };
        }}
        updateData={async (id: string, patch: Record<string, unknown>) => updateResource(section as ResourceKey, id, patch)}
      />
    );
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <Spin size="large" />
      </div>
    );
  }

  if (!admin) {
    return (
      <>
        {contextHolder}
        <LoginView loading={loggingIn} onSubmit={handleLogin} />
      </>
    );
  }

  const navigationMenu = (
    <Menu
      mode="inline"
      selectedKeys={[section]}
      items={menuItems}
      onClick={(event) => handleSectionChange(event.key as SectionKey)}
      className="admin-menu"
    />
  );

  return (
    <>
      {contextHolder}
      <Layout className="app-shell">
        {isMobile ? (
          <Drawer
            placement="left"
            open={mobileNavOpen}
            onClose={() => setMobileNavOpen(false)}
            closable={false}
            width={280}
            className="mobile-admin-drawer"
            bodyStyle={{ padding: 12 }}
          >
            <div className="sider-brand">HostelManager Admin</div>
            {navigationMenu}
          </Drawer>
        ) : (
          <Sider
            collapsible
            collapsed={collapsed}
            onCollapse={setCollapsed}
            breakpoint="lg"
            className="admin-sider"
            width={250}
          >
            <div className="sider-brand">HostelManager Admin</div>
            {navigationMenu}
          </Sider>
        )}

        <Layout>
          <Header className="admin-header">
            <div className="admin-header-main">
              {isMobile ? (
                <Button
                  type="text"
                  icon={<MenuOutlined />}
                  onClick={() => setMobileNavOpen(true)}
                  aria-label="Open navigation menu"
                  className="mobile-nav-trigger"
                />
              ) : null}

              <Space size={12} className="admin-user-block">
                <Avatar icon={<UserOutlined />} />
                <div>
                  <Typography.Text className="admin-email">{admin.email}</Typography.Text>
                  <br />
                  <Typography.Text type="secondary" className="admin-session-label">
                    Secure admin session
                  </Typography.Text>
                </div>
              </Space>
            </div>

            <Button icon={<LogoutOutlined />} onClick={handleLogout}>
              {isMobile ? 'Sign out' : 'Logout'}
            </Button>
          </Header>
          <Content className="admin-content">{renderSection()}</Content>
        </Layout>
      </Layout>
    </>
  );
}
