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
  Linking,
  Animated,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  User,
  Phone,
  MapPin,
  Wallet,
  Calendar,
  Plus,
  Edit,
  Pencil,
  Trash2,
  CheckCircle,
  ChevronDown,
  ArrowRight,
  Clock,
  IndianRupee,
  Home,
  BadgeCheck,
  X,
} from 'lucide-react-native';
import { spacing, radius, shadows, addActionTokens } from '@/theme';
import { typography, textPresets } from '@/theme/typography';
import { useTheme } from '@/context/ThemeContext';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import useResponsiveLayout from '@/hooks/useResponsiveLayout';
import { tenantService, paymentService, roomService, bedService } from '@/services/apiClient';
import type { Tenant, Payment, Room, Bed, BillingFrequency, BillingConfig } from '@/services/apiTypes';
import StatusBadge from '@/components/StatusBadge';
import DatePicker from '@/components/DatePicker';
import EmptyState from '@/components/EmptyState';
import Skeleton from '@/components/Skeleton';
import ApiErrorCard from '@/components/ApiErrorCard';
import { cacheKeys, getScreenCache, setScreenCache, clearScreenCache } from '@/services/screenCache';

interface TenantDetailCachePayload {
  tenant: Tenant;
  payments: Payment[];
  room: Room | null;
}

const TENANT_DETAIL_CACHE_STALE_MS    = 30 * 1000;
const TENANT_DETAIL_FOCUS_THROTTLE_MS = 30 * 1000;

// ── Slide-up sheet helper ─────────────────────────────────────────────────────
function useSheetAnim() {
  const anim = useRef(new Animated.Value(500)).current;
  const open  = () => Animated.spring(anim, { toValue: 0, tension: 68, friction: 12, useNativeDriver: true }).start();
  const close = (cb?: () => void) =>
    Animated.timing(anim, { toValue: 500, duration: 220, useNativeDriver: true }).start(cb);
  return { anim, open, close };
}

