import { View, TouchableOpacity, Text, StyleSheet, Platform } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { shadows, typography } from '@/theme';
import { useTheme } from '@/context/ThemeContext';

export default function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  // Calculate safe bottom space dynamically based on device
  // On devices with home indicators (iPhone X+), insets.bottom will be ~34px
  // On older devices or Android, it will be 0
  const bottomSpace = insets.bottom || 0;

  // Tab bar content height (fixed, without safe area)
  const TAB_BAR_HEIGHT = 56;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background.secondary,
          borderTopColor: colors.border.light,
          paddingBottom: bottomSpace,
          height: TAB_BAR_HEIGHT + bottomSpace,
        },
      ]}>
      <View style={styles.tabsContainer}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const label =
            options.tabBarLabel !== undefined
              ? options.tabBarLabel
              : options.title !== undefined
              ? options.title
              : route.name;

          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          // Get icon from options
          const icon = options.tabBarIcon
            ? options.tabBarIcon({
                focused: isFocused,
                color: isFocused ? colors.primary[500] : colors.text.tertiary,
                size: 24,
              })
            : null;

          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              onPress={onPress}
              onLongPress={onLongPress}
              style={styles.tab}
              activeOpacity={0.7}>
              {icon}
              <Text
                style={[
                  styles.label,
                  {
                    color: isFocused ? colors.primary[500] : colors.text.tertiary,
                  },
                ]}>
                {label as string}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    ...Platform.select({
      ios: shadows.md,
      android: {
        elevation: 8,
      },
    }),
  },
  tabsContainer: {
    flexDirection: 'row',
    height: 56,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  label: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    marginTop: 4,
  },
});
