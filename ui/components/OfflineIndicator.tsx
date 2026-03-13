import { View, Text, StyleSheet } from 'react-native';
import { WifiOff } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useTheme } from '@/context/ThemeContext';

export function OfflineIndicator() {
  const isOnline = useNetworkStatus();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  if (isOnline) {
    return null;
  }

  return (
    <View style={[styles.container, { top: insets.top + 6, backgroundColor: colors.warning[50], borderColor: colors.warning[200] }]}> 
      <WifiOff size={14} color={colors.text.secondary} />
      <Text style={[styles.text, { color: colors.text.secondary }]}>You are offline</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 1000,
    elevation: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
  },
  text: {
    fontSize: 12,
    fontWeight: '500',
  },
});

