import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  ChevronLeft,
  ChevronRight,
  Mail,
  HelpCircle,
  FileText,
  ExternalLink,
} from 'lucide-react-native';
import ScreenContainer from '@/components/ScreenContainer';
import Card from '@/components/Card';
import { spacing, radius, shadows } from '@/theme';
import { typography, textPresets } from '@/theme/typography';
import { useTheme } from '@/context/ThemeContext';

export default function HelpSupportScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();

  const handleEmail = () => {
    Linking.openURL('mailto:hmcontact@shoverhub.com?subject=Help%20Request');
  };

  const faqs = [
    {
      question: 'How do I add a new property?',
      answer: 'Go to Manage Properties and tap the + button to add a new property. Fill in the required details like name, address, and capacity.',
    },
    {
      question: 'How do I manage tenant information?',
      answer: 'Navigate to your property and select the Tenants tab. You can add, edit, or remove tenants from there.',
    },
    {
      question: 'How does billing work?',
      answer: 'Set up payment methods in Subscription & Billing. You can generate invoices and track payments for each tenant.',
    },
    {
      question: 'Can I use the app offline?',
      answer: 'Yes, the app caches your data for offline access. Changes sync automatically when you reconnect to the internet.',
    },
  ];

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
            <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Help & Support</Text>
            <Text style={[styles.headerSubtitle, { color: colors.text.secondary }]}>Get help with Hostel Manager</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Contact Us</Text>
          <Text style={[styles.sectionDescription, { color: colors.text.secondary }]}>
            Choose how you would like to reach our support team.
          </Text>

          <TouchableOpacity onPress={handleEmail} activeOpacity={0.7}>
            <Card style={styles.settingCard}>
              <View style={styles.settingRow}>
                <View style={[styles.settingIcon, { backgroundColor: isDark ? colors.primary[900] : colors.primary[50] }]}>
                  <Mail size={18} color={isDark ? colors.primary[300] : colors.primary[600]} />
                </View>
                <View style={styles.settingContent}>
                  <Text style={[styles.settingTitle, { color: colors.text.primary }]}>Email Support</Text>
                  <Text style={[styles.settingDescription, { color: colors.text.secondary }]}>hmcontact@shoverhub.com</Text>
                </View>
                <ExternalLink size={16} color={colors.text.tertiary} />
              </View>
            </Card>
          </TouchableOpacity>

        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Frequently Asked Questions</Text>

          {faqs.map((faq, index) => (
            <Card key={index} style={styles.faqCard}>
              <View style={styles.faqHeader}>
                <View style={[styles.faqIcon, { backgroundColor: isDark ? colors.warning[900] : colors.warning[50] }]}>
                  <HelpCircle size={16} color={isDark ? colors.warning[300] : colors.warning[600]} />
                </View>
                <Text style={[styles.faqQuestion, { color: colors.text.primary }]}>{faq.question}</Text>
                <ChevronRight size={16} color={colors.text.tertiary} />
              </View>
              <Text style={[styles.faqAnswer, { color: colors.text.secondary }]}>{faq.answer}</Text>
            </Card>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Resources</Text>

          <TouchableOpacity onPress={() => {}} activeOpacity={0.7}>
            <Card style={styles.settingCard}>
              <View style={styles.settingRow}>
                <View style={[styles.settingIcon, { backgroundColor: isDark ? colors.neutral[800] : colors.neutral[100] }]}>
                  <FileText size={18} color={isDark ? colors.neutral[300] : colors.neutral[600]} />
                </View>
                <View style={styles.settingContent}>
                  <Text style={[styles.settingTitle, { color: colors.text.primary }]}>Documentation</Text>
                  <Text style={[styles.settingDescription, { color: colors.text.secondary }]}>Guides and tutorials</Text>
                </View>
                <ChevronRight size={16} color={colors.text.tertiary} />
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
    ...textPresets.h2,
    marginBottom: spacing.xs,
  },
  headerSubtitle: {
    ...textPresets.caption,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...textPresets.h3,
    marginBottom: spacing.xs,
  },
  sectionDescription: {
    ...textPresets.caption,
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
    ...textPresets.bodyMedium,
    marginBottom: spacing.xs,
  },
  settingDescription: {
    ...textPresets.caption,
  },
  faqCard: {
    marginBottom: spacing.sm,
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  faqIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  faqQuestion: {
    ...textPresets.bodyMedium,
    flex: 1,
    marginRight: spacing.sm,
  },
  faqAnswer: {
    ...textPresets.caption,
    lineHeight: 18,
  },
});
