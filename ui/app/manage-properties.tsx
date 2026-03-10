import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StatusBar,
  Dimensions,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenContainer from '@/components/ScreenContainer';
import Card from '@/components/Card';
import ArchiveWarningModal from '@/components/ArchiveWarningModal';
import FAB from '@/components/FAB';
import EmptyState from '@/components/EmptyState';
import Skeleton from '@/components/Skeleton';
import ApiErrorCard from '@/components/ApiErrorCard';
import { ChevronLeft, Building2, MapPin, Trash2, Edit, Archive, AlertTriangle, X } from 'lucide-react-native';
import { spacing, typography, radius, shadows } from '@/theme';
import { useTheme } from '@/context/ThemeContext';
import { useProperty } from '@/context/PropertyContext';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { propertyService } from '@/services/apiClient';
import { clearScreenCache, cacheKeys } from '@/services/screenCache';

export default function ManagePropertiesScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { properties, loading, refreshProperties } = useProperty();
  const isOnline = useNetworkStatus();
  const [showArchiveWarning, setShowArchiveWarning] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<any>(null);
  const [warningAction, setWarningAction] = useState<'edit' | 'delete' | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);


  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshProperties();
    } finally {
      setRefreshing(false);
    }
  }, [refreshProperties]);

  const handleAddProperty = () => {
    router.push('/property-form');
  };

  const handleEditProperty = (property: any) => {
    if (property.active === false) {
      setSelectedProperty(property);
      setWarningAction('edit');
      setShowArchiveWarning(true);
    } else {
      // Navigate to edit screen with propertyId
      router.push(`/property-form?propertyId=${property.id}`);
    }
  };

  const handleDeleteProperty = (property: any) => {
    if (property.active === false) {
      setSelectedProperty(property);
      setWarningAction('delete');
      setShowArchiveWarning(true);
    } else {
      // Show delete confirmation
      setSelectedProperty(property);
      setShowDeleteConfirm(true);
    }
  };

  const handleConfirmDelete = async () => {
    if (!selectedProperty) return;

    try {
      setDeleting(true);
      const deletedPropertyId = selectedProperty.id;
      
      // Call delete API
      await propertyService.deleteProperty(deletedPropertyId);
      
      // Clear ALL caches to force fresh fetch
      clearScreenCache();
      
      // Refresh the properties list from API (bypass cache)
      await refreshProperties();
      
      // Close modal and reset state
      setShowDeleteConfirm(false);
      setSelectedProperty(null);
    } catch (error) {
      console.error('Error deleting property:', error);
      // Show error message
    } finally {
      setDeleting(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <StatusBar barStyle={colors.background.primary === '#000' ? 'light-content' : 'dark-content'} />
      
      {/* Modern Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.background.secondary,
            borderBottomColor: colors.border.light,
            paddingTop: insets.top + spacing.lg,
          },
        ]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.6}>
          <ChevronLeft size={24} color={colors.text.primary} strokeWidth={2.5} />
        </TouchableOpacity>
        
        <View style={styles.headerContent}>
          <Text style={[styles.headerTitle, { color: colors.text.primary }]}>
            Properties
          </Text>
          <Text style={[styles.headerSubtitle, { color: colors.text.secondary }]}>
            {properties.length} {properties.length === 1 ? 'property' : 'properties'}
          </Text>
        </View>

        <View style={styles.addHeaderButton} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: spacing.xxxl },
        ]}
        showsVerticalScrollIndicator={false}
        scrollEnabled={true}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary[500]]}
            tintColor={colors.primary[500]}
          />
        }>
        {loading ? (
          <View style={styles.skeletonContainer}>
            <Skeleton height={180} count={3} />
          </View>
        ) : properties.length === 0 ? (
          <View style={styles.emptyContainer}>
            <EmptyState
              icon={Building2}
              title="No Properties Yet"
              subtitle="Add your first property to get started with hostel management"
              actionLabel="Add Property"
              onActionPress={handleAddProperty}
            />
          </View>
        ) : (
          <View style={styles.propertiesGrid}>
            {properties.map((property, index) => (
              <Card
                key={index}
                style={{
                  ...styles.propertyCard,
                  borderColor: property.active === false ? colors.warning[200] : colors.border.light,
                } as any}>
                {/* Card Header with Icon and Badge */}
                <View style={styles.cardHeader}>
                  <View style={[styles.iconContainer, { backgroundColor: colors.background.tertiary }]}>
                    <Building2 size={24} color={colors.primary[400]} strokeWidth={1.5} />
                  </View>
                  <View style={styles.headerInfo}>
                    <Text style={[styles.propertyName, { color: colors.text.primary }]} numberOfLines={1}>
                      {property.name}
                    </Text>
                    {property.active === false && (
                      <View style={[styles.statusBadge, { backgroundColor: colors.warning[100] }]}>
                        <Archive size={11} color={colors.warning[700]} />
                        <Text style={[styles.statusBadgeText, { color: colors.warning[700] }]}>
                          Archived
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Address Section */}
                <View style={styles.addressSection}>
                  <MapPin size={14} color={colors.text.tertiary} strokeWidth={2} />
                  <Text
                    style={[styles.addressText, { color: colors.text.secondary }]}
                    numberOfLines={2}>
                    {property.address}
                  </Text>
                </View>

                {/* Property Details */}
                <View style={styles.detailsRow}>
                  <View style={styles.detailItem}>
                    <Text style={[styles.detailLabel, { color: colors.text.tertiary }]}>
                      Created
                    </Text>
                    <Text style={[styles.detailValue, { color: colors.text.primary }]}>
                      {new Date(property.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </Text>
                  </View>
                  <View style={[styles.divider, { backgroundColor: colors.border.light }]} />
                  <View style={styles.detailItem}>
                    <Text style={[styles.detailLabel, { color: colors.text.tertiary }]}>
                      Status
                    </Text>
                    <View style={[
                      styles.statusIndicator,
                      {
                        backgroundColor: property.active !== false ? colors.success[100] : colors.warning[100],
                      },
                    ]}>
                      <Text style={[
                        styles.statusText,
                        {
                          color: property.active !== false ? colors.success[700] : colors.warning[700],
                        },
                      ]}>
                        {property.active !== false ? 'Active' : 'Inactive'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Action Buttons */}
                {property.active !== false && (
                  <View style={styles.actionButtons}>
                    <TouchableOpacity
                      style={[
                        styles.actionButton,
                        styles.editButton,
                        {
                          backgroundColor: colors.background.tertiary,
                          opacity: !isOnline ? 0.5 : 1,
                        },
                      ]}
                      onPress={() => handleEditProperty(property)}
                      activeOpacity={0.6}
                      disabled={!isOnline}>
                      <Edit size={18} color={colors.primary[600]} strokeWidth={2} />
                      <Text style={[styles.actionButtonText, { color: colors.primary[600] }]}>
                        Edit
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.actionButton,
                        styles.deleteButton,
                        {
                          backgroundColor: colors.background.tertiary,
                          opacity: !isOnline ? 0.5 : 1,
                        },
                      ]}
                      onPress={() => handleDeleteProperty(property)}
                      activeOpacity={0.6}
                      disabled={!isOnline}>
                      <Trash2 size={18} color={colors.danger[500]} strokeWidth={2} />
                      <Text style={[styles.actionButtonText, { color: colors.danger[500] }]}>
                        Delete
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </Card>
            ))}
          </View>
        )}
      </ScrollView>

        <FAB onPress={handleAddProperty} disabled={!isOnline} />

      <ArchiveWarningModal
        visible={showArchiveWarning}
        resourceName={selectedProperty?.name || 'Property'}
        resourceType="property"
        archivedReason={selectedProperty?.archivedReason}
        action={warningAction}
        onClose={() => {
          setShowArchiveWarning(false);
          setSelectedProperty(null);
        }}
      />

      <Modal visible={showDeleteConfirm} transparent animationType="fade">
        <View style={[styles.overlay, { backgroundColor: colors.modal.overlay }]}>
          <View style={[styles.deleteModal, { backgroundColor: colors.background.secondary }]}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => {
                setShowDeleteConfirm(false);
                setSelectedProperty(null);
              }}
            >
              <X size={24} color={colors.text.primary} />
            </TouchableOpacity>

            <View style={[styles.deleteIconContainer, { backgroundColor: colors.background.tertiary }]}>
              <AlertTriangle size={48} color={colors.danger[500]} />
            </View>

            <Text style={[styles.deleteTitle, { color: colors.text.primary }]}>
              Delete Property?
            </Text>

            <Text style={[styles.deleteDescription, { color: colors.text.secondary }]}>
              This action cannot be undone. All data associated with this property will be permanently deleted.
            </Text>

            <Card
              style={{
                ...styles.deleteWarningCard,
                backgroundColor: colors.background.tertiary,
              } as any}
            >
              <View style={styles.warningHeader}>
                <AlertTriangle size={16} color={colors.danger[500]} />
                <Text style={[styles.warningTitle, { color: colors.danger[500] }]}>
                  Data that will be deleted:
                </Text>
              </View>
              <View style={styles.warningList}>
                <WarningItem
                  text="All tenants"
                  colors={colors}
                />
                <WarningItem
                  text="All rooms"
                  colors={colors}
                />
                <WarningItem
                  text="All beds"
                  colors={colors}
                />
                <WarningItem
                  text="All staff"
                  colors={colors}
                />
                <WarningItem
                  text="All payments"
                  colors={colors}
                />
                <WarningItem
                  text="All payment history"
                  colors={colors}
                />
              </View>
            </Card>

            <View style={styles.deleteButtonContainer}>
              <TouchableOpacity
                style={[styles.cancelButton, { borderColor: colors.border.light }]}
                onPress={() => {
                  setShowDeleteConfirm(false);
                  setSelectedProperty(null);
                }}
                disabled={deleting}
              >
                <Text style={[styles.cancelButtonText, { color: colors.text.primary }]}>
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.deleteButtonConfirm,
                  {
                    backgroundColor: colors.danger[500],
                    opacity: deleting ? 0.6 : 1,
                  },
                ]}
                onPress={handleConfirmDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <>
                    <Trash2 size={18} color={colors.white} strokeWidth={2} />
                    <Text style={[styles.deleteButtonText, { color: colors.white }]}>
                      Delete Property
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

interface WarningItemProps {
  text: string;
  colors: any;
}

function WarningItem({ text, colors }: WarningItemProps) {
  return (
    <View style={styles.warningItem}>
      <View
        style={[styles.warningDot, { backgroundColor: colors.danger[500] }]}
      />
      <Text style={[styles.warningText, { color: colors.danger[500] }]}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: -0.5,
    marginBottom: spacing.xs,
  },
  headerSubtitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
  },
  addHeaderButton: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  skeletonContainer: {
    gap: spacing.md,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 400,
  },
  propertiesGrid: {
    gap: spacing.md,
  },
  propertyCard: {
    overflow: 'hidden',
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  headerInfo: {
    flex: 1,
  },
  propertyName: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.xs,
    letterSpacing: -0.3,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    gap: 4,
    alignSelf: 'flex-start',
  },
  statusBadgeText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  addressSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  addressText: {
    fontSize: typography.fontSize.sm,
    flex: 1,
    lineHeight: 20,
    fontWeight: typography.fontWeight.regular,
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  detailItem: {
    flex: 1,
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailValue: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  divider: {
    width: 1,
    height: 30,
    marginHorizontal: spacing.md,
  },
  statusIndicator: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  statusText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  editButton: {
    // Color set dynamically
  },
  deleteButton: {
    // Color set dynamically
  },
  actionButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: -0.2,
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  deleteModal: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    ...shadows.lg,
    maxHeight: '90%',
  },
  closeButton: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    padding: spacing.sm,
  },
  deleteIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  deleteTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  deleteDescription: {
    fontSize: typography.fontSize.md,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  deleteWarningCard: {
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  warningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  warningTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  warningList: {
    gap: spacing.sm,
  },
  warningItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  warningDot: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
  },
  warningText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  deleteButtonContainer: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  deleteButtonConfirm: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  deleteButtonText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
});
