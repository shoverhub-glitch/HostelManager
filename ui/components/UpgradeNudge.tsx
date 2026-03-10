import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Sparkles } from 'lucide-react-native';
import { spacing, typography, radius } from '@/theme';
import { useTheme } from '@/context/ThemeContext';

interface UpgradeNudgeProps {
  message: string;
}

export default function UpgradeNudge({ message }: UpgradeNudgeProps) {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      style={[
        styles.container,
        {
          backgroundColor: colors.primary[25],
          borderColor: colors.primary[100],
        },
      ]}
      onPress={() => router.push('/subscription')}
      activeOpacity={0.8}>
      <Sparkles size={16} color={colors.primary[500]} />
      <Text style={[styles.message, { color: colors.primary[700] }]}>{message}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
  },
  message: {
    fontSize: typography.fontSize.sm,
    marginLeft: spacing.sm,
    flex: 1,
  },
});
