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
import Card from '@/components/Card';
import ArchiveWarningModal from '@/components/ArchiveWarningModal';
import FAB from '@/components/FAB';
import EmptyState from '@/components/EmptyState';
import Skeleton from '@/components/Skeleton';
import ApiErrorCard from '@/components/ApiErrorCard';
import { ChevronLeft, DoorOpen, Bed, IndianRupee, Eye, Archive, Trash2, Edit } from 'lucide-react-native';
import { spacing, typography, radius } from '@/theme';
import { useTheme } from '@/context/ThemeContext';
import { useProperty } from '@/context/PropertyContext';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { roomService } from '@/services/apiClient';
import type { Room, PaginatedResponse } from '@/services/apiTypes';
import { cacheKeys, clearScreenCache, getScreenCache, setScreenCache } from '@/services/screenCache';

const ROOMS_CACHE_STALE_MS = 60 * 1000;
const ROOMS_FOCUS_THROTTLE_MS = 60 * 1000;

export default function ManageRoomsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { selectedPropertyId, selectedProperty, loading: propertyLoading } = useProperty();
  const isOnline = useNetworkStatus();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showArchiveWarning, setShowArchiveWarning] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<any>(null);
  const [warningAction, setWarningAction] = useState<'edit' | 'delete' | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const lastRoomsFocusRefreshRef = useRef<number>(0);

  const fetchRooms = useCallback(async (forceNetwork: boolean = false) => {
    if (!selectedPropertyId) {
      setLoading(false);
      return;
    }

    const cacheKey = cacheKeys.rooms(selectedPropertyId);
    if (!forceNetwork) {
      const cachedResponse = getScreenCache<PaginatedResponse<Room>>(cacheKey, ROOMS_CACHE_STALE_MS);
      if (cachedResponse) {
        setRooms(cachedResponse.data || []);
        setError(null);
        setLoading(false);
        return;
      }
    }

    try {
      setLoading(true);
      setError(null);
      const response = await roomService.getRooms(selectedPropertyId);

      if (response.data) {
        setRooms(response.data);
        setScreenCache(cacheKey, response);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load rooms');
    } finally {
      setLoading(false);
    }
  }, [selectedPropertyId]);

  useFocusEffect(
    useCallback(() => {
      if (propertyLoading || !selectedPropertyId) return;
      
      const cacheKey = cacheKeys.rooms(selectedPropertyId);
      const hasFreshCache = !!getScreenCache<PaginatedResponse<Room>>(cacheKey, ROOMS_CACHE_STALE_MS);
      const now = Date.now();
      const shouldRefreshBecauseCacheMissing = !hasFreshCache;
      const shouldRefreshByThrottle =
        lastRoomsFocusRefreshRef.current === 0 ||
        (now - lastRoomsFocusRefreshRef.current) > ROOMS_FOCUS_THROTTLE_MS;

      if (shouldRefreshBecauseCacheMissing || shouldRefreshByThrottle) {
        lastRoomsFocusRefreshRef.current = now;
        fetchRooms(shouldRefreshBecauseCacheMissing);
      }
    }, [propertyLoading, selectedPropertyId, fetchRooms])
  );

  const handleRetry = () => {
    fetchRooms(true);
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchRooms(true);
    } finally {
      setRefreshing(false);
    }
  }, [fetchRooms]);

  const handleAddRoom = () => {
    if (!selectedPropertyId) {
      return;
    }
    router.push('/room-form');
  };

  const handleEditRoom = (room: any) => {
    if (room.active === false) {
      setSelectedRoom(room);
      setWarningAction('edit');
      setShowArchiveWarning(true);
    } else {
      router.push(`/room-form?roomId=${room.id}`);
    }
  };

  const handleDeleteRoom = (room: any) => {
    if (room.active === false) {
      setSelectedRoom(room);
      setWarningAction('delete');
      setShowArchiveWarning(true);
    } else {
      setSelectedRoom(room);
      setShowDeleteConfirm(true);
    }
  };

  const confirmDeleteRoom = async () => {
    if (!selectedRoom) return;

    try {
      setDeleting(true);
      await roomService.deleteRoom(selectedRoom.id);
      
      // Clear cache and refresh
      clearScreenCache('rooms:');
      await fetchRooms();
      
      setShowDeleteConfirm(false);
      setSelectedRoom(null);
    } catch (err: any) {
      alert(err?.message || 'Failed to delete room');
    } finally {
      setDeleting(false);
    }
  };

  if (propertyLoading || loading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background.primary }]}
        edges={['top', 'bottom']}>
        <View style={[styles.header, { backgroundColor: colors.background.secondary, borderBottomColor: colors.border.light }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}>
            <ChevronLeft size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Manage Rooms</Text>
          <View style={styles.placeholder} />
        </View>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          <Skeleton height={150} count={3} />
        </ScrollView>
      </SafeAreaView>
    );
  }

