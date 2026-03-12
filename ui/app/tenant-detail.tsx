import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Switch,
  Alert,
  RefreshControl,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  User,
  Phone,
  Mail,
  MapPin,
  Wallet,
  Calendar,
  Plus,
  Edit,
  Pencil,
  Trash2,
  CheckCircle,
  ChevronDown,
} from 'lucide-react-native';
import { Bed as BedIcon } from 'lucide-react-native';
import { spacing, typography, radius, shadows, addActionTokens } from '@/theme';
import { useTheme } from '@/context/ThemeContext';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { tenantService, paymentService, roomService, bedService } from '@/services/apiClient';
import type { Tenant, Payment, Room, Bed, BillingFrequency, BillingConfig } from '@/services/apiTypes';
import Card from '@/components/Card';
import StatusBadge from '@/components/StatusBadge';
import DatePicker from '@/components/DatePicker';
import EmptyState from '@/components/EmptyState';
import Skeleton from '@/components/Skeleton';
import ApiErrorCard from '@/components/ApiErrorCard';
import { cacheKeys, getScreenCache, setScreenCache } from '@/services/screenCache';

interface TenantDetailCachePayload {
  tenant: Tenant;
  payments: Payment[];
  room: Room | null;
}

const TENANT_DETAIL_CACHE_STALE_MS = 30 * 1000;
const TENANT_DETAIL_FOCUS_THROTTLE_MS = 30 * 1000;

