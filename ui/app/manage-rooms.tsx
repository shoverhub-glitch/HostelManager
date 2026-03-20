import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import ArchiveWarningModal from '@/components/ArchiveWarningModal';
import FAB from '@/components/FAB';
import EmptyState from '@/components/EmptyState';
import Skeleton from '@/components/Skeleton';
import ApiErrorCard from '@/components/ApiErrorCard';
import {
  ChevronLeft,
  DoorOpen,
  Bed,
  IndianRupee,
  Archive,
  Trash2,
  Pencil,
  ArrowUpRight,
  ChevronRight,
  ChevronLeft as ChevLeft,
  Layers,
  X,
  AlertTriangle,
} from 'lucide-react-native';
import { spacing, radius, shadows } from '@/theme';
import { typography } from '@/theme/typography';
import { useTheme } from '@/context/ThemeContext';
import { useProperty } from '@/context/PropertyContext';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import useResponsiveLayout from '@/hooks/useResponsiveLayout';
import { roomService } from '@/services/apiClient';
import type { Room, PaginatedResponse } from '@/services/apiTypes';
import { cacheKeys, clearScreenCache, getScreenCache, setScreenCache } from '@/services/screenCache';

const ROOMS_CACHE_STALE_MS    = 60 * 1000;
const ROOMS_FOCUS_THROTTLE_MS = 60 * 1000;
const ROOMS_PAGE_SIZE         = 50;
const MAX_ERROR_MESSAGE_LENGTH = 220;

function normalizeErrorMessage(message?: string): string {
  if (!message) return 'Failed to load rooms';
  const n = String(message).replace(/\s+/g, ' ').trim();
  if (!n) return 'Failed to load rooms';
  return n.length > MAX_ERROR_MESSAGE_LENGTH ? `${n.slice(0, MAX_ERROR_MESSAGE_LENGTH)}...` : n;
}

