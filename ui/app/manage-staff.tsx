import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import ScreenContainer from '@/components/ScreenContainer';
import FAB from '@/components/FAB';
import { spacing, typography, radius, shadows } from '@/theme';
import { useTheme } from '@/context/ThemeContext';
import { useProperty } from '@/context/PropertyContext';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { staffService, subscriptionService } from '@/services/apiClient';
import { Staff, Subscription, PlanLimits } from '@/services/apiTypes';
import { ChevronLeft, Trash2, Edit2, X, Users, AlertCircle, Calendar, ChevronDown, MapPin } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import Card from '@/components/Card';
import EmptyState from '@/components/EmptyState';
import UpgradeModal from '@/components/UpgradeModal';
import DatePicker from '@/components/DatePicker';

const STAFF_ROLES = [
  { label: 'Cooker', value: 'cooker' },
  { label: 'Worker', value: 'worker' },
  { label: 'Cleaner', value: 'cleaner' },
  { label: 'Manager', value: 'manager' },
  { label: 'Security', value: 'security' },
  { label: 'Maintenance', value: 'maintenance' },
  { label: 'Assistant', value: 'assistant' },
  { label: 'Other', value: 'other' },
];

const STAFF_STATUS = [
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
  { label: 'On Leave', value: 'on_leave' },
  { label: 'Terminated', value: 'terminated' },
];

const STAFF_FOCUS_THROTTLE_MS = 60 * 1000;

