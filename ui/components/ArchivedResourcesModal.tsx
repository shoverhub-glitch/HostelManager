import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
} from 'react-native';
import {
  X,
  AlertTriangle,
  Calendar,
  Building2,
  Users,
  MessageSquare,
  Clock,
  ArrowRight,
} from 'lucide-react-native';
import { spacing, radius, colors } from '@/theme';
import { typography,textPresets } from '@/theme/typography';
import { useTheme } from '@/context/ThemeContext';
import Card from '@/components/Card';
import type { ArchivedResourcesResponse } from '@/services/apiTypes';

interface ArchivedResourcesModalProps {
  visible: boolean;
  onClose: () => void;
  archivedData: ArchivedResourcesResponse | null;
  loading?: boolean;
  onUpgrade: () => void;
}

export default function ArchivedResourcesModal({
  visible,
  onClose,
  archivedData,
  loading = false,
  onUpgrade,
}: ArchivedResourcesModalProps) {
  const { colors, isDark } = useTheme();

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return 'Unknown date';
    }
  };

  const daysUntilExpiration = (expiresAt: string) => {
    try {
      const expireDate = new Date(expiresAt);
      const today = new Date();
      const diff = expireDate.getTime() - today.getTime();
      const days = Math.ceil(diff / (1000 * 3600 * 24));
      return Math.max(0, days);
    } catch {
      return 0;
    }
  };

  const getExpirationColor = (days: number) => {
    if (days <= 0) return colors.danger[500];
    if (days <= 7) return colors.warning[500];
    return colors.success[500];
  };

  const renderArchiveCard = (item: any, type: 'property' | 'room' | 'tenant') => {
    const days = daysUntilExpiration(item.expiresAt);
    const icon =
      type === 'property' ? (
        <Building2 size={20} color={isDark ? colors.primary[300] : colors.primary[500]} />
      ) : type === 'room' ? (
        <MessageSquare size={20} color={isDark ? colors.warning[300] : colors.warning[500]} />
      ) : (
        <Users size={20} color={isDark ? colors.success[300] : colors.success[500]} />
      );

    return (
      <Card key={item.id} style={styles.archiveCard}>
        <View style={styles.archiveHeader}>
          <View style={[styles.archiveIcon, { backgroundColor: colors.background.tertiary }]}>{icon}</View>
          <View style={styles.archiveInfo}>
            <Text style={[styles.archiveName, { color: colors.text.primary }]}>
              {item.name || item.roomNumber || 'Unknown'}
            </Text>
            <Text style={[styles.archiveType, { color: colors.text.secondary }]}>
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </Text>
          </View>
          <View style={[styles.expirationBadge, { backgroundColor: colors.background.tertiary }]}>
            <Clock size={14} color={getExpirationColor(days)} />
            <Text
              style={[
                styles.expirationText,
                { color: getExpirationColor(days) },
              ]}
            >
              {days}d
            </Text>
          </View>
        </View>

        <View style={styles.archiveDetails}>
          <View style={styles.detailRow}>
            <Calendar size={14} color={colors.text.tertiary} />
            <Text style={[styles.detailText, { color: colors.text.tertiary }]}>
              Archived: {formatDate(item.archivedAt)}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Clock size={14} color={colors.text.tertiary} />
            <Text style={[styles.detailText, { color: colors.text.tertiary }]}>
              Expires: {formatDate(item.expiresAt)}
            </Text>
          </View>
        </View>

        <View style={[styles.archiveReasonBox, { backgroundColor: colors.background.tertiary }]}>
          <Text style={[styles.reasonLabel, { color: colors.text.secondary }]}>
            Reason:
          </Text>
          <Text style={[styles.reasonText, { color: colors.text.primary }]}>
            {item.reason}
          </Text>
        </View>
      </Card>
    );
  };

  if (!archivedData) return null;

  const totalArchived = archivedData.total_archived || 0;
  const hasArchived = totalArchived > 0;

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
        <View
          style={[styles.header, { backgroundColor: colors.background.secondary, borderBottomColor: colors.border.light }]}
        >
          <Text style={[styles.headerTitle, { color: colors.text.primary }]}>
            Archived Resources
          </Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <X size={24} color={colors.text.primary} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary[500]} />
          </View>
        ) : !hasArchived ? (
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyIcon, { backgroundColor: isDark ? colors.success[900] : colors.success[50] }]}>
              <MessageSquare size={40} color={isDark ? colors.success[300] : colors.success[500]} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>
              No Archived Resources
            </Text>
            <Text style={[styles.emptyText, { color: colors.text.secondary }]}>
              All your resources are active and accessible.
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View
              style={[styles.warningBanner, { backgroundColor: isDark ? colors.warning[900] : colors.warning[50], borderColor: isDark ? colors.warning[700] : colors.warning[200] }]}
            >
              <AlertTriangle size={20} color={isDark ? colors.warning[300] : colors.warning[700]} />
              <View style={styles.warningContent}>
                <Text style={[styles.warningTitle, { color: isDark ? colors.warning[200] : colors.warning[900] }]}>
                  {totalArchived} resource{totalArchived !== 1 ? 's' : ''} archived
                </Text>
                <Text style={[styles.warningText, { color: isDark ? colors.warning[300] : colors.warning[700] }]}>
                  These were archived during your subscription downgrade. You have{' '}
                  <Text style={{ fontWeight: 'bold' }}>
                    {archivedData.grace_period_days} days
                  </Text>{' '}
                  to upgrade and recover them.
                </Text>
              </View>
            </View>

            {archivedData.properties && archivedData.properties.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>
                  Properties ({archivedData.properties.length})
                </Text>
                {archivedData.properties.map((prop) =>
                  renderArchiveCard(prop, 'property')
                )}
              </View>
            )}

            {archivedData.rooms && archivedData.rooms.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>
                  Rooms ({archivedData.rooms.length})
                </Text>
                {archivedData.rooms.map((room) =>
                  renderArchiveCard(room, 'room')
                )}
              </View>
            )}

            {archivedData.tenants && archivedData.tenants.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>
                  Tenants ({archivedData.tenants.length})
                </Text>
                {archivedData.tenants.map((tenant) =>
                  renderArchiveCard(tenant, 'tenant')
                )}
              </View>
            )}

            <TouchableOpacity
              style={[styles.upgradeButton, { backgroundColor: colors.primary[500] }]}
              onPress={onUpgrade}
              activeOpacity={0.7}
            >
              <Text style={[styles.upgradeButtonText, { color: colors.white }]}>
                Upgrade Now to Recover All
              </Text>
              <ArrowRight size={20} color={colors.white} />
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
  },
  headerTitle: {
    ...textPresets.h4,
    color: colors.text.primary,
  },
  closeButton: {
    padding: spacing.sm,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    ...textPresets.h4,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  emptyText: {
    ...textPresets.body,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  warningBanner: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  warningContent: {
    marginLeft: spacing.md,
    flex: 1,
  },
  warningTitle: {
    ...textPresets.bodyMedium,
    color: colors.warning[900],
    marginBottom: spacing.xs,
  },
  warningText: {
    ...textPresets.caption,
    color: colors.warning[700],
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...textPresets.bodyMedium,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  archiveCard: {
    marginBottom: spacing.md,
  },
  archiveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  archiveIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  archiveInfo: {
    flex: 1,
  },
  archiveName: {
    ...textPresets.bodyMedium,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  archiveType: {
    ...textPresets.caption,
    color: colors.text.secondary,
  },
  expirationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
  },
  expirationText: {
    ...textPresets.badge,
    marginLeft: spacing.xs,
  },
  archiveDetails: {
    marginBottom: spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  detailText: {
    ...textPresets.hint,
    color: colors.text.tertiary,
    marginLeft: spacing.sm,
  },
  archiveReasonBox: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  reasonLabel: {
    ...textPresets.hint,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  reasonText: {
    ...textPresets.hint,
    color: colors.text.primary,
  },
  upgradeButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    marginTop: spacing.lg,
  },
  upgradeButtonText: {
    ...textPresets.button,
    color: colors.white,
    marginRight: spacing.sm,
  },
});
