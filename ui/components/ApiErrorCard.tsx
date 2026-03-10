import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { AlertCircle } from 'lucide-react-native';
import Card from './Card';
import { spacing, typography } from '@/theme';
import { useTheme } from '@/context/ThemeContext';

interface ApiErrorCardProps {
  error: string;
  onRetry: () => void;
}

export default function ApiErrorCard({ error, onRetry }: ApiErrorCardProps) {
  const { colors } = useTheme();

  return (
    <Card style={styles.errorCard}>
      <View style={styles.iconRow}>
        <AlertCircle size={24} color={colors.danger[500]} />
        <Text style={[styles.errorTitle, { color: colors.danger[500] }]}>Error Loading Data</Text>
      </View>
      <Text style={[styles.errorMessage, { color: colors.text.secondary }]}>{error}</Text>
      <TouchableOpacity
        style={[styles.retryButton, { backgroundColor: colors.primary[500] }]}
        onPress={onRetry}
        activeOpacity={0.7}>
        <Text style={[styles.retryText, { color: colors.white }]}>Retry</Text>
      </TouchableOpacity>
    </Card>
  );
}

const styles = StyleSheet.create({
  errorCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  errorTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    marginLeft: spacing.md,
  },
  errorMessage: {
    fontSize: typography.fontSize.sm,
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  retryButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: 8,
    alignItems: 'center',
  },
  retryText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
});
