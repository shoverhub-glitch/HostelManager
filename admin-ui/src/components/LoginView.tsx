import { Button, Card, Form, Input, Typography, message } from 'antd';
import { brandColor, colorPalette, typography, spacing, radius, shadows, styles } from '../theme';

interface LoginViewProps {
  loading: boolean;
  onSubmit: (values: { email: string; password: string; securityKey?: string }) => Promise<void>;
}

export function LoginView({ loading, onSubmit }: LoginViewProps) {
  const [messageApi, contextHolder] = message.useMessage();

  const handleSubmit = async (values: { email: string; password: string; securityKey?: string }) => {
    try {
      await onSubmit(values);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : 'Unable to sign in');
    }
  };

  return (
    <div style={styles.loginPage}>
      {contextHolder}
      <Card
        style={styles.loginCard}
        styles={{ body: { padding: spacing.lg } }}
      >
        <Typography.Title 
          level={2} 
          style={{ 
            textAlign: 'center', 
            marginBottom: spacing.xs,
            color: colorPalette.primary[700],
          }}
        >
          HostelManager Admin
        </Typography.Title>
        <Typography.Paragraph 
          type="secondary" 
          style={{ textAlign: 'center', marginBottom: spacing.lg }}
        >
          Restricted control panel for platform administration.
        </Typography.Paragraph>

        <Form layout="vertical" onFinish={handleSubmit} autoComplete="off">
          <Form.Item label="Admin Email" name="email" rules={[{ required: true, message: 'Email is required' }]}>
            <Input placeholder="admin@company.com" size="large" />
          </Form.Item>
          <Form.Item label="Password" name="password" rules={[{ required: true, message: 'Password is required' }]}>
            <Input.Password placeholder="Your password" size="large" />
          </Form.Item>
          <Form.Item
            label="Admin Security Key (optional)"
            name="securityKey"
            tooltip="Required only if backend enables ADMIN_REQUIRE_API_KEY"
          >
            <Input.Password placeholder="Enter extra security key if configured" size="large" />
          </Form.Item>
          <Button htmlType="submit" type="primary" block size="large" loading={loading}>
            Sign In
          </Button>
        </Form>
      </Card>
    </div>
  );
}
