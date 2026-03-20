import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  Modal,
  Animated,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import ScreenContainer from '@/components/ScreenContainer';
import EmptyState from '@/components/EmptyState';
import Skeleton from '@/components/Skeleton';
import ApiErrorCard from '@/components/ApiErrorCard';
import FAB from '@/components/FAB';
import UpgradeModal from '@/components/UpgradeModal';
import {
  Search,
  SlidersHorizontal,
  Phone,
  Users,
  Archive,
  LogOut,
  ChevronLeft,
  ChevronRight,
  X,
  ArrowRight,
  ArrowUpDown,
} from 'lucide-react-native';
import { spacing, radius } from '@/theme';
import { typography } from '@/theme/typography';
import { useTheme } from '@/context/ThemeContext';
import { useProperty } from '@/context/PropertyContext';
import useResponsiveLayout from '@/hooks/useResponsiveLayout';
import { tenantService, bedService } from '@/services/apiClient';
import type { Tenant, PaginatedResponse } from '@/services/apiTypes';
import { cacheKeys, getScreenCache, setScreenCache, clearScreenCache } from '@/services/screenCache';

const TENANTS_CACHE_STALE_MS   = 30 * 1000;
const MAX_ERROR_MESSAGE_LENGTH = 220;

function normalizeErrorMessage(message?: string): string {
  if (!message) return 'Failed to load tenants';
  const normalized = String(message).replace(/\s+/g, ' ').trim();
  if (!normalized) return 'Failed to load tenants';
  return normalized.length > MAX_ERROR_MESSAGE_LENGTH
    ? `${normalized.slice(0, MAX_ERROR_MESSAGE_LENGTH)}...`
    : normalized;
}

