import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { AlertCircle } from 'lucide-react-native';
import Card from './Card';
import { colors, spacing,  } from '@/theme';
import { typography,textPresets } from '@/theme/typography';
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
    ...textPresets.h4,
    color: colors.danger[500],
    marginLeft: spacing.md,
  },
  errorMessage: {
    ...textPresets.body,
    color: colors.text.secondary,
    marginBottom: spacing.lg,
  },
  retryButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: 8,
    alignItems: 'center',
  },
  retryText: {
    ...textPresets.buttonSm,
    color: colors.white,
  },
});
