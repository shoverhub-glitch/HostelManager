import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import EmptyState from '@/components/EmptyState';
import Skeleton from '@/components/Skeleton';
import ApiErrorCard from '@/components/ApiErrorCard';
import {
  ChevronLeft,
  Bed as BedIcon,
  User,
  Wrench,
  CheckCircle,
  XCircle,
} from 'lucide-react-native';
import { spacing, radius } from '@/theme';
import { typography } from '@/theme/typography';
import { useTheme } from '@/context/ThemeContext';
import { useProperty } from '@/context/PropertyContext';
import { bedService, roomService, tenantService } from '@/services/apiClient';
import type { Bed, Room, Tenant } from '@/services/apiTypes';
import { cacheKeys, getScreenCache, setScreenCache } from '@/services/screenCache';
import useResponsiveLayout from '@/hooks/useResponsiveLayout';

interface ManageBedsCachePayload {
  beds: Bed[];
  room: Room | null;
  tenants: Tenant[];
}

const MANAGE_BEDS_CACHE_STALE_MS = 30 * 1000;

export default function ManageBedsScreen() {
  const { colors, isDark }     = useTheme();
  const { isTablet, contentMaxWidth } = useResponsiveLayout();
  const router                 = useRouter();
  const { roomId }             = useLocalSearchParams<{ roomId: string }>();
  const { selectedPropertyId } = useProperty();

  const [beds,      setBeds]      = useState<Bed[]>([]);
  const [room,      setRoom]      = useState<Room | null>(null);
  const [tenants,   setTenants]   = useState<Tenant[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [refreshing,setRefreshing]= useState(false);

  // ── Color aliases ─────────────────────────────────────────────────────────
  const brandColor    = colors.primary[500];
  const brandLight    = isDark ? colors.primary[900] : colors.primary[50];
  const brandText     = isDark ? colors.primary[300] : colors.primary[600];
  const successColor  = colors.success[500];
  const successLight  = isDark ? colors.success[900] : colors.success[50];
  const successText   = isDark ? colors.success[300] : colors.success[600];
  const warningColor  = colors.warning[500];
  const warningLight  = isDark ? colors.warning[900] : colors.warning[50];
  const warningText   = isDark ? colors.warning[300] : colors.warning[700];
  const dangerColor   = colors.danger[500];
  const dangerLight   = isDark ? colors.danger[900] : colors.danger[50];
  const dangerText    = isDark ? colors.danger[300] : colors.danger[600];
  const cardBg        = colors.background.secondary;
  const cardBorder    = colors.border.medium;
  const pageBg        = colors.background.primary;
  const textPrimary   = colors.text.primary;
  const textSecondary = colors.text.secondary;
  const textTertiary  = colors.text.tertiary;

  // ── Data fetching ─────────────────────────────────────────────────────────
  const fetchData = async () => {
    if (!roomId || !selectedPropertyId) { setLoading(false); return; }

    const cacheKey   = cacheKeys.manageBeds(selectedPropertyId, roomId);
    const cachedData = getScreenCache<ManageBedsCachePayload>(cacheKey, MANAGE_BEDS_CACHE_STALE_MS);
    if (cachedData) {
      setBeds(cachedData.beds); setRoom(cachedData.room); setTenants(cachedData.tenants);
      setError(null); setLoading(false); return;
    }

    try {
      setLoading(true); setError(null);
      const [bedsRes, roomRes, tenantsRes] = await Promise.all([
        bedService.getBeds(roomId, selectedPropertyId),
        roomService.getRoomById(roomId),
        tenantService.getTenants(selectedPropertyId),
      ]);

      const nextBeds    = (bedsRes.data    || []).filter((b: Bed)    => b.roomId === roomId);
      const nextRoom    = roomRes.data     || null;
      const nextTenants = (tenantsRes.data || []).filter((t: Tenant) => t.roomId === roomId);

      setBeds(nextBeds); setRoom(nextRoom); setTenants(nextTenants);
      setScreenCache(cacheKey, { beds: nextBeds, room: nextRoom, tenants: nextTenants });
    } catch (err: any) {
      setError(err?.message || 'Failed to load beds');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchData(); }, [roomId, selectedPropertyId]));

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await fetchData(); } finally { setRefreshing(false); }
  }, [roomId, selectedPropertyId]);

  const getTenantForBed = (bedId: string) => tenants.find(t => t.bedId === bedId);

  // ── Bed status config ─────────────────────────────────────────────────────
  function bedStatusConfig(status: string) {
    if (status === 'occupied')    return { label: 'Occupied',    color: dangerColor,  light: dangerLight,  text: dangerText,  Icon: XCircle };
    if (status === 'maintenance') return { label: 'Maintenance', color: warningColor, light: warningLight, text: warningText, Icon: Wrench };
    return                               { label: 'Available',   color: successColor, light: successLight, text: successText, Icon: CheckCircle };
  }

  // ── Shared nav bar ────────────────────────────────────────────────────────
  const NavBar = () => (
    <View style={[styles.navBar, { backgroundColor: cardBg, borderBottomColor: colors.border.light }]}>
      <TouchableOpacity style={styles.navBack} onPress={() => router.back()} activeOpacity={0.7}>
        <ChevronLeft size={22} color={textPrimary} strokeWidth={2} />
      </TouchableOpacity>
      <Text style={[styles.navTitle, { color: textPrimary }]}>Manage Beds</Text>
      <View style={styles.navSpacer} />
    </View>
  );

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: pageBg }]} edges={['top','bottom']}>
        <NavBar />
        <ScrollView
          contentContainerStyle={[styles.scroll, isTablet && { alignSelf: 'center', width: '100%', maxWidth: contentMaxWidth }]}
          showsVerticalScrollIndicator={false}>
          <Skeleton height={90} count={4} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── No room ───────────────────────────────────────────────────────────────
  if (!room) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: pageBg }]} edges={['top','bottom']}>
        <NavBar />
        <EmptyState icon={BedIcon} title="Room Not Found" subtitle="The selected room could not be found" />
      </SafeAreaView>
    );
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  const availableCount    = beds.filter(b => b.status === 'available').length;
  const occupiedCount     = beds.filter(b => b.status === 'occupied').length;
  const maintenanceCount  = beds.filter(b => b.status === 'maintenance').length;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: pageBg }]} edges={['top','bottom']}>
      <NavBar />

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          isTablet && { alignSelf: 'center', width: '100%', maxWidth: contentMaxWidth },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[brandColor]} tintColor={brandColor} />
        }>

        {error ? <ApiErrorCard error={error} onRetry={fetchData} /> : (
          <>
            {/* ── Room summary card ────────────────────────────────────── */}
            <View style={[styles.summaryCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
              <View style={[styles.summaryStrip, { backgroundColor: brandColor }]} />
              <View style={styles.summaryBody}>
                <View style={styles.summaryTop}>
                  <View style={[styles.summaryIconBox, { backgroundColor: brandLight }]}>
                    <BedIcon size={18} color={brandText} strokeWidth={2} />
                  </View>
                  <View>
                    <Text style={[styles.summaryRoomLabel, { color: textTertiary }]}>ROOM</Text>
                    <Text style={[styles.summaryRoomNumber, { color: textPrimary }]}>
                      {room.roomNumber}
                    </Text>
                  </View>
                  <View style={[styles.bedCountChip, { backgroundColor: brandLight, borderColor: isDark ? colors.primary[700] : colors.primary[200] }]}>
                    <Text style={[styles.bedCountText, { color: brandText }]}>
                      {beds.length} {beds.length === 1 ? 'bed' : 'beds'}
                    </Text>
                  </View>
                </View>

                {/* Quick stats */}
                <View style={[styles.statsRow, { borderTopColor: colors.border.light }]}>
                  <View style={styles.stat}>
                    <Text style={[styles.statValue, { color: successColor }]}>{availableCount}</Text>
                    <Text style={[styles.statLabel, { color: textTertiary }]}>Free</Text>
                  </View>
                  <View style={[styles.statDivider, { backgroundColor: colors.border.light }]} />
                  <View style={styles.stat}>
                    <Text style={[styles.statValue, { color: dangerColor }]}>{occupiedCount}</Text>
                    <Text style={[styles.statLabel, { color: textTertiary }]}>Occupied</Text>
                  </View>
                  <View style={[styles.statDivider, { backgroundColor: colors.border.light }]} />
                  <View style={styles.stat}>
                    <Text style={[styles.statValue, { color: warningColor }]}>{maintenanceCount}</Text>
                    <Text style={[styles.statLabel, { color: textTertiary }]}>Maintenance</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* ── Bed list ─────────────────────────────────────────────── */}
            {beds.length === 0 ? (
              <EmptyState icon={BedIcon} title="No Beds Found" subtitle="This room has no beds configured" />
            ) : (
              beds.map((bed, index) => {
                const tenant = getTenantForBed(bed.id);
                const sc     = bedStatusConfig(bed.status);
                const StatusIcon = sc.Icon;

                return (
                  <View
                    key={index}
                    style={[
                      styles.bedCard,
                      { backgroundColor: cardBg, borderColor: cardBorder },
                    ]}>
                    {/* Left accent strip — color = status */}
                    <View style={[styles.bedStrip, { backgroundColor: sc.color }]} />

                    <View style={styles.bedBody}>
                      {/* Top row: icon + bed number + status pill */}
                      <View style={styles.bedTop}>
                        <View style={[styles.bedIconBox, { backgroundColor: brandLight }]}>
                          <BedIcon size={16} color={brandText} strokeWidth={2} />
                        </View>
                        <Text style={[styles.bedNumber, { color: textPrimary }]}>
                          Bed {bed.bedNumber}
                        </Text>
                        <View style={[styles.statusPill, { backgroundColor: sc.light, borderColor: isDark ? `${sc.color}60` : `${sc.color}40` }]}>
                          <StatusIcon size={11} color={sc.color} strokeWidth={2.5} />
                          <Text style={[styles.statusPillText, { color: sc.color }]}>{sc.label}</Text>
                        </View>
                      </View>

                      {/* Tenant row (if occupied) */}
                      {tenant && (
                        <View style={[styles.tenantRow, { borderTopColor: colors.border.light }]}>
                          <View style={[styles.tenantIconBox, { backgroundColor: isDark ? colors.neutral[800] : colors.neutral[100] }]}>
                            <User size={13} color={textTertiary} strokeWidth={2} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.tenantLabel, { color: textTertiary }]}>TENANT</Text>
                            <Text style={[styles.tenantName, { color: textPrimary }]}>{tenant.name}</Text>
                          </View>
                        </View>
                      )}

                      {/* Maintenance note */}
                      {bed.status === 'maintenance' && (
                        <View style={[styles.maintenanceBanner, { backgroundColor: warningLight, borderColor: isDark ? colors.warning[700] : colors.warning[200] }]}>
                          <Wrench size={13} color={warningColor} strokeWidth={2} />
                          <Text style={[styles.maintenanceBannerText, { color: warningText }]}>
                            This bed is currently under maintenance
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Nav bar
  navBar: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.md,
    borderBottomWidth: 1,
  },
  navBack:    { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  navTitle:   { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.lg, letterSpacing: typography.letterSpacing.tight },
  navSpacer:  { width: 36 },

  scroll: {
    paddingHorizontal: spacing.md,
    paddingTop:        spacing.md,
    paddingBottom:     spacing.xxxl,
  },

  // Summary card
  summaryCard: {
    flexDirection:  'row',
    alignItems:     'stretch',
    borderRadius:   radius.xl,
    borderWidth:    1,
    overflow:       'hidden',
    marginBottom:   spacing.md,
  },
  summaryStrip: { width: 3 },
  summaryBody:  { flex: 1, padding: spacing.md },
  summaryTop: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            spacing.md,
    marginBottom:   spacing.md,
  },
  summaryIconBox: {
    width:          38,
    height:         38,
    borderRadius:   radius.md,
    alignItems:     'center',
    justifyContent: 'center',
  },
  summaryRoomLabel: {
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      9,
    letterSpacing: typography.letterSpacing.wider,
    marginBottom:  2,
  },
  summaryRoomNumber: {
    fontFamily:    typography.fontFamily.bold,
    fontSize:      typography.fontSize.lg,
    letterSpacing: typography.letterSpacing.tight,
  },
  bedCountChip: {
    marginLeft:        'auto',
    paddingHorizontal: spacing.sm,
    paddingVertical:   4,
    borderRadius:      radius.full,
    borderWidth:       1,
  },
  bedCountText: {
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      typography.fontSize.xs,
    letterSpacing: typography.letterSpacing.wide,
  },

  // Stats row inside summary
  statsRow: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingTop:     spacing.md,
    borderTopWidth: 1,
  },
  stat:        { flex: 1, alignItems: 'center' },
  statValue: {
    fontFamily:    typography.fontFamily.bold,
    fontSize:      typography.fontSize.xl,
    letterSpacing: typography.letterSpacing.tight,
  },
  statLabel: {
    fontFamily:    typography.fontFamily.regular,
    fontSize:      9,
    letterSpacing: typography.letterSpacing.wide,
    textTransform: 'uppercase',
    marginTop:     2,
  },
  statDivider: { width: 1, height: 30 },

  // Bed card
  bedCard: {
    flexDirection:  'row',
    alignItems:     'stretch',
    borderRadius:   radius.lg,
    borderWidth:    1,
    marginBottom:   spacing.sm,
    overflow:       'hidden',
  },
  bedStrip: { width: 3 },
  bedBody: {
    flex:    1,
    padding: spacing.md,
    gap:     spacing.sm,
  },

  // Bed top row
  bedTop: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.sm,
  },
  bedIconBox: {
    width:          32,
    height:         32,
    borderRadius:   radius.md,
    alignItems:     'center',
    justifyContent: 'center',
  },
  bedNumber: {
    flex:          1,
    fontFamily:    typography.fontFamily.bold,
    fontSize:      typography.fontSize.md,
    letterSpacing: typography.letterSpacing.tight,
  },
  statusPill: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    paddingHorizontal: 8,
    paddingVertical:   3,
    borderRadius:      radius.full,
    borderWidth:       1,
  },
  statusPillText: {
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      9,
    letterSpacing: typography.letterSpacing.wide,
    textTransform: 'uppercase',
  },

  // Tenant row
  tenantRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            spacing.sm,
    paddingTop:     spacing.sm,
    borderTopWidth: 1,
  },
  tenantIconBox: {
    width:          28,
    height:         28,
    borderRadius:   radius.sm,
    alignItems:     'center',
    justifyContent: 'center',
  },
  tenantLabel: {
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      9,
    letterSpacing: typography.letterSpacing.wider,
    marginBottom:  1,
  },
  tenantName: {
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      typography.fontSize.sm,
    letterSpacing: typography.letterSpacing.tight,
  },

  // Maintenance banner
  maintenanceBanner: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm,
    borderRadius:      radius.md,
    borderWidth:       1,
  },
  maintenanceBannerText: {
    fontFamily: typography.fontFamily.medium,
    fontSize:   typography.fontSize.xs,
    flex:       1,
  },
});