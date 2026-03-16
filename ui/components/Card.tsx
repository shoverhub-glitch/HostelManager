import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { ReactNode } from 'react';
import { spacing, radius, shadows } from '@/theme';
import { useTheme } from '@/context/ThemeContext';

interface CardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export default function Card({ children, style }: CardProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: colors.background.secondary }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadows.md,
  },
});
