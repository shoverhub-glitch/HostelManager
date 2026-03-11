import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Platform, Text, TouchableOpacity, Linking } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { PropertyProvider } from '@/context/PropertyContext';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { spacing, typography, radius, shadows } from '@/theme';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const PLAY_STORE_URL = process.env.EXPO_PUBLIC_PLAYSTORE_URL || 'https://play.google.com/store/apps/details?id=com.lohilit101.boltexponativewind';

function WebRedirectScreen() {
  const { colors } = useTheme();

  const handleDownload = () => {
    Linking.openURL(PLAY_STORE_URL).catch((err) => {
      console.error('Failed to open Play Store:', err);
    });
  };

  return (
    <View style={[styles.webContainer, { backgroundColor: colors.background.primary }]}> 
      <View style={[styles.iconCircle, { backgroundColor: colors.primary[50] }]}>
        <Text style={[styles.iconText, { color: colors.primary[500] }]}>📱</Text>
      </View>
      <Text style={[styles.webTitle, { color: colors.text.primary }]}>Mobile App Only</Text>
      <Text style={[styles.webSubtitle, { color: colors.text.secondary }]}>
        This application is designed exclusively for mobile devices. 
        Download it from Google Play Store to access all features on your Android or iOS device.
      </Text>
      <TouchableOpacity
        style={[styles.webButton, { backgroundColor: colors.primary[500] }]}
        onPress={handleDownload}
        activeOpacity={0.8}>
        <Text style={[styles.webButtonText, { color: colors.white }]}>Download from Play Store</Text>
      </TouchableOpacity>
      <Text style={[styles.webFooter, { color: colors.text.tertiary }]}>
        Available for Android and iOS
      </Text>
    </View>
  );
}

function RootNavigator() {
  const { isDark, colors } = useTheme();
  const { isAuthenticated, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(tabs)' || segments[0] === 'property-detail' || segments[0] === 'subscription' || segments[0] === 'manage-properties' || segments[0] === 'property-form' || segments[0] === 'manage-rooms' || segments[0] === 'room-form' || segments[0] === 'manage-beds' || segments[0] === 'manage-staff' || segments[0] === 'add-tenant' || segments[0] === 'add-payment' || segments[0] === 'manual-payment' || segments[0] === 'edit-payment' || segments[0] === 'tenant-detail';
    const inPublicRoute = (segments[0] as any) === 'register' || (segments[0] as any) === 'index';

    if (!isAuthenticated && inAuthGroup) {
      // Not authenticated but trying to access protected routes
      router.replace('/');
    } else if (isAuthenticated && (inPublicRoute || !inAuthGroup)) {
      // Authenticated - redirect to dashboard from any public route
      router.replace('/(tabs)/dashboard');
    }
  }, [isAuthenticated, loading, segments]);

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background.primary }]}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
      </View>
    );
  }

  return (
    <>
      <OfflineIndicator />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="register" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="property-detail" />
        <Stack.Screen name="subscription" />
        <Stack.Screen name="manage-properties" />
        <Stack.Screen name="property-form" />
        <Stack.Screen name="manage-rooms" />
        <Stack.Screen name="room-form" />
        <Stack.Screen name="manage-beds" />
        <Stack.Screen name="manage-staff" />
        <Stack.Screen name="add-tenant" />
        <Stack.Screen name="add-payment" />
        <Stack.Screen name="manual-payment" />
        <Stack.Screen name="edit-payment" />
        <Stack.Screen name="tenant-detail" />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </>
  );
}

export default function RootLayout() {
  useFrameworkReady();

  if (Platform.OS === 'web') {
    return (
      <SafeAreaProvider>
        <ThemeProvider>
          <WebRedirectScreen />
        </ThemeProvider>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider style={{ flex: 1 }}>
      <ThemeProvider>
        <RootLayoutContent />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function RootLayoutContent() {
  const { colors } = useTheme();
  
  return (
    <ErrorBoundary>
      <View style={[styles.rootContainer, { backgroundColor: colors.background.primary }]}>
        <AuthProvider>
          <PropertyProvider>
            <RootNavigator />
          </PropertyProvider>
        </AuthProvider>
      </View>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  webContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  iconText: {
    fontSize: 48,
  },
  webTitle: {
    fontSize: typography.fontSize.xxxl,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  webSubtitle: {
    fontSize: typography.fontSize.md,
    textAlign: 'center',
    marginBottom: spacing.xxl,
    maxWidth: 520,
    lineHeight: 24,
  },
  webButton: {
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    ...shadows.lg,
  },
  webButtonText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  webFooter: {
    fontSize: typography.fontSize.sm,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
