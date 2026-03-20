import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ArchiveWarningModal from '@/components/ArchiveWarningModal';
import FAB from '@/components/FAB';
import EmptyState from '@/components/EmptyState';
import Skeleton from '@/components/Skeleton';
import {
  ChevronLeft,
  Building2,
  MapPin,
  Trash2,
  Pencil,
  Archive,
  AlertTriangle,
  X,
  ArrowUpRight,
  Calendar,
} from 'lucide-react-native';
import { spacing, radius, shadows } from '@/theme';
import { typography } from '@/theme/typography';
import { useTheme } from '@/context/ThemeContext';
import { useProperty } from '@/context/PropertyContext';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import useResponsiveLayout from '@/hooks/useResponsiveLayout';
import { propertyService } from '@/services/apiClient';
import { clearScreenCache } from '@/services/screenCache';

export default function ManagePropertiesScreen() {
  const { colors, isDark }    = useTheme();
  const router                = useRouter();
  const insets                = useSafeAreaInsets();
  const { isTablet, contentMaxWidth, modalMaxWidth } = useResponsiveLayout();
  const { properties, loading, refreshProperties }   = useProperty();
  const isOnline              = useNetworkStatus();

  const [showArchiveWarning, setShowArchiveWarning] = useState(false);
  const [showDeleteConfirm,  setShowDeleteConfirm]  = useState(false);
  const [selectedProperty,   setSelectedProperty]   = useState<any>(null);
  const [warningAction,      setWarningAction]       = useState<'edit' | 'delete' | null>(null);
  const [refreshing,         setRefreshing]          = useState(false);
  const [deleting,           setDeleting]            = useState(false);

  // ── Color aliases ─────────────────────────────────────────────────────────
  const brandColor    = colors.primary[500];
  const brandLight    = isDark ? colors.primary[900] : colors.primary[50];
  const brandText     = isDark ? colors.primary[300] : colors.primary[600];
  const successColor  = colors.success[500];
  const successLight  = isDark ? colors.success[900] : colors.success[50];
  const successText   = isDark ? colors.success[300] : colors.success[700];
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

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refreshProperties(); } finally { setRefreshing(false); }
  }, [refreshProperties]);

  const handleEditProperty = (property: any) => {
    if (property.active === false) {
      setSelectedProperty(property); setWarningAction('edit'); setShowArchiveWarning(true);
    } else {
      router.push(`/property-form?propertyId=${property.id}`);
    }
  };

  const handleDeleteProperty = (property: any) => {
    if (property.active === false) {
      setSelectedProperty(property); setWarningAction('delete'); setShowArchiveWarning(true);
    } else {
      setSelectedProperty(property); setShowDeleteConfirm(true);
    }
  };

  const handleConfirmDelete = async () => {
    if (!selectedProperty) return;
    try {
      setDeleting(true);
      await propertyService.deleteProperty(selectedProperty.id);
      clearScreenCache();
      await refreshProperties();
      setShowDeleteConfirm(false); setSelectedProperty(null);
    } catch (err) {
      console.error('Error deleting property:', err);
    } finally {
      setDeleting(false);
    }
  };

  const closeDelete = () => { setShowDeleteConfirm(false); setSelectedProperty(null); };

  return (
    <View style={[styles.container, { backgroundColor: pageBg }]}>

      {/* ── Nav bar ──────────────────────────────────────────────────────── */}
      <View style={[
        styles.navBar,
        { backgroundColor: cardBg, borderBottomColor: colors.border.light, paddingTop: insets.top + spacing.sm },
      ]}>
        <TouchableOpacity style={styles.navBack} onPress={() => router.back()} activeOpacity={0.7}>
          <ChevronLeft size={22} color={textPrimary} strokeWidth={2} />
        </TouchableOpacity>
        <View style={styles.navCenter}>
          <Text style={[styles.navTitle, { color: textPrimary }]}>Properties</Text>
          {!loading && (
            <Text style={[styles.navCount, { color: textTertiary }]}>
              {properties.length} {properties.length === 1 ? 'property' : 'properties'}
            </Text>
          )}
        </View>
        <View style={styles.navSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          isTablet && { alignSelf: 'center', width: '100%', maxWidth: contentMaxWidth },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[brandColor]} tintColor={brandColor} />
        }>

        {loading ? (
          <Skeleton height={140} count={3} />
        ) : properties.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No Properties Yet"
            subtitle="Add your first property to get started with hostel management"
            actionLabel="Add Property"
            onActionPress={() => router.push('/property-form')}
          />
        ) : (
          <View style={[styles.grid, isTablet && styles.gridTablet]}>
            {properties.map((property, index) => {
              const isActive   = property.active !== false;
              const isArchived = property.active === false;

              // Strip color: active = brand, archived = warning
              const stripColor = isArchived ? warningColor : brandColor;

              const createdLabel = property.createdAt
                ? new Date(property.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })
                : '—';

              return (
                <View
                  key={index}
                  style={[
                    styles.card,
                    {
                      backgroundColor: cardBg,
                      borderColor:     isArchived ? (isDark ? colors.warning[700] : colors.warning[300]) : cardBorder,
                      width:           isTablet ? '48.5%' : '100%',
                    },
                  ]}>
                  {/* Top accent strip */}
                  <View style={[styles.cardStrip, { backgroundColor: stripColor }]} />

                  <View style={styles.cardBody}>
                    {/* Header row: icon + name + status */}
                    <View style={styles.cardHeader}>
                      <View style={[styles.cardIconBox, {
                        backgroundColor: isArchived ? warningLight : brandLight,
                      }]}>
                        <Building2 size={18} color={isArchived ? warningText : brandText} strokeWidth={2} />
                      </View>
                      <View style={styles.cardNameWrap}>
                        <Text style={[styles.cardName, { color: textPrimary }]} numberOfLines={1}>
                          {property.name}
                        </Text>
                        {isArchived && (
                          <View style={[styles.archivedChip, {
                            backgroundColor: warningLight,
                            borderColor: isDark ? colors.warning[700] : colors.warning[300],
                          }]}>
                            <Archive size={10} color={warningColor} strokeWidth={2} />
                            <Text style={[styles.archivedChipText, { color: warningText }]}>Archived</Text>
                          </View>
                        )}
                      </View>
                      {isActive && (
                        <View style={[styles.activeDot, { backgroundColor: successColor }]} />
                      )}
                    </View>

                    {/* Address */}
                    {property.address && (
                      <View style={styles.addressRow}>
                        <MapPin size={12} color={textTertiary} strokeWidth={1.5} />
                        <Text style={[styles.addressText, { color: textSecondary }]} numberOfLines={2}>
                          {property.address}
                        </Text>
                      </View>
                    )}

                    {/* Meta row */}
                    <View style={[styles.metaRow, { borderTopColor: colors.border.light }]}>
                      <View style={styles.metaItem}>
                        <Calendar size={11} color={textTertiary} strokeWidth={1.5} />
                        <Text style={[styles.metaText, { color: textTertiary }]}>
                          {createdLabel}
                        </Text>
                      </View>
                      <View style={[styles.statusPill, {
                        backgroundColor: isActive ? successLight : warningLight,
                        borderColor:     isActive
                          ? (isDark ? colors.success[700] : colors.success[200])
                          : (isDark ? colors.warning[700] : colors.warning[300]),
                      }]}>
                        <Text style={[styles.statusPillText, { color: isActive ? successText : warningText }]}>
                          {isActive ? 'Active' : 'Inactive'}
                        </Text>
                      </View>
                    </View>

                    {/* Actions — only for active properties */}
                    {isActive && (
                      <View style={styles.actionsRow}>
                        <TouchableOpacity
                          style={[styles.actionBtn, {
                            backgroundColor: brandLight,
                            borderColor:     isDark ? colors.primary[700] : colors.primary[200],
                            opacity:         !isOnline ? 0.45 : 1,
                          }]}
                          onPress={() => handleEditProperty(property)}
                          activeOpacity={0.75}
                          disabled={!isOnline}>
                          <Pencil size={14} color={brandText} strokeWidth={2} />
                          <Text style={[styles.actionBtnText, { color: brandText }]}>Edit</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.actionBtn, {
                            backgroundColor: dangerLight,
                            borderColor:     isDark ? colors.danger[700] : colors.danger[200],
                            opacity:         !isOnline ? 0.45 : 1,
                          }]}
                          onPress={() => handleDeleteProperty(property)}
                          activeOpacity={0.75}
                          disabled={!isOnline}>
                          <Trash2 size={14} color={dangerText} strokeWidth={2} />
                          <Text style={[styles.actionBtnText, { color: dangerText }]}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <FAB onPress={() => router.push('/property-form')} disabled={!isOnline} />

      {/* ── Archive warning ───────────────────────────────────────────────── */}
      <ArchiveWarningModal
        visible={showArchiveWarning}
        resourceName={selectedProperty?.name || 'Property'}
        resourceType="property"
        archivedReason={selectedProperty?.archivedReason}
        action={warningAction}
        onClose={() => { setShowArchiveWarning(false); setSelectedProperty(null); }}
      />

      {/* ── Delete confirm modal ──────────────────────────────────────────── */}
      <Modal visible={showDeleteConfirm} transparent animationType="fade" onRequestClose={closeDelete}>
        <View style={[styles.overlay, { backgroundColor: colors.modal.overlay }]}>
          <View style={[styles.deleteSheet, {
            backgroundColor: cardBg,
            maxWidth:        modalMaxWidth,
          }]}>
            {/* Close */}
            <TouchableOpacity
              style={[styles.deleteCloseBtn, { backgroundColor: colors.background.tertiary }]}
              onPress={closeDelete} disabled={deleting}>
              <X size={15} color={textSecondary} strokeWidth={2} />
            </TouchableOpacity>

            {/* Icon */}
            <View style={[styles.deleteIconBox, { backgroundColor: dangerLight }]}>
              <Trash2 size={26} color={dangerText} strokeWidth={2} />
            </View>

            <Text style={[styles.deleteTitle, { color: textPrimary }]}>Delete Property?</Text>
            <Text style={[styles.deleteMsg, { color: textSecondary }]}>
              This action is permanent and cannot be undone. The following data will be removed:
            </Text>

            {/* What gets deleted */}
            <View style={[styles.deleteList, {
              backgroundColor: isDark ? colors.danger[900] : colors.danger[50],
              borderColor:     isDark ? colors.danger[700] : colors.danger[200],
            }]}>
              {['Tenants','Rooms','Beds','Staff','Payments','Payment history'].map((item, i) => (
                <View key={i} style={styles.deleteListItem}>
                  <View style={[styles.deleteListDot, { backgroundColor: dangerColor }]} />
                  <Text style={[styles.deleteListText, { color: isDark ? colors.danger[300] : colors.danger[700] }]}>
                    {item}
                  </Text>
                </View>
              ))}
            </View>

            {/* Buttons */}
            <View style={styles.deleteBtns}>
              <TouchableOpacity
                style={[styles.deleteCancelBtn, { backgroundColor: colors.background.tertiary }]}
                onPress={closeDelete} disabled={deleting} activeOpacity={0.75}>
                <Text style={[styles.deleteCancelText, { color: textPrimary }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.deleteConfirmBtn, { backgroundColor: dangerColor, opacity: deleting ? 0.55 : 1 }]}
                onPress={handleConfirmDelete} disabled={deleting} activeOpacity={0.8}>
                {deleting
                  ? <ActivityIndicator color={colors.white} size="small" />
                  : (
                    <>
                      <Trash2 size={15} color={colors.white} strokeWidth={2.5} />
                      <Text style={[styles.deleteConfirmText, { color: colors.white }]}>Delete</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Nav bar
  navBar: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: spacing.md,
    paddingBottom:     spacing.md,
    borderBottomWidth: 1,
    gap:               spacing.sm,
  },
  navBack:    { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  navCenter:  { flex: 1 },
  navTitle:   { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xl, letterSpacing: typography.letterSpacing.tight },
  navCount:   { fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.xs, marginTop: 1 },
  navSpacer:  { width: 36 },

  scroll: {
    paddingHorizontal: spacing.md,
    paddingTop:        spacing.md,
    paddingBottom:     120,
  },

  // Grid
  grid:       { gap: spacing.sm },
  gridTablet: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between' },

  // Property card
  card: {
    borderRadius:  radius.xl,
    borderWidth:   1,
    overflow:      'hidden',
    marginBottom:  spacing.sm,
  },
  cardStrip: { height: 3 },
  cardBody:  { padding: spacing.md },

  cardHeader: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.sm,
    marginBottom:  spacing.sm,
  },
  cardIconBox: {
    width:          36,
    height:         36,
    borderRadius:   radius.md,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  cardNameWrap: { flex: 1, gap: 4 },
  cardName: {
    fontFamily:    typography.fontFamily.bold,
    fontSize:      typography.fontSize.md,
    letterSpacing: typography.letterSpacing.tight,
  },
  archivedChip: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    alignSelf:         'flex-start',
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
  activeDot: {
    width:        8,
    height:       8,
    borderRadius: 4,
  },

  // Address
  addressRow: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    gap:           5,
    marginBottom:  spacing.sm,
  },
  addressText: {
    fontFamily:  typography.fontFamily.regular,
    fontSize:    typography.fontSize.xs,
    flex:        1,
    lineHeight:  17,
  },

  // Meta row
  metaRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    paddingTop:     spacing.sm,
    borderTopWidth: 1,
    marginBottom:   spacing.md,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
  },
  metaText: {
    fontFamily: typography.fontFamily.regular,
    fontSize:   typography.fontSize.xs,
  },
  statusPill: {
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

  // Action buttons
  actionsRow: {
    flexDirection: 'row',
    gap:           spacing.sm,
  },
  actionBtn: {
    flex:              1,
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               5,
    paddingVertical:   spacing.sm,
    borderRadius:      radius.md,
    borderWidth:       1,
  },
  actionBtnText: {
    fontFamily:    typography.fontFamily.semiBold,
    fontSize:      typography.fontSize.sm,
    letterSpacing: typography.letterSpacing.wide,
  },

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
    width:          30,
    height:         30,
    borderRadius:   radius.md,
    alignItems:     'center',
    justifyContent: 'center',
  },
  deleteIconBox: {
    width:          56,
    height:         56,
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
    fontFamily:  typography.fontFamily.regular,
    fontSize:    typography.fontSize.sm,
    textAlign:   'center',
    lineHeight:  20,
    marginBottom: spacing.lg,
  },
  deleteList: {
    borderRadius:      radius.lg,
    borderWidth:       1,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm,
    marginBottom:      spacing.lg,
    gap:               spacing.xs,
  },
  deleteListItem: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.sm,
    paddingVertical: 3,
  },
  deleteListDot: {
    width:        5,
    height:       5,
    borderRadius: 3,
    opacity:      0.7,
  },
  deleteListText: {
    fontFamily: typography.fontFamily.regular,
    fontSize:   typography.fontSize.sm,
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