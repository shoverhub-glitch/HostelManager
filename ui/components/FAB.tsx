import { TouchableOpacity, StyleSheet, Animated, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus } from 'lucide-react-native';
import { shadows, addActionTokens } from '@/theme';
import { useRef } from 'react';
import { useTheme } from '@/context/ThemeContext';

interface FABProps {
  onPress: () => void;
  disabled?: boolean;
}

export default function FAB({ onPress, disabled = false }: FABProps) {
  const insets = useSafeAreaInsets();
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const { colors } = useTheme();

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: addActionTokens.animation.pressScale,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 3,
      tension: 40,
      useNativeDriver: true,
    }).start();
  };

  const platformLift = Platform.OS === 'android' ? 10 : 0;
  const bottomOffset =
    (insets.bottom || 0) +
    addActionTokens.fab.tabBarHeight +
    addActionTokens.fab.bottomGap +
    platformLift;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          bottom: bottomOffset,
          transform: [{ scale: scaleAnim }],
        },
      ]}>
      <TouchableOpacity
        style={[styles.button, { backgroundColor: colors.action.add.background, opacity: disabled ? 0.5 : 1 }]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.9}
        disabled={disabled}>
        <Plus size={addActionTokens.iconSize.fab} color={colors.action.add.icon} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const fabSize = addActionTokens.fab.size;

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: addActionTokens.fab.rightOffset,
  },
  button: {
    width: fabSize,
    height: fabSize,
    borderRadius: fabSize / 2,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.lg,
  },
});
