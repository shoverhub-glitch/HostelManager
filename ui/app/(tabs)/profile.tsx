import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import ScreenContainer from '@/components/ScreenContainer';
import Card from '@/components/Card';
import {
  User,
  Mail,
  Phone,
  Building2,
  MapPin,
  Bell,
  Shield,
  HelpCircle,
  LogOut,
  ChevronRight,
  CreditCard,
  Moon,
} from 'lucide-react-native';
import { spacing, typography, radius, shadows } from '@/theme';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';

export default function ProfileScreen() {
  const { colors, toggleTheme, isDark } = useTheme();
  const { logout, user } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
  };

  const settingsOptions: Array<{
    icon: any;
    title: string;
    description: string;
    color: string;
    route?: Href;
  }> = [
    {
      icon: Building2,
      title: 'Manage Properties',
      description: 'Add, edit, or remove properties',
      color: colors.primary[500],
      route: '/manage-properties',
    },
    {
      icon: CreditCard,
      title: 'Subscription & Billing',
      description: 'Manage your plan and billing',
      color: colors.warning[500],
      route: '/subscription',
    },
    {
      icon: Bell,
      title: 'Notifications',
      description: 'Manage notification preferences',
      color: colors.purple[500],
    },
    {
      icon: Shield,
      title: 'Privacy & Security',
      description: 'Password and security settings',
      color: colors.success[500],
      route: '/privacy-security' as Href,
    },
    {
      icon: HelpCircle,
      title: 'Help & Support',
      description: 'Get help and contact support',
      color: colors.danger[500],
    },
  ];

  return (
    <ScreenContainer edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Profile</Text>
        </View>

        <Card style={styles.profileCard}>
          <View style={styles.avatarContainer}>
            <View style={[styles.avatar, { backgroundColor: colors.primary[500] }]}>
              <User size={40} color={colors.white} />
            </View>
          </View>
          <Text style={[styles.ownerName, { color: colors.text.primary }]}>
            {user?.name || 'Property Owner'}
          </Text>
          <Text style={[styles.ownerRole, { color: colors.text.secondary }]}>Hostel Manager</Text>
        </Card>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Personal Information</Text>

          <Card style={styles.infoCard}>
            <View style={styles.infoRow}>
              <View style={[styles.infoIcon, { backgroundColor: colors.background.tertiary }]}>
                <Mail size={20} color={colors.primary[500]} />
              </View>
              <View style={styles.infoContent}>
                <Text style={[styles.infoLabel, { color: colors.text.secondary }]}>Email</Text>
                <Text style={[styles.infoValue, { color: colors.text.primary }]}>
                  {user?.email || 'owner@example.com'}
                </Text>
              </View>
            </View>
          </Card>

          <Card style={styles.infoCard}>
            <View style={styles.infoRow}>
              <View style={[styles.infoIcon, { backgroundColor: colors.background.tertiary }]}>
                <Phone size={20} color={colors.success[500]} />
              </View>
              <View style={styles.infoContent}>
                <Text style={[styles.infoLabel, { color: colors.text.secondary }]}>Phone</Text>
                <Text style={[styles.infoValue, { color: colors.text.primary }]}>
                  {user?.phone || 'Not provided'}
                </Text>
              </View>
            </View>
          </Card>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Appearance</Text>

          <Card style={styles.settingCard}>
            <View style={styles.settingRow}>
              <View
                style={[
                  styles.settingIcon,
                  { backgroundColor: `${colors.primary[500]}15` },
                ]}>
                <Moon size={20} color={colors.primary[500]} />
              </View>
              <View style={styles.settingContent}>
                <Text style={[styles.settingTitle, { color: colors.text.primary }]}>
                  Dark Mode
                </Text>
                <Text style={[styles.settingDescription, { color: colors.text.secondary }]}>
                  {isDark ? 'Enabled' : 'Disabled'}
                </Text>
              </View>
              <Switch
                value={isDark}
                onValueChange={toggleTheme}
                trackColor={{ false: colors.neutral[300], true: colors.primary[500] }}
                thumbColor={colors.white}
              />
            </View>
          </Card>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Settings</Text>

          {settingsOptions.map((option, index) => (
            <TouchableOpacity
              key={index}
              activeOpacity={0.7}
              onPress={() => option.route && router.push(option.route)}>
              <Card style={styles.settingCard}>
                <View style={styles.settingRow}>
                  <View
                    style={[
                      styles.settingIcon,
                      { backgroundColor: `${option.color}15` },
                    ]}>
                    <option.icon size={20} color={option.color} />
                  </View>
                  <View style={styles.settingContent}>
                    <Text style={[styles.settingTitle, { color: colors.text.primary }]}>{option.title}</Text>
                    <Text style={[styles.settingDescription, { color: colors.text.secondary }]}>
                      {option.description}
                    </Text>
                  </View>
                  <ChevronRight size={20} color={colors.text.tertiary} />
                </View>
              </Card>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.logoutButton, { backgroundColor: colors.background.secondary, borderColor: colors.danger[100] }]}
          onPress={handleLogout}
          activeOpacity={0.7}>
          <LogOut size={20} color={colors.danger[500]} />
          <Text style={[styles.logoutText, { color: colors.danger[500] }]}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  header: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  headerTitle: {
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
  },
  profileCard: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    marginBottom: spacing.lg,
  },
  avatarContainer: {
    marginBottom: spacing.lg,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerName: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.xs,
  },
  ownerRole: {
    fontSize: typography.fontSize.sm,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.md,
  },
  infoCard: {
    marginBottom: spacing.sm,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: typography.fontSize.sm,
    marginBottom: spacing.xs,
  },
  infoValue: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  settingCard: {
    marginBottom: spacing.sm,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  settingDescription: {
    fontSize: typography.fontSize.sm,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    marginTop: spacing.sm,
    borderWidth: 1,
    ...shadows.md,
  },
  logoutText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    marginLeft: spacing.sm,
  },
});
