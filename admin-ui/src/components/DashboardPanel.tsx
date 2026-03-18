import { Card, Col, Row, Statistic, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { fetchOverview } from '../api';
import type { OverviewStats } from '../types';

const EMPTY_STATS: OverviewStats = {
  users: 0,
  properties: 0,
  tenants: 0,
  rooms: 0,
  payments: 0,
  subscriptions: 0,
};

export function DashboardPanel() {
  const [stats, setStats] = useState<OverviewStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      try {
        const response = await fetchOverview();
        if (mounted) {
          setStats(response || EMPTY_STATS);
        }
      } catch {
        if (mounted) {
          setStats(EMPTY_STATS);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const cardItems = [
    { key: 'users', label: 'Users', value: stats.users },
    { key: 'properties', label: 'Properties', value: stats.properties },
    { key: 'tenants', label: 'Tenants', value: stats.tenants },
    { key: 'rooms', label: 'Rooms', value: stats.rooms },
    { key: 'payments', label: 'Payments', value: stats.payments },
    { key: 'subscriptions', label: 'Subscriptions', value: stats.subscriptions },
  ];

  return (
    <div>
      <Typography.Title level={3} className="page-title">
        Platform Overview
      </Typography.Title>
      <Typography.Paragraph type="secondary" className="page-subtitle">
        Real-time entity counters across the entire HostelManager platform.
      </Typography.Paragraph>
      <Row gutter={[16, 16]}>
        {cardItems.map((item) => (
          <Col xs={24} sm={12} xl={8} key={item.key}>
            <Card className="stat-card" loading={loading}>
              <Statistic title={item.label} value={item.value} />
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}
