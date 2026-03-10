import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LucideIcon } from 'lucide-react-native';
import { spacing, typography } from '@/theme';
import { useTheme } from '@/context/ThemeContext';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  actionLabel?: string;
  onActionPress?: () => void;
}

export default function EmptyState({
  icon: Icon,
  title,
  subtitle,
  actionLabel,
  onActionPress,
}: EmptyStateProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <View style={[styles.iconContainer, { backgroundColor: colors.background.tertiary }]}>
        <Icon size={48} color={colors.text.tertiary} />
      </View>
      <Text style={[styles.title, { color: colors.text.primary }]}>{title}</Text>
      <Text style={[styles.subtitle, { color: colors.text.secondary }]}>{subtitle}</Text>
      {actionLabel && onActionPress && (
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: colors.primary[500] }]}
          onPress={onActionPress}
          activeOpacity={0.7}>
          <Text style={[styles.actionText, { color: colors.white }]}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxxl,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: typography.fontSize.md,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  actionButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 8,
  },
  actionText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
});
