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
import { spacing, radius, shadows } from '@/theme';
import { typography } from '@/theme/typography';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';

export default function ProfileScreen() {
  const { colors, toggleTheme, isDark } = useTheme();
  const { logout, user } = useAuth();
  const router = useRouter();

  const handleLogout = async () => { await logout(); };

  const settingsOptions: Array<{
    icon: any;
    title: string;
    description: string;
    color: string;
    bg: string;
    route?: Href;
  }> = [
    {
      icon:        MapPin,
      title:       'My Property',
      description: 'View current property and quick actions',
      color:       colors.primary[500],
      bg:          isDark ? colors.primary[900] : colors.primary[50],
      route:       '/my-property' as Href,
    },
    {
      icon:        Building2,
      title:       'Manage Properties',
      description: 'Add, edit, or remove properties',
      color:       colors.primary[400],
      bg:          isDark ? colors.primary[900] : colors.primary[50],
      route:       '/manage-properties' as Href,
    },
    {
      icon:        CreditCard,
      title:       'Subscription & Billing',
      description: 'Manage your plan and billing',
      color:       colors.warning[500],
      bg:          isDark ? colors.warning[900] : colors.warning[50],
      route:       '/subscription' as Href,
    },
    {
      icon:        Bell,
      title:       'Notifications',
      description: 'Manage notification preferences',
      color:       colors.purple[500],
      bg:          isDark ? colors.purple[900] : colors.purple[50],
    },
    {
      icon:        Shield,
      title:       'Privacy & Security',
      description: 'Password and security settings',
      color:       colors.success[500],
      bg:          isDark ? colors.success[900] : colors.success[50],
      route:       '/privacy-security' as Href,
    },
    {
      icon:        HelpCircle,
      title:       'Help & Support',
      description: 'Get help and contact support',
      color:       colors.danger[500],
      bg:          isDark ? colors.danger[900] : colors.danger[50],
    },
  ];

  return (
    <ScreenContainer edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Profile</Text>
        </View>

        {/* ── Profile card ── */}
        <Card style={styles.profileCard}>
          <View style={[styles.avatarRing, { borderColor: isDark ? colors.primary[700] : colors.primary[100] }]}>
            <View style={[styles.avatar, { backgroundColor: colors.primary[500] }]}>
              <User size={36} color={colors.white} strokeWidth={1.5} />
            </View>
          </View>
          <Text style={[styles.ownerName, { color: colors.text.primary }]}>
            {user?.name || 'Property Owner'}
          </Text>
          <View style={[styles.rolePill, { backgroundColor: isDark ? colors.primary[900] : colors.primary[50] }]}>
            <Text style={[styles.roleText, { color: isDark ? colors.primary[300] : colors.primary[600] }]}>
              Hostel Manager
            </Text>
          </View>
        </Card>

        {/* ── Personal Info ── */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>
            Personal information
          </Text>

          <Card style={styles.infoCard}>
            <View style={styles.infoRow}>
              <View style={[styles.infoIconWrap, {
                backgroundColor: isDark ? colors.primary[900] : colors.primary[50],
              }]}>
                <Mail size={18} color={colors.primary[500]} strokeWidth={1.5} />
              </View>
              <View style={styles.infoContent}>
                <Text style={[styles.infoLabel, { color: colors.text.secondary }]}>EMAIL</Text>
                <Text style={[styles.infoValue, { color: colors.text.primary }]}>
                  {user?.email || 'owner@example.com'}
                </Text>
              </View>
            </View>
          </Card>

          <Card style={styles.infoCard}>
            <View style={styles.infoRow}>
              <View style={[styles.infoIconWrap, {
                backgroundColor: isDark ? colors.success[900] : colors.success[50],
              }]}>
                <Phone size={18} color={colors.success[500]} strokeWidth={1.5} />
              </View>
              <View style={styles.infoContent}>
                <Text style={[styles.infoLabel, { color: colors.text.secondary }]}>PHONE</Text>
                <Text style={[styles.infoValue, { color: colors.text.primary }]}>
                  {user?.phone || 'Not provided'}
                </Text>
              </View>
            </View>
          </Card>
        </View>

        {/* ── Appearance ── */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Appearance</Text>

          <Card style={styles.settingCard}>
            <View style={styles.settingRow}>
              <View style={[styles.settingIconWrap, {
                backgroundColor: isDark ? colors.primary[900] : colors.primary[50],
              }]}>
                <Moon size={18} color={colors.primary[500]} strokeWidth={1.5} />
              </View>
              <View style={styles.settingContent}>
                <Text style={[styles.settingTitle, { color: colors.text.primary }]}>
                  Dark mode
                </Text>
                <Text style={[styles.settingDesc, { color: colors.text.secondary }]}>
                  {isDark ? 'Currently enabled' : 'Currently disabled'}
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

        {/* ── Settings ── */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Settings</Text>

          {settingsOptions.map((option, i) => (
            <TouchableOpacity
              key={i}
              activeOpacity={0.7}
              onPress={() => option.route && router.push(option.route)}>
              <Card style={styles.settingCard}>
                <View style={styles.settingRow}>
                  <View style={[styles.settingIconWrap, { backgroundColor: option.bg }]}>
                    <option.icon size={18} color={option.color} strokeWidth={1.5} />
                  </View>
                  <View style={styles.settingContent}>
                    <Text style={[styles.settingTitle, { color: colors.text.primary }]}>
                      {option.title}
                    </Text>
                    <Text style={[styles.settingDesc, { color: colors.text.secondary }]}>
                      {option.description}
                    </Text>
                  </View>
                  <ChevronRight size={16} color={colors.text.tertiary} strokeWidth={1.5} />
                </View>
              </Card>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Logout ── */}
        <TouchableOpacity
          style={[
            styles.logoutBtn,
            {
              backgroundColor: isDark ? colors.danger[900] : colors.danger[50],
              borderColor:     isDark ? colors.danger[700] : colors.danger[200],
            },
          ]}
          onPress={handleLogout}
          activeOpacity={0.7}>
          <LogOut size={18} color={colors.danger[500]} strokeWidth={1.5} />
          <Text style={[styles.logoutText, { color: colors.danger[500] }]}>Sign out</Text>
        </TouchableOpacity>

      </ScrollView>
    </ScreenContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom:     spacing.xxxl,
  },

  // ── Header ───────────────────────────────────────────────────────────────
  header: {
    paddingVertical:   spacing.md,
    paddingHorizontal: spacing.sm,
  },

  headerTitle: {
    fontFamily:    typography.fontFamily.bold,
    fontSize:      typography.fontSize.xxl,
    letterSpacing: typography.letterSpacing.tight,
  },

  // ── Profile card ─────────────────────────────────────────────────────────
  profileCard: {
    alignItems:      'center',
    paddingVertical: spacing.xl,
    marginBottom:    spacing.lg,
  },

  avatarRing: {
    width:          88,
    height:         88,
    borderRadius:   radius.full,
    borderWidth:    2,
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   spacing.lg,
  },

  avatar: {
    width:          76,
    height:         76,
    borderRadius:   radius.full,
    alignItems:     'center',
    justifyContent: 'center',
  },

  ownerName: {
    fontFamily:    typography.fontFamily.bold,
    fontSize:      typography.fontSize.xl,
    letterSpacing: typography.letterSpacing.tight,
    marginBottom:  spacing.sm,
  },

  rolePill: {
    paddingHorizontal: spacing.md,
    paddingVertical:   4,
    borderRadius:      radius.full,
  },

  roleText: {
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      typography.fontSize.xs,
    letterSpacing: typography.letterSpacing.wide,
    textTransform: 'uppercase',
  },

  // ── Section ──────────────────────────────────────────────────────────────
  section: { marginBottom: spacing.lg },

  sectionTitle: {
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      typography.fontSize.sm,
    letterSpacing: typography.letterSpacing.wider,
    textTransform: 'uppercase',
    marginBottom:  spacing.md,
    marginLeft:    spacing.xs,
  },

  // ── Info cards ───────────────────────────────────────────────────────────
  infoCard: { marginBottom: spacing.sm },

  infoRow: { flexDirection: 'row', alignItems: 'center' },

  infoIconWrap: {
    width:          40,
    height:         40,
    borderRadius:   radius.full,
    alignItems:     'center',
    justifyContent: 'center',
    marginRight:    spacing.md,
  },

  infoContent: { flex: 1 },

  infoLabel: {
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      typography.fontSize.xs,
    letterSpacing: typography.letterSpacing.wider,
    marginBottom:  spacing.xs,
  },

  infoValue: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize:   typography.fontSize.md,
  },

  // ── Setting cards ─────────────────────────────────────────────────────────
  settingCard: { marginBottom: spacing.sm },

  settingRow: { flexDirection: 'row', alignItems: 'center' },

  settingIconWrap: {
    width:          40,
    height:         40,
    borderRadius:   radius.full,
    alignItems:     'center',
    justifyContent: 'center',
    marginRight:    spacing.md,
  },

  settingContent: { flex: 1 },

  settingTitle: {
    fontFamily:   typography.fontFamily.semiBold,
    fontSize:     typography.fontSize.md,
    marginBottom: 2,
  },

  settingDesc: {
    fontFamily: typography.fontFamily.regular,
    fontSize:   typography.fontSize.sm,
  },

  // ── Logout ───────────────────────────────────────────────────────────────
  logoutBtn: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    borderRadius:   radius.md,
    paddingVertical: spacing.lg,
    marginTop:      spacing.sm,
    borderWidth:    0.5,
    gap:            spacing.sm,
  },

  logoutText: {
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      typography.fontSize.md,
    letterSpacing: typography.letterSpacing.wide,
  },
});