export default function TenantDetailScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { tenantId } = useLocalSearchParams<{ tenantId: string }>();
  const isOnline = useNetworkStatus();

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [showEditBillingModal, setShowEditBillingModal] = useState(false);
  const [editAnchorDay, setEditAnchorDay] = useState<number>(1);
  const [editAutoGenerate, setEditAutoGenerate] = useState(true);
  const [showAnchorDayPicker, setShowAnchorDayPicker] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [showEditTenantModal, setShowEditTenantModal] = useState(false);
  const [editTenantName, setEditTenantName] = useState('');
  const [editTenantDocumentId, setEditTenantDocumentId] = useState('');
  const [editTenantPhone, setEditTenantPhone] = useState('');
  const [editTenantRent, setEditTenantRent] = useState('');
  const [editTenantAddress, setEditTenantAddress] = useState('');
  const [editTenantJoinDate, setEditTenantJoinDate] = useState('');
  const [editTenantStatus, setEditTenantStatus] = useState<'active' | 'vacated'>('active');
  const [editTenantRoom, setEditTenantRoom] = useState<Room | null>(null);
  const [editTenantBed, setEditTenantBed] = useState<Bed | null>(null);
  const [editRoomsWithBeds, setEditRoomsWithBeds] = useState<Array<{ room: Room; availableBeds: Bed[] }>>([]);
  const [editAvailableBedsForRoom, setEditAvailableBedsForRoom] = useState<Bed[]>([]);
  const [showEditRoomPicker, setShowEditRoomPicker] = useState(false);
  const [showEditBedPicker, setShowEditBedPicker] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [tenantActionLoading, setTenantActionLoading] = useState(false);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTenantFocusRefreshRef = useRef<number>(0);

  const fetchTenantData = async (forceNetwork: boolean = false) => {
    if (!tenantId) {
      setLoading(false);
      return;
    }

    const cacheKey = cacheKeys.tenantDetail(tenantId);
    if (!forceNetwork) {
      const cachedData = getScreenCache<TenantDetailCachePayload>(cacheKey, TENANT_DETAIL_CACHE_STALE_MS);
      if (cachedData) {
        setTenant(cachedData.tenant);
        setPayments(cachedData.payments);
        setRoom(cachedData.room);
        setError(null);
        setLoading(false);
        return;
      }
    }

    try {
      setLoading(true);
      setError(null);

      // Set a timeout to auto-dismiss skeleton after 8 seconds
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
      loadingTimeoutRef.current = setTimeout(() => {
        setLoading(false);
        if (!tenant) {
          setError('Request is taking longer than expected. Please try again.');
        }
      }, 8000);

      // Only fetch what we need for this tenant
      const tenantRes = await tenantService.getTenantById(tenantId);

      // Clear timeout if we got data back
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }

      if (tenantRes.data) {
        setTenant(tenantRes.data);
        
        // Only fetch payments/room data if tenant exists
        const [paymentsRes, roomRes] = await Promise.all([
          paymentService.getPayments(tenantRes.data.propertyId, { tenantId, page: 1, pageSize: 50 }),
          tenantRes.data.roomId ? roomService.getRoomById(tenantRes.data.roomId) : Promise.resolve({ data: null }),
        ]);

        if (paymentsRes.data) {
          const tenantPayments = paymentsRes.data
            .sort((a, b) => new Date(b.dueDate ?? '').getTime() - new Date(a.dueDate ?? '').getTime());
          setPayments(tenantPayments);

          setScreenCache(cacheKey, {
            tenant: tenantRes.data,
            payments: tenantPayments,
            room: roomRes?.data || null,
          });
        }

        if (roomRes?.data) {
          setRoom(roomRes.data);
        }
      }
    } catch (err: any) {
      // Clear timeout on error
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
      setError(err?.message || 'Failed to load tenant details');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (!tenantId) return;

      const cacheKey = cacheKeys.tenantDetail(tenantId);
      const hasFreshCache = !!getScreenCache<TenantDetailCachePayload>(cacheKey, TENANT_DETAIL_CACHE_STALE_MS);
      const now = Date.now();
      const shouldRefreshBecauseCacheMissing = !hasFreshCache;
      const shouldRefreshByThrottle =
        lastTenantFocusRefreshRef.current === 0 ||
        (now - lastTenantFocusRefreshRef.current) > TENANT_DETAIL_FOCUS_THROTTLE_MS;

      if (shouldRefreshBecauseCacheMissing || shouldRefreshByThrottle) {
        lastTenantFocusRefreshRef.current = now;
        fetchTenantData(shouldRefreshBecauseCacheMissing);
      }
    }, [tenantId])
  );

  // Cleanup loading timeout on unmount
  useEffect(() => {
    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, []);

  // Update available beds when room is selected in edit modal
  useEffect(() => {
    if (editTenantRoom) {
      const roomData = editRoomsWithBeds.find(r => r.room.id === editTenantRoom.id);
      if (roomData) {
        let bedsForRoom = roomData.availableBeds;
        
        // If this is the tenant's current room and bed, include current bed in the list
        if (tenant?.roomId === editTenantRoom.id && tenant?.bedId && editTenantBed) {
          if (!bedsForRoom.find(b => b.id === editTenantBed.id)) {
            bedsForRoom = [editTenantBed, ...bedsForRoom];
          }
        }
        
        setEditAvailableBedsForRoom(bedsForRoom);
        
        // Clear bed selection if changing to a different room (unless it's available in new room)
        if (editTenantBed && editTenantBed.roomId !== editTenantRoom.id) {
          setEditTenantBed(null);
        }
      }
    } else {
      setEditAvailableBedsForRoom([]);
      setEditTenantBed(null);
    }
  }, [editTenantRoom, editRoomsWithBeds, tenant?.bedId, tenant?.roomId, editTenantBed]);

  const handleRetry = () => {
    fetchTenantData(true);
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchTenantData(true);
    } finally {
      setRefreshing(false);
    }
  }, [tenantId]);

  const calculateNextBillingDate = (anchorDay: number, frequency: BillingFrequency): string => {
    const today = new Date();
    let nextDate = new Date(today.getFullYear(), today.getMonth(), anchorDay);
    if (nextDate < today) {
      nextDate = new Date(today.getFullYear(), today.getMonth() + 1, anchorDay);
    }
    return nextDate.toISOString();
  };

  const openEditBillingModal = () => {
    if (!tenant) return;

    setEditAutoGenerate(tenant.autoGeneratePayments === true);

    if (tenant.billingConfig) {
      setEditAnchorDay(tenant.billingConfig.anchorDay || 1);
    }
    setShowEditBillingModal(true);
  };

  const handleSaveBillingConfig = async () => {
    if (!tenant) return;

    try {
      setEditLoading(true);

      let nextBillingConfig: BillingConfig | null | undefined = tenant.billingConfig;

      if (editAutoGenerate) {
        const billingConfig: BillingConfig = {
          billingCycle: 'monthly',
          anchorDay: editAnchorDay,
          status: tenant.billingConfig?.status || 'due',
        };

        nextBillingConfig = billingConfig;
      } else {
        nextBillingConfig = undefined;
      }

      await tenantService.updateTenant(tenant.id, {
        autoGeneratePayments: editAutoGenerate,
        billingConfig: editAutoGenerate ? nextBillingConfig : null,
      });

      setTenant({
        ...tenant,
        autoGeneratePayments: editAutoGenerate,
        billingConfig: nextBillingConfig,
      });

      setShowEditBillingModal(false);
    } catch (err: any) {
      console.error('Failed to update billing config:', err);
    } finally {
      setEditLoading(false);
    }
  };

  const calculateFinancialSummary = () => {
    // 1. Total amount actually paid
    const totalPaid = payments
      .filter(p => p.status === 'paid')
      .reduce((sum, p) => {
        const amount = typeof p.amount === 'string'
          ? parseFloat(p.amount.replace(/[^0-9]/g, ''))
          : p.amount;
        return sum + amount;
      }, 0);

    const latestPayment = payments[0] || null;

    // 2. Outstanding amount from EXISTING "due" records
    let outstanding = payments
      .filter(p => p.status === 'due')
      .reduce((sum, p) => {
        const amount = typeof p.amount === 'string'
          ? parseFloat(p.amount.replace(/[^0-9]/g, ''))
          : p.amount;
        return sum + amount;
      }, 0);

    // 3. Catch-up logic for "expected" payments not yet generated in DB
    // This provides 100% reliability even if the API hasn't run its cron yet.
    if (tenant?.billingConfig && tenant?.tenantStatus === 'active') {
      try {
        const anchorDay = tenant.billingConfig.anchorDay;
        const rentAmount = typeof tenant.rent === 'string' 
          ? parseFloat(tenant.rent.replace(/[^0-9]/g, '')) 
          : parseFloat(tenant.rent || '0');
        
        const today = new Date();
        
        // Find the "target" due date for the current period
        let targetDueDate = new Date(today.getFullYear(), today.getMonth(), anchorDay);
        if (targetDueDate > today) {
          targetDueDate.setMonth(targetDueDate.getMonth() - 1);
        }

        // Determine where to start checking for gaps
        let currentCheckDate: Date;
        const latestDueDate = latestPayment?.dueDate;
        if (latestDueDate) {
          const lastDue = new Date(latestDueDate);
          currentCheckDate = new Date(lastDue.getFullYear(), lastDue.getMonth() + 1, anchorDay);
        } else if (tenant.joinDate) {
          const joinDate = new Date(tenant.joinDate);
          currentCheckDate = new Date(joinDate.getFullYear(), joinDate.getMonth(), anchorDay);
          if (currentCheckDate < joinDate) {
            currentCheckDate.setMonth(currentCheckDate.getMonth() + 1);
          }
        } else {
          currentCheckDate = new Date(targetDueDate.getTime() + 86400000); // Skip check
        }

        // Add missing months to outstanding
        while (currentCheckDate <= targetDueDate) {
          outstanding += rentAmount;
          currentCheckDate.setMonth(currentCheckDate.getMonth() + 1);
        }
      } catch (err) {
        console.warn('Financial catch-up calculation failed:', err);
      }
    }

    return {
      totalPaid,
      latestPayment,
      outstanding,
    };
  };

  const handleAddPayment = () => {
    const { latestPayment } = calculateFinancialSummary();

    if (latestPayment && latestPayment.status !== 'paid') {
      router.push(`/edit-payment?paymentId=${latestPayment.id}`);
    } else {
      router.push(`/manual-payment?tenantId=${tenantId}`);
    }
  };

  const getDayWithOrdinal = (day: number) => {
    const remainder10 = day % 10;
    const remainder100 = day % 100;

    if (remainder10 === 1 && remainder100 !== 11) return `${day}st`;
    if (remainder10 === 2 && remainder100 !== 12) return `${day}nd`;
    if (remainder10 === 3 && remainder100 !== 13) return `${day}rd`;
    return `${day}th`;
  };

  const formatDateWithOrdinal = (dateString: string) => {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '-';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const day = getDayWithOrdinal(date.getDate());
    const year = date.getFullYear();
    return `${month} ${day} ${year}`;
  };

  const calculateNextDueDate = (lastDueDate: string): string => {
    if (!lastDueDate) return '';
    const lastDue = new Date(lastDueDate);
    if (isNaN(lastDue.getTime())) return '';
    const nextDue = new Date(lastDue);
    nextDue.setMonth(nextDue.getMonth() + 1);
    return isNaN(nextDue.getTime()) ? '' : nextDue.toISOString();
  };

  const handleMarkAsPaid = async () => {
    if (!latestPayment) return;

    router.push(`/edit-payment?paymentId=${latestPayment.id}`);
  };

  const handleGenerateDue = () => {
    if (tenant?.autoGeneratePayments) {
      Alert.alert(
        'Billing Enabled',
        'This tenant uses auto-generated billing. Manual payment is available only when auto-generate is disabled.'
      );
      return;
    }

    router.push(`/manual-payment?tenantId=${tenantId}`);
  };

  const openEditTenantModal = async () => {
    if (!tenant) return;
    setEditTenantName(tenant.name || '');
    setEditTenantDocumentId(tenant.documentId || '');
    setEditTenantPhone(tenant.phone || '');
    setEditTenantRent(tenant.rent || '');
    setEditTenantAddress(tenant.address || '');
    setEditTenantJoinDate(tenant.joinDate || '');
    setEditTenantStatus(tenant.tenantStatus || 'active');
    
    // Set current room if exists
    if (tenant.roomId && room) {
      setEditTenantRoom(room);
    } else {
      setEditTenantRoom(null);
    }
    
    // Fetch beds to show options
    // For vacated tenants, fetch ALL beds so they can be reassigned
    // For active tenants, fetch only available beds
    if (tenant.propertyId) {
      try {
        const isVacated = tenant.tenantStatus === 'vacated';
        const response = isVacated 
          ? await bedService.getAllBedsByProperty(tenant.propertyId)
          : await bedService.getAvailableBedsByProperty(tenant.propertyId);
        
        if (response.data) {
          setEditRoomsWithBeds(response.data);
          
          // Set current bed if exists - find it from the fetched data
          let currentBed: Bed | null = null;
          if (tenant.bedId && tenant.roomId) {
            const roomData = response.data.find(r => r.room.id === tenant.roomId);
            if (roomData) {
              currentBed = roomData.availableBeds.find(b => b.id === tenant.bedId) || null;
              if (currentBed) {
                setEditTenantBed(currentBed);
              } else {
                setEditTenantBed(null);
              }
              
              setEditAvailableBedsForRoom(roomData.availableBeds);
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch beds for edit modal', err);
      }
    }
    
    setShowEditTenantModal(true);
  };

  const handleUpdateTenant = async () => {
    if (!tenant) return;

    const name = editTenantName.trim();
    const documentId = editTenantDocumentId.trim();
    const phone = editTenantPhone.trim();
    const rent = editTenantRent.trim();
    const address = editTenantAddress.trim();

    if (!name || !phone || !rent) {
      Alert.alert('Validation', 'Name, phone, and rent are required.');
      return;
    }

    if (!/^\d{10}$/.test(phone)) {
      Alert.alert('Validation', 'Phone must be 10 digits.');
      return;
    }

    // Check if status is active - room and bed are mandatory
    if (editTenantStatus === 'active') {
      if (!editTenantRoom || !editTenantBed) {
        Alert.alert('Validation', 'Room and bed are mandatory for active tenants.');
        return;
      }
    }

    // Check if changing from vacated to active - room and bed are required
    const isChangingFromVacatedToActive = tenant.tenantStatus === 'vacated' && editTenantStatus === 'active';
    if (isChangingFromVacatedToActive && (!editTenantRoom || !editTenantBed)) {
      Alert.alert('Validation', 'Please assign a room and bed when reactivating a tenant.');
      return;
    }

    try {
      setTenantActionLoading(true);
      const response = await tenantService.updateTenant(tenant.id, {
        name,
        documentId,
        phone,
        rent,
        address,
        joinDate: editTenantJoinDate,
        roomId: editTenantRoom?.id || undefined,
        bedId: editTenantBed?.id || undefined,
        tenantStatus: editTenantStatus,
      });
      if (response.data) {
        setTenant((prev) => prev ? { ...prev, ...response.data } : prev);
      }
      setShowEditTenantModal(false);
      
      // If reactivating from vacated status, show billing setup screen
      if (isChangingFromVacatedToActive) {
        setTimeout(() => {
          openEditBillingModal();
        }, 500);
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update tenant');
    } finally {
      setTenantActionLoading(false);
    }
  };

  const handleDeleteTenant = () => {
    setShowDeleteConfirmModal(true);
  };

  const confirmDeleteTenant = async () => {
    if (!tenant) return;

    try {
      setTenantActionLoading(true);
      setShowDeleteConfirmModal(false);
      await tenantService.deleteTenant(tenant.id);
      Alert.alert('Success', 'Tenant and payments deleted successfully.', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to delete tenant');
    } finally {
      setTenantActionLoading(false);
    }
  };

  if (loading) {
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
          <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Tenant Details</Text>
          <View style={styles.placeholder} />
        </View>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          <Skeleton height={200} count={3} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!tenant) {
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
          <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Tenant Details</Text>
          <View style={styles.placeholder} />
        </View>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          <EmptyState
            icon={User}
            title="Tenant Not Found"
            subtitle="The selected tenant could not be found"
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const { totalPaid, latestPayment, outstanding } = calculateFinancialSummary();

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
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Tenant Details</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.iconActionButton, { backgroundColor: colors.primary[50], borderColor: colors.primary[200], opacity: !isOnline ? 0.5 : 1 }]}
            onPress={openEditTenantModal}
            activeOpacity={0.7}
            disabled={tenantActionLoading || !isOnline}>
            <Pencil size={16} color={colors.primary[600]} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconActionButton, { backgroundColor: colors.danger[50], borderColor: colors.danger[200], opacity: !isOnline ? 0.5 : 1 }]}
            onPress={handleDeleteTenant}
            activeOpacity={0.7}
            disabled={tenantActionLoading || !isOnline}>
            <Trash2 size={16} color={colors.danger[600]} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary[500]]}
            tintColor={colors.primary[500]}
          />
        }>
        {error ? (
          <ApiErrorCard error={error} onRetry={handleRetry} />
        ) : (
          <>
            <Card style={styles.profileCard}>
              <View style={styles.profileHeader}>
                <View style={[styles.avatar, { backgroundColor: colors.primary[500] }]}>
                  <Text style={[styles.avatarText, { color: colors.white }]}>
                    {tenant.name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')}
                  </Text>
                </View>
                <View style={styles.profileInfo}>
                  <Text style={[styles.tenantName, { color: colors.text.primary }]}>
                    {tenant.name}
                  </Text>
                </View>
              </View>

              <View style={[styles.divider, { backgroundColor: colors.border.light }]} />

              <View style={styles.contactSection}>
                <View style={styles.contactItem}>
                  <Text style={[styles.contactText, { color: colors.text.primary }]}>
                    Status: <Text style={{ color: tenant.tenantStatus === 'active' ? colors.success[600] : colors.danger[600], fontWeight: typography.fontWeight.semibold as any }}>{tenant.tenantStatus === 'active' ? 'Active' : 'Vacated'}</Text>
                  </Text>
                </View>
              </View>
            </Card>

            {tenant.tenantStatus === 'active' && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>
                    Financial Summary
                  </Text>
                </View>

                <Card style={styles.summaryCard}>
                  <View style={styles.summaryGrid}>
                    <View style={styles.summaryItem}>
                      <Text style={[styles.summaryLabel, { color: colors.text.secondary }]}>
                        Total Paid
                      </Text>
                      <Text style={[styles.summaryValue, { color: colors.success[500] }]}>
                        ₹{totalPaid.toLocaleString()}
                      </Text>
                    </View>

                    <View style={styles.summaryItem}>
                      <Text style={[styles.summaryLabel, { color: colors.text.secondary }]}>
                        Monthly Rent
                      </Text>
                      <Text style={[styles.summaryValue, { color: colors.text.primary }]}>
                        {tenant.rent}
                      </Text>
                    </View>

                    <View style={styles.summaryItem}>
                      <Text style={[styles.summaryLabel, { color: colors.text.secondary }]}>
                        Outstanding
                      </Text>
                      <Text style={[styles.summaryValue, { color: outstanding > 0 ? colors.danger[500] : colors.text.primary }]}>
                        ₹{outstanding.toLocaleString()}
                      </Text>
                    </View>
                  </View>
                </Card>
              </View>
            )}

            {tenant.tenantStatus === 'active' && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>
                    Billing Configuration
                  </Text>
                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: colors.primary[500], opacity: !isOnline ? 0.5 : 1 }]}
                    onPress={openEditBillingModal}
                    activeOpacity={0.7}
                    disabled={!isOnline}>
                    <Edit size={16} color={colors.white} />
                    <Text style={[styles.actionButtonText, { color: colors.white }]}>
                      Edit
                    </Text>
                  </TouchableOpacity>
                </View>

                <Card style={styles.billingCard}>
                  {tenant?.billingConfig ? (
                    <>
                      <View style={styles.billingRow}>
                        <Text style={[styles.billingLabel, { color: colors.text.secondary }]}>
                          Billing Frequency
                        </Text>
                        <Text style={[styles.billingValue, { color: colors.text.primary }]}>
                          {tenant.billingConfig.billingCycle ? (tenant.billingConfig.billingCycle.charAt(0).toUpperCase() + tenant.billingConfig.billingCycle.slice(1)) : ''}
                        </Text>
                      </View>

                      <View style={[styles.divider, { backgroundColor: colors.border.light }]} />

                      <View style={styles.billingRow}>
                        <Text style={[styles.billingLabel, { color: colors.text.secondary }]}>
                          Anchor Day
                        </Text>
                        <Text style={[styles.billingValue, { color: colors.text.primary }]}>
                          {getDayWithOrdinal(tenant.billingConfig.anchorDay)} of every month
                        </Text>
                      </View>

                      <View style={[styles.divider, { backgroundColor: colors.border.light }]} />

                      <View style={styles.billingRow}>
                        <Text style={[styles.billingLabel, { color: colors.text.secondary }]}>
                          Next Billing Date
                        </Text>
                        <Text style={[styles.billingValue, { color: colors.primary[600] }]}>
                          {formatDateWithOrdinal(calculateNextBillingDate(tenant.billingConfig.anchorDay || 1, 'monthly'))}
                        </Text>
                      </View>

                      <View style={[styles.divider, { backgroundColor: colors.border.light }]} />

                      {/* Auto-Generate logic removed, not present in BillingConfig type */}
                    </>
                  ) : (
                    <Text style={[styles.noBillingText, { color: colors.text.secondary }]}>
                      No billing configuration set
                    </Text>
                  )}
                </Card>
              </View>
            )}

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.text.primary }]}> 
                  Payment History
                </Text>
                {latestPayment && latestPayment.status === 'due' ? (
                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: colors.success[500] }]}
                    onPress={handleMarkAsPaid}
                    activeOpacity={0.7}>
                    <CheckCircle size={16} color={colors.white} />
                    <Text style={[styles.actionButtonText, { color: colors.white }]}> 
                      Mark as Paid
                    </Text>
                  </TouchableOpacity>
                ) : !latestPayment && !tenant.autoGeneratePayments ? (
                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: colors.primary[500] }]}
                    onPress={handleGenerateDue}
                    activeOpacity={0.7}>
                    <Plus size={addActionTokens.iconSize.compact} color={colors.action.add.icon} />
                    <Text style={[styles.actionButtonText, { color: colors.white }]}> 
                      Generate Due
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {payments.length === 0 ? (
                <Card style={styles.emptyPaymentCard}>
                  <EmptyState
                    icon={Wallet}
                    title="No Payments Yet"
                    subtitle={tenant.autoGeneratePayments
                      ? 'Payments will be auto-generated from this tenant billing setup.'
                      : 'Payment history will appear here'}
                  />
                </Card>
              ) : (
                <>
                  {payments.map((payment, index) => (
                    <Card key={index} style={styles.paymentCard}>
                      <View style={styles.paymentHeader}>
                        <View style={styles.paymentLeft}>
                          <Text style={[styles.paymentAmount, { color: colors.text.primary }]}>
                            {payment.amount}
                          </Text>
                          <Text style={[styles.paymentMethod, { color: colors.text.secondary }]}>
                            {payment.method || 'Pending'}
                          </Text>
                        </View>
                        <StatusBadge status={payment.status} />
                      </View>

                      <View style={[styles.divider, { backgroundColor: colors.border.light }]} />

                      <View style={styles.paymentDetails}>
                        {payment.status === 'paid' ? (
                          <View style={styles.paymentDetailRow}>
                            <Text style={[styles.paymentDetailLabel, { color: colors.text.tertiary }]}>
                              Paid On:
                            </Text>
                            <Text style={[styles.paymentDetailValue, { color: colors.text.secondary }]}>
                              {formatDateWithOrdinal(payment.paidDate ?? payment.dueDate ?? '')}
                            </Text>
                          </View>
                        ) : (
                          <View style={styles.paymentDetailRow}>
                            <Text style={[styles.paymentDetailLabel, { color: colors.text.tertiary }]}>
                              Due:
                            </Text>
                            <Text style={[styles.paymentDetailValue, { color: colors.text.secondary }]}>
                              {formatDateWithOrdinal(payment.dueDate ?? '')}
                            </Text>
                          </View>
                        )}
                      </View>
                    </Card>
                  ))}
                </>
              )}
            </View>
          </>
        )}
      </ScrollView>

      <Modal
        visible={showEditTenantModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEditTenantModal(false)}>
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: colors.background.primary }]}>
          <View style={[styles.modalHeader, { backgroundColor: colors.background.secondary, borderBottomColor: colors.border.light }]}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => setShowEditTenantModal(false)}
              activeOpacity={0.7}>
              <ChevronLeft size={24} color={colors.text.primary} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text.primary }]}>Edit Tenant</Text>
            <View style={styles.placeholder} />
          </View>

          <ScrollView contentContainerStyle={styles.modalScrollContent}>
            <View style={styles.formContainer}>
              <View style={styles.inputContainer}>
                <Text style={[styles.label, { color: colors.text.primary }]}>Status</Text>
                <TouchableOpacity
                  style={[
                    styles.pickerButton,
                    {
                      backgroundColor: colors.background.secondary,
                      borderColor: colors.border.medium,
                    },
                  ]}
                  onPress={() => setShowStatusPicker(true)}
                  activeOpacity={0.7}
                  disabled={tenantActionLoading}>
                  <Text
                    style={[
                      styles.pickerButtonText,
                      {
                        color: colors.text.primary,
                      },
                    ]}>
                    {editTenantStatus === 'active' ? 'Active' : 'Vacated'}
                  </Text>
                  <ChevronDown size={20} color={colors.text.tertiary} />
                </TouchableOpacity>
              </View>

              {editTenantStatus === 'active' && (
                <>
                  <View style={styles.inputContainer}>
                    <Text style={[styles.label, { color: colors.text.primary }]}>Name</Text>
                    <TextInput
                      style={[styles.textInput, { backgroundColor: colors.background.secondary, borderColor: colors.border.medium, color: colors.text.primary }]}
                      value={editTenantName}
                      onChangeText={setEditTenantName}
                      placeholder="Enter tenant name"
                      placeholderTextColor={colors.text.tertiary}
                      editable={!tenantActionLoading}
                    />
                  </View>

                  <View style={styles.inputContainer}>
                    <Text style={[styles.label, { color: colors.text.primary }]}>Document ID</Text>
                    <TextInput
                      style={[styles.textInput, { backgroundColor: colors.background.secondary, borderColor: colors.border.medium, color: colors.text.primary }]}
                      value={editTenantDocumentId}
                      onChangeText={setEditTenantDocumentId}
                      placeholder="e.g., Aadhar123456"
                      placeholderTextColor={colors.text.tertiary}
                      editable={!tenantActionLoading}
                    />
                  </View>

                  <View style={styles.inputContainer}>
                    <Text style={[styles.label, { color: colors.text.primary }]}>Phone</Text>
                    <TextInput
                      style={[styles.textInput, { backgroundColor: colors.background.secondary, borderColor: colors.border.medium, color: colors.text.primary }]}
                      value={editTenantPhone}
                      onChangeText={setEditTenantPhone}
                      keyboardType="number-pad"
                      maxLength={10}
                      placeholder="Enter 10-digit phone"
                      placeholderTextColor={colors.text.tertiary}
                      editable={!tenantActionLoading}
                    />
                  </View>

                  <View style={styles.inputContainer}>
                    <Text style={[styles.label, { color: colors.text.primary }]}>Rent</Text>
                    <TextInput
                      style={[styles.textInput, { backgroundColor: colors.background.secondary, borderColor: colors.border.medium, color: colors.text.primary }]}
                      value={editTenantRent}
                      onChangeText={setEditTenantRent}
                      placeholder="Enter rent amount"
                      placeholderTextColor={colors.text.tertiary}
                      editable={!tenantActionLoading}
                    />
                  </View>

                  <View style={styles.inputContainer}>
                    <Text style={[styles.label, { color: colors.text.primary }]}>Address</Text>
                    <TextInput
                      style={[styles.textInput, { backgroundColor: colors.background.secondary, borderColor: colors.border.medium, color: colors.text.primary }]}
                      value={editTenantAddress}
                      onChangeText={setEditTenantAddress}
                      placeholder="Enter address"
                      placeholderTextColor={colors.text.tertiary}
                      editable={!tenantActionLoading}
                      multiline
                      numberOfLines={2}
                    />
                  </View>

                  <DatePicker
                    value={editTenantJoinDate}
                    onChange={setEditTenantJoinDate}
                    label="Join Date"
                    disabled={tenantActionLoading}
                    required
                  />

                  <View style={styles.inputContainer}>
                    <Text style={[styles.label, { color: colors.text.primary }]}>Room</Text>
                    <TouchableOpacity
                      style={[
                        styles.pickerButton,
                        {
                          backgroundColor: colors.background.secondary,
                          borderColor: colors.border.medium,
                        },
                      ]}
                      onPress={() => setShowEditRoomPicker(true)}
                      activeOpacity={0.7}
                      disabled={tenantActionLoading || editRoomsWithBeds.length === 0}>
                      <Text
                        style={[
                          styles.pickerButtonText,
                          {
                            color: editTenantRoom ? colors.text.primary : colors.text.tertiary,
                          },
                        ]}>
                        {editTenantRoom ? `Room ${editTenantRoom.roomNumber}` : 'Select Room'}
                      </Text>
                      <ChevronDown size={20} color={colors.text.tertiary} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.inputContainer}>
                    <Text style={[styles.label, { color: colors.text.primary }]}>Bed</Text>
                    <TouchableOpacity
                      style={[
                        styles.pickerButton,
                        {
                          backgroundColor: colors.background.secondary,
                          borderColor: colors.border.medium,
                          opacity: !editTenantRoom ? 0.5 : 1,
                        },
                      ]}
                      onPress={() => setShowEditBedPicker(true)}
                      activeOpacity={0.7}
                      disabled={tenantActionLoading || !editTenantRoom || editAvailableBedsForRoom.length === 0}>
                      <Text
                        style={[
                          styles.pickerButtonText,
                          {
                            color: editTenantBed ? colors.text.primary : colors.text.tertiary,
                          },
                        ]}>
                        {editTenantBed ? `Bed ${editTenantBed.bedNumber}` : 'Select Bed'}
                      </Text>
                      <ChevronDown size={20} color={colors.text.tertiary} />
                    </TouchableOpacity>
                  </View>
                </>
              )}

              <TouchableOpacity
                style={[
                  styles.submitButton,
                  {
                    backgroundColor: colors.primary[500],
                    opacity: tenantActionLoading ? 0.6 : 1,
                  },
                ]}
                onPress={handleUpdateTenant}
                activeOpacity={0.8}
                disabled={tenantActionLoading}>
                {tenantActionLoading ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <Text style={[styles.submitButtonText, { color: colors.white }]}>Save Tenant</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={showEditBillingModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEditBillingModal(false)}>
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: colors.background.primary }]}>
          <View style={[styles.modalHeader, { backgroundColor: colors.background.secondary, borderBottomColor: colors.border.light }]}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => setShowEditBillingModal(false)}
              activeOpacity={0.7}>
              <ChevronLeft size={24} color={colors.text.primary} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text.primary }]}>Edit Billing</Text>
            <View style={styles.placeholder} />
          </View>

          <ScrollView contentContainerStyle={styles.modalScrollContent}>
            <View style={styles.formContainer}>
              <View style={[styles.toggleContainer, { backgroundColor: colors.background.secondary, borderColor: colors.border.medium }]}>
                <View style={styles.toggleLabel}>
                  <Text style={[styles.label, { color: colors.text.primary }]}>Enable Auto-Generate</Text>
                  <Text style={[styles.toggleHint, { color: colors.text.secondary }]}>
                    Automatically generate due payments
                  </Text>
                </View>
                <Switch
                  value={editAutoGenerate}
                  onValueChange={setEditAutoGenerate}
                  disabled={editLoading}
                  trackColor={{ false: colors.border.medium, true: colors.primary[200] }}
                  thumbColor={editAutoGenerate ? colors.primary[500] : colors.text.tertiary}
                />
              </View>

              {editAutoGenerate && (
                <>
                  <View style={styles.inputContainer}>
                    <Text style={[styles.label, { color: colors.text.primary }]}>When is rent due each month?</Text>
                    <TouchableOpacity
                      style={[styles.pickerButton, { backgroundColor: colors.background.secondary, borderColor: colors.border.medium }]}
                      onPress={() => setShowAnchorDayPicker(true)}
                      activeOpacity={0.7}
                      disabled={editLoading}>
                      <Text style={[styles.pickerButtonText, { color: colors.text.primary }]}>📅 Day {editAnchorDay} • Every Month</Text>
                      <ChevronDown size={20} color={colors.text.tertiary} />
                    </TouchableOpacity>
                    <Text style={[styles.summaryLabel, { color: colors.text.secondary, marginTop: spacing.xs }]}>Same day each month</Text>
                  </View>
                </>
              )}

              <TouchableOpacity
                style={[
                  styles.submitButton,
                  {
                    backgroundColor: colors.primary[500],
                    opacity: editLoading ? 0.6 : 1,
                  },
                ]}
                onPress={handleSaveBillingConfig}
                activeOpacity={0.8}
                disabled={editLoading}>
                {editLoading ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <Text style={[styles.submitButtonText, { color: colors.white }]}>
                    Save Changes
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Anchor Day Picker Modal */}
      <Modal
        visible={showAnchorDayPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAnchorDayPicker(false)}>
        <View style={[styles.pickerOverlay, { backgroundColor: colors.modal.overlay }]}>
          <View style={[styles.pickerContainer, { backgroundColor: colors.background.secondary }]}>
            <View style={[styles.pickerHeader, { borderBottomColor: colors.border.light }]}>
              <Text style={[styles.pickerTitle, { color: colors.text.primary }]}>When is rent due each month?</Text>
            </View>
            <ScrollView style={styles.pickerScrollView}>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                <TouchableOpacity
                  key={day}
                  style={[styles.pickerOption, { borderBottomColor: colors.border.light }]}
                  onPress={() => {
                    setEditAnchorDay(day);
                    setShowAnchorDayPicker(false);
                  }}
                  activeOpacity={0.7}>
                  <Text
                    style={[
                      styles.pickerOptionText,
                      {
                        color:
                          editAnchorDay === day ? colors.primary[500] : colors.text.primary,
                        fontWeight:
                          editAnchorDay === day
                            ? typography.fontWeight.semibold
                            : typography.fontWeight.regular,
                      },
                    ]}>
                    Day {day} • Every Month
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={[styles.pickerCloseButton, { borderTopColor: colors.border.light }]}
              onPress={() => setShowAnchorDayPicker(false)}
              activeOpacity={0.7}>
              <Text style={[styles.pickerCloseButtonText, { color: colors.text.secondary }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Status Picker Modal */}
      <Modal
        visible={showStatusPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowStatusPicker(false)}>
        <View style={[styles.pickerOverlay, { backgroundColor: colors.modal.overlay }]}>
          <View style={[styles.pickerContainer, { backgroundColor: colors.background.secondary }]}>
            <View style={[styles.pickerHeader, { borderBottomColor: colors.border.light }]}>
              <Text style={[styles.pickerTitle, { color: colors.text.primary }]}>Select Status</Text>
            </View>
            <ScrollView style={styles.pickerScrollView}>
              <TouchableOpacity
                style={[styles.pickerOption, { borderBottomColor: colors.border.light }]}
                onPress={() => {
                  setEditTenantStatus('active');
                  setShowStatusPicker(false);
                }}
                activeOpacity={0.7}>
                <Text
                  style={[
                    styles.pickerOptionText,
                    {
                      color:
                        editTenantStatus === 'active' ? colors.primary[500] : colors.text.primary,
                      fontWeight:
                        editTenantStatus === 'active'
                          ? typography.fontWeight.semibold
                          : typography.fontWeight.regular,
                    },
                  ]}>
                  Active
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pickerOption, { borderBottomColor: colors.border.light }]}
                onPress={() => {
                  setEditTenantStatus('vacated');
                  setShowStatusPicker(false);
                }}
                activeOpacity={0.7}>
                <Text
                  style={[
                    styles.pickerOptionText,
                    {
                      color:
                        editTenantStatus === 'vacated' ? colors.primary[500] : colors.text.primary,
                      fontWeight:
                        editTenantStatus === 'vacated'
                          ? typography.fontWeight.semibold
                          : typography.fontWeight.regular,
                    },
                  ]}>
                  Vacated
                </Text>
              </TouchableOpacity>
            </ScrollView>
            <TouchableOpacity
              style={[styles.pickerCloseButton, { borderTopColor: colors.border.light }]}
              onPress={() => setShowStatusPicker(false)}
              activeOpacity={0.7}>
              <Text style={[styles.pickerCloseButtonText, { color: colors.text.secondary }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={showDeleteConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => !tenantActionLoading && setShowDeleteConfirmModal(false)}>
        <View style={[styles.deleteModalOverlay, { backgroundColor: 'rgba(0, 0, 0, 0.5)' }]}>
          <View style={[styles.deleteModalContent, { backgroundColor: colors.background.secondary }]}>
            {/* Icon */}
            <View style={[styles.deleteIconContainer, { backgroundColor: colors.danger[50] }]}>
              <Trash2 size={32} color={colors.danger[500]} />
            </View>

            {/* Title */}
            <Text style={[styles.deleteModalTitle, { color: colors.text.primary }]}>Delete Tenant?</Text>

            {/* Message */}
            <Text style={[styles.deleteModalMessage, { color: colors.text.secondary }]}>
              This will permanently remove {tenant?.name}, their profile, and all payment records.
            </Text>

            {/* Warning */}
            <View style={[styles.deleteWarning, { backgroundColor: colors.danger[50], borderLeftColor: colors.danger[500] }]}>
              <Text style={[styles.deleteWarningText, { color: colors.danger[700] }]}>This action cannot be undone.</Text>
            </View>

            {/* Buttons */}
            <View style={styles.deleteModalButtons}>
              <TouchableOpacity
                style={[styles.deleteCancelButton, { backgroundColor: colors.background.tertiary }]}
                onPress={() => setShowDeleteConfirmModal(false)}
                disabled={tenantActionLoading}
                activeOpacity={0.7}>
                <Text style={[styles.deleteCancelButtonText, { color: colors.text.primary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.deleteConfirmButton, { backgroundColor: colors.danger[500] }]}
                onPress={confirmDeleteTenant}
                disabled={tenantActionLoading}
                activeOpacity={0.7}>
                {tenantActionLoading ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <Text style={styles.deleteConfirmButtonText}>Delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Room Picker Modal */}
      <Modal
        visible={showEditRoomPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEditRoomPicker(false)}>
        <View style={[styles.pickerOverlay, { backgroundColor: colors.modal.overlay }]}>
          <View style={[styles.pickerContainer, { backgroundColor: colors.background.secondary }]}>
            <View style={[styles.pickerHeader, { borderBottomColor: colors.border.light }]}>
              <Text style={[styles.pickerTitle, { color: colors.text.primary }]}>
                Select Room
              </Text>
            </View>

            <ScrollView style={styles.pickerScrollView}>
              {editRoomsWithBeds.map((roomData, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.pickerOption,
                    { borderBottomColor: colors.border.light },
                  ]}
                  onPress={() => {
                    setEditTenantRoom(roomData.room);
                    setShowEditRoomPicker(false);
                  }}
                  activeOpacity={0.7}>
                  <View style={styles.modalOptionContent}>
                    <Text
                      style={[
                        styles.pickerOptionText,
                        {
                          color:
                            editTenantRoom?.id === roomData.room.id
                              ? colors.primary[500]
                              : colors.text.primary,
                          fontWeight:
                            editTenantRoom?.id === roomData.room.id
                              ? typography.fontWeight.semibold
                              : typography.fontWeight.regular,
                        },
                      ]}>
                      Room {roomData.room.roomNumber}
                    </Text>
                    <Text style={[styles.pickerOptionSubtext, { color: colors.text.secondary }]}>
                      Floor {roomData.room.floor} • {roomData.availableBeds.length} available • ₹{roomData.room.price}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={[styles.pickerCloseButton, { borderTopColor: colors.border.light }]}
              onPress={() => setShowEditRoomPicker(false)}
              activeOpacity={0.7}>
              <Text style={[styles.pickerCloseButtonText, { color: colors.text.secondary }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Edit Bed Picker Modal */}
      <Modal
        visible={showEditBedPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEditBedPicker(false)}>
        <View style={[styles.pickerOverlay, { backgroundColor: colors.modal.overlay }]}>
          <View style={[styles.pickerContainer, { backgroundColor: colors.background.secondary }]}>
            <View style={[styles.pickerHeader, { borderBottomColor: colors.border.light }]}>
              <Text style={[styles.pickerTitle, { color: colors.text.primary }]}>
                Select Bed
              </Text>
            </View>

            <ScrollView style={styles.pickerScrollView}>
              {editAvailableBedsForRoom.map((bed, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.pickerOption,
                    { borderBottomColor: colors.border.light },
                  ]}
                  onPress={() => {
                    setEditTenantBed(bed);
                    setShowEditBedPicker(false);
                  }}
                  activeOpacity={0.7}>
                  <Text
                    style={[
                      styles.pickerOptionText,
                      {
                        color:
                          editTenantBed?.id === bed.id
                            ? colors.primary[500]
                            : colors.text.primary,
                        fontWeight:
                          editTenantBed?.id === bed.id
                            ? typography.fontWeight.semibold
                            : typography.fontWeight.regular,
                      },
                    ]}>
                    Bed {bed.bedNumber}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={[styles.pickerCloseButton, { borderTopColor: colors.border.light }]}
              onPress={() => setShowEditBedPicker(false)}
              activeOpacity={0.7}>
              <Text style={[styles.pickerCloseButtonText, { color: colors.text.secondary }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
  },
  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  iconActionButton: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  placeholder: {
    width: 40,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  profileCard: {
    marginBottom: spacing.lg,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.lg,
  },
  avatarText: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
  },
  profileInfo: {
    flex: 1,
    gap: spacing.sm,
  },
  tenantName: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
  },
  divider: {
    height: 1,
    marginBottom: spacing.lg,
  },
  contactSection: {
    gap: spacing.md,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  contactText: {
    fontSize: typography.fontSize.md,
  },

  section: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    gap: spacing.xs,
    ...shadows.sm,
  },
  addButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  summaryCard: {
    paddingVertical: spacing.lg,
  },
  summaryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryLabel: {
    fontSize: typography.fontSize.xs,
    marginBottom: spacing.sm,
  },
  summaryValue: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  emptyPaymentCard: {
    paddingVertical: spacing.xl,
  },
  paymentCard: {
    marginBottom: spacing.sm,
  },
  paymentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  paymentLeft: {
    flex: 1,
  },
  paymentAmount: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    marginBottom: 2,
  },
  paymentMethod: {
    fontSize: typography.fontSize.xs,
  },
  paymentDetails: {
    gap: 2,
  },
  paymentDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paymentDetailLabel: {
    fontSize: typography.fontSize.xs,
  },
  paymentDetailValue: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    gap: spacing.xs,
    ...shadows.sm,
  },
  actionButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  nextDueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    ...shadows.md,
  },
  nextDueText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  billingCard: {
    paddingVertical: spacing.lg,
  },
  billingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  billingStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  billingLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  billingValue: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  statusBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  statusBadgeText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
  },
  infoBanner: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  infoBannerText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  noBillingText: {
    fontSize: typography.fontSize.md,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  modalScrollContent: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  formContainer: {
    width: '100%',
  },
  dateInputContainer: {
    position: 'relative',
  },
  dateIcon: {
    position: 'absolute',
    left: spacing.lg,
    top: spacing.md,
    zIndex: 1,
  },
  dateInput: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    paddingLeft: 48,
    fontSize: typography.fontSize.md,
    borderWidth: 1,
  },
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.xl,
  },
  toggleLabel: {
    flex: 1,
    marginRight: spacing.md,
  },
  toggleHint: {
    fontSize: typography.fontSize.xs,
    marginTop: spacing.xs,
  },
  inputContainer: {
    marginBottom: spacing.xl,
  },
  label: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.sm,
  },
  textInput: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: typography.fontSize.md,
    borderWidth: 1,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
  },
  pickerButtonText: {
    fontSize: typography.fontSize.md,
  },
  submitButton: {
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    ...shadows.lg,
  },
  submitButtonText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  pickerOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  pickerContainer: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '50%',
    ...shadows.xl,
  },
  pickerHeader: {
    padding: spacing.lg,
    borderBottomWidth: 1,
  },
  pickerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    textAlign: 'center',
  },
  pickerScrollView: {
    maxHeight: 250,
  },
  pickerOption: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
  },
  pickerOptionText: {
    fontSize: typography.fontSize.md,
  },
  pickerCloseButton: {
    padding: spacing.lg,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  pickerCloseButtonText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  infoBox: {
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  infoLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  infoValue: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  infoNote: {
    fontSize: typography.fontSize.xs,
    marginTop: spacing.xs,
  },
  // Delete Confirmation Modal Styles
  deleteModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  deleteModalContent: {
    borderRadius: radius.xl,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    maxWidth: 360,
    ...shadows.lg,
  },
  deleteIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  deleteModalTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.sm,
  },
  deleteModalMessage: {
    fontSize: typography.fontSize.md,
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 1.5,
  },
  deleteWarning: {
    borderLeftWidth: 4,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
    width: '100%',
  },
  deleteWarningText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  deleteModalButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
  },
  deleteCancelButton: {
    flex: 1,
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteCancelButtonText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  deleteConfirmButton: {
    flex: 1,
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteConfirmButtonText: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  modalOptionContent: {
    gap: spacing.xs,
  },
  pickerOptionSubtext: {
    fontSize: typography.fontSize.xs,
  },
});
