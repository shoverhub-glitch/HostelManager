import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
} from 'react-native';
import {
  AlertTriangle,
  Lock,
  ArrowRight,
  X,
} from 'lucide-react-native';
import { spacing, radius, shadows, colors } from '@/theme';
import { typography,textPresets } from '@/theme/typography';
import { useTheme } from '@/context/ThemeContext';
import Card from '@/components/Card';

interface ArchiveWarningModalProps {
  visible: boolean;
  onClose: () => void;
  resourceType: 'property' | 'room' | 'tenant';
  resourceName?: string;
  archivedReason?: string;
  reason?: string;
  onUpgrade?: () => void;
  action?: 'edit' | 'delete' | null;
}

export default function ArchiveWarningModal({
  visible,
  onClose,
  resourceType,
  resourceName = 'Resource',
  reason,
  archivedReason,
  onUpgrade,
  action,
}: ArchiveWarningModalProps) {
  const { colors, isDark } = useTheme();
  const archiveReason = reason || archivedReason;

  const getTitle = () => {
    return `${resourceType.charAt(0).toUpperCase() + resourceType.slice(1)} is Archived`;
  };

  const getDescription = () => {
    if (action === 'edit') {
      return `Cannot edit this archived ${resourceType}. It was archived when you downgraded your subscription. Upgrade to recover and edit it.`;
    }
    if (action === 'delete') {
      return `Cannot delete this archived ${resourceType}. It was archived when you downgraded your subscription. Upgrade to recover or delete it.`;
    }
    return `This ${resourceType} has been archived. It was archived when you downgraded your subscription. Upgrade to recover access.`;
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={[styles.overlay, { backgroundColor: 'rgba(0, 0, 0, 0.5)' }]}>
        <View style={[styles.modal, { backgroundColor: colors.background.secondary }]}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <X size={24} color={colors.text.primary} />
          </TouchableOpacity>

          <View style={[styles.iconContainer, { backgroundColor: isDark ? colors.danger[900] : colors.danger[50] }]}>
            <Lock size={48} color={isDark ? colors.danger[300] : colors.danger[500]} />
          </View>

          <Text style={[styles.title, { color: colors.text.primary }]}>
            {getTitle()}
          </Text>

          <Text style={[styles.description, { color: colors.text.secondary }]}>
            {getDescription()}
          </Text>

          {archiveReason && (
            <Card style={[styles.reasonCard, { backgroundColor: colors.background.tertiary }] as any}>
              <View style={styles.reasonHeader}>
                <AlertTriangle size={16} color={isDark ? colors.warning[300] : colors.warning[500]} />
                <Text style={[styles.reasonTitle, { color: colors.text.secondary }]}>
                  Archival Reason
                </Text>
              </View>
              <Text style={[styles.reasonText, { color: colors.text.primary }]}>
                {archiveReason}
              </Text>
            </Card>
          )}

          <View style={styles.featureList}>
            <FeatureItem
              icon={<Lock size={16} color={colors.text.tertiary} />}
              text="Read-only access until upgrade"
              colors={colors}
            />
            <FeatureItem
              icon={<ArrowRight size={16} color={colors.text.tertiary} />}
              text="Upgrade to recover full access"
              colors={colors}
            />
            <FeatureItem
              icon={<AlertTriangle size={16} color={colors.text.tertiary} />}
              text="30-day grace period to recover"
              colors={colors}
            />
          </View>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.cancelButton, { borderColor: colors.border.light }]}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={[styles.cancelButtonText, { color: colors.text.primary }]}>
                Close
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.upgradeButton, { backgroundColor: colors.primary[500] }]}
              onPress={onUpgrade || onClose}
              activeOpacity={0.7}
            >
              <Text style={[styles.upgradeButtonText, { color: colors.white }]}>
                {onUpgrade ? 'Upgrade Plan' : 'OK'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

interface FeatureItemProps {
  icon: React.ReactNode;
  text: string;
  colors: any;
}

function FeatureItem({ icon, text, colors }: FeatureItemProps) {
  return (
    <View style={styles.featureItem}>
      {icon}
      <Text style={[styles.featureText, { color: colors.text.secondary }]}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  modal: {
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
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    ...textPresets.h3,
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  description: {
    ...textPresets.body,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  reasonCard: {
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  reasonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  reasonTitle: {
    ...textPresets.hint,
    color: colors.text.secondary,
    marginLeft: spacing.sm,
  },
  reasonText: {
    ...textPresets.caption,
    color: colors.text.primary,
  },
  featureList: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureText: {
    ...textPresets.body,
    color: colors.text.secondary,
    marginLeft: spacing.md,
    flex: 1,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelButtonText: {
    ...textPresets.button,
    color: colors.text.primary,
  },
  upgradeButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  upgradeButtonText: {
    ...textPresets.button,
    color: colors.white,
  },
});
