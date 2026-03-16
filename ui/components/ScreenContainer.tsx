import { ReactNode } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import useResponsiveLayout from '@/hooks/useResponsiveLayout';

interface ScreenContainerProps {
  children: ReactNode;
  edges?: Array<'top' | 'bottom' | 'left' | 'right'>;
  style?: ViewStyle;
}

export default function ScreenContainer({
  children,
  edges = ['top'],
  style,
}: ScreenContainerProps) {
  const { colors } = useTheme();
  const { isTablet, contentMaxWidth } = useResponsiveLayout();

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background.primary }, style]}
      edges={edges}>
      <View
        style={[
          styles.content,
          { backgroundColor: colors.background.primary },
          isTablet && { alignSelf: 'center', width: '100%', maxWidth: contentMaxWidth },
        ]}>
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
});
