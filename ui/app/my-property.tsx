import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import ScreenContainer from '@/components/ScreenContainer';
import PropertyDropdown from '@/components/PropertyDropdown';
import Card from '@/components/Card';
import EmptyState from '@/components/EmptyState';
import {
  Building2,
  MapPin,
  ChevronRight,
  DoorOpen,
  Users,
} from 'lucide-react-native';
import { spacing, radius, colors} from '@/theme';
import { typography,textPresets } from '@/theme/typography';
import { useTheme } from '@/context/ThemeContext';
import { useProperty } from '@/context/PropertyContext';

// Helper function to mask IDs professionally
const maskId = (id: string): string => {
  if (!id || id.length <= 8) return id;
  const start = id.substring(0, 4);
  const end = id.substring(id.length - 4);
  return `${start}...${end}`;
};

export default function MyPropertyScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { selectedProperty, loading: propertyLoading } = useProperty();

  const manageOptions = [
    {
      icon: DoorOpen,
      title: 'Manage Rooms',
      description: 'Add and manage property rooms',
      color: colors.primary[500],
      route: '/manage-rooms',
    },
    {
      icon: Users,
      title: 'Manage Staff',
      description: 'Manage your staff members',
      color: colors.success[500],
      route: '/manage-staff',
    },
  ];

  if (propertyLoading) {
    return (
      <ScreenContainer edges={['top']}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.text.primary }]}>MyProperty</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[500]} />
        </View>
      </ScreenContainer>
    );
  }

  if (!selectedProperty) {
    return (
      <ScreenContainer edges={['top']}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.text.primary }]}>MyProperty</Text>
        </View>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          <EmptyState
            icon={Building2}
            title="No Property Found"
            subtitle="Create your first property to get started"
            actionLabel="Create Property"
            onActionPress={() => router.push('/property-form')}
          />
        </ScrollView>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>MyProperty</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <Card style={styles.propertyCard}>
          <View style={styles.propertyHeader}>
            <View style={[styles.iconContainer, { backgroundColor: isDark ? colors.primary[900] : colors.primary[50] }]}>
              <Building2 size={32} color={isDark ? colors.primary[300] : colors.primary[500]} />
            </View>
            <View style={styles.propertyInfo}>
              <Text style={[styles.propertyName, { color: colors.text.primary }]}>
                {selectedProperty.name}
              </Text>
              <View style={styles.addressRow}>
                <MapPin size={14} color={colors.text.secondary} />
                <Text style={[styles.addressText, { color: colors.text.secondary }]}>
                  {selectedProperty.address}
                </Text>
              </View>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border.light }]} />

          <View style={styles.detailsGrid}>
            <View style={styles.detailItem}>
              <Text style={[styles.detailLabel, { color: colors.text.secondary }]}>Owner ID</Text>
              <Text style={[styles.detailValue, { color: colors.text.primary }]} numberOfLines={1}>
                {maskId(selectedProperty.ownerId) || 'N/A'}
              </Text>
            </View>
            <View style={styles.detailItem}>
              <Text style={[styles.detailLabel, { color: colors.text.secondary }]}>
                Property ID
              </Text>
              <Text style={[styles.detailValue, { color: colors.text.primary }]} numberOfLines={1}>
                {maskId(selectedProperty.id)}
              </Text>
            </View>
          </View>
        </Card>

        <PropertyDropdown />

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>
            Manage Property
          </Text>

          {manageOptions.map((option, index) => (
            <TouchableOpacity
              key={index}
              onPress={() => router.push(option.route as any)}
              activeOpacity={0.7}>
              <Card style={styles.optionCard}>
                <View style={styles.optionContent}>
                  <View style={[styles.optionIcon, { backgroundColor: option.color + '20' }]}>
                    <option.icon size={24} color={option.color} />
                  </View>
                  <View style={styles.optionText}>
                    <Text style={[styles.optionTitle, { color: colors.text.primary }]}> 
                      {option.title}
                    </Text>
                    <Text style={[styles.optionDescription, { color: colors.text.secondary }]}>
                      {option.description}
                    </Text>
                  </View>
                </View>
                <ChevronRight size={20} color={colors.text.tertiary} />
              </Card>
            </TouchableOpacity>
          ))}
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
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  headerTitle: {
    ...textPresets.h2,
    color: colors.text.primary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  propertyCard: {
    marginBottom: spacing.md,
  },
  propertyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    flexShrink: 0,
  },
  propertyInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  propertyName: {
    ...textPresets.bodyMedium,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addressText: {
    ...textPresets.caption,
    color: colors.text.secondary,
    marginLeft: spacing.xs,
    flex: 1,
  },
  divider: {
    height: 1,
    marginVertical: spacing.lg,
  },
  detailsGrid: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  detailItem: {
    flex: 1,
  },
  detailLabel: {
    ...textPresets.label,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  detailValue: {
    ...textPresets.bodyMedium,
    color: colors.text.primary,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...textPresets.h3,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    paddingVertical: spacing.lg,
  },
  optionContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  optionText: {
    flex: 1,
  },
  optionTitle: {
    ...textPresets.bodyMedium,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  optionDescription: {
    ...textPresets.caption,
    color: colors.text.secondary,
  },
});