import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import ScreenContainer from '@/components/ScreenContainer';
import PropertyDropdown from '@/components/PropertyDropdown';
import EmptyState from '@/components/EmptyState';
import {
  Building2,
  MapPin,
  ArrowUpRight,
  DoorOpen,
  Users,
  Hash,
  Fingerprint,
} from 'lucide-react-native';
import { spacing, radius } from '@/theme';
import { typography } from '@/theme/typography';
import { useTheme } from '@/context/ThemeContext';
import { useProperty } from '@/context/PropertyContext';

const maskId = (id: string): string => {
  if (!id || id.length <= 8) return id;
  return `${id.substring(0, 4)}···${id.substring(id.length - 4)}`;
};

export default function MyPropertyScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { selectedProperty, loading: propertyLoading } = useProperty();

  // ── Color aliases ─────────────────────────────────────────────────────────
  const brandColor    = colors.primary[500];
  const brandLight    = isDark ? colors.primary[900] : colors.primary[50];
  const brandText     = isDark ? colors.primary[300] : colors.primary[600];
  const successColor  = colors.success[500];
  const successLight  = isDark ? colors.success[900] : colors.success[50];
  const successText   = isDark ? colors.success[300] : colors.success[600];
  const cardBg        = colors.background.secondary;
  const cardBorder    = colors.border.medium;
  const pageBg        = colors.background.primary;
  const textPrimary   = colors.text.primary;
  const textSecondary = colors.text.secondary;
  const textTertiary  = colors.text.tertiary;

  const manageOptions = [
    {
      icon:        DoorOpen,
      title:       'Manage Rooms',
      description: 'Add and configure property rooms',
      color:       brandColor,
      iconBg:      brandLight,
      iconText:    brandText,
      route:       '/manage-rooms',
    },
    {
      icon:        Users,
      title:       'Manage Staff',
      description: 'Manage your staff members',
      color:       successColor,
      iconBg:      successLight,
      iconText:    successText,
      route:       '/manage-staff',
    },
  ];

  // ── Loading state ─────────────────────────────────────────────────────────
  if (propertyLoading) {
    return (
      <ScreenContainer edges={['top']}>
        <View style={[styles.topBar]}>
          <Text style={[styles.screenTitle, { color: textPrimary }]}>My Property</Text>
        </View>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={brandColor} />
        </View>
      </ScreenContainer>
    );
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  if (!selectedProperty) {
    return (
      <ScreenContainer edges={['top']}>
        <View style={styles.topBar}>
          <Text style={[styles.screenTitle, { color: textPrimary }]}>My Property</Text>
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <EmptyState
            icon={Building2}
            title="No Property Found"
            subtitle="Create your first property to get started"
            actionLabel="Create Property"
            onActionPress={() => router.push('/property-form')}
          />
        </ScrollView>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={['top']}>
      <View style={styles.topBar}>
        <Text style={[styles.screenTitle, { color: textPrimary }]}>My Property</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { backgroundColor: pageBg }]}
        showsVerticalScrollIndicator={false}>

        {/* ── Property Hero Card ─────────────────────────────────────────── */}
        <View style={[styles.heroCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          {/* Top accent strip */}
          <View style={[styles.heroStrip, { backgroundColor: brandColor }]} />

          <View style={styles.heroBody}>
            {/* Icon + name */}
            <View style={styles.heroHeader}>
              <View style={[styles.heroIconBox, { backgroundColor: brandLight }]}>
                <Building2 size={22} color={brandText} strokeWidth={2} />
              </View>
              <View style={styles.heroInfo}>
                <Text style={[styles.heroName, { color: textPrimary }]} numberOfLines={1}>
                  {selectedProperty.name}
                </Text>
                {selectedProperty.address && (
                  <View style={styles.heroAddressRow}>
                    <MapPin size={12} color={textTertiary} strokeWidth={1.5} />
                    <Text style={[styles.heroAddress, { color: textSecondary }]} numberOfLines={2}>
                      {selectedProperty.address}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* ID pills */}
            <View style={[styles.idRow, { borderTopColor: colors.border.light }]}>
              <View style={[styles.idPill, { backgroundColor: pageBg, borderColor: cardBorder }]}>
                <Fingerprint size={12} color={textTertiary} strokeWidth={2} />
                <Text style={[styles.idPillLabel, { color: textTertiary }]}>OWNER</Text>
                <Text style={[styles.idPillValue, { color: textSecondary }]}>
                  {maskId(selectedProperty.ownerId) || 'N/A'}
                </Text>
              </View>
              <View style={[styles.idPill, { backgroundColor: pageBg, borderColor: cardBorder }]}>
                <Hash size={12} color={textTertiary} strokeWidth={2} />
                <Text style={[styles.idPillLabel, { color: textTertiary }]}>PROPERTY</Text>
                <Text style={[styles.idPillValue, { color: textSecondary }]}>
                  {maskId(selectedProperty.id)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Property Switcher ─────────────────────────────────────────── */}
        <PropertyDropdown />

        {/* ── Manage Options ────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: textPrimary }]}>Manage Property</Text>

          {manageOptions.map((option, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.optionRow,
                { backgroundColor: cardBg, borderColor: cardBorder },
                index < manageOptions.length - 1 && { marginBottom: spacing.sm },
              ]}
              onPress={() => router.push(option.route as any)}
              activeOpacity={0.72}>

              {/* Left accent */}
              <View style={[styles.optionAccent, { backgroundColor: option.color }]} />

              <View style={styles.optionBody}>
                <View style={[styles.optionIconBox, { backgroundColor: option.iconBg }]}>
                  <option.icon size={18} color={option.iconText} strokeWidth={2} />
                </View>
                <View style={styles.optionText}>
                  <Text style={[styles.optionTitle, { color: textPrimary }]}>{option.title}</Text>
                  <Text style={[styles.optionDesc, { color: textSecondary }]}>{option.description}</Text>
                </View>
                <ArrowUpRight size={15} color={textTertiary} strokeWidth={2} />
              </View>
            </TouchableOpacity>
          ))}
        </View>

      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({

  // Top bar
  topBar: {
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.md,
  },
  screenTitle: {
    fontFamily:    typography.fontFamily.bold,
    fontSize:      typography.fontSize.xxl,
    letterSpacing: typography.letterSpacing.tight,
  },

  loadingBox: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
  },

  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom:     spacing.xxxl,
  },

  // Hero card
  heroCard: {
    borderRadius:  radius.xl,
    borderWidth:   1,
    overflow:      'hidden',
    marginBottom:  spacing.md,
  },
  heroStrip: {
    height: 3,
  },
  heroBody: {
    padding: spacing.md,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    gap:           spacing.md,
    marginBottom:  spacing.md,
  },
  heroIconBox: {
    width:          44,
    height:         44,
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
    marginBottom:  4,
  },
  heroAddressRow: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    gap:           4,
  },
  heroAddress: {
    fontFamily:  typography.fontFamily.regular,
    fontSize:    typography.fontSize.xs,
    flex:        1,
    lineHeight:  16,
  },

  // ID pills row
  idRow: {
    flexDirection:  'row',
    gap:            spacing.sm,
    paddingTop:     spacing.md,
    borderTopWidth: 1,
  },
  idPill: {
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
  idPillLabel: {
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      9,
    letterSpacing: typography.letterSpacing.wider,
  },
  idPillValue: {
    fontFamily:    typography.fontFamily.medium,
    fontSize:      typography.fontSize.xs,
    letterSpacing: typography.letterSpacing.wide,
    flex:          1,
  },

  // Section
  section:      { marginBottom: spacing.lg },
  sectionTitle: {
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      typography.fontSize.md,
    letterSpacing: typography.letterSpacing.normal,
    marginBottom:  spacing.sm,
  },

  // Option rows
  optionRow: {
    flexDirection:  'row',
    alignItems:     'stretch',
    borderRadius:   radius.lg,
    borderWidth:    1,
    overflow:       'hidden',
  },
  optionAccent: {
    width: 3,
  },
  optionBody: {
    flex:           1,
    flexDirection:  'row',
    alignItems:     'center',
    gap:            spacing.md,
    paddingVertical:   spacing.md,
    paddingHorizontal: spacing.md,
  },
  optionIconBox: {
    width:          40,
    height:         40,
    borderRadius:   radius.md,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  optionText: { flex: 1 },
  optionTitle: {
    fontFamily:   typography.fontFamily.semiBold,
    fontSize:     typography.fontSize.md,
    marginBottom: 2,
    letterSpacing: typography.letterSpacing.tight,
  },
  optionDesc: {
    fontFamily: typography.fontFamily.regular,
    fontSize:   typography.fontSize.xs,
  },
});