export default function ManageRoomsScreen() {
  const { colors, isDark }     = useTheme();
  const router                 = useRouter();
  const { isTablet, isLargeTablet, contentMaxWidth, modalMaxWidth } = useResponsiveLayout();
  const { selectedPropertyId, selectedProperty, loading: propertyLoading } = useProperty();
  const isOnline               = useNetworkStatus();

  const [rooms,      setRooms]      = useState<Room[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [currentPage,setCurrentPage]= useState(1);
  const [total,      setTotal]      = useState(0);

  const [showArchiveWarning, setShowArchiveWarning] = useState(false);
  const [selectedRoom,       setSelectedRoom]        = useState<any>(null);
  const [warningAction,      setWarningAction]       = useState<'edit' | 'delete' | null>(null);
  const [showDeleteConfirm,  setShowDeleteConfirm]   = useState(false);
  const [deleting,           setDeleting]            = useState(false);

  const lastRoomsFocusRefreshRef = useRef<number>(0);

  // ── Color aliases ─────────────────────────────────────────────────────────
  const brandColor    = colors.primary[500];
  const brandLight    = isDark ? colors.primary[900] : colors.primary[50];
  const brandText     = isDark ? colors.primary[300] : colors.primary[600];
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

  // ── Cache / fetch ─────────────────────────────────────────────────────────
  const getRoomsCacheKey = useCallback(
    (propertyId: string, page: number) => `${cacheKeys.rooms(propertyId)}:page:${page}`,
    []
  );

  const fetchRooms = useCallback(async (page = currentPage, forceNetwork = false) => {
    if (!selectedPropertyId) { setLoading(false); return; }
    const cacheKey = getRoomsCacheKey(selectedPropertyId, page);
    if (!forceNetwork) {
      const cached = getScreenCache<PaginatedResponse<Room>>(cacheKey, ROOMS_CACHE_STALE_MS);
      if (cached) {
        setRooms(cached.data || []); setTotal(cached.meta?.total || 0);
        setError(null); setLoading(false); return;
      }
    }
    try {
      setLoading(true); setError(null);
      const res = await roomService.getRooms(selectedPropertyId, undefined, page, ROOMS_PAGE_SIZE);
      if (res.data) {
        setRooms(res.data); setTotal(res.meta?.total || res.data.length || 0);
        setScreenCache(cacheKey, res);
      }
    } catch (err: any) {
      setError(normalizeErrorMessage(err?.message));
    } finally {
      setLoading(false);
    }
  }, [selectedPropertyId, currentPage, getRoomsCacheKey]);

  useFocusEffect(
    useCallback(() => {
      if (propertyLoading || !selectedPropertyId) return;
      const cacheKey      = getRoomsCacheKey(selectedPropertyId, currentPage);
      const hasFreshCache = !!getScreenCache<PaginatedResponse<Room>>(cacheKey, ROOMS_CACHE_STALE_MS);
      const now           = Date.now();
      const cacheMissing  = !hasFreshCache;
      const throttleHit   = lastRoomsFocusRefreshRef.current === 0 || (now - lastRoomsFocusRefreshRef.current) > ROOMS_FOCUS_THROTTLE_MS;
      if (cacheMissing || throttleHit) {
        lastRoomsFocusRefreshRef.current = now;
        fetchRooms(currentPage, cacheMissing);
      }
    }, [propertyLoading, selectedPropertyId, currentPage, fetchRooms, getRoomsCacheKey])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true); setCurrentPage(1);
    try { await fetchRooms(1, true); } finally { setRefreshing(false); }
  }, [fetchRooms]);

  const handleEditRoom = (room: any) => {
    if (room.active === false) {
      setSelectedRoom(room); setWarningAction('edit'); setShowArchiveWarning(true);
    } else {
      router.push(`/room-form?roomId=${room.id}`);
    }
  };

  const handleDeleteRoom = (room: any) => {
    if (room.active === false) {
      setSelectedRoom(room); setWarningAction('delete'); setShowArchiveWarning(true);
    } else {
      setSelectedRoom(room); setShowDeleteConfirm(true);
    }
  };

  const confirmDeleteRoom = async () => {
    if (!selectedRoom) return;
    try {
      setDeleting(true);
      await roomService.deleteRoom(selectedRoom.id);
      clearScreenCache('rooms:');
      await fetchRooms(currentPage, true);
      setShowDeleteConfirm(false); setSelectedRoom(null);
    } catch (err: any) {
      alert(err?.message || 'Failed to delete room');
    } finally {
      setDeleting(false);
    }
  };

  const totalPages    = Math.max(1, Math.ceil(total / ROOMS_PAGE_SIZE));
  const showEmptyState = !!selectedProperty && !loading && rooms.length === 0 && !error;
  const cardWidth     = isLargeTablet ? '31.5%' : isTablet ? '48.5%' : '100%';

  // ── Shared nav ────────────────────────────────────────────────────────────
  const NavBar = () => (
    <View style={[styles.navBar, { backgroundColor: cardBg, borderBottomColor: colors.border.light }]}>
      <TouchableOpacity style={styles.navBack} onPress={() => router.back()} activeOpacity={0.7}>
        <ChevronLeft size={22} color={textPrimary} strokeWidth={2} />
      </TouchableOpacity>
      <Text style={[styles.navTitle, { color: textPrimary }]}>Manage Rooms</Text>
      <View style={styles.navSpacer} />
    </View>
  );

  // ── Loading ───────────────────────────────────────────────────────────────
  if (propertyLoading || loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: pageBg }]} edges={['top','bottom']}>
        <NavBar />
        <ScrollView
          contentContainerStyle={[styles.scroll, isTablet && { alignSelf: 'center', width: '100%', maxWidth: contentMaxWidth }]}
          showsVerticalScrollIndicator={false}>
          <Skeleton height={140} count={3} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── No property ───────────────────────────────────────────────────────────
  if (!selectedProperty) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: pageBg }]} edges={['top','bottom']}>
        <NavBar />
        <EmptyState icon={DoorOpen} title="No Property Selected" subtitle="Please select a property first to manage rooms" />
      </SafeAreaView>
    );
  }

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

        {error ? (
          <ApiErrorCard error={error} onRetry={() => fetchRooms(currentPage, true)} />
        ) : showEmptyState ? (
          <EmptyState
            icon={DoorOpen}
            title="No Rooms Yet"
            subtitle="Add rooms to start organizing tenants and beds"
            actionLabel="Add Room"
            onActionPress={() => router.push('/room-form')}
          />
        ) : (
          <>
            <View style={[styles.grid, isTablet && styles.gridTablet]}>
              {rooms.map(room => {
                const isArchived = room.active === false;
                const stripColor = isArchived ? warningColor : brandColor;

                return (
                  <View
                    key={room.id}
                    style={[
                      styles.card,
                      {
                        backgroundColor: cardBg,
                        borderColor:     isArchived ? (isDark ? colors.warning[700] : colors.warning[300]) : cardBorder,
                        width:           cardWidth,
                        opacity:         isArchived ? 0.7 : 1,
                      },
                    ]}>
                    {/* Top accent strip */}
                    <View style={[styles.cardStrip, { backgroundColor: stripColor }]} />

                    <View style={styles.cardBody}>

                      {/* Header: icon + number + floor + actions */}
                      <View style={styles.cardHeader}>
                        <View style={[styles.cardIconBox, { backgroundColor: isArchived ? warningLight : brandLight }]}>
                          <DoorOpen size={16} color={isArchived ? warningText : brandText} strokeWidth={2} />
                        </View>
                        <View style={styles.cardTitleWrap}>
                          <Text style={[styles.cardTitle, { color: textPrimary }]} numberOfLines={1}>
                            Room {room.roomNumber}
                          </Text>
                          <View style={styles.cardSubRow}>
                            <Layers size={11} color={textTertiary} strokeWidth={1.5} />
                            <Text style={[styles.cardSub, { color: textTertiary }]}>Floor {room.floor}</Text>
                            {isArchived && (
                              <View style={[styles.archivedChip, {
                                backgroundColor: warningLight,
                                borderColor:     isDark ? colors.warning[700] : colors.warning[300],
                              }]}>
                                <Archive size={9} color={warningColor} strokeWidth={2} />
                                <Text style={[styles.archivedChipText, { color: warningText }]}>Archived</Text>
                              </View>
                            )}
                          </View>
                        </View>
                        {!isArchived && (
                          <View style={styles.cardActions}>
                            <TouchableOpacity
                              style={[styles.cardActionBtn, { backgroundColor: brandLight, borderColor: isDark ? colors.primary[700] : colors.primary[200], opacity: !isOnline ? 0.4 : 1 }]}
                              onPress={() => handleEditRoom(room)}
                              activeOpacity={0.75}
                              disabled={!isOnline}>
                              <Pencil size={13} color={brandText} strokeWidth={2} />
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.cardActionBtn, { backgroundColor: dangerLight, borderColor: isDark ? colors.danger[700] : colors.danger[200], opacity: !isOnline ? 0.4 : 1 }]}
                              onPress={() => handleDeleteRoom(room)}
                              activeOpacity={0.75}
                              disabled={!isOnline}>
                              <Trash2 size={13} color={dangerText} strokeWidth={2} />
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>

                      {/* Stats row */}
                      <View style={[styles.statsRow, { backgroundColor: pageBg, borderColor: cardBorder }]}>
                        <View style={styles.stat}>
                          <View style={[styles.statIconBox, { backgroundColor: successLight }]}>
                            <IndianRupee size={13} color={successText} strokeWidth={2} />
                          </View>
                          <View>
                            <Text style={[styles.statLabel, { color: textTertiary }]}>PRICE</Text>
                            <Text style={[styles.statValue, { color: textPrimary }]}>
                              ₹{room.price.toLocaleString('en-IN')}
                            </Text>
                          </View>
                        </View>
                        <View style={[styles.statSep, { backgroundColor: cardBorder }]} />
                        <View style={styles.stat}>
                          <View style={[styles.statIconBox, { backgroundColor: brandLight }]}>
                            <Bed size={13} color={brandText} strokeWidth={2} />
                          </View>
                          <View>
                            <Text style={[styles.statLabel, { color: textTertiary }]}>BEDS</Text>
                            <Text style={[styles.statValue, { color: textPrimary }]}>
                              {room.numberOfBeds} {room.numberOfBeds !== 1 ? 'beds' : 'bed'}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* View beds CTA */}
                      <TouchableOpacity
                        style={[
                          styles.viewBedsBtn,
                          { backgroundColor: isArchived ? pageBg : brandColor, borderColor: isArchived ? cardBorder : brandColor },
                        ]}
                        onPress={() => router.push(`/manage-beds?roomId=${room.id}`)}
                        activeOpacity={0.82}
                        disabled={isArchived}>
                        <Bed size={14} color={isArchived ? textTertiary : colors.white} strokeWidth={2} />
                        <Text style={[styles.viewBedsBtnText, { color: isArchived ? textTertiary : colors.white }]}>
                          View Beds
                        </Text>
                        <ArrowUpRight size={13} color={isArchived ? textTertiary : colors.white} strokeWidth={2} style={{ marginLeft: 'auto' }} />
                      </TouchableOpacity>

                    </View>
                  </View>
                );
              })}
            </View>

            {/* Pagination */}
            {total > ROOMS_PAGE_SIZE && !error && (
              <View style={[styles.pagination, { borderTopColor: colors.border.light }]}>
                <TouchableOpacity
                  style={[styles.pageBtn, {
                    backgroundColor: currentPage === 1 ? colors.background.tertiary : brandColor,
                    borderColor:     currentPage === 1 ? cardBorder : brandColor,
                  }]}
                  onPress={() => {
                    if (currentPage > 1) { const p = currentPage - 1; setCurrentPage(p); fetchRooms(p, true); }
                  }}
                  disabled={currentPage === 1 || refreshing}
                  activeOpacity={0.75}>
                  <ChevLeft size={15} color={currentPage === 1 ? textTertiary : colors.white} strokeWidth={2.5} />
                  <Text style={[styles.pageBtnText, { color: currentPage === 1 ? textTertiary : colors.white }]}>Prev</Text>
                </TouchableOpacity>

                <Text style={[styles.pageCount, { color: textSecondary }]}>{currentPage} / {totalPages}</Text>

                <TouchableOpacity
                  style={[styles.pageBtn, {
                    backgroundColor: currentPage >= totalPages ? colors.background.tertiary : brandColor,
                    borderColor:     currentPage >= totalPages ? cardBorder : brandColor,
                  }]}
                  onPress={() => {
                    if (currentPage < totalPages) { const p = currentPage + 1; setCurrentPage(p); fetchRooms(p, true); }
                  }}
                  disabled={currentPage >= totalPages || refreshing}
                  activeOpacity={0.75}>
                  <Text style={[styles.pageBtnText, { color: currentPage >= totalPages ? textTertiary : colors.white }]}>Next</Text>
                  <ChevronRight size={15} color={currentPage >= totalPages ? textTertiary : colors.white} strokeWidth={2.5} />
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {!showEmptyState && <FAB onPress={() => router.push('/room-form')} disabled={!isOnline} />}

      {/* Archive warning */}
      <ArchiveWarningModal
        visible={showArchiveWarning}
        resourceName={`Room ${selectedRoom?.roomNumber || ''}`}
        resourceType="room"
        archivedReason={selectedRoom?.archivedReason}
        action={warningAction}
        onClose={() => { setShowArchiveWarning(false); setSelectedRoom(null); }}
      />

      {/* Delete confirm */}
      <Modal visible={showDeleteConfirm} transparent animationType="fade" onRequestClose={() => setShowDeleteConfirm(false)}>
        <View style={[styles.overlay, { backgroundColor: colors.modal.overlay }]}>
          <View style={[styles.deleteSheet, { backgroundColor: cardBg, maxWidth: modalMaxWidth }]}>

            <TouchableOpacity
              style={[styles.deleteCloseBtn, { backgroundColor: colors.background.tertiary }]}
              onPress={() => setShowDeleteConfirm(false)} disabled={deleting}>
              <X size={14} color={textSecondary} strokeWidth={2} />
            </TouchableOpacity>

            <View style={[styles.deleteIconBox, { backgroundColor: dangerLight }]}>
              <Trash2 size={24} color={dangerText} strokeWidth={2} />
            </View>

            <Text style={[styles.deleteTitle, { color: textPrimary }]}>Delete Room?</Text>
            <Text style={[styles.deleteMsg, { color: textSecondary }]}>
              This room will be permanently deleted. This action cannot be undone.
            </Text>

            <View style={[styles.deleteWarning, {
              backgroundColor: isDark ? colors.warning[900] : colors.warning[50],
              borderColor:     isDark ? colors.warning[700] : colors.warning[300],
            }]}>
              <AlertTriangle size={14} color={warningColor} strokeWidth={2} />
              <Text style={[styles.deleteWarningText, { color: warningText }]}>
                All tenants will be marked vacated · All beds become available
              </Text>
            </View>

            <View style={styles.deleteBtns}>
              <TouchableOpacity
                style={[styles.deleteCancelBtn, { backgroundColor: colors.background.tertiary }]}
                onPress={() => setShowDeleteConfirm(false)} disabled={deleting} activeOpacity={0.75}>
                <Text style={[styles.deleteCancelText, { color: textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.deleteConfirmBtn, { backgroundColor: dangerColor, opacity: deleting ? 0.55 : 1 }]}
                onPress={confirmDeleteRoom} disabled={deleting} activeOpacity={0.8}>
                {deleting
                  ? <ActivityIndicator color={colors.white} size="small" />
                  : (
                    <>
                      <Trash2 size={14} color={colors.white} strokeWidth={2.5} />
                      <Text style={[styles.deleteConfirmText, { color: colors.white }]}>Delete</Text>
                    </>
                  )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  navBar: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.md,
    borderBottomWidth: 1,
  },
  navBack:   { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  navTitle:  { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.lg, letterSpacing: typography.letterSpacing.tight },
  navSpacer: { width: 36 },

  scroll: {
    paddingHorizontal: spacing.md,
    paddingTop:        spacing.md,
    paddingBottom:     120,
  },

  // Grid
  grid:       { gap: spacing.sm },
  gridTablet: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between' },

  // Room card
  card: {
    borderRadius:  radius.xl,
    borderWidth:   1,
    overflow:      'hidden',
    marginBottom:  spacing.sm,
  },
  cardStrip: { height: 3 },
  cardBody:  { padding: spacing.md, gap: spacing.md },

  cardHeader: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.sm,
  },
  cardIconBox: {
    width:          34,
    height:         34,
    borderRadius:   radius.md,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  cardTitleWrap: { flex: 1 },
  cardTitle: {
    fontFamily:    typography.fontFamily.bold,
    fontSize:      typography.fontSize.md,
    letterSpacing: typography.letterSpacing.tight,
  },
  cardSubRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
    marginTop:     2,
    flexWrap:      'wrap',
  },
  cardSub: {
    fontFamily: typography.fontFamily.regular,
    fontSize:   typography.fontSize.xs,
  },
  archivedChip: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               3,
    paddingHorizontal: 6,
    paddingVertical:   2,
    borderRadius:      radius.full,
    borderWidth:       1,
  },
  archivedChipText: {
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      9,
    letterSpacing: typography.letterSpacing.wide,
  },
  cardActions: {
    flexDirection: 'row',
    gap:           spacing.xs,
  },
  cardActionBtn: {
    width:          30,
    height:         30,
    borderRadius:   radius.md,
    alignItems:     'center',
    justifyContent: 'center',
    borderWidth:    1,
  },

  // Stats row
  statsRow: {
    flexDirection:  'row',
    borderRadius:   radius.lg,
    borderWidth:    1,
    overflow:       'hidden',
  },
  stat: {
    flex:          1,
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.sm,
    padding:       spacing.sm,
  },
  statIconBox: {
    width:          30,
    height:         30,
    borderRadius:   radius.md,
    alignItems:     'center',
    justifyContent: 'center',
  },
  statLabel: {
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      9,
    letterSpacing: typography.letterSpacing.wider,
    marginBottom:  1,
  },
  statValue: {
    fontFamily:    typography.fontFamily.bold,
    fontSize:      typography.fontSize.sm,
    letterSpacing: typography.letterSpacing.tight,
  },
  statSep: { width: 1 },

  // View beds CTA
  viewBedsBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               spacing.sm,
    paddingVertical:   spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius:      radius.lg,
    borderWidth:       1,
  },
  viewBedsBtnText: {
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      typography.fontSize.sm,
    letterSpacing: typography.letterSpacing.wide,
  },

  // Pagination
  pagination: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    marginTop:      spacing.sm,
  },
  pageBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm,
    borderRadius:      radius.md,
    borderWidth:       1,
    minWidth:          80,
    justifyContent:    'center',
  },
  pageBtnText: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.fontSize.sm },
  pageCount:   { fontFamily: typography.fontFamily.medium, fontSize: typography.fontSize.sm },

  // Delete modal
  overlay: {
    flex:           1,
    justifyContent: 'center',
    alignItems:     'center',
    paddingHorizontal: spacing.lg,
  },
  deleteSheet: {
    borderRadius:      radius.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical:   spacing.xl,
    width:             '100%',
    ...shadows.xl,
  },
  deleteCloseBtn: {
    position:       'absolute',
    top:            spacing.md,
    right:          spacing.md,
    width:          28,
    height:         28,
    borderRadius:   radius.md,
    alignItems:     'center',
    justifyContent: 'center',
  },
  deleteIconBox: {
    width:          52,
    height:         52,
    borderRadius:   radius.full,
    alignItems:     'center',
    justifyContent: 'center',
    alignSelf:      'center',
    marginBottom:   spacing.md,
  },
  deleteTitle: {
    fontFamily:    typography.fontFamily.bold,
    fontSize:      typography.fontSize.xl,
    letterSpacing: typography.letterSpacing.tight,
    textAlign:     'center',
    marginBottom:  spacing.sm,
  },
  deleteMsg: {
    fontFamily:   typography.fontFamily.regular,
    fontSize:     typography.fontSize.sm,
    textAlign:    'center',
    lineHeight:   20,
    marginBottom: spacing.md,
  },
  deleteWarning: {
    flexDirection:     'row',
    alignItems:        'flex-start',
    gap:               spacing.sm,
    borderRadius:      radius.lg,
    borderWidth:       1,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm,
    marginBottom:      spacing.lg,
  },
  deleteWarningText: {
    fontFamily: typography.fontFamily.medium,
    fontSize:   typography.fontSize.xs,
    flex:       1,
    lineHeight: 18,
  },
  deleteBtns: {
    flexDirection: 'row',
    gap:           spacing.md,
  },
  deleteCancelBtn: {
    flex:            1,
    paddingVertical: spacing.md,
    borderRadius:    radius.lg,
    alignItems:      'center',
  },
  deleteCancelText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize:   typography.fontSize.md,
  },
  deleteConfirmBtn: {
    flex:           1,
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            spacing.xs,
    paddingVertical: spacing.md,
    borderRadius:   radius.lg,
  },
  deleteConfirmText: {
    fontFamily:    typography.fontFamily.bold,
    fontSize:      typography.fontSize.md,
    letterSpacing: typography.letterSpacing.wide,
  },
});