import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { PropertyProvider } from '@/context/PropertyContext';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { ErrorBoundary } from '@/components/ErrorBoundary';

function RootNavigator() {
  const { isDark, colors } = useTheme();
  const { isAuthenticated, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const firstSegment = segments[0];
    const inAuthGroup = [
      '(tabs)', 'property-detail', 'subscription', 'manage-properties', 
      'property-form', 'manage-rooms', 'room-form', 'manage-beds', 
      'manage-staff', 'add-tenant', 'add-payment', 'manual-payment', 
      'edit-payment', 'tenant-detail', 'privacy-security', 'change-password', 'my-property'
    ].includes(firstSegment);

    const isRoot = !firstSegment;
    const inPublicRoute = isRoot || firstSegment === 'register';

    if (!isAuthenticated && inAuthGroup) {
      // Not authenticated but trying to access protected routes
      router.replace('/');
    } else if (isAuthenticated && inPublicRoute) {
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
        <Stack.Screen name="forgot-password" />
        <Stack.Screen name="change-password" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="my-property" />
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
        <Stack.Screen name="privacy-security" />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </>
  );
}

export default function RootLayout() {
  useFrameworkReady();

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
});
