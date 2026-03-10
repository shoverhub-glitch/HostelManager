import { View, StyleSheet, Animated, Easing, type DimensionValue } from 'react-native';
import { useEffect, useRef } from 'react';
import { spacing, radius } from '@/theme';
import { useTheme } from '@/context/ThemeContext';

interface SkeletonProps {
  height?: number;
  count?: number;
  width?: DimensionValue;
}

export default function Skeleton({ height = 200, count = 3, width = '100%' }: SkeletonProps) {
  const { colors, isDark } = useTheme();
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.5,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [opacity]);

  const skeletonColor = isDark ? colors.neutral[700] : colors.neutral[200];

  return (
    <View>
      {Array.from({ length: count }).map((_, index) => (
        <Animated.View
          key={index}
          style={[
            styles.skeleton,
            {
              backgroundColor: skeletonColor,
              height,
              width,
              marginBottom: spacing.md,
              opacity,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: {
    borderRadius: radius.lg,
  },
});
