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
import { Search, Filter, Phone, Users, Archive, LogOut } from 'lucide-react-native';
import { spacing, typography, radius, shadows } from '@/theme';
import { useTheme } from '@/context/ThemeContext';
import { useProperty } from '@/context/PropertyContext';
import { tenantService } from '@/services/apiClient';
import type { Tenant, PaginatedResponse } from '@/services/apiTypes';
import { cacheKeys, getScreenCache, setScreenCache, clearScreenCache } from '@/services/screenCache';

const TENANTS_CACHE_STALE_MS = 30 * 1000;

export default function TenantsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { selectedProperty, selectedPropertyId, loading: propertyLoading } = useProperty();
  
  // Initialize with cached data synchronously to avoid glitch
  const { initialTenants, initialTotal } = (() => {
    if (!selectedPropertyId) return { initialTenants: [], initialTotal: 0 };
    const cacheKey = cacheKeys.tenants(selectedPropertyId, 1, '', 'all');
    const cachedResponse = getScreenCache<PaginatedResponse<Tenant>>(cacheKey, TENANTS_CACHE_STALE_MS);
    return {
      initialTenants: cachedResponse?.data || [],
      initialTotal: cachedResponse?.meta?.total || 0
    };
  })();
  
  const [tenants, setTenants] = useState<Tenant[]>(initialTenants);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(initialTotal);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showStatusFilterModal, setShowStatusFilterModal] = useState(false);
  
  // Filter & Pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'active' | 'vacated'>('all');
  const [sortBy, setSortBy] = useState<'latest' | 'oldest'>('latest');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFocusRefreshRef = useRef<number>(Date.now());
  const isFetchingRef = useRef(false);
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tenantsCountRef = useRef(initialTenants.length);
  const hasMountedSearchEffectRef = useRef(false);

  useEffect(() => {
    tenantsCountRef.current = tenants.length;
  }, [tenants.length]);

  const fetchTenants = useCallback(async (page: number = 1, search: string = '', status: string = 'all', forceNetwork: boolean = false, sort: string = 'latest') => {
    if (!selectedPropertyId) {
      setLoading(false);
      return;
    }

    // Prevent concurrent fetches
    if (isFetchingRef.current) {
      return;
    }

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
      // Only show loading if we don't already have data
      if (!tenantsCountRef.current) {
        setLoading(true);
        
        // Set a timeout to auto-dismiss skeleton after 8 seconds
        if (loadingTimeoutRef.current) {
          clearTimeout(loadingTimeoutRef.current);
        }
        loadingTimeoutRef.current = setTimeout(() => {
          setLoading(false);
          if (!tenantsCountRef.current) {
            setError('Request is taking longer than expected. Please try again.');
          }
        }, 8000);
      }
      setError(null);
      
      const statusFilter = status !== 'all' ? status : undefined;
      
      // ONLY fetch tenants - rooms & beds data now included in response
      const tenantsRes = await tenantService.getTenants(selectedPropertyId, search || undefined, statusFilter, page, pageSize, sort as 'latest' | 'oldest');

      // Clear timeout if we got data back
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }

      if (tenantsRes.data) {
        setTenants(tenantsRes.data);
        setTotal(tenantsRes.meta?.total || 0);
        setScreenCache(cacheKey, tenantsRes);
      }
    } catch (err: any) {
      // Clear timeout on error
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
      
      if (err?.code === 'SUBSCRIPTION_LIMIT_EXCEEDED' || err?.details?.status === 402) {
        setShowUpgradeModal(true);
      } else {
        setError(err?.message || 'Failed to load tenants');
      }
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [selectedPropertyId, sortBy]);

  // Fetch data on property change or initial mount
  useEffect(() => {
    if (!selectedPropertyId || propertyLoading) {
      return;
    }

    // Check for cached data first
    const cacheKey = cacheKeys.tenants(selectedPropertyId, 1, '', 'all');
    const cachedResponse = getScreenCache<PaginatedResponse<Tenant>>(cacheKey, TENANTS_CACHE_STALE_MS);
    
    if (!cachedResponse && tenantsCountRef.current === 0) {
      // Only show skeleton if we have no cached data and no current data
      setLoading(true);
      setTenants([]);
      setTotal(0);
      fetchTenants(1, '', 'all', false, sortBy);
    }
  }, [selectedPropertyId, propertyLoading, fetchTenants, sortBy]);

  // Debounced search handler
  useEffect(() => {
    if (!hasMountedSearchEffectRef.current) {
      hasMountedSearchEffectRef.current = true;
      return;
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      setCurrentPage(1); // Reset to first page on new search
      fetchTenants(1, searchQuery, selectedStatus, false, sortBy);
    }, 500); // 500ms debounce

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery, selectedStatus, sortBy, fetchTenants]);

  // Cleanup loading timeout on unmount
  useEffect(() => {
    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!propertyLoading && selectedPropertyId) {
        const cacheKey = cacheKeys.tenants(selectedPropertyId, currentPage, searchQuery, selectedStatus);
        const hasFreshCache = !!getScreenCache<PaginatedResponse<Tenant>>(cacheKey, TENANTS_CACHE_STALE_MS);
        const now = Date.now();
        const timeSinceLastRefresh = now - lastFocusRefreshRef.current;
        const shouldRefreshBecauseCacheMissing = !hasFreshCache;
        const shouldRefreshByThrottle = timeSinceLastRefresh > TENANTS_CACHE_STALE_MS;

        if (shouldRefreshBecauseCacheMissing || shouldRefreshByThrottle) {
          lastFocusRefreshRef.current = now;
          fetchTenants(currentPage, searchQuery, selectedStatus, shouldRefreshBecauseCacheMissing, sortBy);
        }
      }
    }, [propertyLoading, selectedPropertyId, currentPage, searchQuery, selectedStatus, sortBy, fetchTenants])
  );

  const handleRetry = () => {
    fetchTenants(currentPage, searchQuery, selectedStatus, true, sortBy);
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);

    // Clear only tenants cache to avoid forcing unrelated screens to refetch
    if (selectedPropertyId) {
      clearScreenCache(`tenants:${selectedPropertyId}:`);
    } else {
      clearScreenCache('tenants:');
    }
    
    // Reset pagination and filters
    setCurrentPage(1);
    setSearchQuery('');
    setSelectedStatus('all');
    setSortBy('latest');
    setTenants([]);
    setTotal(0);
    
    // Re-fetch tenants
    if (selectedPropertyId) {
      try {
        await fetchTenants(1, '', 'all', true, 'latest');
      } finally {
        setRefreshing(false);
      }
    } else {
      setRefreshing(false);
    }
  }, [selectedPropertyId, fetchTenants]);

  const handleFabPress = () => {
    router.push('/add-tenant');
  };

  const handleSelectStatusFilter = (status: 'all' | 'active' | 'vacated') => {
    setShowStatusFilterModal(false);
    setCurrentPage(1);
    setSelectedStatus(status);
  };

  const handleSelectSort = (sort: 'latest' | 'oldest') => {
    setCurrentPage(1);
    setSortBy(sort);
    fetchTenants(1, searchQuery, selectedStatus, true, sort);
  };

  const handleAddRoom = () => {
    router.push('/room-form');
  };

  const getRoomInfo = (tenant: Tenant) => {
    // Show only room number
    if (tenant.roomNumber) {
      return `Room ${tenant.roomNumber}`;
    }
    return 'N/A';
  };

  const showEmptyState = !!selectedProperty && !loading && tenants.length === 0 && !error;

  return (
    <ScreenContainer edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Tenants</Text>
        <Text style={{ fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium as any, color: colors.text.secondary }}>
          {loading && tenants.length === 0 ? '0' : total} Total
        </Text>
      </View>

      <View style={styles.searchContainer}>
        <View style={[styles.searchBar, { backgroundColor: colors.background.secondary, borderColor: colors.border.medium }]}>
          <Search size={20} color={colors.text.tertiary} />
          <TextInput
            style={[styles.searchInput, { color: colors.text.primary }]}
            placeholder="Search by name, phone..."
            placeholderTextColor={colors.text.tertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            editable={!!selectedProperty && !loading && !error}
          />
        </View>
        <TouchableOpacity
          style={[
            styles.filterButton,
            {
              backgroundColor: selectedStatus !== 'all' || sortBy !== 'latest' ? colors.primary[100] : colors.primary[50],
              borderColor: selectedStatus !== 'all' || sortBy !== 'latest' ? colors.primary[300] : colors.primary[100]
            }
          ]}
          activeOpacity={0.7}
          onPress={() => setShowStatusFilterModal(true)}
          disabled={loading || !selectedProperty || !!error}>
          <Filter size={20} color={selectedStatus !== 'all' || sortBy !== 'latest' ? colors.primary[700] : colors.primary[500]} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
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
        ) : (error && selectedProperty) ? (
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
            {tenants.map((tenant, index) => {
              return (
                <Card key={index} style={[styles.tenantCard, tenant.archived === true ? { opacity: 0.6 } : {}] as any}>
                  <TouchableOpacity
                    onPress={() => router.push(`/tenant-detail?tenantId=${tenant.id}`)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.tenantHeader}>
                      <View style={[styles.avatar, { backgroundColor: tenant.archived === true ? colors.neutral[200] : colors.primary[500] }]}>
                        <Text style={[styles.avatarText, { color: colors.white }]}>
                          {tenant.name
                            .split(' ')
                            .map((n) => n[0])
                            .join('')}
                        </Text>
                      </View>
                      <View style={styles.tenantInfo}>
                        <View style={styles.tenantNameRow}>
                          <Text style={[styles.tenantName, { color: colors.text.primary }]}>{tenant.name}</Text>
                          {tenant.tenantStatus === 'vacated' && (
                            <View style={[styles.archivedBadge, { backgroundColor: colors.danger[100] }]}>
                              <LogOut size={12} color={colors.danger[600]} />
                              <Text style={[styles.archivedBadgeText, { color: colors.danger[600] }]}>Vacated</Text>
                            </View>
                          )}
                          {tenant.archived === true && (
                            <View style={[styles.archivedBadge, { backgroundColor: colors.warning[100] }]}>
                              <Archive size={12} color={colors.warning[600]} />
                              <Text style={[styles.archivedBadgeText, { color: colors.warning[600] }]}>Archived</Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.phoneRow}>
                          <Phone size={13} color={tenant.archived === true ? colors.text.tertiary : colors.primary[500]} />
                          <Text style={[styles.phoneText, { color: colors.text.secondary }]}>{tenant.phone}</Text>
                        </View>
                      </View>
                    </View>

                    <View style={styles.detailsRow}>
                      <View style={styles.detailItem}>
                        <Text style={[styles.detailLabel, { color: colors.text.tertiary }]}>Room</Text>
                        <Text style={[styles.detailValue, { color: colors.text.primary }]}>{getRoomInfo(tenant)}</Text>
                      </View>
                      <View style={styles.detailItem}>
                        <Text style={[styles.detailLabel, { color: colors.text.tertiary }]}>Rent</Text>
                        <Text style={[styles.detailValue, { color: colors.text.primary }]}>{tenant.rent}</Text>
                      </View>
                      <View style={styles.detailItem}>
                        <Text style={[styles.detailLabel, { color: colors.text.tertiary }]}>Since</Text>
                        <Text style={[styles.detailValue, { color: colors.text.primary }]}>{tenant.joinDate}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                </Card>
              );
            })}
            
            {/* Pagination Controls */}
            {total > pageSize && (
              <View style={[styles.paginationContainer, { backgroundColor: colors.background.secondary, borderTopColor: colors.border.light }]}>
                <TouchableOpacity
                  style={[
                    styles.paginationButton,
                    {
                      backgroundColor: currentPage === 1 ? colors.neutral[100] : colors.primary[500],
                      borderColor: colors.border.medium
                    }
                  ]}
                  onPress={() => {
                    if (currentPage > 1) {
                      const newPage = currentPage - 1;
                      setCurrentPage(newPage);
                      fetchTenants(newPage, searchQuery, selectedStatus, true, sortBy);
                    }
                  }}
                  disabled={currentPage === 1}
                  activeOpacity={0.7}>
                  <Text style={[styles.paginationButtonText, { color: currentPage === 1 ? colors.text.tertiary : colors.white }]}>
                    ← Previous
                  </Text>
                </TouchableOpacity>
                
                <View style={styles.paginationInfo}>
                  <Text style={[styles.paginationText, { color: colors.text.primary }]}>
                    Page {currentPage} of {Math.ceil(total / pageSize)}
                  </Text>
                </View>
                
                <TouchableOpacity
                  style={[
                    styles.paginationButton,
                    {
                      backgroundColor: currentPage >= Math.ceil(total / pageSize) ? colors.neutral[100] : colors.primary[500],
                      borderColor: colors.border.medium
                    }
                  ]}
                  onPress={() => {
                    if (currentPage < Math.ceil(total / pageSize)) {
                      const newPage = currentPage + 1;
                      setCurrentPage(newPage);
                      fetchTenants(newPage, searchQuery, selectedStatus, true, sortBy);
                    }
                  }}
                  disabled={currentPage >= Math.ceil(total / pageSize)}
                  activeOpacity={0.7}>
                  <Text style={[styles.paginationButtonText, { color: currentPage >= Math.ceil(total / pageSize) ? colors.text.tertiary : colors.white }]}>
                    Next →
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>
      {selectedProperty && !showEmptyState && <FAB onPress={handleFabPress} />}
      <UpgradeModal
        visible={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        onSelectPlan={() => setShowUpgradeModal(false)}
      />

      <Modal
        visible={showStatusFilterModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowStatusFilterModal(false)}>
        <View style={styles.filterModalOverlay}>
          <View style={[styles.filterModalContainer, { backgroundColor: colors.background.secondary }]}> 
            <Text style={[styles.filterModalTitle, { color: colors.text.primary }]}>Sort By</Text>

            {[
              { label: 'Latest First', value: 'latest' as const, icon: '↓' },
              { label: 'Oldest First', value: 'oldest' as const, icon: '↑' },
            ].map((option) => {
              const selected = sortBy === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.filterOption,
                    {
                      borderColor: selected ? colors.primary[500] : colors.border.medium,
                      backgroundColor: selected ? colors.primary[50] : colors.background.primary,
                    },
                  ]}
                  onPress={() => {
                    handleSelectSort(option.value);
                    setShowStatusFilterModal(false);
                  }}
                  activeOpacity={0.7}>
                  <Text
                    style={[
                      styles.filterOptionText,
                      {
                        color: selected ? colors.primary[700] : colors.text.primary,
                        fontWeight: selected ? typography.fontWeight.semibold : typography.fontWeight.regular,
                      },
                    ]}>
                    {option.icon} {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}

            <View style={[styles.filterDivider, { backgroundColor: colors.border.light }]} />

            <Text style={[styles.filterModalTitle, { color: colors.text.primary }]}>Filter by Status</Text>

            {[
              { label: 'All Tenants', value: 'all' as const },
              { label: 'Active', value: 'active' as const },
              { label: 'Vacated', value: 'vacated' as const },
            ].map((option) => {
              const selected = selectedStatus === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.filterOption,
                    {
                      borderColor: selected ? colors.primary[500] : colors.border.medium,
                      backgroundColor: selected ? colors.primary[50] : colors.background.primary,
                    },
                  ]}
                  onPress={() => handleSelectStatusFilter(option.value)}
                  activeOpacity={0.7}>
                  <Text
                    style={[
                      styles.filterOptionText,
                      {
                        color: selected ? colors.primary[700] : colors.text.primary,
                        fontWeight: selected ? typography.fontWeight.semibold : typography.fontWeight.regular,
                      },
                    ]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={[styles.filterModalCloseButton, { borderTopColor: colors.border.light }]}
              onPress={() => setShowStatusFilterModal(false)}
              activeOpacity={0.7}>
              <Text style={[styles.filterModalCloseText, { color: colors.text.secondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxxl,
    paddingTop: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  headerTitle: {
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
  },
    headerCount: {
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.medium,
    },
  searchContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    marginLeft: spacing.sm,
    fontSize: typography.fontSize.md,
  },
  filterButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  tenantCard: {
    marginBottom: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  tenantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  avatarText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
  },
  tenantInfo: {
    flex: 1,
  },
  tenantName: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  phoneText: {
    fontSize: typography.fontSize.sm,
  },

  detailsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  detailItem: {
    flex: 1,
  },
  detailLabel: {
    fontSize: typography.fontSize.xs,
    marginBottom: spacing.xs,
  },
  detailValue: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  paginationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
    borderTopWidth: 1,
  },
  paginationButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paginationButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  paginationInfo: {
    flex: 1,
    alignItems: 'center',
  },
  paginationText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  tenantNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  archivedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    gap: spacing.xs,
  },
  archivedBadgeText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  filterModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  filterModalContainer: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  filterModalTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.sm,
  },
  filterOption: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  filterOptionText: {
    fontSize: typography.fontSize.md,
  },
  filterDivider: {
    height: 1,
    marginVertical: spacing.md,
  },
  filterModalCloseButton: {
    marginTop: spacing.sm,
    borderTopWidth: 1,
    alignItems: 'center',
    paddingTop: spacing.md,
  },
  filterModalCloseText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.medium,
  },
});

