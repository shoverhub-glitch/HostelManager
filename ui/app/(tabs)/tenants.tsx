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
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import ScreenContainer from '@/components/ScreenContainer';
import StatusBadge from '@/components/StatusBadge';
import Card from '@/components/Card';
import EmptyState from '@/components/EmptyState';
import Skeleton from '@/components/Skeleton';
import ApiErrorCard from '@/components/ApiErrorCard';
import FAB from '@/components/FAB';
import UpgradeModal from '@/components/UpgradeModal';
import { Search, Filter, Phone, Users, Archive, LogOut, ChevronLeft, ChevronRight, Check } from 'lucide-react-native';
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

export default function TenantsScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { isTablet, contentMaxWidth, modalMaxWidth } = useResponsiveLayout();
  const { selectedProperty, selectedPropertyId, loading: propertyLoading } = useProperty();

  const { initialTenants, initialTotal } = (() => {
    if (!selectedPropertyId) return { initialTenants: [], initialTotal: 0 };
    const cacheKey      = cacheKeys.tenants(selectedPropertyId, 1, '', 'all');
    const cachedResponse = getScreenCache<PaginatedResponse<Tenant>>(cacheKey, TENANTS_CACHE_STALE_MS);
    return {
      initialTenants: cachedResponse?.data || [],
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
  const [showStatusFilterModal, setShowStatusFilterModal] = useState(false);
  const [searchQuery,           setSearchQuery]           = useState('');
  const [selectedStatus,        setSelectedStatus]        = useState<'all' | 'active' | 'vacated'>('all');
  const [sortBy,                setSortBy]                = useState<'latest' | 'oldest'>('latest');
  const [currentPage,           setCurrentPage]           = useState(1);

  const pageSize             = 50;
  const searchTimeoutRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFocusRefreshRef  = useRef<number>(Date.now());
  const isFetchingRef        = useRef(false);
  const loadingTimeoutRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tenantsCountRef      = useRef(initialTenants.length);
  const hasMountedSearchEffectRef = useRef(false);

  useEffect(() => { tenantsCountRef.current = tenants.length; }, [tenants.length]);

  const fetchTenants = useCallback(async (
    page: number = 1,
    search: string = '',
    status: string = 'all',
    forceNetwork: boolean = false,
    sort: string = 'latest',
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
        const cacheKey        = cacheKeys.tenants(selectedPropertyId, currentPage, searchQuery, selectedStatus);
        const hasFreshCache   = !!getScreenCache<PaginatedResponse<Tenant>>(cacheKey, TENANTS_CACHE_STALE_MS);
        const now             = Date.now();
        const timeSince       = now - lastFocusRefreshRef.current;
        if (!hasFreshCache || timeSince > TENANTS_CACHE_STALE_MS) {
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
      // On error, fall through to add-tenant which will handle it gracefully
      router.push('/add-tenant');
    } finally {
      setCheckingBeds(false);
    }
  };

  const handleSelectStatusFilter = (status: 'all' | 'active' | 'vacated') => {
    setShowStatusFilterModal(false); setCurrentPage(1); setSelectedStatus(status);
  };

  const handleSelectSort = (sort: 'latest' | 'oldest') => {
    setCurrentPage(1); setSortBy(sort);
    fetchTenants(1, searchQuery, selectedStatus, true, sort);
  };

  const getRoomInfo = (tenant: Tenant) =>
    tenant.roomNumber ? `Room ${tenant.roomNumber}` : 'N/A';

  const showEmptyState = !!selectedProperty && !loading && tenants.length === 0 && !error;
  const filtersActive  = selectedStatus !== 'all' || sortBy !== 'latest';
  const totalPages     = Math.ceil(total / pageSize);

  return (
    <ScreenContainer edges={['top']}>

      {/* ── Screen Header ── */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Tenants</Text>
        <View style={[styles.countPill, { backgroundColor: isDark ? colors.neutral[800] : colors.neutral[100] }]}>
          <Text style={[styles.countText, { color: colors.text.secondary }]}>
            {loading && tenants.length === 0 ? '—' : total} total
          </Text>
        </View>
      </View>

      {/* ── Search + Filter ── */}
      <View style={styles.searchContainer}>
        <View style={[
          styles.searchBar,
          { backgroundColor: colors.background.secondary, borderColor: colors.border.medium },
        ]}>
          <Search size={18} color={colors.text.tertiary} strokeWidth={1.5} />
          <TextInput
            style={[styles.searchInput, { color: colors.text.primary, fontFamily: typography.fontFamily.regular }]}
            placeholder="Search by name, phone…"
            placeholderTextColor={colors.text.tertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            editable={!!selectedProperty && !loading && !error}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[styles.clearBtn, { color: colors.text.tertiary }]}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[
            styles.filterButton,
            {
              backgroundColor: filtersActive
                ? (isDark ? colors.primary[900] : colors.primary[50])
                : colors.background.secondary,
              borderColor: filtersActive ? colors.primary[400] : colors.border.medium,
            },
          ]}
          activeOpacity={0.7}
          onPress={() => setShowStatusFilterModal(true)}
          disabled={loading || !selectedProperty || !!error}>
          <Filter
            size={18}
            color={filtersActive ? colors.primary[500] : colors.text.secondary}
            strokeWidth={1.5}
          />
          {filtersActive && (
            <View style={[styles.filterDot, { backgroundColor: colors.primary[500] }]} />
          )}
        </TouchableOpacity>
      </View>

      {/* ── List ── */}
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
            colors={[colors.primary[500]]}
            tintColor={colors.primary[500]}
          />
        }>

        {loading && tenants.length === 0 ? (
          <Skeleton height={200} count={3} />
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
            {tenants.map((tenant) => (
              <Card
                key={tenant.id}
                style={[styles.tenantCard, tenant.archived === true && { opacity: 0.6 }] as any}>
                <TouchableOpacity
                  onPress={() => router.push(`/tenant-detail?tenantId=${tenant.id}`)}
                  activeOpacity={0.7}>

                  {/* Tenant header row */}
                  <View style={styles.tenantHeader}>
                    <View style={[
                      styles.avatar,
                      {
                        backgroundColor: tenant.archived === true
                          ? colors.neutral[400]
                          : colors.primary[500],
                      },
                    ]}>
                      <Text style={[styles.avatarText, { color: colors.white }]}>
                        {tenant.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                      </Text>
                    </View>

                    <View style={styles.tenantInfo}>
                      <View style={styles.tenantNameRow}>
                        <Text
                          style={[styles.tenantName, { color: colors.text.primary }]}
                          numberOfLines={1}
                          ellipsizeMode="tail">
                          {tenant.name}
                        </Text>
                        {tenant.tenantStatus === 'vacated' && (
                          <View style={[styles.badge, {
                            backgroundColor: isDark ? colors.danger[900] : colors.danger[50],
                            borderColor:     isDark ? colors.danger[700] : colors.danger[200],
                          }]}>
                            <LogOut size={10} color={isDark ? colors.danger[300] : colors.danger[600]} strokeWidth={2} />
                            <Text style={[styles.badgeText, {
                              color: isDark ? colors.danger[300] : colors.danger[700],
                            }]}>
                              Vacated
                            </Text>
                          </View>
                        )}
                        {tenant.archived === true && (
                          <View style={[styles.badge, {
                            backgroundColor: isDark ? colors.warning[900] : colors.warning[50],
                            borderColor:     isDark ? colors.warning[700] : colors.warning[200],
                          }]}>
                            <Archive size={10} color={isDark ? colors.warning[300] : colors.warning[600]} strokeWidth={2} />
                            <Text style={[styles.badgeText, {
                              color: isDark ? colors.warning[300] : colors.warning[700],
                            }]}>
                              Archived
                            </Text>
                          </View>
                        )}
                      </View>

                      <View style={styles.phoneRow}>
                        <Phone
                          size={12}
                          color={tenant.archived === true ? colors.text.tertiary : colors.primary[500]}
                          strokeWidth={1.5}
                        />
                        <Text style={[styles.phoneText, { color: colors.text.secondary }]}
                          numberOfLines={1} ellipsizeMode="tail">
                          {tenant.phone}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Details row */}
                  <View style={[styles.detailsRow, { borderTopColor: colors.border.light }]}>
                    {[
                      { label: 'Room',  value: getRoomInfo(tenant)  },
                      { label: 'Rent',  value: tenant.rent          },
                      { label: 'Since', value: tenant.joinDate      },
                    ].map((item) => (
                      <View key={item.label} style={styles.detailItem}>
                        <Text style={[styles.detailLabel, { color: colors.text.tertiary }]}>
                          {item.label.toUpperCase()}
                        </Text>
                        <Text style={[styles.detailValue, { color: colors.text.primary }]}
                          numberOfLines={1} ellipsizeMode="tail">
                          {item.value}
                        </Text>
                      </View>
                    ))}
                  </View>

                </TouchableOpacity>
              </Card>
            ))}

            {/* ── Pagination ── */}
            {total > pageSize && (
              <View style={[
                styles.paginationRow,
                { backgroundColor: colors.background.secondary, borderTopColor: colors.border.light },
              ]}>
                <TouchableOpacity
                  style={[
                    styles.pageBtn,
                    {
                      backgroundColor: currentPage === 1
                        ? colors.background.tertiary
                        : colors.primary[500],
                      borderColor: currentPage === 1 ? colors.border.medium : colors.primary[500],
                    },
                  ]}
                  onPress={() => {
                    if (currentPage > 1) {
                      const p = currentPage - 1; setCurrentPage(p);
                      fetchTenants(p, searchQuery, selectedStatus, true, sortBy);
                    }
                  }}
                  disabled={currentPage === 1}
                  activeOpacity={0.7}>
                  <ChevronLeft
                    size={16}
                    color={currentPage === 1 ? colors.text.tertiary : colors.white}
                    strokeWidth={2}
                  />
                  <Text style={[styles.pageBtnText, {
                    color: currentPage === 1 ? colors.text.tertiary : colors.white,
                  }]}>
                    Prev
                  </Text>
                </TouchableOpacity>

                <View style={styles.pageInfo}>
                  <Text style={[styles.pageInfoText, { color: colors.text.primary }]}>
                    {currentPage} / {totalPages}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[
                    styles.pageBtn,
                    {
                      backgroundColor: currentPage >= totalPages
                        ? colors.background.tertiary
                        : colors.primary[500],
                      borderColor: currentPage >= totalPages ? colors.border.medium : colors.primary[500],
                    },
                  ]}
                  onPress={() => {
                    if (currentPage < totalPages) {
                      const p = currentPage + 1; setCurrentPage(p);
                      fetchTenants(p, searchQuery, selectedStatus, true, sortBy);
                    }
                  }}
                  disabled={currentPage >= totalPages}
                  activeOpacity={0.7}>
                  <Text style={[styles.pageBtnText, {
                    color: currentPage >= totalPages ? colors.text.tertiary : colors.white,
                  }]}>
                    Next
                  </Text>
                  <ChevronRight
                    size={16}
                    color={currentPage >= totalPages ? colors.text.tertiary : colors.white}
                    strokeWidth={2}
                  />
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {selectedProperty && !showEmptyState && <FAB onPress={handleFabPress} disabled={checkingBeds} />}

      <UpgradeModal
        visible={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        onSelectPlan={() => setShowUpgradeModal(false)}
      />

      {/* ── Filter Modal ── */}
      <Modal
        visible={showStatusFilterModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowStatusFilterModal(false)}>
        <View style={[
          styles.modalOverlay,
          isTablet && styles.modalOverlayTablet,
        ]}>
          <View style={[
            styles.modalSheet,
            isTablet && styles.modalSheetTablet,
            { backgroundColor: colors.background.secondary, maxWidth: modalMaxWidth },
          ]}>

            {/* Sort section */}
            <Text style={[styles.modalSectionTitle, { color: colors.text.primary }]}>Sort by</Text>
            {([
              { label: 'Latest first', value: 'latest' as const },
              { label: 'Oldest first', value: 'oldest' as const },
            ] as const).map((opt) => {
              const selected = sortBy === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.filterOption,
                    {
                      borderColor:     selected ? colors.primary[400] : colors.border.medium,
                      backgroundColor: selected
                        ? (isDark ? colors.primary[900] : colors.primary[50])
                        : colors.background.primary,
                    },
                  ]}
                  onPress={() => { handleSelectSort(opt.value); setShowStatusFilterModal(false); }}
                  activeOpacity={0.7}>
                  <Text style={[styles.filterOptionText, {
                    color:      selected ? colors.primary[isDark ? 300 : 700] : colors.text.primary,
                    fontFamily: selected
                      ? typography.fontFamily.semiBold
                      : typography.fontFamily.regular,
                  }]}>
                    {opt.label}
                  </Text>
                  {selected && (
                    <Check size={16} color={colors.primary[500]} strokeWidth={2.5} />
                  )}
                </TouchableOpacity>
              );
            })}

            <View style={[styles.modalDivider, { backgroundColor: colors.border.light }]} />

            {/* Status section */}
            <Text style={[styles.modalSectionTitle, { color: colors.text.primary }]}>Filter by status</Text>
            {([
              { label: 'All tenants', value: 'all'     as const },
              { label: 'Active',      value: 'active'  as const },
              { label: 'Vacated',     value: 'vacated' as const },
            ] as const).map((opt) => {
              const selected = selectedStatus === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.filterOption,
                    {
                      borderColor:     selected ? colors.primary[400] : colors.border.medium,
                      backgroundColor: selected
                        ? (isDark ? colors.primary[900] : colors.primary[50])
                        : colors.background.primary,
                    },
                  ]}
                  onPress={() => handleSelectStatusFilter(opt.value)}
                  activeOpacity={0.7}>
                  <Text style={[styles.filterOptionText, {
                    color:      selected ? colors.primary[isDark ? 300 : 700] : colors.text.primary,
                    fontFamily: selected
                      ? typography.fontFamily.semiBold
                      : typography.fontFamily.regular,
                  }]}>
                    {opt.label}
                  </Text>
                  {selected && (
                    <Check size={16} color={colors.primary[500]} strokeWidth={2.5} />
                  )}
                </TouchableOpacity>
              );
            })}

            {/* Cancel */}
            <TouchableOpacity
              style={[styles.modalCancelBtn, { borderTopColor: colors.border.light }]}
              onPress={() => setShowStatusFilterModal(false)}
              activeOpacity={0.7}>
              <Text style={[styles.modalCancelText, { color: colors.text.secondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // ── Header ───────────────────────────────────────────────────────────────
  header: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.md,
  },

  headerTitle: {
    fontFamily:    typography.fontFamily.bold,
    fontSize:      typography.fontSize.xxl,
    letterSpacing: typography.letterSpacing.tight,
  },

  countPill: {
    paddingHorizontal: spacing.md,
    paddingVertical:   4,
    borderRadius:      radius.full,
  },

  countText: {
    fontFamily: typography.fontFamily.medium,
    fontSize:   typography.fontSize.sm,
  },

  // ── Search ───────────────────────────────────────────────────────────────
  searchContainer: {
    flexDirection:     'row',
    paddingHorizontal: spacing.md,
    marginBottom:      spacing.md,
    gap:               spacing.sm,
  },

  searchBar: {
    flex:              1,
    flexDirection:     'row',
    alignItems:        'center',
    borderRadius:      radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm,
    borderWidth:       0.5,
    gap:               spacing.sm,
  },

  searchInput: {
    flex:     1,
    fontSize: typography.fontSize.md,
  },

  clearBtn: {
    fontSize:   typography.fontSize.sm,
    paddingLeft: 4,
  },

  filterButton: {
    width:          44,
    height:         44,
    borderRadius:   radius.md,
    alignItems:     'center',
    justifyContent: 'center',
    borderWidth:    0.5,
    position:       'relative',
  },

  filterDot: {
    position:     'absolute',
    top:          8,
    right:        8,
    width:        6,
    height:       6,
    borderRadius: radius.full,
  },

  // ── List ─────────────────────────────────────────────────────────────────
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom:     spacing.xxxl,
    paddingTop:        spacing.sm,
  },

  tenantCard: {
    marginBottom:      spacing.sm,
    paddingVertical:   spacing.md,
    paddingHorizontal: spacing.md,
  },

  tenantHeader: {
    flexDirection: 'row',
    alignItems:    'center',
    marginBottom:  spacing.md,
  },

  avatar: {
    width:          44,
    height:         44,
    borderRadius:   radius.full,
    alignItems:     'center',
    justifyContent: 'center',
    marginRight:    spacing.md,
  },

  avatarText: {
    fontFamily: typography.fontFamily.bold,
    fontSize:   typography.fontSize.md,
  },

  tenantInfo: { flex: 1 },

  tenantNameRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.sm,
    marginBottom:  spacing.xs,
    flexWrap:      'wrap',
  },

  tenantName: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize:   typography.fontSize.md,
    flexShrink: 1,
  },

  badge: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: spacing.sm,
    paddingVertical:   2,
    borderRadius:      radius.full,
    borderWidth:       0.5,
    gap:               3,
  },

  badgeText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize:   typography.fontSize.xs,
  },

  phoneRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.xs,
  },

  phoneText: {
    fontFamily: typography.fontFamily.regular,
    fontSize:   typography.fontSize.sm,
  },

  // ── Detail row ───────────────────────────────────────────────────────────
  detailsRow: {
    flexDirection:  'row',
    gap:            spacing.sm,
    borderTopWidth: 0.5,
    paddingTop:     spacing.md,
  },

  detailItem: { flex: 1 },

  detailLabel: {
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      typography.fontSize.xs,
    letterSpacing: typography.letterSpacing.wider,
    marginBottom:  spacing.xs,
  },

  detailValue: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize:   typography.fontSize.sm,
  },

  // ── Pagination ───────────────────────────────────────────────────────────
  paginationRow: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.md,
    marginTop:         spacing.md,
    borderTopWidth:    0.5,
    borderRadius:      radius.md,
  },

  pageBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm,
    borderRadius:      radius.md,
    borderWidth:       0.5,
    minWidth:          80,
    justifyContent:    'center',
  },

  pageBtnText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize:   typography.fontSize.sm,
  },

  pageInfo:     { flex: 1, alignItems: 'center' },

  pageInfoText: {
    fontFamily: typography.fontFamily.medium,
    fontSize:   typography.fontSize.sm,
  },

  // ── Filter Modal ─────────────────────────────────────────────────────────
  modalOverlay: {
    flex:            1,
    justifyContent:  'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },

  modalOverlayTablet: {
    justifyContent:    'center',
    paddingHorizontal: spacing.lg,
  },

  modalSheet: {
    borderTopLeftRadius:  radius.xl ?? 20,
    borderTopRightRadius: radius.xl ?? 20,
    paddingHorizontal:    spacing.lg,
    paddingTop:           spacing.lg,
    paddingBottom:        spacing.xl,
    gap:                  spacing.sm,
  },

  modalSheetTablet: {
    width:                    '100%',
    alignSelf:                'center',
    borderBottomLeftRadius:   radius.xl ?? 20,
    borderBottomRightRadius:  radius.xl ?? 20,
  },

  modalSectionTitle: {
    fontFamily:   typography.fontFamily.bold,
    fontSize:     typography.fontSize.md,
    marginBottom: spacing.xs,
  },

  filterOption: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    borderWidth:       0.5,
    borderRadius:      radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.md,
  },

  filterOptionText: {
    fontSize: typography.fontSize.md,
  },

  modalDivider: {
    height:        0.5,
    marginVertical: spacing.sm,
  },

  modalCancelBtn: {
    marginTop:   spacing.sm,
    borderTopWidth: 0.5,
    alignItems:  'center',
    paddingTop:  spacing.md,
  },

  modalCancelText: {
    fontFamily: typography.fontFamily.medium,
    fontSize:   typography.fontSize.md,
  },
});