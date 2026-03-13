import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  ChevronLeft,
  KeyRound,
  Trash2,
  LogOut,
  ChevronRight,
} from 'lucide-react-native';
import ScreenContainer from '@/components/ScreenContainer';
import Card from '@/components/Card';
import { spacing, typography, radius, shadows } from '@/theme';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { dataCache } from '@/services/dataCache';
import { clearScreenCache } from '@/services/screenCache';

export default function PrivacySecurityScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { logout } = useAuth();

  const [clearingCache, setClearingCache] = useState(false);

  const handleClearCache = () => {
    Alert.alert(
      'Clear offline cache',
      'This removes cached app data from this device. You can still fetch fresh data when online.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              setClearingCache(true);
              await dataCache.clear();
              clearScreenCache();
              Alert.alert('Done', 'Offline cache cleared successfully.');
            } catch (error) {
              Alert.alert('Failed', 'Could not clear cache. Please try again.');
            } finally {
              setClearingCache(false);
            }
          },
        },
      ]
    );
  };

  const handleLogoutThisDevice = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout from this device?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await logout();
          },
        },
      ]
    );
  };

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity
            style={[styles.backButton, { backgroundColor: colors.background.secondary }]}
            onPress={() => router.back()}
            activeOpacity={0.7}>
            <ChevronLeft size={20} color={colors.text.primary} />
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Privacy & Security</Text>
            <Text style={[styles.headerSubtitle, { color: colors.text.secondary }]}>Essential settings for version 1</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Account</Text>

          <TouchableOpacity onPress={() => router.push('/change-password' as any)} activeOpacity={0.7}>
            <Card style={styles.settingCard}>
              <View style={styles.settingRow}>
                <View style={[styles.settingIcon, { backgroundColor: `${colors.primary[500]}15` }]}>
                  <KeyRound size={18} color={colors.primary[500]} />
                </View>
                <View style={styles.settingContent}>
                  <Text style={[styles.settingTitle, { color: colors.text.primary }]}>Change Password</Text>
                  <Text style={[styles.settingDescription, { color: colors.text.secondary }]}>Update password using your current password</Text>
                </View>
                <ChevronRight size={18} color={colors.text.tertiary} />
              </View>
            </Card>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Data & Session</Text>

          <TouchableOpacity onPress={handleClearCache} activeOpacity={0.7}>
            <Card style={styles.settingCard}>
              <View style={styles.settingRow}>
                <View style={[styles.settingIcon, { backgroundColor: `${colors.warning[500]}15` }]}>
                  <Trash2 size={18} color={colors.warning[600]} />
                </View>
                <View style={styles.settingContent}>
                  <Text style={[styles.settingTitle, { color: colors.text.primary }]}>Clear Offline Cache</Text>
                  <Text style={[styles.settingDescription, { color: colors.text.secondary }]}>Remove locally stored cached app data</Text>
                </View>
                {clearingCache ? (
                  <ActivityIndicator size="small" color={colors.primary[500]} />
                ) : (
                  <ChevronRight size={18} color={colors.text.tertiary} />
                )}
              </View>
            </Card>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleLogoutThisDevice} activeOpacity={0.7}>
            <Card style={styles.settingCard}>
              <View style={styles.settingRow}>
                <View style={[styles.settingIcon, { backgroundColor: `${colors.danger[500]}15` }]}>
                  <LogOut size={18} color={colors.danger[500]} />
                </View>
                <View style={styles.settingContent}>
                  <Text style={[styles.settingTitle, { color: colors.danger[500] }]}>Logout This Device</Text>
                  <Text style={[styles.settingDescription, { color: colors.text.secondary }]}>End your current session immediately</Text>
                </View>
                <ChevronRight size={18} color={colors.text.tertiary} />
              </View>
            </Card>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.xs,
  },
  headerSubtitle: {
    fontSize: typography.fontSize.sm,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.md,
  },
  settingCard: {
    marginBottom: spacing.sm,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  settingDescription: {
    fontSize: typography.fontSize.sm,
  },
});
