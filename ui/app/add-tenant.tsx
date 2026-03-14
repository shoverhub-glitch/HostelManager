import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Modal,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { UserPlus, ChevronLeft, ChevronDown, Calendar } from 'lucide-react-native';
import { spacing, typography, radius, shadows, addActionTokens } from '@/theme';
import { useTheme } from '@/context/ThemeContext';
import { useProperty } from '@/context/PropertyContext';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { tenantService, roomService, bedService } from '@/services/apiClient';
import type { Room, Bed, BillingFrequency, BillingConfig, PaginatedResponse } from '@/services/apiTypes';
import EmptyState from '@/components/EmptyState';
import UpgradeModal from '@/components/UpgradeModal';
import DatePicker from '@/components/DatePicker';
import { cacheKeys, getScreenCache, setScreenCache } from '@/services/screenCache';

const FORM_CACHE_STALE_MS = 60 * 1000;

export default function AddTenantScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { selectedPropertyId } = useProperty();
  const isOnline = useNetworkStatus();

  const [name, setName] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [rent, setRent] = useState('');
  const [joinDate, setJoinDate] = useState(new Date().toISOString().split('T')[0]);

  const [roomsWithBeds, setRoomsWithBeds] = useState<Array<{ room: Room; availableBeds: Bed[] }>>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [availableBedsForRoom, setAvailableBedsForRoom] = useState<Bed[]>([]);
  const [selectedBed, setSelectedBed] = useState<Bed | null>(null);

  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showRoomPicker, setShowRoomPicker] = useState(false);
  const [showBedPicker, setShowBedPicker] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const [errors, setErrors] = useState<{
    name?: string;
    phone?: string;
    documentId?: string;
    rent?: string;
    address?: string;
  }>({});

  const validateName = (value: string): string | undefined => {
    if (!value || value.trim().length === 0) {
      return 'Name is required';
    }
    if (value.trim().length < 2) {
      return 'Name must be at least 2 characters';
    }
    if (/^\d+$/.test(value.trim())) {
      return 'Name cannot contain only numbers';
    }
    if (/[0-9]/.test(value.trim())) {
      return 'Name cannot contain numbers';
    }
    if (!/^[a-zA-Z\s\'\-\.]+$/.test(value.trim())) {
      return 'Name can only contain letters, spaces, hyphens, dots, and apostrophes';
    }
    return undefined;
  };

  const validatePhone = (value: string): string | undefined => {
    if (!value || value.trim().length === 0) {
      return 'Phone number is required';
    }
    const digitsOnly = value.replace(/\D/g, '');
    if (digitsOnly.length !== 10) {
      return 'Phone number must be exactly 10 digits';
    }
    if (!/^[6-9]/.test(digitsOnly)) {
      return 'Phone number must start with 6, 7, 8, or 9';
    }
    return undefined;
  };

  const validateDocumentId = (value: string): string | undefined => {
    if (!value || value.trim().length === 0) {
      return undefined;
    }
    if (value.trim().length < 4) {
      return 'Document ID must be at least 4 characters';
    }
    if (!/^[a-zA-Z0-9\-_]+$/.test(value.trim())) {
      return 'Document ID can only contain letters, numbers, hyphens, and underscores';
    }
    return undefined;
  };

  const validateRent = (value: string): string | undefined => {
    if (!value || value.trim().length === 0) {
      return 'Rent amount is required';
    }
    const rentNum = parseFloat(value.replace(/,/g, ''));
    if (isNaN(rentNum)) {
      return 'Please enter a valid number';
    }
    if (rentNum <= 0) {
      return 'Rent amount must be greater than 0';
    }
    if (rentNum > 999999) {
      return 'Rent amount is too high';
    }
    return undefined;
  };

  const validateAddress = (value: string): string | undefined => {
    if (!value || value.trim().length === 0) {
      return undefined;
    }
    if (value.trim().length < 5) {
      return 'Address must be at least 5 characters';
    }
    return undefined;
  };

  const validateForm = () => {
    const newErrors: typeof errors = {};
    
    newErrors.name = validateName(name);
    newErrors.phone = validatePhone(phone);
    newErrors.documentId = validateDocumentId(documentId);
    newErrors.rent = validateRent(rent);
    newErrors.address = validateAddress(address);
    
    setErrors(newErrors);
    
    return !Object.values(newErrors).some(error => error !== undefined);
  };

  const fetchAvailableBeds = useCallback(async () => {
    if (!selectedPropertyId) return;

    try {
      setFetchingData(true);
      setError(null);
      const response = await bedService.getAvailableBedsByProperty(selectedPropertyId);
      if (response.data) {
        setRoomsWithBeds(response.data);
        
        // Auto-select if only one room available
        if (response.data.length === 1) {
          const roomData = response.data[0];
          setSelectedRoom(roomData.room);
          
          // Auto-select if only one bed available in that room
          if (roomData.availableBeds.length === 1) {
            setSelectedBed(roomData.availableBeds[0]);
          }
        }
      } else {
        setRoomsWithBeds([]);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load available beds');
      setRoomsWithBeds([]);
    } finally {
      setFetchingData(false);
    }
  }, [selectedPropertyId]);

  useEffect(() => {
    if (selectedPropertyId) {
      fetchAvailableBeds();
    }
  }, [selectedPropertyId, fetchAvailableBeds]);

  useFocusEffect(
    useCallback(() => {
      if (selectedPropertyId) {
        fetchAvailableBeds();
      }
    }, [selectedPropertyId, fetchAvailableBeds])
  );

  useEffect(() => {
    if (selectedRoom) {
      // Find available beds for the selected room
      const roomData = roomsWithBeds.find(r => r.room.id === selectedRoom.id);
      if (roomData) {
        setAvailableBedsForRoom(roomData.availableBeds);
        setRent(roomData.room.price.toString());
        
        // Auto-select if only one bed available
        if (roomData.availableBeds.length === 1) {
          setSelectedBed(roomData.availableBeds[0]);
        } else {
          // Only clear selection if there are 0 or multiple beds
          setSelectedBed(null);
        }
      } else {
        setAvailableBedsForRoom([]);
        setSelectedBed(null);
      }
    } else {
      setAvailableBedsForRoom([]);
      setSelectedBed(null);
    }
  }, [selectedRoom, roomsWithBeds]);

  const handleNext = () => {
    setError(null);
    
    if (!validateForm()) {
      setError('Please fix the errors below');
      return;
    }

    if (!selectedRoom || !selectedBed) {
      setError('Please select a room and bed');
      return;
    }
    
    if (!joinDate) {
      setError('Join date is required');
      return;
    }

    const rentNum = parseFloat(rent);
    if (!selectedPropertyId) {
      setError('No property selected');
      return;
    }
    
    router.push({
      pathname: '/add-payment',
      params: {
        name: name.trim(),
        documentId: documentId.trim(),
        phone: phone.replace(/\D/g, ''),
        address: address.trim(),
        rent: rentNum.toString(),
        joinDate,
        propertyId: selectedPropertyId,
        roomId: selectedRoom.id,
        bedId: selectedBed.id,
      },
    });
  };

  const isFormValid = () => {
    return (
      name.trim() &&
      documentId.trim() &&
      phone.trim() &&
      rent &&
      joinDate &&
      selectedRoom &&
      selectedBed &&
      !validateName(name) &&
      !validatePhone(phone) &&
      !validateRent(rent)
    );
  };

  if (!selectedPropertyId) {
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
          <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Add Tenant</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.emptyContainer}>
          <EmptyState
            icon={UserPlus}
            title="No Property Selected"
            subtitle="Please create a property first to add tenants"
            actionLabel="Go Back"
            onActionPress={() => router.back()}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (fetchingData) {
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
          <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Add Tenant</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[500]} />
        </View>
      </SafeAreaView>
    );
  }

  if (roomsWithBeds.length === 0) {
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
          <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Add Tenant</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.emptyContainer}>
          <EmptyState
            icon={UserPlus}
            title="No Available Beds"
            subtitle="Create a room with beds first, then you can add tenants."
            actionLabel="Add Room"
            onActionPress={() => router.push('/room-form')}
          />
        </View>
      </SafeAreaView>
    );
  }

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
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Add Tenant</Text>
        <View style={styles.placeholder} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled">
          <View style={styles.logoContainer}>
            <View style={[styles.logoCircle, { backgroundColor: colors.primary[50] }]}>
              <UserPlus size={addActionTokens.iconSize.userPlus.form} color={colors.action.add.background} />
            </View>
            <Text style={[styles.title, { color: colors.text.primary }]}>Add New Tenant</Text>
          </View>

          <View style={styles.formContainer}>
            {error && (
              <View
                style={[
                  styles.errorContainer,
                  {
                    backgroundColor: colors.danger[50],
                    borderColor: colors.danger[200],
                  },
                ]}>
                <Text style={[styles.errorText, { color: colors.danger[700] }]}>{error}</Text>
              </View>
            )}

            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: colors.text.primary }]}>Name *</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.background.secondary,
                    color: colors.text.primary,
                    borderColor: errors.name ? colors.danger[500] : colors.border.medium,
                  },
                ]}
                placeholder="e.g., John Smith"
                placeholderTextColor={colors.text.tertiary}
                value={name}
                onChangeText={(text) => {
                  setName(text);
                  if (errors.name) {
                    setErrors(prev => ({ ...prev, name: undefined }));
                  }
                }}
                onBlur={() => {
                  setErrors(prev => ({ ...prev, name: validateName(name) }));
                }}
                editable={!loading}
                autoFocus
              />
              {errors.name && (
                <Text style={[styles.errorText, { color: colors.danger[600] }]}>
                  {errors.name}
                </Text>
              )}
            </View>

            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: colors.text.primary }]}>Document ID</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.background.secondary,
                    color: colors.text.primary,
                    borderColor: errors.documentId ? colors.danger[500] : colors.border.medium,
                  },
                ]}
                placeholder="e.g., AADHAR123456"
                autoCapitalize="characters"
                placeholderTextColor={colors.text.tertiary}
                value={documentId}
                onChangeText={(text) => {
                  setDocumentId(text);
                  if (errors.documentId) {
                    setErrors(prev => ({ ...prev, documentId: undefined }));
                  }
                }}
                onBlur={() => {
                  setErrors(prev => ({ ...prev, documentId: validateDocumentId(documentId) }));
                }}
                editable={!loading}
              />
              {errors.documentId && (
                <Text style={[styles.errorText, { color: colors.danger[600] }]}>
                  {errors.documentId}
                </Text>
              )}
            </View>

            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: colors.text.primary }]}>Phone *</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.background.secondary,
                    color: colors.text.primary,
                    borderColor: errors.phone ? colors.danger[500] : colors.border.medium,
                  },
                ]}
                placeholder="e.g., 9876543210"
                keyboardType="phone-pad"
                maxLength={15}
                placeholderTextColor={colors.text.tertiary}
                value={phone}
                onChangeText={(text) => {
                  setPhone(text);
                  if (errors.phone) {
                    setErrors(prev => ({ ...prev, phone: undefined }));
                  }
                }}
                onBlur={() => {
                  setErrors(prev => ({ ...prev, phone: validatePhone(phone) }));
                }}
                editable={!loading}
              />
              {errors.phone && (
                <Text style={[styles.errorText, { color: colors.danger[600] }]}>
                  {errors.phone}
                </Text>
              )}
            </View>

            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: colors.text.primary }]}>Address</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.background.secondary,
                    color: colors.text.primary,
                    borderColor: errors.address ? colors.danger[500] : colors.border.medium,
                  },
                ]}
                placeholder="e.g., 123 Main St, City"
                placeholderTextColor={colors.text.tertiary}
                value={address}
                onChangeText={(text) => {
                  setAddress(text);
                  if (errors.address) {
                    setErrors(prev => ({ ...prev, address: undefined }));
                  }
                }}
                onBlur={() => {
                  setErrors(prev => ({ ...prev, address: validateAddress(address) }));
                }}
                editable={!loading}
                multiline
                numberOfLines={2}
              />
              {errors.address && (
                <Text style={[styles.errorText, { color: colors.danger[600] }]}>
                  {errors.address}
                </Text>
              )}
            </View>

            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: colors.text.primary }]}>Room *</Text>
              <TouchableOpacity
                style={[
                  styles.pickerButton,
                  {
                    backgroundColor: colors.background.secondary,
                    borderColor: colors.border.medium,
                  },
                ]}
                onPress={() => setShowRoomPicker(true)}
                activeOpacity={0.7}
                disabled={loading || roomsWithBeds.length === 0}>
                <Text
                  style={[
                    styles.pickerButtonText,
                    {
                      color: selectedRoom ? colors.text.primary : colors.text.tertiary,
                    },
                  ]}>
                  {selectedRoom ? `Room ${selectedRoom.roomNumber}` : 'Select Room'}
                </Text>
                <ChevronDown size={20} color={colors.text.tertiary} />
              </TouchableOpacity>
            </View>

            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: colors.text.primary }]}>Bed *</Text>
              <TouchableOpacity
                style={[
                  styles.pickerButton,
                  {
                    backgroundColor: colors.background.secondary,
                    borderColor: colors.border.medium,
                    opacity: !selectedRoom ? 0.5 : 1,
                  },
                ]}
                onPress={() => setShowBedPicker(true)}
                activeOpacity={0.7}
                disabled={loading || !selectedRoom || availableBedsForRoom.length === 0}>
                <Text
                  style={[
                    styles.pickerButtonText,
                    {
                      color: selectedBed ? colors.text.primary : colors.text.tertiary,
                    },
                  ]}>
                  {selectedBed
                    ? `Bed ${selectedBed.bedNumber}`
                    : 'Select Bed'}
                </Text>
                <ChevronDown size={20} color={colors.text.tertiary} />
              </TouchableOpacity>
              {selectedRoom && availableBedsForRoom.length === 0 && (
                <View style={[styles.infoContainer, { backgroundColor: colors.warning[50], borderColor: colors.warning[200] }]}>
                  <Text style={[styles.infoText, { color: colors.warning[700] }]}>
                    No available beds in this room
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: colors.text.primary }]}>Rent Amount *</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.background.secondary,
                    color: colors.text.primary,
                    borderColor: errors.rent ? colors.danger[500] : colors.border.medium,
                  },
                ]}
                placeholder="e.g., 5000"
                keyboardType="numeric"
                placeholderTextColor={colors.text.tertiary}
                value={rent}
                onChangeText={(text) => {
                  const cleaned = text.replace(/[^0-9.]/g, '');
                  const parts = cleaned.split('.');
                  if (parts.length > 2) return;
                  if (parts[1] && parts[1].length > 2) return;
                  setRent(cleaned);
                  if (errors.rent) {
                    setErrors(prev => ({ ...prev, rent: undefined }));
                  }
                }}
                onBlur={() => {
                  setErrors(prev => ({ ...prev, rent: validateRent(rent) }));
                }}
                editable={!loading}
              />
              {errors.rent && (
                <Text style={[styles.errorText, { color: colors.danger[600] }]}>
                  {errors.rent}
                </Text>
              )}
            </View>

            <DatePicker
              value={joinDate}
              onChange={setJoinDate}
              label="Join Date"
              disabled={loading || !isOnline}
              required
            />

            {/* Billing settings removed */}

            {!isOnline && (
              <View style={[styles.offlineWarning, { backgroundColor: colors.warning[50], borderColor: colors.warning[200] }]}>
                <Text style={[styles.offlineWarningText, { color: colors.warning[900] }]}>
                  📡 Offline - You cannot add tenants without internet connection
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.submitButton,
                {
                  backgroundColor: colors.primary[500],
                  opacity: loading || !isFormValid() || !isOnline ? 0.6 : 1,
                },
              ]}
              onPress={handleNext}
              activeOpacity={0.8}
              disabled={loading || !isFormValid() || !isOnline}>
              {loading ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={[styles.submitButtonText, { color: colors.white }]}> 
                  {isOnline ? 'Next' : 'Offline'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={showRoomPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRoomPicker(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: colors.modal.overlay }]}>
          <View style={[styles.modalContainer, { backgroundColor: colors.background.secondary }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border.light }]}>
              <Text style={[styles.modalTitle, { color: colors.text.primary }]}>
                Select Room
              </Text>
            </View>

            <ScrollView style={styles.modalScrollView}>
              {roomsWithBeds.map((roomData, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.modalOption,
                    { borderBottomColor: colors.border.light },
                  ]}
                  onPress={() => {
                    setSelectedRoom(roomData.room);
                    setShowRoomPicker(false);
                  }}
                  activeOpacity={0.7}>
                  <View style={styles.modalOptionContent}>
                    <Text
                      style={[
                        styles.modalOptionText,
                        {
                          color:
                            selectedRoom?.id === roomData.room.id
                              ? colors.primary[500]
                              : colors.text.primary,
                          fontWeight:
                            selectedRoom?.id === roomData.room.id
                              ? typography.fontWeight.semibold
                              : typography.fontWeight.regular,
                        },
                      ]}>
                      Room {roomData.room.roomNumber}
                    </Text>
                    <Text style={[styles.modalOptionSubtext, { color: colors.text.secondary }]}>
                      Floor {roomData.room.floor} • {roomData.availableBeds.length} available • ₹{roomData.room.price}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={[styles.modalCloseButton, { borderTopColor: colors.border.light }]}
              onPress={() => setShowRoomPicker(false)}
              activeOpacity={0.7}>
              <Text style={[styles.modalCloseButtonText, { color: colors.text.secondary }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showBedPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBedPicker(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: colors.modal.overlay }]}>
          <View style={[styles.modalContainer, { backgroundColor: colors.background.secondary }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border.light }]}>
              <Text style={[styles.modalTitle, { color: colors.text.primary }]}>
                Select Bed
              </Text>
            </View>

            <ScrollView style={styles.modalScrollView}>
              {availableBedsForRoom.map((bed, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.modalOption,
                    { borderBottomColor: colors.border.light },
                  ]}
                  onPress={() => {
                    setSelectedBed(bed);
                    setShowBedPicker(false);
                  }}
                  activeOpacity={0.7}>
                  <Text
                    style={[
                      styles.modalOptionText,
                      {
                        color:
                          selectedBed?.id === bed.id
                            ? colors.primary[500]
                            : colors.text.primary,
                        fontWeight:
                          selectedBed?.id === bed.id
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
              style={[styles.modalCloseButton, { borderTopColor: colors.border.light }]}
              onPress={() => setShowBedPicker(false)}
              activeOpacity={0.7}>
              <Text style={[styles.modalCloseButtonText, { color: colors.text.secondary }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <UpgradeModal
        visible={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        onSelectPlan={() => {
          setShowUpgradeModal(false);
          router.back();
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
  placeholder: {
    width: 40,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  formContainer: {
    width: '100%',
  },
  errorContainer: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  errorText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
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
  input: {
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
  helperText: {
    fontSize: typography.fontSize.xs,
    marginTop: spacing.xs,
  },
  infoContainer: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  infoText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
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
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContainer: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '70%',
    ...shadows.xl,
  },
  modalHeader: {
    padding: spacing.lg,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    textAlign: 'center',
  },
  modalScrollView: {
    maxHeight: 400,
  },
  modalOption: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
  },
  modalOptionContent: {
    gap: spacing.xs,
  },
  modalOptionText: {
    fontSize: typography.fontSize.md,
  },
  modalOptionSubtext: {
    fontSize: typography.fontSize.sm,
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
  billingSection: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    marginBottom: spacing.xl,
  },
  billingSectionTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.lg,
  },
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
  },
  toggleLabel: {
    flex: 1,
    marginRight: spacing.md,
  },
  toggleHint: {
    fontSize: typography.fontSize.xs,
    marginTop: spacing.xs,
  },
});