export default function TenantDetailScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { tenantId } = useLocalSearchParams<{ tenantId: string }>();
  const isOnline = useNetworkStatus();
  const { isTablet, isLandscape, contentMaxWidth, modalMaxWidth } = useResponsiveLayout();
  const isTabletLandscape = isTablet && isLandscape;

  const [tenant,   setTenant]   = useState<Tenant | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [room,     setRoom]     = useState<Room | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [loadingPayments,  setLoadingPayments]  = useState(false);
  const [paymentsPage,     setPaymentsPage]     = useState(1);
  const [hasMorePayments,  setHasMorePayments]  = useState(false);
  const PAYMENTS_PAGE_SIZE = 20;

  const [showEditBillingModal,        setShowEditBillingModal]        = useState(false);
  const [editAnchorDay,               setEditAnchorDay]               = useState<number>(1);
  const [editAutoGenerate,            setEditAutoGenerate]            = useState(true);
  const [editBillingStatus,           setEditBillingStatus]           = useState<'paid' | 'due'>('due');
  const [showEditBillingStatusPicker, setShowEditBillingStatusPicker] = useState(false);
  const [showAnchorDayPicker,         setShowAnchorDayPicker]         = useState(false);
  const [editLoading,                 setEditLoading]                 = useState(false);
  const [showEditTenantModal,         setShowEditTenantModal]         = useState(false);
  const [editTenantName,              setEditTenantName]              = useState('');
  const [editTenantDocumentId,        setEditTenantDocumentId]        = useState('');
  const [editTenantPhone,             setEditTenantPhone]             = useState('');
  const [editTenantRent,              setEditTenantRent]              = useState('');
  const [editTenantAddress,           setEditTenantAddress]           = useState('');
  const [editTenantJoinDate,          setEditTenantJoinDate]          = useState('');
  const [editTenantStatus,            setEditTenantStatus]            = useState<'active' | 'vacated'>('active');
  const [editTenantRoom,              setEditTenantRoom]              = useState<Room | null>(null);
  const [editTenantBed,               setEditTenantBed]               = useState<Bed | null>(null);
  const [editRoomsWithBeds,           setEditRoomsWithBeds]           = useState<Array<{ room: Room; availableBeds: Bed[] }>>([]);
  const [editAvailableBedsForRoom,    setEditAvailableBedsForRoom]    = useState<Bed[]>([]);
  const [showEditRoomPicker,          setShowEditRoomPicker]          = useState(false);
  const [showEditBedPicker,           setShowEditBedPicker]           = useState(false);
  const [showStatusPicker,            setShowStatusPicker]            = useState(false);
  const [tenantActionLoading,         setTenantActionLoading]         = useState(false);
  const [showDeleteConfirmModal,      setShowDeleteConfirmModal]      = useState(false);

  const loadingTimeoutRef        = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTenantFocusRefreshRef = useRef<number>(0);

  // Sheet animations
  const billingSheet = useSheetAnim();
  const statusSheet  = useSheetAnim();
  const anchorSheet  = useSheetAnim();
  const roomSheet    = useSheetAnim();
  const bedSheet     = useSheetAnim();

  // ── Color aliases ────────────────────────────────────────────────────────
  const brandColor       = colors.primary[500];
  const brandLight       = isDark ? colors.primary[900] : colors.primary[50];
  const brandText        = isDark ? colors.primary[300] : colors.primary[600];
  const successColor     = colors.success[500];
  const successLight     = isDark ? colors.success[900] : colors.success[50];
  const successText      = isDark ? colors.success[300] : colors.success[600];
  const warningColor     = colors.warning[500];
  const warningLight     = isDark ? colors.warning[900] : colors.warning[50];
  const dangerColor      = colors.danger[500];
  const dangerLight      = isDark ? colors.danger[900] : colors.danger[50];
  const dangerText       = isDark ? colors.danger[300] : colors.danger[600];
  const cardBg           = colors.background.secondary;
  const cardBorder       = colors.border.medium;
  const pageBg           = colors.background.primary;
  const textPrimary      = colors.text.primary;
  const textSecondary    = colors.text.secondary;
  const textTertiary     = colors.text.tertiary;

  // ── Data fetching ─────────────────────────────────────────────────────────
  const fetchTenantData = async (forceNetwork = false) => {
    if (!tenantId) { setLoading(false); return; }
    const cacheKey = cacheKeys.tenantDetail(tenantId);
    if (!forceNetwork) {
      const cached = getScreenCache<TenantDetailCachePayload>(cacheKey, TENANT_DETAIL_CACHE_STALE_MS);
      if (cached) {
        setTenant(cached.tenant); setPayments(cached.payments); setRoom(cached.room);
        setError(null); setLoading(false); return;
      }
    }
    try {
      setLoading(true); setError(null);
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = setTimeout(() => {
        setLoading(false);
        if (!tenant) setError('Request is taking longer than expected. Please try again.');
      }, 8000);

      const tenantRes = await tenantService.getTenantById(tenantId);
      if (loadingTimeoutRef.current) { clearTimeout(loadingTimeoutRef.current); loadingTimeoutRef.current = null; }
      if (tenantRes.data) {
        setTenant(tenantRes.data);
        const [_, roomRes] = await Promise.all([
          fetchPayments(tenantRes.data.propertyId, 1, true),
          tenantRes.data.roomId ? roomService.getRoomById(tenantRes.data.roomId) : Promise.resolve({ data: null }),
        ]);
        if (roomRes?.data) setRoom(roomRes.data);
      }
    } catch (err: any) {
      if (loadingTimeoutRef.current) { clearTimeout(loadingTimeoutRef.current); loadingTimeoutRef.current = null; }
      setError(err?.message || 'Failed to load tenant details');
    } finally {
      setLoading(false);
    }
  };

  const fetchPayments = async (propertyId: string, page: number, reset = false) => {
    if (!tenantId) return;
    try {
      setLoadingPayments(true);
      const res = await paymentService.getPayments(propertyId, { tenantId, page, pageSize: PAYMENTS_PAGE_SIZE });
      const newPayments = (res.data || []).sort(
        (a, b) => new Date(b.dueDate ?? '').getTime() - new Date(a.dueDate ?? '').getTime()
      );
      if (reset) setPayments(newPayments);
      else setPayments(prev => [...prev, ...newPayments]);
      setHasMorePayments(newPayments.length === PAYMENTS_PAGE_SIZE);
      setPaymentsPage(page);
      if (tenant) {
        setScreenCache(cacheKeys.tenantDetail(tenantId), {
          tenant, payments: reset ? newPayments : [...payments, ...newPayments], room,
        });
      }
    } catch (err) { console.error('Error fetching payments:', err); }
    finally { setLoadingPayments(false); }
  };

  const handleLoadMorePayments = () => {
    if (!loadingPayments && hasMorePayments && tenant) fetchPayments(tenant.propertyId, paymentsPage + 1);
  };

  useFocusEffect(
    useCallback(() => {
      if (!tenantId) return;
      const cacheKey      = cacheKeys.tenantDetail(tenantId);
      const hasFreshCache = !!getScreenCache<TenantDetailCachePayload>(cacheKey, TENANT_DETAIL_CACHE_STALE_MS);
      const now           = Date.now();
      const shouldRefreshCacheMissing = !hasFreshCache;
      const shouldRefreshThrottle     = lastTenantFocusRefreshRef.current === 0
        || (now - lastTenantFocusRefreshRef.current) > TENANT_DETAIL_FOCUS_THROTTLE_MS;
      if (shouldRefreshCacheMissing || shouldRefreshThrottle) {
        lastTenantFocusRefreshRef.current = now;
        fetchTenantData(shouldRefreshCacheMissing);
      }
    }, [tenantId])
  );

  useEffect(() => () => { if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current); }, []);

  useEffect(() => {
    if (editTenantRoom) {
      const roomData = editRoomsWithBeds.find(r => r.room.id === editTenantRoom.id);
      if (roomData) {
        let bedsForRoom = roomData.availableBeds;
        if (tenant?.roomId === editTenantRoom.id && tenant?.bedId && editTenantBed) {
          if (!bedsForRoom.find(b => b.id === editTenantBed.id)) bedsForRoom = [editTenantBed, ...bedsForRoom];
        }
        setEditAvailableBedsForRoom(bedsForRoom);
        if (editTenantBed?.roomId && editTenantBed.roomId !== editTenantRoom.id) setEditTenantBed(null);
      }
    } else {
      setEditAvailableBedsForRoom([]); setEditTenantBed(null);
    }
  }, [editTenantRoom, editRoomsWithBeds, tenant?.bedId, tenant?.roomId, editTenantBed]);

  const handleRetry   = () => fetchTenantData(true);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await fetchTenantData(true); } finally { setRefreshing(false); }
  }, [tenantId]);

  // ── Billing helpers ───────────────────────────────────────────────────────
  const calculateNextBillingDate = (anchorDay: number): string => {
    const today = new Date();
    let next = new Date(today.getFullYear(), today.getMonth(), anchorDay);
    if (next < today) next = new Date(today.getFullYear(), today.getMonth() + 1, anchorDay);
    return next.toISOString();
  };

  const openEditBillingModal = () => {
    if (!tenant) return;
    setEditAutoGenerate(tenant.autoGeneratePayments === true);
    setEditAnchorDay(tenant.billingConfig?.anchorDay || 1);
    setEditBillingStatus((tenant.billingConfig?.status as 'paid' | 'due') || 'due');
    setShowEditBillingModal(true);
    billingSheet.open();
  };

  const handleSaveBillingConfig = async () => {
    if (!tenant) return;
    try {
      setEditLoading(true);
      const billingConfig = editAutoGenerate ? { billingCycle: 'monthly' as const, anchorDay: editAnchorDay, status: editBillingStatus } : null;
      await tenantService.updateTenant(tenant.id, { autoGeneratePayments: editAutoGenerate, billingConfig });
      setTenant({ ...tenant, autoGeneratePayments: editAutoGenerate, billingConfig: billingConfig ?? undefined });
      billingSheet.close(() => setShowEditBillingModal(false));
      Alert.alert('Success', 'Billing configuration updated successfully.');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update billing configuration');
    } finally { setEditLoading(false); }
  };

  // ── Financial summary ─────────────────────────────────────────────────────
  const calculateFinancialSummary = () => {
    const totalPaid = payments
      .filter(p => p.status === 'paid')
      .reduce((sum, p) => {
        const amt = typeof p.amount === 'string' ? parseFloat(p.amount.replace(/[^0-9]/g, '')) : p.amount;
        return sum + amt;
      }, 0);
    const latestPayment = payments[0] || null;
    let outstanding = payments
      .filter(p => p.status === 'due')
      .reduce((sum, p) => {
        const amt = typeof p.amount === 'string' ? parseFloat(p.amount.replace(/[^0-9]/g, '')) : p.amount;
        return sum + amt;
      }, 0);
    if (tenant?.billingConfig && tenant?.tenantStatus === 'active') {
      try {
        const anchorDay  = tenant.billingConfig.anchorDay;
        const rentAmount = typeof tenant.rent === 'string'
          ? parseFloat(tenant.rent.replace(/[^0-9]/g, ''))
          : parseFloat(tenant.rent || '0');
        const today          = new Date();
        let targetDueDate    = new Date(today.getFullYear(), today.getMonth(), anchorDay);
        if (targetDueDate > today) targetDueDate.setMonth(targetDueDate.getMonth() - 1);
        let currentCheckDate: Date;
        const latestDueDate  = latestPayment?.dueDate;
        if (latestDueDate) {
          const lastDue = new Date(latestDueDate);
          currentCheckDate = new Date(lastDue.getFullYear(), lastDue.getMonth() + 1, anchorDay);
        } else if (tenant.joinDate) {
          const joinDate = new Date(tenant.joinDate);
          currentCheckDate = new Date(joinDate.getFullYear(), joinDate.getMonth(), anchorDay);
          if (currentCheckDate < joinDate) currentCheckDate.setMonth(currentCheckDate.getMonth() + 1);
        } else {
          currentCheckDate = new Date(targetDueDate.getTime() + 86400000);
        }
        while (currentCheckDate <= targetDueDate) {
          outstanding += rentAmount;
          currentCheckDate.setMonth(currentCheckDate.getMonth() + 1);
        }
      } catch (err) { console.warn('Financial catch-up failed:', err); }
    }
    return { totalPaid, latestPayment, outstanding };
  };

  const handleMarkAsPaid = async () => {
    const { latestPayment } = calculateFinancialSummary();
    if (!latestPayment) return;
    router.push(`/edit-payment?paymentId=${latestPayment.id}`);
  };

  const handleGenerateDue = () => {
    if (tenant?.autoGeneratePayments) {
      Alert.alert('Billing Enabled', 'This tenant uses auto-generated billing.');
      return;
    }
    router.push(`/manual-payment?tenantId=${tenantId}`);
  };

  // ── Formatting helpers ────────────────────────────────────────────────────
  const getDayWithOrdinal = (day: number) => {
    const r10 = day % 10; const r100 = day % 100;
    if (r10 === 1 && r100 !== 11) return `${day}st`;
    if (r10 === 2 && r100 !== 12) return `${day}nd`;
    if (r10 === 3 && r100 !== 13) return `${day}rd`;
    return `${day}th`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '—';
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[date.getMonth()]} ${getDayWithOrdinal(date.getDate())} ${date.getFullYear()}`;
  };

  const openPhoneDialer = async (rawPhone?: string) => {
    const normalized = (rawPhone || '').replace(/[^0-9+]/g, '');
    if (!normalized) { Alert.alert('Invalid phone', 'No valid phone number.'); return; }
    const phoneUrl = `tel:${normalized}`;
    try {
      const canOpen = await Linking.canOpenURL(phoneUrl);
      if (!canOpen) { Alert.alert('Dialer unavailable', 'Could not open phone dialer.'); return; }
      await Linking.openURL(phoneUrl);
    } catch { Alert.alert('Dial failed', 'Unable to open phone dialer.'); }
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
    setEditTenantRoom(null); setEditTenantBed(null); setEditAvailableBedsForRoom([]);
    if (tenant.propertyId) {
      try {
        const isVacated = tenant.tenantStatus === 'vacated';
        const [selectableRes, allBedsRes] = isVacated
          ? await Promise.all([bedService.getAllBedsByProperty(tenant.propertyId), bedService.getAllBedsByProperty(tenant.propertyId)])
          : await Promise.all([bedService.getAvailableBedsByProperty(tenant.propertyId), bedService.getAllBedsByProperty(tenant.propertyId)]);
        const selectableRooms = selectableRes.data || [];
        const allRooms        = allBedsRes.data || [];
        setEditRoomsWithBeds(selectableRooms);
        let currentBed: Bed | null = null;
        if (tenant.bedId && tenant.roomId) {
          const currentRoomAllBeds = allRooms.find(r => r.room.id === tenant.roomId);
          currentBed = currentRoomAllBeds?.availableBeds.find(b => b.id === tenant.bedId) || null;
        }
        if (!currentBed && tenant.bedId) {
          try { const res = await bedService.getBedById(tenant.bedId); currentBed = res.data || null; } catch { currentBed = null; }
        }
        if (tenant.roomId) {
          const selected = selectableRooms.find(r => r.room.id === tenant.roomId) || allRooms.find(r => r.room.id === tenant.roomId);
          if (selected) {
            setEditTenantRoom(selected.room);
            const merged = [...(selected.availableBeds || [])];
            if (currentBed && !merged.some(b => b.id === currentBed!.id)) merged.unshift(currentBed);
            setEditAvailableBedsForRoom(merged);
          } else if (room) {
            setEditTenantRoom(room);
            setEditAvailableBedsForRoom(currentBed ? [currentBed] : []);
          }
        }
        setEditTenantBed(currentBed);
      } catch (err) { console.error('Failed to fetch beds for edit modal', err); }
    }
    setShowEditTenantModal(true);
  };

  const handleUpdateTenant = async () => {
    if (!tenant) return;
    const name       = editTenantName.trim();
    const documentId = editTenantDocumentId.trim();
    const phone      = editTenantPhone.trim();
    const rent       = editTenantRent.trim();
    const address    = editTenantAddress.trim();
    if (!name || !phone || !rent) { Alert.alert('Validation', 'Name, phone, and rent are required.'); return; }
    if (!/^\d{10}$/.test(phone)) { Alert.alert('Validation', 'Phone must be 10 digits.'); return; }
    if (editTenantStatus === 'active' && (!editTenantRoom || !editTenantBed)) {
      Alert.alert('Validation', 'Room and bed are mandatory for active tenants.'); return;
    }
    const isChangingFromVacatedToActive = tenant.tenantStatus === 'vacated' && editTenantStatus === 'active';
    if (isChangingFromVacatedToActive && (!editTenantRoom || !editTenantBed)) {
      Alert.alert('Validation', 'Please assign a room and bed when reactivating a tenant.'); return;
    }
    try {
      setTenantActionLoading(true);
      const response = await tenantService.updateTenant(tenant.id, {
        name, documentId, phone, rent, address,
        joinDate:     editTenantJoinDate,
        roomId:       editTenantRoom?.id || undefined,
        bedId:        editTenantBed?.id || undefined,
        tenantStatus: editTenantStatus,
      });
      if (response.data) setTenant(prev => prev ? { ...prev, ...response.data } : prev);
      setShowEditTenantModal(false);
      if (isChangingFromVacatedToActive) setTimeout(() => openEditBillingModal(), 500);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update tenant');
    } finally { setTenantActionLoading(false); }
  };

  const invalidateCaches = (currentTenant: Tenant) => {
    const pid = currentTenant.propertyId;
    clearScreenCache(`tenant-detail:${currentTenant.id}`);
    if (pid) {
      clearScreenCache(`tenants:${pid}:`);
      clearScreenCache(`payments:${pid}:`);
      clearScreenCache(`dashboard:${pid}`);
      clearScreenCache(`rooms:${pid}`);
      if (currentTenant.roomId) {
        clearScreenCache(`manage-beds:${pid}:${currentTenant.roomId}`);
        clearScreenCache(`room-beds:${pid}:${currentTenant.roomId}`);
      } else {
        clearScreenCache(`manage-beds:${pid}:`);
        clearScreenCache(`room-beds:${pid}:`);
      }
    } else {
      ['tenants:','payments:','dashboard:','rooms:','manage-beds:','room-beds:'].forEach(k => clearScreenCache(k));
    }
  };

  const confirmDeleteTenant = async () => {
    if (!tenant) return;
    try {
      setTenantActionLoading(true);
      setShowDeleteConfirmModal(false);
      await tenantService.deleteTenant(tenant.id);
      invalidateCaches(tenant);
      Alert.alert('Deleted', 'Tenant removed successfully.', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to delete tenant');
    } finally { setTenantActionLoading(false); }
  };

  // ── Reusable sheet ────────────────────────────────────────────────────────
  const PickerSheet = ({
    visible, onClose, title, anim, children,
  }: { visible: boolean; onClose: () => void; title: string; anim: Animated.Value; children: React.ReactNode }) => (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={[sheetStyles.overlay, { backgroundColor: colors.modal.overlay }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
        <Animated.View style={[sheetStyles.sheet, { backgroundColor: cardBg, transform: [{ translateY: anim }] }]}>
          <View style={sheetStyles.handle}>
            <View style={[sheetStyles.handleBar, { backgroundColor: colors.border.dark }]} />
          </View>
          <View style={[sheetStyles.sheetHeader, { borderBottomColor: colors.border.light }]}>
            <Text style={[sheetStyles.sheetTitle, { color: textPrimary }]}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={[sheetStyles.closeBtn, { backgroundColor: colors.background.tertiary }]}>
              <X size={15} color={textSecondary} strokeWidth={2} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );

  const SheetOption = ({
    label, sublabel, active, onPress,
  }: { label: string; sublabel?: string; active: boolean; onPress: () => void }) => (
    <TouchableOpacity
      style={[sheetStyles.option, { borderBottomColor: colors.border.light }]}
      onPress={onPress}
      activeOpacity={0.72}>
      <View style={{ flex: 1 }}>
        <Text style={[sheetStyles.optionText, {
          color:      active ? brandColor : textPrimary,
          fontFamily: active ? typography.fontFamily.semiBold : typography.fontFamily.regular,
        }]}>{label}</Text>
        {sublabel && <Text style={[sheetStyles.optionSub, { color: textTertiary }]}>{sublabel}</Text>}
      </View>
      {active && <CheckCircle size={16} color={brandColor} strokeWidth={2} />}
    </TouchableOpacity>
  );

  // ── Loading / empty screens ───────────────────────────────────────────────
  const NavBar = ({ title }: { title: string }) => (
    <View style={[styles.navBar, { backgroundColor: cardBg, borderBottomColor: colors.border.light }]}>
      <TouchableOpacity style={styles.navBack} onPress={() => router.back()} activeOpacity={0.7}>
        <ChevronLeft size={22} color={textPrimary} strokeWidth={2} />
      </TouchableOpacity>
      <Text style={[styles.navTitle, { color: textPrimary }]}>{title}</Text>
      <View style={styles.navSpacer} />
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: pageBg }]} edges={['top','bottom']}>
        <NavBar title="Tenant Details" />
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Skeleton height={200} count={3} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!tenant) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: pageBg }]} edges={['top','bottom']}>
        <NavBar title="Tenant Details" />
        <EmptyState icon={User} title="Tenant Not Found" subtitle="The selected tenant could not be found" />
      </SafeAreaView>
    );
  }

  const { totalPaid, latestPayment, outstanding } = calculateFinancialSummary();
  const isActive = tenant.tenantStatus === 'active';

  const initials = tenant.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: pageBg }]} edges={['top','bottom']}>

      {/* ── Nav Bar ─────────────────────────────────────────────────────── */}
      <View style={[styles.navBar, { backgroundColor: cardBg, borderBottomColor: colors.border.light }]}>
        <TouchableOpacity style={styles.navBack} onPress={() => router.back()} activeOpacity={0.7}>
          <ChevronLeft size={22} color={textPrimary} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: textPrimary }]}>Tenant Details</Text>
        <View style={styles.navActions}>
          <TouchableOpacity
            style={[styles.navAction, { backgroundColor: brandLight, borderColor: isDark ? colors.primary[700] : colors.primary[200], opacity: !isOnline ? 0.45 : 1 }]}
            onPress={openEditTenantModal}
            activeOpacity={0.7}
            disabled={tenantActionLoading || !isOnline}>
            <Pencil size={15} color={brandText} strokeWidth={2} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.navAction, { backgroundColor: dangerLight, borderColor: isDark ? colors.danger[700] : colors.danger[200], opacity: !isOnline ? 0.45 : 1 }]}
            onPress={() => setShowDeleteConfirmModal(true)}
            activeOpacity={0.7}
            disabled={tenantActionLoading || !isOnline}>
            <Trash2 size={15} color={dangerText} strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          isTablet && { alignSelf: 'center', width: '100%', maxWidth: contentMaxWidth },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[brandColor]} tintColor={brandColor} />}>

        {error ? <ApiErrorCard error={error} onRetry={handleRetry} /> : (
          <>
            {/* ── Profile Hero ─────────────────────────────────────────── */}
            <View style={[styles.heroCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
              {/* Avatar */}
              <View style={styles.heroTop}>
                <View style={[styles.avatar, { backgroundColor: isActive ? brandColor : colors.neutral[400] }]}>
                  <Text style={styles.avatarText}>{initials}</Text>
                </View>
                <View style={styles.heroInfo}>
                  <Text style={[styles.heroName, { color: textPrimary }]}>{tenant.name}</Text>
                  <View style={[styles.statusPill, {
                    backgroundColor: isActive ? successLight : dangerLight,
                    borderColor:     isActive ? (isDark ? colors.success[700] : colors.success[200]) : (isDark ? colors.danger[700] : colors.danger[200]),
                  }]}>
                    <View style={[styles.statusDot, { backgroundColor: isActive ? successColor : dangerColor }]} />
                    <Text style={[styles.statusPillText, { color: isActive ? successText : dangerText }]}>
                      {isActive ? 'Active' : 'Vacated'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Meta rows */}
              <View style={[styles.heroMeta, { borderTopColor: colors.border.light }]}>
                {tenant.phone && (
                  <TouchableOpacity style={styles.metaRow} onPress={() => openPhoneDialer(tenant.phone)} activeOpacity={0.7}>
                    <View style={[styles.metaIcon, { backgroundColor: brandLight }]}>
                      <Phone size={13} color={brandText} strokeWidth={2} />
                    </View>
                    <Text style={[styles.metaLabel, { color: textSecondary }]}>Phone</Text>
                    <Text style={[styles.metaValue, { color: brandColor }]}>{tenant.phone}</Text>
                    <ArrowRight size={12} color={brandColor} style={{ marginLeft: 'auto' }} />
                  </TouchableOpacity>
                )}
                {tenant.documentId && (
                  <View style={styles.metaRow}>
                    <View style={[styles.metaIcon, { backgroundColor: isDark ? colors.neutral[800] : colors.neutral[100] }]}>
                      <BadgeCheck size={13} color={textSecondary} strokeWidth={2} />
                    </View>
                    <Text style={[styles.metaLabel, { color: textSecondary }]}>Document</Text>
                    <Text style={[styles.metaValue, { color: textPrimary }]}>{tenant.documentId}</Text>
                  </View>
                )}
                {tenant.joinDate && (
                  <View style={styles.metaRow}>
                    <View style={[styles.metaIcon, { backgroundColor: isDark ? colors.neutral[800] : colors.neutral[100] }]}>
                      <Calendar size={13} color={textSecondary} strokeWidth={2} />
                    </View>
                    <Text style={[styles.metaLabel, { color: textSecondary }]}>Joined</Text>
                    <Text style={[styles.metaValue, { color: textPrimary }]}>{formatDate(tenant.joinDate)}</Text>
                  </View>
                )}
                {isActive && room && (
                  <View style={styles.metaRow}>
                    <View style={[styles.metaIcon, { backgroundColor: isDark ? colors.neutral[800] : colors.neutral[100] }]}>
                      <Home size={13} color={textSecondary} strokeWidth={2} />
                    </View>
                    <Text style={[styles.metaLabel, { color: textSecondary }]}>Room</Text>
                    <Text style={[styles.metaValue, { color: textPrimary }]}>{room.roomNumber}</Text>
                  </View>
                )}
                {tenant.tenantStatus === 'vacated' && tenant.checkoutDate && (
                  <View style={styles.metaRow}>
                    <View style={[styles.metaIcon, { backgroundColor: dangerLight }]}>
                      <Calendar size={13} color={dangerText} strokeWidth={2} />
                    </View>
                    <Text style={[styles.metaLabel, { color: textSecondary }]}>Checkout</Text>
                    <Text style={[styles.metaValue, { color: dangerColor }]}>{formatDate(tenant.checkoutDate)}</Text>
                  </View>
                )}
                {tenant.address && (
                  <View style={styles.metaRow}>
                    <View style={[styles.metaIcon, { backgroundColor: isDark ? colors.neutral[800] : colors.neutral[100] }]}>
                      <MapPin size={13} color={textSecondary} strokeWidth={2} />
                    </View>
                    <Text style={[styles.metaLabel, { color: textSecondary }]}>Address</Text>
                    <Text style={[styles.metaValue, { color: textPrimary, flex: 1 }]} numberOfLines={2}>{tenant.address}</Text>
                  </View>
                )}
              </View>
            </View>

            {/* ── Financial + Billing (active only) ──────────────────────── */}
            {isActive && (
              <View style={[styles.kpiRow, isTabletLandscape && { flexDirection: 'row', gap: spacing.md }]}>

                {/* Financial Summary */}
                <View style={[styles.kpiCard, { backgroundColor: cardBg, borderColor: cardBorder }, isTabletLandscape && { flex: 1 }]}>
                  <View style={styles.kpiHeader}>
                    <View style={[styles.kpiIconBox, { backgroundColor: successLight }]}>
                      <IndianRupee size={14} color={successText} strokeWidth={2} />
                    </View>
                    <Text style={[styles.kpiTitle, { color: textPrimary }]}>Financial Summary</Text>
                  </View>
                  <View style={styles.kpiGrid}>
                    <View style={styles.kpiStat}>
                      <Text style={[styles.kpiStatLabel, { color: textTertiary }]}>TOTAL PAID</Text>
                      <Text style={[styles.kpiStatValue, { color: successColor }]}>
                        ₹{totalPaid.toLocaleString('en-IN')}
                      </Text>
                    </View>
                    <View style={[styles.kpiDivider, { backgroundColor: colors.border.light }]} />
                    <View style={styles.kpiStat}>
                      <Text style={[styles.kpiStatLabel, { color: textTertiary }]}>MONTHLY RENT</Text>
                      <Text style={[styles.kpiStatValue, { color: textPrimary }]}>{tenant.rent || '₹0'}</Text>
                    </View>
                    <View style={[styles.kpiDivider, { backgroundColor: colors.border.light }]} />
                    <View style={styles.kpiStat}>
                      <Text style={[styles.kpiStatLabel, { color: textTertiary }]}>OUTSTANDING</Text>
                      <Text style={[styles.kpiStatValue, { color: outstanding > 0 ? dangerColor : textPrimary }]}>
                        ₹{outstanding.toLocaleString('en-IN')}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Billing Config */}
                <View style={[styles.kpiCard, { backgroundColor: cardBg, borderColor: cardBorder }, isTabletLandscape && { flex: 1 }]}>
                  <View style={styles.kpiHeader}>
                    <View style={[styles.kpiIconBox, { backgroundColor: brandLight }]}>
                      <Calendar size={14} color={brandText} strokeWidth={2} />
                    </View>
                    <Text style={[styles.kpiTitle, { color: textPrimary }]}>Billing Config</Text>
                    <TouchableOpacity
                      style={[styles.editChip, { backgroundColor: brandLight, borderColor: isDark ? colors.primary[700] : colors.primary[200], opacity: !isOnline ? 0.45 : 1 }]}
                      onPress={openEditBillingModal}
                      activeOpacity={0.75}
                      disabled={!isOnline}>
                      <Edit size={12} color={brandText} strokeWidth={2} />
                      <Text style={[styles.editChipText, { color: brandText }]}>Edit</Text>
                    </TouchableOpacity>
                  </View>
                  {tenant.billingConfig ? (
                    <View style={styles.billingRows}>
                      <View style={styles.billingRow}>
                        <Text style={[styles.billingLabel, { color: textTertiary }]}>CYCLE</Text>
                        <Text style={[styles.billingValue, { color: textPrimary }]}>
                          {tenant.billingConfig.billingCycle?.charAt(0).toUpperCase() + (tenant.billingConfig.billingCycle?.slice(1) || '')}
                        </Text>
                      </View>
                      <View style={[styles.billingDivider, { backgroundColor: colors.border.light }]} />
                      <View style={styles.billingRow}>
                        <Text style={[styles.billingLabel, { color: textTertiary }]}>ANCHOR DAY</Text>
                        <Text style={[styles.billingValue, { color: textPrimary }]}>
                          {getDayWithOrdinal(tenant.billingConfig.anchorDay)} of every month
                        </Text>
                      </View>
                      <View style={[styles.billingDivider, { backgroundColor: colors.border.light }]} />
                      <View style={styles.billingRow}>
                        <Text style={[styles.billingLabel, { color: textTertiary }]}>NEXT DUE</Text>
                        <Text style={[styles.billingValue, { color: brandColor }]}>
                          {formatDate(calculateNextBillingDate(tenant.billingConfig.anchorDay || 1))}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <Text style={[styles.noBillingText, { color: textTertiary }]}>No billing config set</Text>
                  )}
                </View>
              </View>
            )}

            {/* ── Payment History ───────────────────────────────────────── */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: textPrimary }]}>Payment History</Text>
                {latestPayment?.status === 'due' ? (
                  <TouchableOpacity
                    style={[styles.headerAction, { backgroundColor: successColor }]}
                    onPress={handleMarkAsPaid} activeOpacity={0.8}>
                    <CheckCircle size={14} color={colors.white} strokeWidth={2.5} />
                    <Text style={[styles.headerActionText, { color: colors.white }]}>Mark Paid</Text>
                  </TouchableOpacity>
                ) : !latestPayment && !tenant.autoGeneratePayments ? (
                  <TouchableOpacity
                    style={[styles.headerAction, { backgroundColor: brandColor }]}
                    onPress={handleGenerateDue} activeOpacity={0.8}>
                    <Plus size={14} color={colors.white} strokeWidth={2.5} />
                    <Text style={[styles.headerActionText, { color: colors.white }]}>Generate Due</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {payments.length === 0 ? (
                <View style={[styles.emptyCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                  <EmptyState
                    icon={Wallet}
                    title="No Payments Yet"
                    subtitle={tenant.autoGeneratePayments
                      ? 'Payments will be auto-generated from this tenant billing setup.'
                      : 'Payment history will appear here'}
                  />
                </View>
              ) : (
                <>
                  {payments.map((payment, idx) => {
                    const isPaid = payment.status === 'paid';
                    return (
                      <View
                        key={idx}
                        style={[styles.paymentRow, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                        <View style={[styles.paymentStrip, { backgroundColor: isPaid ? successColor : warningColor }]} />
                        <View style={styles.paymentBody}>
                          <View style={styles.paymentTop}>
                            <Text style={[styles.paymentAmount, { color: textPrimary }]}>{payment.amount}</Text>
                            <View style={[styles.paymentPill, {
                              backgroundColor: isPaid ? successLight : warningLight,
                              borderColor: isPaid ? (isDark ? colors.success[700] : colors.success[200]) : (isDark ? colors.warning[700] : colors.warning[200]),
                            }]}>
                              {isPaid
                                ? <CheckCircle size={10} color={successColor} strokeWidth={2.5} />
                                : <Clock size={10} color={warningColor} strokeWidth={2.5} />}
                              <Text style={[styles.paymentPillText, { color: isPaid ? successColor : warningColor }]}>
                                {isPaid ? 'Paid' : 'Due'}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.paymentMeta}>
                            <Calendar size={11} color={textTertiary} strokeWidth={1.5} />
                            <Text style={[styles.paymentDate, { color: textSecondary }]}>
                              {isPaid
                                ? formatDate(payment.paidDate ?? payment.dueDate ?? '')
                                : formatDate(payment.dueDate ?? '')}
                            </Text>
                            {payment.method && (
                              <View style={[styles.methodChip, { backgroundColor: isDark ? colors.neutral[800] : colors.neutral[100], borderColor: cardBorder }]}>
                                <Text style={[styles.methodText, { color: textSecondary }]}>{payment.method}</Text>
                              </View>
                            )}
                          </View>
                        </View>
                      </View>
                    );
                  })}

                  {hasMorePayments && (
                    <TouchableOpacity
                      style={[styles.loadMoreBtn, { borderColor: cardBorder }]}
                      onPress={handleLoadMorePayments}
                      disabled={loadingPayments}
                      activeOpacity={0.7}>
                      {loadingPayments
                        ? <ActivityIndicator size="small" color={brandColor} />
                        : <Text style={[styles.loadMoreText, { color: brandColor }]}>Load older payments</Text>}
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* ── Edit Tenant — Full-screen modal ──────────────────────────────── */}
      <Modal visible={showEditTenantModal} transparent={false} animationType="slide" onRequestClose={() => setShowEditTenantModal(false)}>
        <SafeAreaView style={[styles.container, { backgroundColor: pageBg }]} edges={['top','bottom']}>
          <View style={[styles.navBar, { backgroundColor: cardBg, borderBottomColor: colors.border.light }]}>
            <TouchableOpacity style={styles.navBack} onPress={() => setShowEditTenantModal(false)} activeOpacity={0.7}>
              <ChevronLeft size={22} color={textPrimary} strokeWidth={2} />
            </TouchableOpacity>
            <Text style={[styles.navTitle, { color: textPrimary }]}>Edit Tenant</Text>
            <View style={styles.navSpacer} />
          </View>
          <ScrollView contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false}>
            <View style={[styles.formWrap, isTabletLandscape && styles.formWrapTablet]}>

              {/* Status */}
              <View style={[styles.field, isTabletLandscape && styles.fieldFull]}>
                <Text style={[styles.fieldLabel, { color: textPrimary }]}>Status</Text>
                <TouchableOpacity
                  style={[styles.picker, { backgroundColor: cardBg, borderColor: cardBorder }]}
                  onPress={() => { setShowStatusPicker(true); statusSheet.open(); }}
                  activeOpacity={0.75} disabled={tenantActionLoading}>
                  <Text style={[styles.pickerText, { color: textPrimary }]}>
                    {editTenantStatus === 'active' ? 'Active' : 'Vacated'}
                  </Text>
                  <ChevronDown size={18} color={textTertiary} strokeWidth={2} />
                </TouchableOpacity>
              </View>

              {editTenantStatus === 'active' && (
                <>
                  <View style={[styles.field, isTabletLandscape && styles.fieldHalf]}>
                    <Text style={[styles.fieldLabel, { color: textPrimary }]}>Name</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: cardBg, borderColor: cardBorder, color: textPrimary }]}
                      value={editTenantName} onChangeText={setEditTenantName}
                      placeholder="Tenant name" placeholderTextColor={textTertiary} editable={!tenantActionLoading} />
                  </View>

                  <View style={[styles.field, isTabletLandscape && styles.fieldHalf]}>
                    <Text style={[styles.fieldLabel, { color: textPrimary }]}>Document ID</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: cardBg, borderColor: cardBorder, color: textPrimary }]}
                      value={editTenantDocumentId} onChangeText={setEditTenantDocumentId}
                      placeholder="e.g. Aadhar123456" placeholderTextColor={textTertiary} editable={!tenantActionLoading} />
                  </View>

                  <View style={[styles.field, isTabletLandscape && styles.fieldHalf]}>
                    <Text style={[styles.fieldLabel, { color: textPrimary }]}>Phone</Text>
                    <View style={styles.phoneRow}>
                      <TextInput
                        style={[styles.input, { flex: 1, backgroundColor: cardBg, borderColor: cardBorder, color: textPrimary }]}
                        value={editTenantPhone} onChangeText={setEditTenantPhone}
                        keyboardType="number-pad" maxLength={10}
                        placeholder="10-digit number" placeholderTextColor={textTertiary} editable={!tenantActionLoading} />
                      <TouchableOpacity
                        style={[styles.dialBtn, { backgroundColor: cardBg, borderColor: cardBorder, opacity: !editTenantPhone.trim() ? 0.4 : 1 }]}
                        onPress={() => openPhoneDialer(editTenantPhone)} activeOpacity={0.75}
                        disabled={!editTenantPhone.trim()}>
                        <Phone size={17} color={brandColor} strokeWidth={2} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={[styles.field, isTabletLandscape && styles.fieldHalf]}>
                    <Text style={[styles.fieldLabel, { color: textPrimary }]}>Rent</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: cardBg, borderColor: cardBorder, color: textPrimary }]}
                      value={editTenantRent} onChangeText={setEditTenantRent}
                      placeholder="Amount" placeholderTextColor={textTertiary} editable={!tenantActionLoading} />
                  </View>

                  <View style={[styles.field, isTabletLandscape && styles.fieldFull]}>
                    <Text style={[styles.fieldLabel, { color: textPrimary }]}>Address</Text>
                    <TextInput
                      style={[styles.input, styles.inputMulti, { backgroundColor: cardBg, borderColor: cardBorder, color: textPrimary }]}
                      value={editTenantAddress} onChangeText={setEditTenantAddress}
                      placeholder="Address" placeholderTextColor={textTertiary} editable={!tenantActionLoading}
                      multiline numberOfLines={2} />
                  </View>

                  <View style={isTabletLandscape ? styles.fieldFull : undefined}>
                    <DatePicker value={editTenantJoinDate} onChange={setEditTenantJoinDate} label="Join Date" disabled={tenantActionLoading} required />
                  </View>

                  <View style={[styles.field, isTabletLandscape && styles.fieldHalf]}>
                    <Text style={[styles.fieldLabel, { color: textPrimary }]}>Room</Text>
                    <TouchableOpacity
                      style={[styles.picker, { backgroundColor: cardBg, borderColor: cardBorder, opacity: editRoomsWithBeds.length === 0 ? 0.4 : 1 }]}
                      onPress={() => { setShowEditRoomPicker(true); roomSheet.open(); }}
                      activeOpacity={0.75} disabled={tenantActionLoading || editRoomsWithBeds.length === 0}>
                      <Text style={[styles.pickerText, { color: editTenantRoom ? textPrimary : textTertiary }]}>
                        {editTenantRoom ? `Room ${editTenantRoom.roomNumber}` : 'Select Room'}
                      </Text>
                      <ChevronDown size={18} color={textTertiary} strokeWidth={2} />
                    </TouchableOpacity>
                  </View>

                  <View style={[styles.field, isTabletLandscape && styles.fieldHalf]}>
                    <Text style={[styles.fieldLabel, { color: textPrimary }]}>Bed</Text>
                    <TouchableOpacity
                      style={[styles.picker, { backgroundColor: cardBg, borderColor: cardBorder, opacity: !editTenantRoom ? 0.4 : 1 }]}
                      onPress={() => { setShowEditBedPicker(true); bedSheet.open(); }}
                      activeOpacity={0.75} disabled={tenantActionLoading || !editTenantRoom || editAvailableBedsForRoom.length === 0}>
                      <Text style={[styles.pickerText, { color: editTenantBed ? textPrimary : textTertiary }]}>
                        {editTenantBed ? `Bed ${editTenantBed.bedNumber}` : 'Select Bed'}
                      </Text>
                      <ChevronDown size={18} color={textTertiary} strokeWidth={2} />
                    </TouchableOpacity>
                  </View>
                </>
              )}

              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: brandColor, opacity: tenantActionLoading ? 0.6 : 1 }, isTabletLandscape && styles.fieldFull]}
                onPress={handleUpdateTenant} activeOpacity={0.85} disabled={tenantActionLoading}>
                {tenantActionLoading
                  ? <ActivityIndicator color={colors.white} size="small" />
                  : <Text style={[styles.submitBtnText, { color: colors.white }]}>Save Changes</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Edit Billing — Full-screen modal ─────────────────────────────── */}
      <Modal visible={showEditBillingModal} transparent={false} animationType="slide" onRequestClose={() => setShowEditBillingModal(false)}>
        <SafeAreaView style={[styles.container, { backgroundColor: pageBg }]} edges={['top','bottom']}>
          <View style={[styles.navBar, { backgroundColor: cardBg, borderBottomColor: colors.border.light }]}>
            <TouchableOpacity style={styles.navBack} onPress={() => setShowEditBillingModal(false)} activeOpacity={0.7}>
              <ChevronLeft size={22} color={textPrimary} strokeWidth={2} />
            </TouchableOpacity>
            <Text style={[styles.navTitle, { color: textPrimary }]}>Edit Billing</Text>
            <View style={styles.navSpacer} />
          </View>
          <ScrollView contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.formWrap}>

              {/* Auto-generate toggle */}
              <View style={[styles.toggleRow, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: textPrimary, marginBottom: 2 }]}>Auto-Generate Payments</Text>
                  <Text style={[styles.toggleHint, { color: textSecondary }]}>Automatically create due payments each month</Text>
                </View>
                <Switch
                  value={editAutoGenerate}
                  onValueChange={setEditAutoGenerate}
                  disabled={editLoading}
                  trackColor={{ false: colors.border.medium, true: colors.primary[300] }}
                  thumbColor={editAutoGenerate ? brandColor : textTertiary}
                />
              </View>

              {editAutoGenerate && (
                <>
                  <View style={styles.field}>
                    <Text style={[styles.fieldLabel, { color: textPrimary }]}>Current billing status</Text>
                    <TouchableOpacity
                      style={[styles.picker, { backgroundColor: cardBg, borderColor: cardBorder }]}
                      onPress={() => { setShowEditBillingStatusPicker(true); billingSheet.open(); }}
                      activeOpacity={0.75} disabled={editLoading}>
                      <Text style={[styles.pickerText, { color: textPrimary }]}>
                        {editBillingStatus === 'paid' ? 'Paid — this month collected' : 'Due — this month not paid'}
                      </Text>
                      <ChevronDown size={18} color={textTertiary} strokeWidth={2} />
                    </TouchableOpacity>
                    <Text style={[styles.fieldHint, { color: textTertiary }]}>Used to create the first payment record correctly</Text>
                  </View>

                  <View style={styles.field}>
                    <Text style={[styles.fieldLabel, { color: textPrimary }]}>When is rent due each month?</Text>
                    <TouchableOpacity
                      style={[styles.picker, { backgroundColor: cardBg, borderColor: cardBorder }]}
                      onPress={() => { setShowAnchorDayPicker(true); anchorSheet.open(); }}
                      activeOpacity={0.75} disabled={editLoading}>
                      <Text style={[styles.pickerText, { color: textPrimary }]}>📅 Day {editAnchorDay} · Every Month</Text>
                      <ChevronDown size={18} color={textTertiary} strokeWidth={2} />
                    </TouchableOpacity>
                    <Text style={[styles.fieldHint, { color: textTertiary }]}>Same day each month</Text>
                  </View>
                </>
              )}

              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: brandColor, opacity: editLoading ? 0.6 : 1 }]}
                onPress={handleSaveBillingConfig} activeOpacity={0.85} disabled={editLoading}>
                {editLoading
                  ? <ActivityIndicator color={colors.white} size="small" />
                  : <Text style={[styles.submitBtnText, { color: colors.white }]}>Save Billing</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Picker Sheets ─────────────────────────────────────────────────── */}
      <PickerSheet visible={showEditBillingStatusPicker} onClose={() => { billingSheet.close(() => setShowEditBillingStatusPicker(false)); }} title="Billing Status" anim={billingSheet.anim}>
        {(['paid','due'] as const).map(s => (
          <SheetOption key={s} label={s === 'paid' ? 'Paid — this month collected' : 'Due — this month not paid'}
            active={editBillingStatus === s}
            onPress={() => { setEditBillingStatus(s); billingSheet.close(() => setShowEditBillingStatusPicker(false)); }} />
        ))}
      </PickerSheet>

      <PickerSheet visible={showAnchorDayPicker} onClose={() => { anchorSheet.close(() => setShowAnchorDayPicker(false)); }} title="Rent Due Day" anim={anchorSheet.anim}>
        {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
          <SheetOption key={day} label={`Day ${day} · Every Month`}
            active={editAnchorDay === day}
            onPress={() => { setEditAnchorDay(day); anchorSheet.close(() => setShowAnchorDayPicker(false)); }} />
        ))}
      </PickerSheet>

      <PickerSheet visible={showStatusPicker} onClose={() => { statusSheet.close(() => setShowStatusPicker(false)); }} title="Tenant Status" anim={statusSheet.anim}>
        {(['active','vacated'] as const).map(s => (
          <SheetOption key={s} label={s.charAt(0).toUpperCase() + s.slice(1)}
            active={editTenantStatus === s}
            onPress={() => { setEditTenantStatus(s); statusSheet.close(() => setShowStatusPicker(false)); }} />
        ))}
      </PickerSheet>

      <PickerSheet visible={showEditRoomPicker} onClose={() => { roomSheet.close(() => setShowEditRoomPicker(false)); }} title="Select Room" anim={roomSheet.anim}>
        {editRoomsWithBeds.map((rd, idx) => (
          <SheetOption key={idx}
            label={`Room ${rd.room.roomNumber}`}
            sublabel={`Floor ${rd.room.floor} · ${rd.availableBeds.length} available · ₹${rd.room.price}`}
            active={editTenantRoom?.id === rd.room.id}
            onPress={() => { setEditTenantRoom(rd.room); roomSheet.close(() => setShowEditRoomPicker(false)); }} />
        ))}
      </PickerSheet>

      <PickerSheet visible={showEditBedPicker} onClose={() => { bedSheet.close(() => setShowEditBedPicker(false)); }} title="Select Bed" anim={bedSheet.anim}>
        {editAvailableBedsForRoom.map((bed, idx) => (
          <SheetOption key={idx} label={`Bed ${bed.bedNumber}`}
            active={editTenantBed?.id === bed.id}
            onPress={() => { setEditTenantBed(bed); bedSheet.close(() => setShowEditBedPicker(false)); }} />
        ))}
      </PickerSheet>

      {/* ── Delete Confirm ────────────────────────────────────────────────── */}
      <Modal visible={showDeleteConfirmModal} transparent animationType="fade" onRequestClose={() => !tenantActionLoading && setShowDeleteConfirmModal(false)}>
        <View style={[styles.deleteOverlay, { backgroundColor: colors.modal.overlay }]}>
          <View style={[styles.deleteSheet, { backgroundColor: cardBg, maxWidth: modalMaxWidth }]}>
            <View style={[styles.deleteIconWrap, { backgroundColor: dangerLight }]}>
              <Trash2 size={28} color={dangerText} strokeWidth={2} />
            </View>
            <Text style={[styles.deleteTitle, { color: textPrimary }]}>Delete Tenant?</Text>
            <Text style={[styles.deleteMsg, { color: textSecondary }]}>
              This will permanently remove {tenant.name}, their profile, and all payment records.
            </Text>
            <View style={[styles.deleteWarning, { backgroundColor: dangerLight, borderLeftColor: dangerColor }]}>
              <Text style={[styles.deleteWarningText, { color: isDark ? colors.danger[300] : colors.danger[700] }]}>
                This action cannot be undone.
              </Text>
            </View>
            <View style={styles.deleteBtns}>
              <TouchableOpacity
                style={[styles.deleteCancelBtn, { backgroundColor: colors.background.tertiary }]}
                onPress={() => setShowDeleteConfirmModal(false)} disabled={tenantActionLoading} activeOpacity={0.75}>
                <Text style={[styles.deleteCancelText, { color: textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.deleteConfirmBtn, { backgroundColor: dangerColor }]}
                onPress={confirmDeleteTenant} disabled={tenantActionLoading} activeOpacity={0.8}>
                {tenantActionLoading
                  ? <ActivityIndicator color={colors.white} size="small" />
                  : <Text style={[styles.deleteConfirmText, { color: colors.white }]}>Delete</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

// ── Sheet styles (shared) ─────────────────────────────────────────────────────
const sheetStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    ...shadows.xl,
  },
  handle: { alignItems: 'center', paddingTop: spacing.sm, paddingBottom: spacing.xs },
  handleBar: { width: 38, height: 4, borderRadius: 2, opacity: 0.35 },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1,
  },
  sheetTitle: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.md, letterSpacing: typography.letterSpacing.tight },
  closeBtn: { width: 30, height: 30, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  option: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  optionText: { fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.md },
  optionSub: { fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.xs, marginTop: 2 },
});

// ── Screen styles ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },

  // Nav bar
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1,
  },
  navBack: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  navTitle: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.lg, letterSpacing: typography.letterSpacing.tight },
  navSpacer: { width: 36 },
  navActions: { flexDirection: 'row', gap: spacing.xs },
  navAction: { width: 32, height: 32, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },

  scrollContent: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.xxxl },

  // Profile hero card
  heroCard: { borderRadius: radius.xl, borderWidth: 1, marginBottom: spacing.md, overflow: 'hidden' },
  heroTop: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.md },
  avatar: { width: 56, height: 56, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xl, color: '#FFFFFF', letterSpacing: typography.letterSpacing.tight },
  heroInfo: { flex: 1, gap: spacing.sm },
  heroName: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xl, letterSpacing: typography.letterSpacing.tight },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.full, borderWidth: 1 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusPillText: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.fontSize.xs, letterSpacing: typography.letterSpacing.wide },
  heroMeta: { borderTopWidth: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  metaIcon: { width: 26, height: 26, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  metaLabel: { fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.xs, letterSpacing: typography.letterSpacing.wide, textTransform: 'uppercase', width: 68 },
  metaValue: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.fontSize.sm },

  // KPI cards
  kpiRow: { marginBottom: spacing.md, gap: spacing.md },
  kpiCard: { borderRadius: radius.xl, borderWidth: 1, padding: spacing.md, marginBottom: spacing.md },
  kpiHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  kpiIconBox: { width: 30, height: 30, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  kpiTitle: { flex: 1, fontFamily: typography.fontFamily.semiBold, fontSize: typography.fontSize.md, letterSpacing: typography.letterSpacing.tight },
  editChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.full, borderWidth: 1 },
  editChipText: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.fontSize.xs },
  kpiGrid: { flexDirection: 'row', alignItems: 'center' },
  kpiStat: { flex: 1, alignItems: 'center' },
  kpiStatLabel: { fontFamily: typography.fontFamily.semiBold, fontSize: 9, letterSpacing: typography.letterSpacing.wider, textTransform: 'uppercase', marginBottom: 4 },
  kpiStatValue: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.md, letterSpacing: typography.letterSpacing.tight },
  kpiDivider: { width: 1, height: 36 },

  // Billing rows
  billingRows: { gap: 0 },
  billingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm },
  billingDivider: { height: 1 },
  billingLabel: { fontFamily: typography.fontFamily.semiBold, fontSize: 9, letterSpacing: typography.letterSpacing.wider, textTransform: 'uppercase' },
  billingValue: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.fontSize.sm },
  noBillingText: { fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.sm, textAlign: 'center', paddingVertical: spacing.md },

  // Section
  section: { marginBottom: spacing.lg },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  sectionTitle: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.lg, letterSpacing: typography.letterSpacing.tight },
  headerAction: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md },
  headerActionText: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.fontSize.sm },

  emptyCard: { borderRadius: radius.xl, borderWidth: 1, paddingVertical: spacing.xl },

  // Payment rows
  paymentRow: { flexDirection: 'row', alignItems: 'stretch', borderRadius: radius.lg, borderWidth: 1, marginBottom: spacing.sm, overflow: 'hidden' },
  paymentStrip: { width: 3 },
  paymentBody: { flex: 1, padding: spacing.md },
  paymentTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  paymentAmount: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.lg, letterSpacing: typography.letterSpacing.tight },
  paymentPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.full, borderWidth: 1 },
  paymentPillText: { fontFamily: typography.fontFamily.semiBold, fontSize: 9, letterSpacing: typography.letterSpacing.wide, textTransform: 'uppercase' },
  paymentMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  paymentDate: { fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.xs, flex: 1 },
  methodChip: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.sm, borderWidth: 1 },
  methodText: { fontFamily: typography.fontFamily.medium, fontSize: 9, letterSpacing: typography.letterSpacing.wide, textTransform: 'uppercase' },
  loadMoreBtn: { paddingVertical: spacing.md, alignItems: 'center', borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.md, marginTop: spacing.sm },
  loadMoreText: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.fontSize.sm },

  // Form (edit tenant / billing)
  formScroll: { paddingHorizontal: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.xxxl },
  formWrap: { width: '100%' },
  formWrapTablet: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start' },
  field: { marginBottom: spacing.lg },
  fieldHalf: { width: '48.5%' },
  fieldFull: { width: '100%' },
  fieldLabel: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.fontSize.sm, marginBottom: spacing.sm, letterSpacing: typography.letterSpacing.wide },
  fieldHint: { fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.xs, marginTop: spacing.xs, letterSpacing: typography.letterSpacing.wide },
  input: { borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderWidth: 1, fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.md },
  inputMulti: { minHeight: 70, textAlignVertical: 'top' },
  phoneRow: { flexDirection: 'row', gap: spacing.sm },
  dialBtn: { width: 48, height: 48, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  picker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderWidth: 1 },
  pickerText: { fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.md, flex: 1 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.lg, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.md, marginBottom: spacing.lg, gap: spacing.md },
  toggleHint: { fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.xs, marginTop: 2 },
  submitBtn: { borderRadius: radius.md, paddingVertical: spacing.lg, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm, ...shadows.md },
  submitBtnText: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.md, letterSpacing: typography.letterSpacing.wide },

  // Delete confirm
  deleteOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.lg },
  deleteSheet: { borderRadius: radius.xl, paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl, alignItems: 'center', width: '100%', maxWidth: 360, ...shadows.xl },
  deleteIconWrap: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  deleteTitle: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xl, letterSpacing: typography.letterSpacing.tight, marginBottom: spacing.sm },
  deleteMsg: { fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.md, textAlign: 'center', marginBottom: spacing.lg, lineHeight: 22 },
  deleteWarning: { borderLeftWidth: 3, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.lg, width: '100%' },
  deleteWarningText: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.fontSize.sm },
  deleteBtns: { flexDirection: 'row', gap: spacing.md, width: '100%' },
  deleteCancelBtn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.lg, alignItems: 'center' },
  deleteCancelText: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.fontSize.md },
  deleteConfirmBtn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.lg, alignItems: 'center' },
  deleteConfirmText: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.md },
});