// ── Pill group (reused from PaymentsScreen pattern) ───────────────────────────
function PillGroup<T extends string>({
  options,
  value,
  onChange,
  activeColor,
  activeBg,
  inactiveBg,
  inactiveBorder,
  activeText,
  inactiveText,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
  activeColor: string;
  activeBg: string;
  inactiveBg: string;
  inactiveBorder: string;
  activeText: string;
  inactiveText: string;
}) {
  return (
    <View style={pillStyles.row}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[
              pillStyles.pill,
              {
                backgroundColor: active ? activeBg    : inactiveBg,
                borderColor:     active ? activeColor : inactiveBorder,
              },
            ]}
            onPress={() => onChange(opt.value)}
            activeOpacity={0.75}>
            <Text style={[
              pillStyles.pillText,
              {
                color:      active ? activeText : inactiveText,
                fontFamily: active
                  ? typography.fontFamily.semiBold
                  : typography.fontFamily.regular,
              },
            ]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
const pillStyles = StyleSheet.create({
  row:  { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical:   7,
    borderRadius:      radius.full,
    borderWidth:       1,
  },
  pillText: {
    fontSize:      typography.fontSize.sm,
    letterSpacing: typography.letterSpacing.wide,
  },
});

// ── Avatar initials ───────────────────────────────────────────────────────────
function TenantAvatar({ name, color, archived }: { name: string; color: string; archived: boolean }) {
  const initials = name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  return (
    <View style={[
      avatarStyles.wrap,
      { backgroundColor: archived ? '#94A3B8' : color },
    ]}>
      <Text style={avatarStyles.text}>{initials}</Text>
    </View>
  );
}
const avatarStyles = StyleSheet.create({
  wrap: {
    width:          42,
    height:         42,
    borderRadius:   radius.full,
    alignItems:     'center',
    justifyContent: 'center',
  },
  text: {
    fontFamily: typography.fontFamily.bold,
    fontSize:   typography.fontSize.sm,
    color:      '#FFFFFF',
    letterSpacing: 0.5,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
export default function TenantsScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { isTablet, contentMaxWidth, modalMaxWidth } = useResponsiveLayout();
  const { selectedProperty, selectedPropertyId, loading: propertyLoading } = useProperty();

  const { initialTenants, initialTotal } = (() => {
    if (!selectedPropertyId) return { initialTenants: [], initialTotal: 0 };
    const cacheKey       = cacheKeys.tenants(selectedPropertyId, 1, '', 'all');
    const cachedResponse = getScreenCache<PaginatedResponse<Tenant>>(cacheKey, TENANTS_CACHE_STALE_MS);
    return {
      initialTenants: cachedResponse?.data  || [],
      initialTotal:   cachedResponse?.meta?.total || 0,
    };
  })();

  const [tenants,               setTenants]               = useState<Tenant[]>(initialTenants);
  const [loading,               setLoading]               = useState(false);
  const [refreshing,            setRefreshing]            = useState(false);
  const [error,                 setError]                 = useState<string | null>(null);
  const [total,                 setTotal]                 = useState(initialTotal);
  const [showUpgradeModal,      setShowUpgradeModal]      = useState(false);
  const [checkingBeds,          setCheckingBeds]          = useState(false);
  const [showFilterModal,       setShowFilterModal]       = useState(false);
  const [searchQuery,           setSearchQuery]           = useState('');
  const [selectedStatus,        setSelectedStatus]        = useState<'all' | 'active' | 'vacated'>('all');
  const [sortBy,                setSortBy]                = useState<'latest' | 'oldest'>('latest');
  const [currentPage,           setCurrentPage]           = useState(1);

  const pageSize                   = 50;
  const searchTimeoutRef           = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFocusRefreshRef        = useRef<number>(Date.now());
  const isFetchingRef              = useRef(false);
  const loadingTimeoutRef          = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tenantsCountRef            = useRef(initialTenants.length);
  const hasMountedSearchEffectRef  = useRef(false);

  // Modal animation
  const slideAnim = useRef(new Animated.Value(500)).current;

  const openModal = () => {
    setShowFilterModal(true);
    Animated.spring(slideAnim, {
      toValue: 0, useNativeDriver: true, tension: 65, friction: 11,
    }).start();
  };
  const closeModal = () => {
    Animated.timing(slideAnim, {
      toValue: 500, duration: 220, useNativeDriver: true,
    }).start(() => setShowFilterModal(false));
  };

  useEffect(() => { tenantsCountRef.current = tenants.length; }, [tenants.length]);

  const fetchTenants = useCallback(async (
    page: number    = 1,
    search: string  = '',
    status: string  = 'all',
    forceNetwork    = false,
    sort: string    = 'latest',
  ) => {
    if (!selectedPropertyId) { setLoading(false); return; }
    if (isFetchingRef.current) return;

    const cacheKey = cacheKeys.tenants(selectedPropertyId, page, search, status);
    if (!forceNetwork) {
      const cachedResponse = getScreenCache<PaginatedResponse<Tenant>>(cacheKey, TENANTS_CACHE_STALE_MS);
      if (cachedResponse) {
        setTenants(cachedResponse.data || []);
        setTotal(cachedResponse.meta?.total || 0);
        setError(null);
        return;
      }
    }

    try {
      isFetchingRef.current = true;
      if (!tenantsCountRef.current) {
        setLoading(true);
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = setTimeout(() => {
          setLoading(false);
          if (!tenantsCountRef.current)
            setError('Request is taking longer than expected. Please try again.');
        }, 8000);
      }
      setError(null);

      const statusFilter = status !== 'all' ? status : undefined;
      const tenantsRes   = await tenantService.getTenants(
        selectedPropertyId, search || undefined, statusFilter, page, pageSize, sort as 'latest' | 'oldest'
      );

      if (loadingTimeoutRef.current) { clearTimeout(loadingTimeoutRef.current); loadingTimeoutRef.current = null; }

      if (tenantsRes.data) {
        setTenants(tenantsRes.data);
        setTotal(tenantsRes.meta?.total || 0);
        setScreenCache(cacheKey, tenantsRes);
      }
    } catch (err: any) {
      if (loadingTimeoutRef.current) { clearTimeout(loadingTimeoutRef.current); loadingTimeoutRef.current = null; }
      if (err?.code === 'SUBSCRIPTION_LIMIT_EXCEEDED' || err?.details?.status === 402) {
        setShowUpgradeModal(true);
      } else {
        setError(normalizeErrorMessage(err?.message));
      }
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [selectedPropertyId, sortBy]);

  useEffect(() => {
    if (!selectedPropertyId || propertyLoading) return;
    const cacheKey       = cacheKeys.tenants(selectedPropertyId, 1, '', 'all');
    const cachedResponse = getScreenCache<PaginatedResponse<Tenant>>(cacheKey, TENANTS_CACHE_STALE_MS);
    if (!cachedResponse && tenantsCountRef.current === 0) {
      setLoading(true); setTenants([]); setTotal(0);
      fetchTenants(1, '', 'all', false, sortBy);
    }
  }, [selectedPropertyId, propertyLoading, fetchTenants, sortBy]);

  useEffect(() => {
    if (!hasMountedSearchEffectRef.current) { hasMountedSearchEffectRef.current = true; return; }
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setCurrentPage(1);
      fetchTenants(1, searchQuery, selectedStatus, false, sortBy);
    }, 500);
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, [searchQuery, selectedStatus, sortBy, fetchTenants]);

  useEffect(() => () => { if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current); }, []);

  useFocusEffect(
    useCallback(() => {
      if (!propertyLoading && selectedPropertyId) {
        const cacheKey      = cacheKeys.tenants(selectedPropertyId, currentPage, searchQuery, selectedStatus);
        const hasFreshCache = !!getScreenCache<PaginatedResponse<Tenant>>(cacheKey, TENANTS_CACHE_STALE_MS);
        const now           = Date.now();
        if (!hasFreshCache || now - lastFocusRefreshRef.current > TENANTS_CACHE_STALE_MS) {
          lastFocusRefreshRef.current = now;
          fetchTenants(currentPage, searchQuery, selectedStatus, !hasFreshCache, sortBy);
        }
      }
    }, [propertyLoading, selectedPropertyId, currentPage, searchQuery, selectedStatus, sortBy, fetchTenants])
  );

  const handleRetry   = () => fetchTenants(currentPage, searchQuery, selectedStatus, true, sortBy);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    if (selectedPropertyId) {
      clearScreenCache(`tenants:${selectedPropertyId}:`);
    } else {
      clearScreenCache('tenants:');
    }
    setCurrentPage(1); setSearchQuery(''); setSelectedStatus('all'); setSortBy('latest');
    setTenants([]); setTotal(0);
    if (selectedPropertyId) {
      try { await fetchTenants(1, '', 'all', true, 'latest'); }
      finally { setRefreshing(false); }
    } else { setRefreshing(false); }
  }, [selectedPropertyId, fetchTenants]);

  const handleFabPress = async () => {
    if (!selectedPropertyId || checkingBeds) return;
    setCheckingBeds(true);
    try {
      const response = await bedService.getAvailableBedsByProperty(selectedPropertyId);
      if (!response.data || response.data.length === 0) {
        Alert.alert(
          'No Available Beds',
          'All beds are occupied or none have been added yet. Add a room with beds first.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Add Room', onPress: () => router.push('/room-form') },
          ]
        );
      } else {
        router.push('/add-tenant');
      }
    } catch {
      router.push('/add-tenant');
    } finally {
      setCheckingBeds(false);
    }
  };

  const handleSelectStatus = (status: 'all' | 'active' | 'vacated') => {
    setSelectedStatus(status);
    setCurrentPage(1);
  };
  const handleSelectSort = (sort: 'latest' | 'oldest') => {
    setSortBy(sort);
    setCurrentPage(1);
    fetchTenants(1, searchQuery, selectedStatus, true, sort);
  };

  const getRoomInfo = (tenant: Tenant) =>
    tenant.roomNumber ? `Room ${tenant.roomNumber}` : 'N/A';

  const showEmptyState = !!selectedProperty && !loading && tenants.length === 0 && !error;
  const filtersActive  = selectedStatus !== 'all' || sortBy !== 'latest';
  const totalPages     = Math.ceil(total / pageSize);

  // ── Color aliases ─────────────────────────────────────────────────────────
  const brandColor     = colors.primary[500];
  const brandLight     = isDark ? colors.primary[900] : colors.primary[50];
  const brandText      = isDark ? colors.primary[300] : colors.primary[700];
  const cardBg         = colors.background.secondary;
  const cardBorder     = colors.border.medium;
  const textPrimary    = colors.text.primary;
  const textSecondary  = colors.text.secondary;
  const textTertiary   = colors.text.tertiary;

  const statusOptions: { label: string; value: 'all' | 'active' | 'vacated' }[] = [
    { label: 'All',     value: 'all'     },
    { label: 'Active',  value: 'active'  },
    { label: 'Vacated', value: 'vacated' },
  ];
  const sortOptions: { label: string; value: 'latest' | 'oldest' }[] = [
    { label: 'Latest first', value: 'latest' },
    { label: 'Oldest first', value: 'oldest' },
  ];

  return (
    <ScreenContainer edges={['top']}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.headerLabel, { color: textTertiary }]}>TENANTS</Text>
          <Text style={[styles.headerCount, { color: textPrimary }]}>
            {loading && tenants.length === 0 ? '—' : total}
            <Text style={[styles.headerCountSuffix, { color: textSecondary }]}> total</Text>
          </Text>
        </View>

        <View style={styles.headerActions}>
          {/* Sort quick toggle */}
          <TouchableOpacity
            style={[
              styles.sortBtn,
              {
                backgroundColor: sortBy !== 'latest' ? brandLight : cardBg,
                borderColor:     sortBy !== 'latest' ? brandColor : cardBorder,
              },
            ]}
            onPress={() => handleSelectSort(sortBy === 'latest' ? 'oldest' : 'latest')}
            activeOpacity={0.75}
            disabled={loading || !selectedProperty || !!error}>
            <ArrowUpDown size={14} color={sortBy !== 'latest' ? brandColor : textSecondary} strokeWidth={2} />
            <Text style={[styles.sortBtnText, { color: sortBy !== 'latest' ? brandText : textSecondary }]}>
              {sortBy === 'latest' ? 'Newest' : 'Oldest'}
            </Text>
          </TouchableOpacity>

          {/* Filter */}
          <TouchableOpacity
            style={[
              styles.filterBtn,
              {
                backgroundColor: selectedStatus !== 'all' ? brandColor : cardBg,
                borderColor:     selectedStatus !== 'all' ? brandColor : cardBorder,
              },
            ]}
            onPress={openModal}
            activeOpacity={0.75}
            disabled={loading || !selectedProperty || !!error}>
            <SlidersHorizontal
              size={16}
              color={selectedStatus !== 'all' ? colors.white : brandColor}
              strokeWidth={2}
            />
            {selectedStatus !== 'all' && (
              <View style={[styles.filterDot, { backgroundColor: colors.warning[400] }]} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Search bar ──────────────────────────────────────────────────── */}
      <View style={styles.searchWrap}>
        <View style={[styles.searchBar, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <Search size={16} color={textTertiary} strokeWidth={1.5} />
          <TextInput
            style={[styles.searchInput, { color: textPrimary, fontFamily: typography.fontFamily.regular }]}
            placeholder="Search by name or phone…"
            placeholderTextColor={textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            editable={!!selectedProperty && !loading && !error}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={14} color={textTertiary} strokeWidth={2} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Active filter chips ──────────────────────────────────────────── */}
      {filtersActive && (
        <View style={styles.activeFilters}>
          {selectedStatus !== 'all' && (
            <View style={[styles.activeChip, {
              backgroundColor: brandLight,
              borderColor: isDark ? colors.primary[700] : colors.primary[200],
            }]}>
              <Text style={[styles.activeChipText, { color: brandText }]}>
                {selectedStatus.charAt(0).toUpperCase() + selectedStatus.slice(1)}
              </Text>
              <TouchableOpacity onPress={() => handleSelectStatus('all')} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <X size={11} color={brandText} strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
          )}
          {sortBy !== 'latest' && (
            <View style={[styles.activeChip, {
              backgroundColor: brandLight,
              borderColor: isDark ? colors.primary[700] : colors.primary[200],
            }]}>
              <Text style={[styles.activeChipText, { color: brandText }]}>Oldest first</Text>
              <TouchableOpacity onPress={() => handleSelectSort('latest')} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <X size={11} color={brandText} strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
          )}
          <TouchableOpacity
            onPress={() => { handleSelectStatus('all'); handleSelectSort('latest'); }}
            style={styles.clearAllBtn}>
            <Text style={[styles.clearAllText, { color: textTertiary }]}>Clear all</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── List ────────────────────────────────────────────────────────── */}
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          isTablet && { alignSelf: 'center', width: '100%', maxWidth: contentMaxWidth },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[brandColor]}
            tintColor={brandColor}
          />
        }>

        {loading && tenants.length === 0 ? (
          <Skeleton height={110} count={4} />
        ) : error && selectedProperty ? (
          <ApiErrorCard error={error} onRetry={handleRetry} />
        ) : !selectedProperty ? (
          <EmptyState
            icon={Users}
            title="No Properties Found"
            subtitle="Create your first property to start managing tenants"
            actionLabel="Create Property"
            onActionPress={() => router.push('/property-form')}
          />
        ) : showEmptyState ? (
          <EmptyState
            icon={Users}
            title="No Tenants Yet"
            subtitle="Add tenants to start tracking rent payments and occupancy"
            actionLabel="Add Tenant"
            onActionPress={handleFabPress}
          />
        ) : (
          <>
            {tenants.map((tenant) => {
              const isArchived = tenant.archived === true;
              const isVacated  = tenant.tenantStatus === 'vacated';

              return (
                <TouchableOpacity
                  key={tenant.id}
                  activeOpacity={0.72}
                  onPress={() => router.push(`/tenant-detail?tenantId=${tenant.id}`)}>

                  <View style={[
                    styles.card,
                    { backgroundColor: cardBg, borderColor: cardBorder },
                    isArchived && { opacity: 0.55 },
                  ]}>
                    {/* Left status strip */}
                    <View style={[
                      styles.cardStrip,
                      {
                        backgroundColor: isVacated
                          ? colors.danger[500]
                          : isArchived
                          ? colors.neutral[400]
                          : colors.success[500],
                      },
                    ]} />

                    <View style={styles.cardBody}>
                      {/* Top row — avatar + name + amount */}
                      <View style={styles.cardTop}>
                        <TenantAvatar
                          name={tenant.name}
                          color={brandColor}
                          archived={isArchived}
                        />

                        <View style={styles.cardMid}>
                          <View style={styles.nameRow}>
                            <Text
                              style={[styles.tenantName, { color: textPrimary }]}
                              numberOfLines={1}
                              ellipsizeMode="tail">
                              {tenant.name}
                            </Text>
                            {isVacated && (
                              <View style={[styles.statusChip, {
                                backgroundColor: isDark ? colors.danger[900] : colors.danger[50],
                                borderColor:     isDark ? colors.danger[700] : colors.danger[200],
                              }]}>
                                <LogOut size={9} color={isDark ? colors.danger[300] : colors.danger[600]} strokeWidth={2.5} />
                                <Text style={[styles.statusChipText, { color: isDark ? colors.danger[300] : colors.danger[700] }]}>
                                  Vacated
                                </Text>
                              </View>
                            )}
                            {isArchived && (
                              <View style={[styles.statusChip, {
                                backgroundColor: isDark ? colors.warning[900] : colors.warning[50],
                                borderColor:     isDark ? colors.warning[700] : colors.warning[200],
                              }]}>
                                <Archive size={9} color={isDark ? colors.warning[300] : colors.warning[600]} strokeWidth={2.5} />
                                <Text style={[styles.statusChipText, { color: isDark ? colors.warning[300] : colors.warning[700] }]}>
                                  Archived
                                </Text>
                              </View>
                            )}
                          </View>

                          <View style={styles.phoneRow}>
                            <Phone size={11} color={isArchived ? textTertiary : brandColor} strokeWidth={1.5} />
                            <Text style={[styles.phoneText, { color: textSecondary }]} numberOfLines={1}>
                              {tenant.phone}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.cardRight}>
                          <Text style={[styles.rentAmount, { color: textPrimary }]}>{tenant.rent}</Text>
                          <Text style={[styles.rentLabel, { color: textTertiary }]}>/ month</Text>
                        </View>
                      </View>

                      {/* Bottom row — room + since + arrow */}
                      <View style={[styles.cardMeta, { borderTopColor: colors.border.light }]}>
                        <View style={styles.metaPill}>
                          <Text style={[styles.metaLabel, { color: textTertiary }]}>ROOM</Text>
                          <Text style={[styles.metaValue, { color: textPrimary }]}>{getRoomInfo(tenant)}</Text>
                        </View>
                        <View style={[styles.metaDivider, { backgroundColor: colors.border.light }]} />
                        <View style={styles.metaPill}>
                          <Text style={[styles.metaLabel, { color: textTertiary }]}>SINCE</Text>
                          <Text style={[styles.metaValue, { color: textPrimary }]}>{tenant.joinDate}</Text>
                        </View>
                        <ArrowRight size={14} color={textTertiary} strokeWidth={1.5} style={styles.cardArrow} />
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}

            {/* ── Pagination ── */}
            {total > pageSize && (
              <View style={[styles.pagination, { borderTopColor: colors.border.light }]}>
                <TouchableOpacity
                  style={[styles.pageBtn, {
                    backgroundColor: currentPage === 1 ? colors.background.tertiary : brandColor,
                    borderColor:     currentPage === 1 ? cardBorder               : brandColor,
                  }]}
                  onPress={() => {
                    if (currentPage > 1) {
                      const p = currentPage - 1; setCurrentPage(p);
                      fetchTenants(p, searchQuery, selectedStatus, true, sortBy);
                    }
                  }}
                  disabled={currentPage === 1}
                  activeOpacity={0.75}>
                  <ChevronLeft size={15} color={currentPage === 1 ? textTertiary : colors.white} strokeWidth={2.5} />
                  <Text style={[styles.pageBtnText, { color: currentPage === 1 ? textTertiary : colors.white }]}>Prev</Text>
                </TouchableOpacity>

                <Text style={[styles.pageCount, { color: textSecondary }]}>
                  {currentPage} / {totalPages}
                </Text>

                <TouchableOpacity
                  style={[styles.pageBtn, {
                    backgroundColor: currentPage >= totalPages ? colors.background.tertiary : brandColor,
                    borderColor:     currentPage >= totalPages ? cardBorder               : brandColor,
                  }]}
                  onPress={() => {
                    if (currentPage < totalPages) {
                      const p = currentPage + 1; setCurrentPage(p);
                      fetchTenants(p, searchQuery, selectedStatus, true, sortBy);
                    }
                  }}
                  disabled={currentPage >= totalPages}
                  activeOpacity={0.75}>
                  <Text style={[styles.pageBtnText, { color: currentPage >= totalPages ? textTertiary : colors.white }]}>Next</Text>
                  <ChevronRight size={15} color={currentPage >= totalPages ? textTertiary : colors.white} strokeWidth={2.5} />
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {selectedProperty && !showEmptyState && (
        <FAB onPress={handleFabPress} disabled={checkingBeds} />
      )}

      <UpgradeModal
        visible={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        onSelectPlan={() => setShowUpgradeModal(false)}
      />

      {/* ── Filter Bottom Sheet ──────────────────────────────────────────── */}
      <Modal
        visible={showFilterModal}
        transparent
        animationType="none"
        onRequestClose={closeModal}>
        <View style={[styles.modalOverlay, { backgroundColor: colors.modal.overlay }]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeModal} activeOpacity={1} />

          <Animated.View
            style={[
              styles.sheet,
              isTablet && styles.sheetTablet,
              {
                backgroundColor: colors.background.secondary,
                maxWidth:        isTablet ? modalMaxWidth : undefined,
                transform:       [{ translateY: slideAnim }],
              },
            ]}>

            {/* Handle */}
            <View style={styles.sheetHandle}>
              <View style={[styles.handleBar, { backgroundColor: colors.border.dark }]} />
            </View>

            {/* Header */}
            <View style={[styles.sheetHeader, { borderBottomColor: colors.border.light }]}>
              <Text style={[styles.sheetTitle, { color: textPrimary }]}>Filter Tenants</Text>
              <TouchableOpacity
                onPress={closeModal}
                style={[styles.sheetCloseBtn, { backgroundColor: colors.background.tertiary }]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={15} color={textSecondary} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.sheetBody}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: spacing.lg }}>

              {/* Status */}
              <View style={styles.filterBlock}>
                <Text style={[styles.filterBlockLabel, { color: textTertiary }]}>STATUS</Text>
                <PillGroup
                  options={statusOptions}
                  value={selectedStatus}
                  onChange={handleSelectStatus}
                  activeColor={brandColor}
                  activeBg={brandLight}
                  inactiveBg={colors.background.primary}
                  inactiveBorder={cardBorder}
                  activeText={brandText}
                  inactiveText={textPrimary}
                />
              </View>

              {/* Sort */}
              <View style={styles.filterBlock}>
                <Text style={[styles.filterBlockLabel, { color: textTertiary }]}>SORT ORDER</Text>
                <PillGroup
                  options={sortOptions}
                  value={sortBy}
                  onChange={handleSelectSort}
                  activeColor={brandColor}
                  activeBg={brandLight}
                  inactiveBg={colors.background.primary}
                  inactiveBorder={cardBorder}
                  activeText={brandText}
                  inactiveText={textPrimary}
                />
              </View>

            </ScrollView>

            {/* Footer */}
            <View style={[styles.sheetFooter, { borderTopColor: colors.border.light }]}>
              <TouchableOpacity
                style={[styles.footerClearBtn, {
                  backgroundColor: colors.background.primary,
                  borderColor:     cardBorder,
                  opacity: filtersActive ? 1 : 0.4,
                }]}
                onPress={() => { handleSelectStatus('all'); handleSelectSort('latest'); }}
                disabled={!filtersActive}
                activeOpacity={0.75}>
                <Text style={[styles.footerClearText, { color: textPrimary }]}>Clear all</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.footerApplyBtn, { backgroundColor: brandColor }]}
                onPress={closeModal}
                activeOpacity={0.85}>
                <Text style={[styles.footerApplyText, { color: colors.white }]}>Done</Text>
              </TouchableOpacity>
            </View>

          </Animated.View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({

  // ── Header ───────────────────────────────────────────────────────────────
  header: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'center',
    paddingHorizontal: spacing.md,
    paddingTop:        spacing.lg,
    paddingBottom:     spacing.sm,
  },

  headerLabel: {
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      9,
    letterSpacing: typography.letterSpacing.wider,
    marginBottom:  2,
  },

  headerCount: {
    fontFamily:    typography.fontFamily.bold,
    fontSize:      typography.fontSize.xxl,
    letterSpacing: typography.letterSpacing.tight,
  },

  headerCountSuffix: {
    fontFamily:    typography.fontFamily.regular,
    fontSize:      typography.fontSize.md,
    letterSpacing: 0,
  },

  headerActions: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.sm,
  },

  sortBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               5,
    paddingHorizontal: spacing.sm,
    paddingVertical:   8,
    borderRadius:      radius.md,
    borderWidth:       1,
  },

  sortBtnText: {
    fontFamily: typography.fontFamily.medium,
    fontSize:   typography.fontSize.xs,
    letterSpacing: typography.letterSpacing.wide,
  },

  filterBtn: {
    width:          38,
    height:         38,
    borderRadius:   radius.md,
    alignItems:     'center',
    justifyContent: 'center',
    borderWidth:    1,
    position:       'relative',
  },

  filterDot: {
    position:     'absolute',
    top:    5,
    right:  5,
    width:  6,
    height: 6,
    borderRadius: radius.full,
  },

  // ── Search ────────────────────────────────────────────────────────────────
  searchWrap: {
    paddingHorizontal: spacing.md,
    paddingBottom:     spacing.sm,
  },

  searchBar: {
    flexDirection:     'row',
    alignItems:        'center',
    borderRadius:      radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical:   10,
    borderWidth:       1,
    gap:               spacing.sm,
  },

  searchInput: {
    flex:     1,
    fontSize: typography.fontSize.md,
  },

  // ── Active chips ──────────────────────────────────────────────────────────
  activeFilters: {
    flexDirection:     'row',
    alignItems:        'center',
    flexWrap:          'wrap',
    gap:               spacing.xs,
    paddingHorizontal: spacing.md,
    paddingBottom:     spacing.sm,
  },

  activeChip: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               5,
    paddingHorizontal: spacing.sm,
    paddingVertical:   5,
    borderRadius:      radius.full,
    borderWidth:       1,
  },

  activeChipText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize:   typography.fontSize.xs,
  },

  clearAllBtn: {
    paddingHorizontal: spacing.xs,
    paddingVertical:   5,
  },

  clearAllText: {
    fontFamily:         typography.fontFamily.regular,
    fontSize:           typography.fontSize.xs,
    textDecorationLine: 'underline',
  },

  // ── Scroll ────────────────────────────────────────────────────────────────
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom:     spacing.xxxl,
    paddingTop:        spacing.xs,
  },

  // ── Tenant card ───────────────────────────────────────────────────────────
  card: {
    flexDirection:  'row',
    borderRadius:   radius.lg,
    borderWidth:    1,
    marginBottom:   spacing.sm,
    overflow:       'hidden',
  },

  cardStrip: { width: 3 },

  cardBody: {
    flex:    1,
    padding: spacing.md,
  },

  cardTop: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            spacing.sm,
    marginBottom:   spacing.sm,
  },

  cardMid: {
    flex: 1,
  },

  nameRow: {
    flexDirection: 'row',
    alignItems:    'center',
    flexWrap:      'wrap',
    gap:           spacing.xs,
    marginBottom:  3,
  },

  tenantName: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize:   typography.fontSize.md,
    flexShrink: 1,
  },

  statusChip: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               3,
    paddingHorizontal: 6,
    paddingVertical:   2,
    borderRadius:      radius.full,
    borderWidth:       1,
  },

  statusChipText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize:   9,
  },

  phoneRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
  },

  phoneText: {
    fontFamily: typography.fontFamily.regular,
    fontSize:   typography.fontSize.xs,
  },

  cardRight: { alignItems: 'flex-end' },

  rentAmount: {
    fontFamily:    typography.fontFamily.bold,
    fontSize:      typography.fontSize.md,
    letterSpacing: typography.letterSpacing.tight,
  },

  rentLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize:   9,
    marginTop:  1,
  },

  cardMeta: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingTop:     spacing.sm,
    borderTopWidth: 1,
    gap:            spacing.sm,
  },

  metaPill: { gap: 2 },

  metaLabel: {
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      8,
    letterSpacing: typography.letterSpacing.wider,
  },

  metaValue: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize:   typography.fontSize.xs,
  },

  metaDivider: {
    width:  1,
    height: 24,
  },

  cardArrow: { marginLeft: 'auto' },

  // ── Pagination ────────────────────────────────────────────────────────────
  pagination: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingVertical:   spacing.lg,
    borderTopWidth:    1,
    marginTop:         spacing.xs,
  },

  pageBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm,
    borderRadius:      radius.md,
    borderWidth:       1,
    minWidth:          80,
    justifyContent:    'center',
  },

  pageBtnText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize:   typography.fontSize.sm,
  },

  pageCount: {
    fontFamily: typography.fontFamily.medium,
    fontSize:   typography.fontSize.sm,
  },

  // ── Bottom sheet ──────────────────────────────────────────────────────────
  modalOverlay: {
    flex:           1,
    justifyContent: 'flex-end',
  },

  sheet: {
    borderTopLeftRadius:  24,
    borderTopRightRadius: 24,
    maxHeight:            '75%',
  },

  sheetTablet: {
    width:                   '100%',
    alignSelf:               'center',
    borderBottomLeftRadius:  24,
    borderBottomRightRadius: 24,
  },

  sheetHandle: {
    alignItems:    'center',
    paddingTop:    spacing.sm,
    paddingBottom: spacing.xs,
  },

  handleBar: {
    width:        40,
    height:       4,
    borderRadius: 2,
    opacity:      0.4,
  },

  sheetHeader: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'center',
    paddingHorizontal: spacing.lg,
    paddingVertical:   spacing.md,
    borderBottomWidth: 1,
  },

  sheetTitle: {
    fontFamily:    typography.fontFamily.bold,
    fontSize:      typography.fontSize.lg,
    letterSpacing: typography.letterSpacing.tight,
  },

  sheetCloseBtn: {
    width:          32,
    height:         32,
    borderRadius:   radius.md,
    alignItems:     'center',
    justifyContent: 'center',
  },

  sheetBody: {
    paddingHorizontal: spacing.lg,
    paddingTop:        spacing.lg,
  },

  filterBlock: { marginBottom: spacing.xl },

  filterBlockLabel: {
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      9,
    letterSpacing: typography.letterSpacing.wider,
    marginBottom:  spacing.md,
  },

  sheetFooter: {
    flexDirection:     'row',
    gap:               spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical:   spacing.md,
    borderTopWidth:    1,
  },

  footerClearBtn: {
    flex:            1,
    paddingVertical: spacing.md,
    borderRadius:    radius.md,
    alignItems:      'center',
    borderWidth:     1,
  },

  footerClearText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize:   typography.fontSize.md,
  },

  footerApplyBtn: {
    flex:            1.8,
    paddingVertical: spacing.md,
    borderRadius:    radius.md,
    alignItems:      'center',
  },

  footerApplyText: {
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      typography.fontSize.md,
    letterSpacing: typography.letterSpacing.wide,
  },
});