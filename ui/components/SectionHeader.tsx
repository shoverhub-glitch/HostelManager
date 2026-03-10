import { View, Text, StyleSheet } from 'react-native';
import { LucideIcon } from 'lucide-react-native';
import { spacing, typography } from '@/theme';
import { useTheme } from '@/context/ThemeContext';

interface SectionHeaderProps {
  icon?: LucideIcon;
  iconColor?: string;
  title: string;
  style?: object;
}

export default function SectionHeader({
  icon: Icon,
  iconColor,
  title,
  style,
}: SectionHeaderProps) {
  const { colors } = useTheme();
  const defaultIconColor = iconColor || colors.primary[500];

  return (
    <View style={[styles.container, style]}>
      {Icon && <Icon size={20} color={defaultIconColor} />}
      <Text style={[styles.title, { color: colors.text.primary }]}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    marginLeft: spacing.sm,
  },
});
