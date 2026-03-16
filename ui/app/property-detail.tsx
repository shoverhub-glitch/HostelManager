import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import StatusBadge from '@/components/StatusBadge';
import Card from '@/components/Card';
import { ChevronLeft, MapPin } from 'lucide-react-native';
import { spacing, typography, radius } from '@/theme';
import { useTheme } from '@/context/ThemeContext';
import useResponsiveLayout from '@/hooks/useResponsiveLayout';

export default function PropertyDetailScreen() {
  const { colors } = useTheme();
  const { isTablet, contentMaxWidth } = useResponsiveLayout();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('beds');

  const beds = [
    { number: 'A-101', status: 'occupied' as const, tenant: 'John Smith' },
    { number: 'A-102', status: 'occupied' as const, tenant: 'Sarah Johnson' },
    { number: 'A-103', status: 'vacant' as const, tenant: null },
    { number: 'A-104', status: 'occupied' as const, tenant: 'Mike Davis' },
    { number: 'B-201', status: 'occupied' as const, tenant: 'Emma Wilson' },
    { number: 'B-202', status: 'occupied' as const, tenant: 'Alex Brown' },
    { number: 'B-203', status: 'vacant' as const, tenant: null },
    { number: 'B-204', status: 'occupied' as const, tenant: 'Lisa Anderson' },
    { number: 'C-301', status: 'occupied' as const, tenant: 'Tom Harris' },
    { number: 'C-302', status: 'occupied' as const, tenant: 'Jane Miller' },
    { number: 'C-303', status: 'occupied' as const, tenant: 'David Lee' },
    { number: 'C-304', status: 'maintenance' as const, tenant: null },
  ];

  const rooms = [
    { name: 'Room A', beds: 4, occupied: 3 },
    { name: 'Room B', beds: 4, occupied: 3 },
    { name: 'Room C', beds: 4, occupied: 3 },
    { name: 'Room D', beds: 4, occupied: 4 },
    { name: 'Room E', beds: 4, occupied: 4 },
    { name: 'Room F', beds: 4, occupied: 3 },
  ];

  const tenants = [
    {
      name: 'John Smith',
      bed: 'A-101',
      rent: '₹5,000',
      status: 'paid' as const,
      phone: '+91 98765 43210',
    },
    {
      name: 'Sarah Johnson',
      bed: 'A-102',
      rent: '₹5,500',
      status: 'paid' as const,
      phone: '+91 98765 43211',
    },
    {
      name: 'Mike Davis',
      bed: 'A-104',
      rent: '₹6,000',
      status: 'due' as const,
      phone: '+91 98765 43212',
    },
  ];

  const getBedCardStyle = (status: string) => {
    if (status === 'occupied') return { backgroundColor: colors.primary[50], borderWidth: 1, borderColor: colors.primary[200] };
    if (status === 'vacant') return { backgroundColor: colors.success[50], borderWidth: 1, borderColor: colors.success[200] };
    if (status === 'maintenance') return { backgroundColor: colors.warning[50], borderWidth: 1, borderColor: colors.warning[200] };
    return {};
  };

  const renderBeds = () => (
    <View style={styles.bedsGrid}>
      {beds.map((bed, index) => {
        const bedCardStyle = getBedCardStyle(bed.status);
        return (
          <Card key={index} style={[styles.bedCard, bedCardStyle] as any}>
            <Text style={[styles.bedNumber, { color: colors.text.primary }]}>{bed.number}</Text>
            <StatusBadge status={bed.status} />
            {bed.tenant && <Text style={[styles.bedTenant, { color: colors.text.secondary }]}>{bed.tenant}</Text>}
          </Card>
        );
      })}
    </View>
  );

  const renderRooms = () => (
    <View>
      {rooms.map((room, index) => (
        <Card key={index} style={styles.roomCard}>
          <Text style={[styles.roomName, { color: colors.text.primary }]}>{room.name}</Text>
          <View style={styles.roomStats}>
            <Text style={[styles.roomBeds, { color: colors.text.secondary }]}>
              {room.occupied}/{room.beds} Beds Occupied
            </Text>
            <View style={[styles.occupancyBar, { backgroundColor: colors.neutral[200] }]}>
              <View
                style={[
                  styles.occupancyFill,
                  { width: `${(room.occupied / room.beds) * 100}%`, backgroundColor: colors.success[500] },
                ]}
              />
            </View>
          </View>
        </Card>
      ))}
    </View>
  );

  const renderTenants = () => (
    <View>
      {tenants.map((tenant, index) => (
        <Card key={index} style={styles.tenantCard}>
          <View style={styles.tenantRow}>
            <View style={styles.tenantInfo}>
              <Text style={[styles.tenantName, { color: colors.text.primary }]}>{tenant.name}</Text>
              <Text style={[styles.tenantBed, { color: colors.text.secondary }]}>Bed: {tenant.bed}</Text>
              <Text style={[styles.tenantPhone, { color: colors.text.secondary }]}>{tenant.phone}</Text>
            </View>
            <View style={styles.tenantRight}>
              <Text style={[styles.tenantRent, { color: colors.text.primary }]}>{tenant.rent}</Text>
              <StatusBadge status={tenant.status} />
            </View>
          </View>
        </Card>
      ))}
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background.primary }]}
      edges={['top', 'bottom']}>
      <View style={[styles.header, { backgroundColor: colors.background.secondary, borderBottomColor: colors.border.light }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}>
          <ChevronLeft size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={[styles.propertyName, { color: colors.text.primary }]}>Sunshine Hostel</Text>
          <View style={styles.addressRow}>
            <MapPin size={14} color={colors.text.secondary} />
            <Text style={[styles.addressText, { color: colors.text.secondary }]}>MG Road, Bangalore</Text>
          </View>
        </View>
      </View>

      <View style={[styles.tabsContainer, { backgroundColor: colors.background.secondary, borderBottomColor: colors.border.light }]}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'rooms' && { ...styles.tabActive, borderBottomColor: colors.primary[500] }]}
          onPress={() => setActiveTab('rooms')}
          activeOpacity={0.7}>
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'rooms' ? colors.primary[500] : colors.text.tertiary },
            ]}>
            Rooms
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'beds' && { ...styles.tabActive, borderBottomColor: colors.primary[500] }]}
          onPress={() => setActiveTab('beds')}
          activeOpacity={0.7}>
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'beds' ? colors.primary[500] : colors.text.tertiary },
            ]}>
            Beds
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'tenants' && { ...styles.tabActive, borderBottomColor: colors.primary[500] }]}
          onPress={() => setActiveTab('tenants')}
          activeOpacity={0.7}>
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'tenants' ? colors.primary[500] : colors.text.tertiary },
            ]}>
            Tenants
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          isTablet && { alignSelf: 'center', width: '100%', maxWidth: contentMaxWidth },
        ]}
        showsVerticalScrollIndicator={false}>
        {activeTab === 'beds' && renderBeds()}
        {activeTab === 'rooms' && renderRooms()}
        {activeTab === 'tenants' && renderTenants()}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
  },
  backButton: {
    marginRight: spacing.md,
  },
  headerInfo: {
    flex: 1,
  },
  propertyName: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.xs,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addressText: {
    fontSize: typography.fontSize.sm,
    marginLeft: spacing.xs,
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
  },
  tabText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  tabTextActive: {
  },
  bedsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -spacing.xs,
  },
  bedCard: {
    width: '31.33%',
    marginHorizontal: '1%',
    marginBottom: spacing.sm,
    padding: spacing.md,
    alignItems: 'center',
  },
  bedOccupied: {
  },
  bedVacant: {
  },
  bedMaintenance: {
  },
  bedNumber: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.xs,
  },
  bedTenant: {
    fontSize: typography.fontSize.xs,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  roomCard: {
    marginBottom: spacing.md,
  },
  roomName: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.md,
  },
  roomStats: {
    gap: spacing.sm,
  },
  roomBeds: {
    fontSize: typography.fontSize.sm,
  },
  occupancyBar: {
    height: 8,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  occupancyFill: {
    height: '100%',
    borderRadius: radius.sm,
  },
  tenantCard: {
    marginBottom: spacing.md,
  },
  tenantRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tenantInfo: {
    flex: 1,
  },
  tenantName: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.xs,
  },
  tenantBed: {
    fontSize: typography.fontSize.sm,
    marginBottom: 2,
  },
  tenantPhone: {
    fontSize: typography.fontSize.sm,
  },
  tenantRight: {
    alignItems: 'flex-end',
  },
  tenantRent: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.sm,
  },
});