const showEmptyState = !!selectedProperty && !loading && rooms.length === 0 && !error;

  if (!selectedProperty) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background.primary }]}
        edges={['top', 'bottom']}>
        <View style={[styles.header, { backgroundColor: colors.background.secondary, borderBottomColor: colors.border.light }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}>
            <ChevronLeft size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Manage Rooms</Text>
          <View style={styles.placeholder} />
        </View>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          <EmptyState
            icon={DoorOpen}
            title="No Property Selected"
            subtitle="Please select a property first to manage rooms"
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background.primary }]}
      edges={['top', 'bottom']}>
      <View style={[styles.header, { backgroundColor: colors.background.secondary, borderBottomColor: colors.border.light }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}>
          <ChevronLeft size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Manage Rooms</Text>
        <View style={styles.placeholder} />
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
        {error ? (
          <ApiErrorCard error={error} onRetry={handleRetry} />
        ) : showEmptyState ? (
          <EmptyState
            icon={DoorOpen}
            title="No Rooms Yet"
            subtitle="Add rooms to start organizing tenants and beds in your property"
            actionLabel="Add Room"
            onActionPress={handleAddRoom}
          />
        ) : (
          <>
            {rooms.map((room, index) => (
              <Card key={index} style={[styles.roomCard, room.active === false ? { opacity: 0.65 } : {}] as any}>
                <View style={styles.roomCardContent}>
                  <View style={styles.roomHeader}>
                    <View style={[styles.roomIconContainer, { backgroundColor: room.active === false ? colors.neutral[100] : colors.primary[100] }]}>
                      <DoorOpen size={24} color={room.active === false ? colors.text.tertiary : colors.primary[600]} />
                    </View>
                    <View style={styles.roomInfo}>
                      <View style={styles.roomNameRow}>
                        <Text style={[styles.roomNumber, { color: colors.text.primary }]}>
                          Room {room.roomNumber}
                        </Text>
                        {room.active === false && (
                          <View style={[styles.archivedBadge, { backgroundColor: colors.warning[100] }]}>
                            <Archive size={12} color={colors.warning[600]} />
                            <Text style={[styles.archivedBadgeText, { color: colors.warning[600] }]}>
                              Archived
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.roomFloor, { color: colors.text.secondary }]}>
                        Floor {room.floor}
                      </Text>
                    </View>
                    {room.active !== false && (
                      <View style={styles.roomActionIcons}>
                        <TouchableOpacity
                          style={[styles.roomIconButton, { backgroundColor: colors.primary[50] }]}
                          onPress={() => handleEditRoom(room)}
                          activeOpacity={0.6}
                          disabled={!isOnline}>
                          <Edit size={16} color={colors.primary[600]} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.roomIconButton, { backgroundColor: colors.danger[50] }]}
                          onPress={() => handleDeleteRoom(room)}
                          activeOpacity={0.6}
                          disabled={!isOnline}>
                          <Trash2 size={16} color={colors.danger[600]} />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>

                  <View style={[styles.roomStatsContainer, { backgroundColor: room.active === false ? colors.background.primary : colors.background.tertiary }]}>
                    <View style={styles.statItem}>
                      <View style={[styles.statIconContainer, { backgroundColor: colors.success[50] }]}>
                        <IndianRupee size={16} color={colors.success[600]} />
                      </View>
                      <View>
                        <Text style={[styles.statLabel, { color: colors.text.secondary }]}>Price</Text>
                        <Text style={[styles.statValue, { color: colors.text.primary }]}>
                          ₹{room.price.toLocaleString()}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.statDivider} />

                    <View style={styles.statItem}>
                      <View style={[styles.statIconContainer, { backgroundColor: colors.primary[50] }]}>
                        <Bed size={16} color={colors.primary[600]} />
                      </View>
                      <View>
                        <Text style={[styles.statLabel, { color: colors.text.secondary }]}>Beds</Text>
                        <Text style={[styles.statValue, { color: colors.text.primary }]}>
                          {room.numberOfBeds} bed{room.numberOfBeds !== 1 ? 's' : ''}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.viewBedsButton, { backgroundColor: colors.primary[500] }]}
                    onPress={() => router.push(`/manage-beds?roomId=${room.id}`)}
                    activeOpacity={0.8}
                    disabled={room.active === false}>
                    <Eye size={16} color={colors.white} />
                    <Text style={[styles.viewBedsButtonText, { color: colors.white }]}>
                      View Beds
                    </Text>
                  </TouchableOpacity>
                </View>
              </Card>
            ))}
          </>
        )}
      </ScrollView>

      {!showEmptyState && <FAB onPress={handleAddRoom} disabled={!isOnline} />}

      <ArchiveWarningModal
        visible={showArchiveWarning}
        resourceName={`Room ${selectedRoom?.roomNumber || ''}`}
        resourceType="room"
        archivedReason={selectedRoom?.archivedReason}
        action={warningAction}
        onClose={() => {
          setShowArchiveWarning(false);
          setSelectedRoom(null);
        }}
      />

      <Modal
        visible={showDeleteConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteConfirm(false)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View style={[styles.modalContent, { backgroundColor: colors.background.primary }]}>
            <Text style={[styles.modalTitle, { color: colors.text.primary }]}>Delete Room?</Text>
            
            <Text style={[styles.modalMessage, { color: colors.text.secondary }]}>
              This room will be permanently deleted. This action cannot be undone.
            </Text>

            <View style={[styles.warningBox, { 
              backgroundColor: colors.background.secondary, 
              borderColor: colors.danger[500] 
            } as any]}>
              <Text style={[styles.warningTitle, { color: colors.danger[500] } as any]}>⚠️ Warning</Text>
              <Text style={[styles.warningText, { color: colors.text.secondary }]}>
                • All tenants in this room will be marked as vacated{'\n'}
                • All beds in this room will become available
              </Text>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.background.secondary }]}
                onPress={() => setShowDeleteConfirm(false)}
                disabled={deleting}
              >
                <Text style={[styles.modalButtonText, { color: colors.text.primary }]}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, styles.deleteButton, { 
                  backgroundColor: colors.danger[500] 
                } as any]}
                onPress={confirmDeleteRoom}
                disabled={deleting}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={[styles.modalButtonText, { color: '#fff' }]}>Delete</Text>
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
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
  },
  headerTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
  },

  roomCard: {
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  roomCardContent: {
    gap: spacing.md,
  },
  roomFloor: {
    fontSize: typography.fontSize.sm,
  },
  roomStatsContainer: {
    flexDirection: 'row',
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  statItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    gap: spacing.sm,
  },
  statIconContainer: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: {
    fontSize: typography.fontSize.xs,
    marginBottom: 2,
  },
  statValue: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  statDivider: {
    width: 1,
    opacity: 0.1,
  },
  viewBedsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  viewBedsButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  divider: {
    height: 1,
    marginBottom: spacing.lg,
  },
  detailsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  detailItem: {
    flex: 1,
  },
  detailIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  detailLabel: {
    fontSize: typography.fontSize.xs,
    marginLeft: spacing.xs,
  },
  detailValue: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  roomNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
    flex: 1,
  },
  roomActionIcons: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'center',
  },
  roomIconButton: {
    padding: spacing.xs,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
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
  actionsContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
    minWidth: '32%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  actionText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    marginLeft: spacing.xs,
  },
  propertyName: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  placeholder: {
    width: 40,
  },
  roomHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  roomIconContainer: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  roomInfo: {
    flex: 1,
  },
  roomNumber: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.md,
  },
  modalMessage: {
    fontSize: typography.fontSize.md,
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  warningBox: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  warningTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.sm,
  },
  warningText: {
    fontSize: typography.fontSize.sm,
    lineHeight: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  modalButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButton: {
    // backgroundColor set inline
  },
  modalButtonText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
});
