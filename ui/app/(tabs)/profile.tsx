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
  ArrowUpRight,
  CreditCard,
  Moon,
  Sun,
} from 'lucide-react-native';
import { spacing, radius } from '@/theme';
import { typography } from '@/theme/typography';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';

export default function ProfileScreen() {
  const { colors, toggleTheme, isDark } = useTheme();
  const { logout, user }                = useAuth();
  const router                          = useRouter();

  const handleLogout = async () => { await logout(); };

  // ── Color aliases ─────────────────────────────────────────────────────────
  const brandColor    = colors.primary[500];
  const brandLight    = isDark ? colors.primary[900] : colors.primary[50];
  const brandText     = isDark ? colors.primary[300] : colors.primary[600];
  const cardBg        = colors.background.secondary;
  const cardBorder    = colors.border.medium;
  const pageBg        = colors.background.primary;
  const textPrimary   = colors.text.primary;
  const textSecondary = colors.text.secondary;
  const textTertiary  = colors.text.tertiary;

  // ── Settings list ─────────────────────────────────────────────────────────
  type SettingOption = {
    icon: any;
    title: string;
    description: string;
    accentColor: string;
    accentBg: string;
    route?: Href;
  };

  const settingsOptions: SettingOption[] = [
    {
      icon:        MapPin,
      title:       'My Property',
      description: 'View property and quick actions',
      accentColor: brandText,
      accentBg:    brandLight,
      route:       '/my-property' as Href,
    },
    {
      icon:        Building2,
      title:       'Manage Properties',
      description: 'Add, edit, or remove properties',
      accentColor: isDark ? colors.primary[300] : colors.primary[500],
      accentBg:    isDark ? colors.primary[900] : colors.primary[50],
      route:       '/manage-properties' as Href,
    },
    {
      icon:        CreditCard,
      title:       'Subscription & Billing',
      description: 'Manage your plan and billing',
      accentColor: isDark ? colors.warning[300] : colors.warning[600],
      accentBg:    isDark ? colors.warning[900] : colors.warning[50],
      route:       '/subscription' as Href,
    },
    {
      icon:        Bell,
      title:       'Notifications',
      description: 'Manage notification preferences',
      accentColor: isDark ? colors.purple[300] : colors.purple[500],
      accentBg:    isDark ? colors.purple[900] : colors.purple[50],
    },
    {
      icon:        Shield,
      title:       'Privacy & Security',
      description: 'Password and security settings',
      accentColor: isDark ? colors.success[300] : colors.success[600],
      accentBg:    isDark ? colors.success[900] : colors.success[50],
      route:       '/privacy-security' as Href,
    },
    {
      icon:        HelpCircle,
      title:       'Help & Support',
      description: 'Get help and contact support',
      accentColor: isDark ? colors.danger[300] : colors.danger[600],
      accentBg:    isDark ? colors.danger[900] : colors.danger[50],
    },
  ];

  return (
    <ScreenContainer edges={['top']}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { backgroundColor: pageBg }]}
        showsVerticalScrollIndicator={false}>

        {/* ── Page title ─────────────────────────────────────────────────── */}
        <View style={styles.topBar}>
          <Text style={[styles.screenTitle, { color: textPrimary }]}>Profile</Text>
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
              <View style={styles.heroInfo}>
                <Text style={[styles.heroName, { color: textPrimary }]} numberOfLines={1}>
                  {user?.name || 'Property Owner'}
                </Text>
                <View style={[styles.rolePill, { backgroundColor: brandLight, borderColor: isDark ? colors.primary[700] : colors.primary[200] }]}>
                  <Text style={[styles.roleText, { color: brandText }]}>Hostel Manager</Text>
                </View>
              </View>
            </View>

            {/* Contact chips */}
            <View style={[styles.contactRow, { borderTopColor: colors.border.light }]}>
              <View style={[styles.contactChip, { backgroundColor: pageBg, borderColor: cardBorder }]}>
                <Mail size={12} color={textTertiary} strokeWidth={2} />
                <Text style={[styles.contactText, { color: textSecondary }]} numberOfLines={1}>
                  {user?.email || 'Not provided'}
                </Text>
              </View>
              <View style={[styles.contactChip, { backgroundColor: pageBg, borderColor: cardBorder }]}>
                <Phone size={12} color={textTertiary} strokeWidth={2} />
                <Text style={[styles.contactText, { color: textSecondary }]} numberOfLines={1}>
                  {user?.phone || 'Not provided'}
                </Text>
              </View>
            </View>
          </Card>
        </View>

        {/* ── Appearance ─────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: textTertiary }]}>APPEARANCE</Text>
          <View style={[styles.row, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            {/* Left accent strip tied to mode */}
            <View style={[styles.rowStrip, { backgroundColor: isDark ? colors.neutral[400] : colors.primary[500] }]} />
            <View style={styles.rowBody}>
              <View style={[styles.rowIconBox, {
                backgroundColor: isDark
                  ? (isDark ? colors.neutral[800] : colors.neutral[100])
                  : brandLight,
              }]}>
                {isDark
                  ? <Moon size={16} color={colors.neutral[300]} strokeWidth={2} />
                  : <Sun  size={16} color={brandColor}           strokeWidth={2} />}
              </View>
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: textPrimary }]}>
                  {isDark ? 'Dark Mode' : 'Light Mode'}
                </Text>
                <Text style={[styles.rowDesc, { color: textSecondary }]}>
                  {isDark ? 'Currently enabled' : 'Currently disabled'}
                </Text>
              </View>
              <Switch
                value={isDark}
                onValueChange={toggleTheme}
                trackColor={{ false: colors.neutral[300], true: brandColor }}
                thumbColor={colors.white}
              />
            </View>
          </View>
        </View>

        {/* ── Settings ───────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: textTertiary }]}>SETTINGS</Text>
          {settingsOptions.map((option, i) => {
            const isLast = i === settingsOptions.length - 1;
            return (
              <TouchableOpacity
                key={i}
                style={[
                  styles.row,
                  { backgroundColor: cardBg, borderColor: cardBorder },
                  !isLast && { marginBottom: spacing.sm },
                ]}
                onPress={() => option.route && router.push(option.route)}
                activeOpacity={0.72}
                disabled={!option.route}>
                <View style={[styles.rowStrip, { backgroundColor: option.accentColor }]} />
                <View style={styles.rowBody}>
                  <View style={[styles.rowIconBox, { backgroundColor: option.accentBg }]}>
                    <option.icon size={16} color={option.accentColor} strokeWidth={2} />
                  </View>
                  <View style={styles.rowText}>
                    <Text style={[styles.rowTitle, { color: textPrimary }]}>{option.title}</Text>
                    <Text style={[styles.rowDesc, { color: textSecondary }]}>{option.description}</Text>
                  </View>
                  {option.route
                    ? <ArrowUpRight size={14} color={textTertiary} strokeWidth={2} />
                    : <View style={[styles.comingSoonChip, { backgroundColor: isDark ? colors.neutral[800] : colors.neutral[100] }]}>
                        <Text style={[styles.comingSoonText, { color: textTertiary }]}>Soon</Text>
                      </View>}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Sign out ───────────────────────────────────────────────────── */}
        <TouchableOpacity
          style={[
            styles.signOutBtn,
            {
              backgroundColor: isDark ? colors.danger[900] : colors.danger[50],
              borderColor:     isDark ? colors.danger[700] : colors.danger[200],
            },
          ]}
          onPress={handleLogout}
          activeOpacity={0.78}>
          <LogOut size={16} color={colors.danger[500]} strokeWidth={2} />
          <Text style={[styles.signOutText, { color: colors.danger[500] }]}>Sign out</Text>
        </TouchableOpacity>

        {/* App version hint */}
        <Text style={[styles.versionText, { color: textTertiary }]}>Hostel Manager · v1.0</Text>

      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({

  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom:     spacing.xxxl,
  },

  // Top bar
  topBar: {
    paddingVertical: spacing.md,
    paddingLeft:     spacing.xs,
  },
  screenTitle: {
    fontFamily:    typography.fontFamily.bold,
    fontSize:      typography.fontSize.xxl,
    letterSpacing: typography.letterSpacing.tight,
  },

  // Profile card
  profileCard: {
    borderRadius:  radius.xl,
    borderWidth:   1,
    overflow:      'hidden',
    marginBottom:  spacing.lg,
    alignItems:    'center',
    paddingTop:    spacing.lg,
    paddingBottom: spacing.lg,
  },
  avatarRing: {
    width:          74,
    height:         74,
    borderRadius:   radius.full,
    borderWidth:    2,
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   spacing.sm,
  },
  avatar: {
    width:          52,
    height:         52,
    borderRadius:   radius.full,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  ownerName: {
    fontFamily:    typography.fontFamily.bold,
    fontSize:      typography.fontSize.lg,
    letterSpacing: typography.letterSpacing.tight,
    marginBottom:  spacing.xs,
  },
  sectionTitle: {
    fontFamily:   typography.fontFamily.semiBold,
    fontSize:     typography.fontSize.md,
    marginBottom: spacing.sm,
    marginLeft:   spacing.xs,
  },
  infoCard: {
    borderRadius: radius.lg,
    borderWidth:  1,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.md,
    marginBottom:  spacing.md,
  },
  infoIconWrap: {
    width:          36,
    height:         36,
    borderRadius:   radius.md,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  heroInfo: { flex: 1 },
  heroName: {
    fontFamily:    typography.fontFamily.bold,
    fontSize:      typography.fontSize.lg,
    letterSpacing: typography.letterSpacing.tight,
    marginBottom:  6,
  },
  rolePill: {
    alignSelf:         'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical:   3,
    borderRadius:      radius.full,
    borderWidth:       1,
  },
  roleText: {
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      9,
    letterSpacing: typography.letterSpacing.wider,
    textTransform: 'uppercase',
  },

  // Contact chips
  contactRow: {
    flexDirection:  'row',
    gap:            spacing.sm,
    paddingTop:     spacing.md,
    borderTopWidth: 1,
  },
  contactChip: {
    flex:              1,
    flexDirection:     'row',
    alignItems:        'center',
    gap:               5,
    paddingHorizontal: spacing.sm,
    paddingVertical:   spacing.sm,
    borderRadius:      radius.md,
    borderWidth:       1,
    overflow:          'hidden',
  },
  contactText: {
    fontFamily: typography.fontFamily.regular,
    fontSize:   typography.fontSize.xs,
    flex:       1,
  },

  // Section
  section:      { marginBottom: spacing.lg },
  sectionLabel: {
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      9,
    letterSpacing: typography.letterSpacing.wider,
    marginBottom:  spacing.sm,
    marginLeft:    spacing.xs,
  },

  // Rows (appearance + settings share this pattern)
  row: {
    flexDirection:  'row',
    alignItems:     'stretch',
    borderRadius:   radius.lg,
    borderWidth:    1,
    overflow:       'hidden',
    marginBottom:   spacing.sm,
  },
  rowStrip: { width: 3 },
  rowBody: {
    flex:              1,
    flexDirection:     'row',
    alignItems:        'center',
    gap:               spacing.md,
    paddingVertical:   spacing.md,
    paddingHorizontal: spacing.md,
  },
  rowIconBox: {
    width:          36,
    height:         36,
    borderRadius:   radius.md,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  rowText: { flex: 1 },
  rowTitle: {
    fontFamily:   typography.fontFamily.semiBold,
    fontSize:     typography.fontSize.md,
    marginBottom: 2,
    letterSpacing: typography.letterSpacing.tight,
  },
  rowDesc: {
    fontFamily: typography.fontFamily.regular,
    fontSize:   typography.fontSize.xs,
  },

  // Coming soon chip
  comingSoonChip: {
    paddingHorizontal: 7,
    paddingVertical:   3,
    borderRadius:      radius.full,
  },
  comingSoonText: {
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      9,
    letterSpacing: typography.letterSpacing.wide,
    textTransform: 'uppercase',
  },

  // Sign out
  signOutBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             spacing.sm,
    borderRadius:    radius.lg,
    paddingVertical: spacing.md,
    borderWidth:     1,
    marginBottom:    spacing.md,
  },
  signOutText: {
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      typography.fontSize.md,
    letterSpacing: typography.letterSpacing.wide,
  },

  // Version
  versionText: {
    fontFamily:  typography.fontFamily.regular,
    fontSize:    10,
    textAlign:   'center',
    letterSpacing: typography.letterSpacing.wide,
  },
});