export default function ManageStaffScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { selectedProperty } = useProperty();
  const isOnline = useNetworkStatus();

  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [planLimits, setPlanLimits] = useState<PlanLimits | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showRolePicker, setShowRolePicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [staffToDelete, setStaffToDelete] = useState<Staff | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    mobileNumber: '',
    address: '',
    status: 'active',
    joiningDate: new Date().toISOString().split('T')[0],
    salary: '',
  });
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const lastStaffFocusRefreshRef = useRef<number>(0);

  // Load all staff data (without filters)
  const loadAllStaff = useCallback(async () => {
    if (!selectedProperty?.id) return;
    try {
      setLoading(true);
      const [staffResponse, subResponse] = await Promise.all([
        staffService.getStaff(
          selectedProperty.id,
          undefined, // Don't filter on API - we'll do it client-side
          undefined,
          undefined,
          1,
          100
        ),
        subscriptionService.getSubscription(),
      ]);
      setStaffList(staffResponse.data || []);
      setSubscription(subResponse.data || null);
    } catch (error) {
      console.error('Failed to load staff or subscription:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedProperty?.id]);

  // Filter staff data based on search and role (client-side)
  const getFilteredStaff = useCallback(() => {
    let filtered = staffList;

    // Filter by search term (name or mobile)
    if (search.trim()) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(
        (staff) =>
          staff.name?.toLowerCase().includes(searchLower) ||
          staff.mobileNumber?.includes(searchLower)
      );
    }

    // Filter by role
    if (selectedRole) {
      filtered = filtered.filter((staff) => staff.role === selectedRole);
    }

    return filtered;
  }, [staffList, search, selectedRole]);

  // Load staff on component focus with throttle (not on filter changes)
  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      if (lastStaffFocusRefreshRef.current === 0 || (now - lastStaffFocusRefreshRef.current) > STAFF_FOCUS_THROTTLE_MS) {
        lastStaffFocusRefreshRef.current = now;
        loadAllStaff();
      }
    }, [loadAllStaff])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadAllStaff();
    } finally {
      setRefreshing(false);
    }
  }, [loadAllStaff]);

  useEffect(() => {
    if (!subscription) {
      setPlanLimits(null);
      return;
    }

    // Use limits directly from subscription object instead of separate API call
    const limits: PlanLimits = {
      properties: subscription.propertyLimit,
      tenants: subscription.tenantLimit,
      rooms: subscription.roomLimit,
      staff: subscription.staffLimit,
      price: subscription.price,
    };
    setPlanLimits(limits);
  }, [subscription]);

  const resetForm = () => {
    setFormData({
      name: '',
      role: '',
      mobileNumber: '',
      address: '',
      status: 'active',
      joiningDate: new Date().toISOString().split('T')[0],
      salary: '',
    });
    setFormError(null);
    setEditingStaff(null);
  };

  const openAddModal = () => {
    resetForm();
    setShowAddModal(true);
  };

  const openEditModal = (staff: Staff) => {
    setFormData({
      name: staff.name || '',
      role: staff.role || '',
      mobileNumber: staff.mobileNumber || '',
      address: staff.address || '',
      status: staff.status || 'active',
      joiningDate: staff.joiningDate || new Date().toISOString().split('T')[0],
      salary: staff.salary ? staff.salary.toString() : '',
    });
    setEditingStaff(staff);
    setShowAddModal(true);
  };

  const validateForm = (): boolean => {
    if (!formData.name.trim()) {
      setFormError('Staff name is required');
      return false;
    }
    if (!formData.role) {
      setFormError('Please select a role');
      return false;
    }
    if (!formData.mobileNumber.trim()) {
      setFormError('Mobile number is required');
      return false;
    }
    if (!/^\d{10}$/.test(formData.mobileNumber)) {
      setFormError('Mobile number must be 10 digits');
      return false;
    }
    if (!formData.address.trim()) {
      setFormError('Address is required');
      return false;
    }
    if (!formData.joiningDate) {
      setFormError('Joining date is required');
      return false;
    }
    if (!formData.salary.trim()) {
      setFormError('Salary is required');
      return false;
    }
    if (isNaN(parseFloat(formData.salary)) || parseFloat(formData.salary) <= 0) {
      setFormError('Please enter a valid salary amount');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    if (!selectedProperty?.id) return;

    try {
      setFormLoading(true);
      setFormError(null);

      const staffData = {
        propertyId: selectedProperty.id,
        name: formData.name,
        role: formData.role as Staff['role'],
        mobileNumber: formData.mobileNumber,
        address: formData.address,
        status: formData.status as Staff['status'],
        joiningDate: formData.joiningDate || undefined,
        salary: formData.salary ? parseFloat(formData.salary) : undefined,
      };

      if (editingStaff?.id) {
        await staffService.updateStaff(editingStaff.id, staffData);
      } else {
        await staffService.createStaff(staffData);
      }

      await loadAllStaff();
      setShowAddModal(false);
      resetForm();
    } catch (error: any) {
      const message = error?.message || 'Failed to save staff';
      if (error?.code === 'SUBSCRIPTION_LIMIT_EXCEEDED' || error?.details?.status === 402) {
        setShowUpgradeModal(true);
        setShowAddModal(false);
        setFormError(message);
      } else if (message.includes('limit') || message.includes('Upgrade')) {
        setFormError(message);
      } else {
        setFormError(message);
      }
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = (staff: Staff) => {
    setStaffToDelete(staff);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (!staffToDelete) return;
    try {
      setDeleting(true);
      await staffService.deleteStaff(staffToDelete.id);
      setShowDeleteConfirm(false);
      setStaffToDelete(null);
      await loadAllStaff();
    } catch (error) {
      Alert.alert('Error', 'Failed to remove staff member');
    } finally {
      setDeleting(false);
    }
  };

  const StaffCard = ({ item }: { item: Staff }) => (
    <Card style={styles.staffCard as any}>
      {/* Card Header with Icon and Name */}
      <View style={styles.cardHeader}>
        <View style={[styles.iconContainer, { backgroundColor: colors.background.tertiary }]}>
          <Users size={24} color={colors.primary[600]} strokeWidth={1.5} />
        </View>
        <View style={styles.headerInfo}>
          <Text style={[styles.staffName, { color: colors.text.primary }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[styles.staffRole, { color: colors.text.secondary }]}>
            {STAFF_ROLES.find((r) => r.value === item.role)?.label || item.role}
          </Text>
        </View>
      </View>

      {/* Details Section */}
      <View style={styles.detailsGrid}>
        <View style={styles.detailItem}>
          <Text style={[styles.detailLabel, { color: colors.text.tertiary }]}>Mobile</Text>
          <Text style={[styles.detailValue, { color: colors.text.primary }]}>{item.mobileNumber}</Text>
        </View>
        <View style={[styles.detailDivider, { backgroundColor: colors.border.light }]} />
        <View style={styles.detailItem}>
          <Text style={[styles.detailLabel, { color: colors.text.tertiary }]}>Salary</Text>
          <Text style={[styles.detailValue, { color: colors.text.primary }]}>₹ {item.salary}</Text>
        </View>
      </View>

      {/* Address Section */}
      <View style={styles.addressSection}>
        <MapPin size={14} color={colors.text.tertiary} strokeWidth={2} />
        <Text style={[styles.addressText, { color: colors.text.secondary }]} numberOfLines={2}>
          {item.address}
        </Text>
      </View>

      {/* Date Section */}
      {item.joiningDate && (
        <View style={styles.dateSection}>
          <Calendar size={14} color={colors.text.tertiary} strokeWidth={2} />
          <Text style={[styles.dateText, { color: colors.text.secondary }]}>
            Joined {new Date(item.joiningDate).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </Text>
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={[
            styles.actionButton,
            styles.editButton,
            {
              backgroundColor: colors.background.tertiary,
              opacity: !isOnline ? 0.5 : 1,
            },
          ]}
          onPress={() => openEditModal(item)}
          activeOpacity={0.6}
          disabled={!isOnline}>
          <Edit2 size={18} color={colors.primary[600]} strokeWidth={2} />
          <Text style={[styles.actionButtonText, { color: colors.primary[600] }]}>
            Edit
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.actionButton,
            styles.deleteButton,
            {
              backgroundColor: colors.background.tertiary,
              opacity: !isOnline ? 0.5 : 1,
            },
          ]}
          onPress={() => handleDelete(item)}
          activeOpacity={0.6}
          disabled={!isOnline}>
          <Trash2 size={18} color={colors.danger[500]} strokeWidth={2} />
          <Text style={[styles.actionButtonText, { color: colors.danger[500] }]}>
            Delete
          </Text>
        </TouchableOpacity>
      </View>
    </Card>
  );

  const hasPlanLimits = !!planLimits;
  const staffLimit = planLimits?.staff ?? 0;
  const hasReachedStaffLimit = !!subscription && hasPlanLimits && staffList.length >= staffLimit;
  const staffUsagePercent = hasPlanLimits && staffLimit > 0
    ? Math.min((staffList.length / staffLimit) * 100, 100)
    : 0;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background.primary }]}
      edges={['top', 'bottom']}>
      {/* Modern Header */}
      <View style={[styles.header, { backgroundColor: colors.background.secondary, borderBottomColor: colors.border.light }]}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <ChevronLeft size={24} color={colors.text.primary} strokeWidth={2.5} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Staff Members</Text>
          <Text style={[styles.headerSubtitle, { color: colors.text.secondary }]}>
            {staffList.length} {staffList.length === 1 ? 'member' : 'members'}
          </Text>
        </View>
        <View style={styles.placeholder} />
      </View>

      {/* Quota Banner */}
      {subscription && (
        <View style={[styles.quotaBanner, { backgroundColor: colors.background.secondary, borderBottomColor: colors.border.light }]}>
          <View style={styles.quotaContent}>
            <View style={styles.quotaInfo}>
              <Text style={[styles.quotaLabel, { color: colors.text.secondary }]}>Staff Quota</Text>
              <Text style={[styles.quotaValue, { color: colors.text.primary }]}>
                {staffList.length} <Text style={[styles.quotaTotal, { color: colors.text.tertiary }]}>/ {staffLimit}</Text>
              </Text>
            </View>
            <View style={styles.quotaBar}>
              <View
                style={[
                  styles.quotaFill,
                  {
                    backgroundColor: hasReachedStaffLimit ? colors.danger[500] : colors.primary[500],
                    width: `${staffUsagePercent}%`,
                  },
                ]}
              />
            </View>
          </View>
          {hasReachedStaffLimit && (
            <View style={[styles.quotaWarning, { backgroundColor: colors.danger[50] }]}>
              <AlertCircle size={16} color={colors.danger[600]} />
              <Text style={[styles.quotaWarningText, { color: colors.danger[600] }]}>
                Quota limit reached. Upgrade to add more staff.
              </Text>
              <TouchableOpacity
                onPress={() => router.push('/subscription')}
                activeOpacity={0.7}>
                <Text style={[styles.upgradeLink, { color: colors.danger[600] }]}>Upgrade →</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Search Section */}
      <View style={[styles.searchSection, { backgroundColor: colors.background.primary }]}>
        <View
          style={[
            styles.searchInputContainer,
            {
              backgroundColor: colors.background.secondary,
              borderColor: colors.border.light,
            },
          ]}>
          <TextInput
            style={[styles.searchInput, { color: colors.text.primary }]}
            placeholder="Search by name or mobile..."
            placeholderTextColor={colors.text.tertiary}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      {/* Staff List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary[500]} />
        </View>
      ) : staffList.length === 0 ? (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.emptyContainer}>
          <EmptyState
            icon={Users}
            title="No Staff Added"
            subtitle="Add staff members to manage your team"
            actionLabel="Add Staff"
            onActionPress={openAddModal}
          />
        </ScrollView>
      ) : (
        <FlatList
          data={getFilteredStaff()}
          renderItem={({ item }) => <StaffCard item={item} />}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          scrollEnabled={true}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[colors.primary[500]]}
              tintColor={colors.primary[500]}
            />
          }
        />
      )}

      <FAB onPress={openAddModal} disabled={!!(subscription && hasReachedStaffLimit)} />

      {/* Add/Edit Modal */}
      <Modal visible={showAddModal} animationType="slide" transparent={false}>
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
          <View style={[styles.header, { backgroundColor: colors.background.secondary, borderBottomColor: colors.border.light }]}>
            <TouchableOpacity
              onPress={() => {
                setShowAddModal(false);
                resetForm();
              }}
              activeOpacity={0.7}>
              <X size={24} color={colors.text.primary} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.text.primary }]}>
              {editingStaff ? 'Edit Staff' : 'Add Staff'}
            </Text>
            <View style={styles.placeholder} />
          </View>

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.keyboardView}>
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled">
              <View style={styles.logoContainer}>
                <View style={[styles.logoCircle, { backgroundColor: colors.background.tertiary }]}>
                  <Users size={32} color={colors.primary[500]} />
                </View>
                <Text style={[styles.title, { color: colors.text.primary }]}>{editingStaff ? 'Edit Staff Member' : 'Add New Staff'}</Text>
              </View>

              <View style={styles.form}>
                {formError && (
                  <View style={[styles.errorContainer, { backgroundColor: colors.danger[50], borderColor: colors.danger[200] }]}>
                    <Text style={[styles.errorText, { color: colors.danger[700] }]}>{formError}</Text>
                  </View>
                )}

                {/* Name */}
                <View style={styles.inputContainer}>
                  <Text style={[styles.label, { color: colors.text.primary }]}>Staff Name *</Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: colors.background.secondary,
                        color: colors.text.primary,
                        borderColor: colors.border.medium,
                      },
                    ]}
                    placeholder="e.g., John Smith"
                    placeholderTextColor={colors.text.tertiary}
                    value={formData.name}
                    onChangeText={(text) => setFormData({ ...formData, name: text })}
                    editable={!formLoading}
                    autoFocus
                  />
                </View>

                {/* Mobile Number */}
                <View style={styles.inputContainer}>
                  <Text style={[styles.label, { color: colors.text.primary }]}>Mobile Number *</Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: colors.background.secondary,
                        color: colors.text.primary,
                        borderColor: colors.border.medium,
                      },
                    ]}
                    placeholder="e.g., 9876543210"
                    placeholderTextColor={colors.text.tertiary}
                    keyboardType="phone-pad"
                    value={formData.mobileNumber}
                    onChangeText={(text) => setFormData({ ...formData, mobileNumber: text })}
                    maxLength={10}
                    editable={!formLoading}
                  />
                </View>

                {/* Address */}
                <View style={styles.inputContainer}>
                  <Text style={[styles.label, { color: colors.text.primary }]}>Address *</Text>
                  <TextInput
                    style={[
                      styles.textarea,
                      {
                        backgroundColor: colors.background.secondary,
                        color: colors.text.primary,
                        borderColor: colors.border.medium,
                      },
                    ]}
                    placeholder="Enter residential address"
                    placeholderTextColor={colors.text.tertiary}
                    multiline={true}
                    numberOfLines={3}
                    value={formData.address}
                    onChangeText={(text) => setFormData({ ...formData, address: text })}
                    editable={!formLoading}
                  />
                </View>

                {/* Joining Date */}
                <DatePicker
                  value={formData.joiningDate}
                  onChange={(date) => setFormData({ ...formData, joiningDate: date })}
                  label="Joining Date *"
                  disabled={formLoading}
                  required={true}
                />

                {/* Salary */}
                <View style={styles.inputContainer}>
                  <Text style={[styles.label, { color: colors.text.primary }]}>Monthly Salary *</Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: colors.background.secondary,
                        color: colors.text.primary,
                        borderColor: colors.border.medium,
                      },
                    ]}
                    placeholder="e.g., 15000"
                    placeholderTextColor={colors.text.tertiary}
                    keyboardType="decimal-pad"
                    value={formData.salary}
                    onChangeText={(text) => setFormData({ ...formData, salary: text })}
                    editable={!formLoading}
                  />
                </View>

                {/* Role */}
                <View style={styles.inputContainer}>
                  <Text style={[styles.label, { color: colors.text.primary }]}>Role *</Text>
                  <TouchableOpacity
                    style={[
                      styles.pickerButton,
                      {
                        backgroundColor: colors.background.secondary,
                        borderColor: colors.border.medium,
                      },
                    ]}
                    onPress={() => setShowRolePicker(true)}
                    activeOpacity={0.7}
                    disabled={formLoading}>
                    <Text
                      style={[
                        styles.pickerButtonText,
                        {
                          color: formData.role ? colors.text.primary : colors.text.tertiary,
                        },
                      ]}>
                      {formData.role ? STAFF_ROLES.find(r => r.value === formData.role)?.label : 'Select Role'}
                    </Text>
                    <ChevronDown size={20} color={colors.text.tertiary} />
                  </TouchableOpacity>
                </View>

                {!isOnline && (
                  <View style={[styles.offlineWarning, { backgroundColor: colors.warning[50], borderColor: colors.warning[200] }]}>
                    <Text style={[styles.offlineWarningText, { color: colors.warning[900] }]}>
                      📡 Offline - You cannot add or update staff without internet connection
                    </Text>
                  </View>
                )}

                {/* Submit Button */}
                <TouchableOpacity
                  style={[
                    styles.submitButton,
                    {
                      backgroundColor: colors.primary[500],
                      opacity: formLoading || !isOnline ? 0.6 : 1,
                    },
                  ]}
                  onPress={handleSubmit}
                  disabled={formLoading || !isOnline}
                  activeOpacity={0.8}>
                  {formLoading ? (
                    <ActivityIndicator color={colors.white} size="small" />
                  ) : (
                    <Text style={[styles.submitButtonText, { color: colors.white }]}>
                      {!isOnline ? 'Offline' : editingStaff ? 'Update Staff' : 'Add Staff'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Role Picker Modal */}
      <Modal
        visible={showRolePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRolePicker(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: colors.modal.overlay }]}>
          <View style={[styles.modalContainer, { backgroundColor: colors.background.secondary }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border.light }]}>
              <Text style={[styles.modalTitle, { color: colors.text.primary }]}>
                Select Role
              </Text>
            </View>

            <ScrollView style={styles.modalScrollView}>
              {STAFF_ROLES.map((role) => (
                <TouchableOpacity
                  key={role.value}
                  style={[
                    styles.modalOption,
                    { borderBottomColor: colors.border.light },
                  ]}
                  onPress={() => {
                    setFormData({ ...formData, role: role.value });
                    setShowRolePicker(false);
                  }}
                  activeOpacity={0.7}>
                  <Text
                    style={[
                      styles.modalOptionText,
                      {
                        color:
                          formData.role === role.value
                            ? colors.primary[500]
                            : colors.text.primary,
                        fontWeight:
                          formData.role === role.value
                            ? typography.fontWeight.semibold
                            : typography.fontWeight.regular,
                      },
                    ]}>
                    {role.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={[styles.modalCloseButton, { borderTopColor: colors.border.light }]}
              onPress={() => setShowRolePicker(false)}
              activeOpacity={0.7}>
              <Text style={[styles.modalCloseButtonText, { color: colors.text.secondary }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal visible={showDeleteConfirm} transparent animationType="fade">
        <View style={[styles.overlay, { backgroundColor: colors.modal.overlay }]}>
          <View style={[styles.deleteModal, { backgroundColor: colors.background.secondary }]}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => {
                setShowDeleteConfirm(false);
                setStaffToDelete(null);
              }}>
              <X size={24} color={colors.text.primary} />
            </TouchableOpacity>

            <View style={[styles.deleteIconContainer, { backgroundColor: colors.background.tertiary }]}>
              <AlertCircle size={48} color={colors.danger[500]} />
            </View>

            <Text style={[styles.deleteTitle, { color: colors.text.primary }]}>
              Remove Staff?
            </Text>

            <Text style={[styles.deleteDescription, { color: colors.text.secondary }]}>
              Are you sure you want to remove {staffToDelete?.name}? This action cannot be undone.
            </Text>

            <View style={styles.deleteButtonContainer}>
              <TouchableOpacity
                style={[styles.cancelButton, { borderColor: colors.border.light }]}
                onPress={() => {
                  setShowDeleteConfirm(false);
                  setStaffToDelete(null);
                }}
                disabled={deleting}>
                <Text style={[styles.cancelButtonText, { color: colors.text.primary }]}>
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.deleteButtonConfirm,
                  {
                    backgroundColor: colors.danger[500],
                    opacity: deleting ? 0.6 : 1,
                  },
                ]}
                onPress={handleConfirmDelete}
                disabled={deleting}>
                {deleting ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <>
                    <Trash2 size={18} color={colors.white} strokeWidth={2} />
                    <Text style={[styles.deleteButtonText, { color: colors.white }]}>
                      Remove Staff
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <UpgradeModal
        visible={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        onSelectPlan={() => {
          setShowUpgradeModal(false);
          loadAllStaff();
        }}
      />
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    gap: spacing.md,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  headerSubtitle: {
    fontSize: typography.fontSize.sm,
    marginTop: spacing.xs,
  },
  quotaBanner: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  quotaContent: {
    marginBottom: spacing.md,
  },
  quotaInfo: {
    marginBottom: spacing.md,
  },
  quotaLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    marginBottom: spacing.xs,
  },
  quotaValue: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
  },
  quotaTotal: {
    fontSize: typography.fontSize.md,
  },
  quotaBar: {
    height: 6,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.1)',
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  quotaFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  quotaWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  quotaWarningText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    flex: 1,
  },
  upgradeLink: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  searchSection: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  searchInputContainer: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    fontSize: typography.fontSize.md,
    paddingVertical: spacing.md,
  },
  scrollView: {
    flex: 1,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  staffCard: {
    overflow: 'hidden',
    marginBottom: 0,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerInfo: {
    flex: 1,
  },
  staffName: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.xs,
  },
  staffRole: {
    fontSize: typography.fontSize.sm,
  },
  detailsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
  },
  detailItem: {
    flex: 1,
    justifyContent: 'center',
  },
  detailLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  detailValue: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  detailDivider: {
    width: 1,
    height: 40,
    marginHorizontal: spacing.md,
  },
  addressSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
  },
  addressText: {
    fontSize: typography.fontSize.sm,
    flex: 1,
    lineHeight: 18,
  },
  dateSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  dateText: {
    fontSize: typography.fontSize.sm,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  editButton: {
    // Styling from parent with dynamic backgroundColor
  },
  deleteButton: {
    // Styling from parent with dynamic backgroundColor
  },
  actionButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContainer: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '70%',
  },
  modalHeader: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  modalScrollView: {
    paddingVertical: spacing.lg,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  modalOptionText: {
    fontSize: typography.fontSize.md,
  },
  modalCloseButton: {
    padding: spacing.lg,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  modalCloseButtonText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  // Delete Confirmation Modal
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  deleteModal: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    ...shadows.lg,
    maxHeight: '90%',
  },
  closeButton: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    padding: spacing.sm,
  },
  deleteIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  deleteTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  deleteDescription: {
    fontSize: typography.fontSize.md,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  deleteButtonContainer: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  deleteButtonConfirm: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  deleteButtonText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  // Form Modal Styles
  placeholder: {
    width: 44,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  logoCircle: {
    width: 60,
    height: 60,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    marginBottom: 0,
  },
  form: {
    width: '100%',
  },
  errorContainer: {
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
  },
  errorText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  inputContainer: {
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: typography.fontSize.md,
  },
  textarea: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: typography.fontSize.md,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  pickerButton: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  offlineWarning: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  offlineWarningText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
});
