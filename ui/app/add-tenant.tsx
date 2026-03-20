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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { UserPlus, ChevronLeft, ChevronDown } from 'lucide-react-native';
import { spacing, radius, shadows, addActionTokens } from '@/theme';
import { typography } from '@/theme/typography';
import { useTheme } from '@/context/ThemeContext';
import { useProperty } from '@/context/PropertyContext';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { bedService } from '@/services/apiClient';
import type { Room, Bed} from '@/services/apiTypes';
import EmptyState from '@/components/EmptyState';
import UpgradeModal from '@/components/UpgradeModal';
import DatePicker from '@/components/DatePicker';
import useResponsiveLayout from '@/hooks/useResponsiveLayout';

export default function AddTenantScreen() {
  const { colors, isDark } = useTheme();
  const { isTablet, contentMaxWidth, modalMaxWidth, formMaxWidth } = useResponsiveLayout();
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

  const brandColor = colors.primary[500];
  const brandLight = isDark ? colors.primary[900] : colors.primary[50];
  const brandText = isDark ? colors.primary[300] : colors.primary[700];
  const cardBg = colors.background.secondary;
  const cardBorder = colors.border.medium;
  const textPrimary = colors.text.primary;
  const textSecondary = colors.text.secondary;
  const textTertiary = colors.text.tertiary;

  const renderNavBar = () => (
    <View style={[styles.navBar, { backgroundColor: cardBg, borderBottomColor: colors.border.light }]}>
      <TouchableOpacity
        style={[styles.navBack, { backgroundColor: colors.background.primary, borderColor: cardBorder }]}
        onPress={() => router.back()}
        activeOpacity={0.75}>
        <ChevronLeft size={20} color={textPrimary} strokeWidth={2.4} />
      </TouchableOpacity>

      <View style={styles.navCenter}>
        <Text style={[styles.navEyebrow, { color: textTertiary }]}>TENANT</Text>
        <Text style={[styles.navTitle, { color: textPrimary }]}>Add Tenant</Text>
      </View>

      <View style={styles.navSpacer} />
    </View>
  );

  if (!selectedPropertyId) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background.primary }]}
        edges={['top', 'bottom']}>
        {renderNavBar()}
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
        {renderNavBar()}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={brandColor} />
        </View>
      </SafeAreaView>
    );
  }

  if (roomsWithBeds.length === 0) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background.primary }]}
        edges={['top', 'bottom']}>
        {renderNavBar()}
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

  const submitDisabled = loading || !isFormValid() || !isOnline;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background.primary }]}
      edges={['top', 'bottom']}>
      {renderNavBar()}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            isTablet && { alignSelf: 'center', width: '100%', maxWidth: contentMaxWidth },
          ]}
          keyboardShouldPersistTaps="handled">
          <View style={[styles.heroCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <View style={[styles.heroIconWrap, { backgroundColor: brandLight }]}>
              <UserPlus
                size={addActionTokens.iconSize.userPlus.form}
                color={isDark ? colors.primary[300] : colors.action.add.background}
              />
            </View>
            <View style={styles.heroCopy}>
              <Text style={[styles.heroEyebrow, { color: textTertiary }]}>TENANT ONBOARDING</Text>
              <Text style={[styles.heroTitle, { color: textPrimary }]}>Add new tenant</Text>
              <Text style={[styles.heroSubtitle, { color: textSecondary }]}>Profile, room assignment, and billing setup in one flow.</Text>
            </View>
          </View>

          <View
            style={[
              styles.formCard,
              { backgroundColor: cardBg, borderColor: cardBorder },
              isTablet && { alignSelf: 'center', width: '100%', maxWidth: formMaxWidth },
            ]}>
            {error && (
              <View
                style={[
                  styles.errorContainer,
                  {
                    backgroundColor: isDark ? colors.danger[900] : colors.danger[50],
                    borderColor: isDark ? colors.danger[700] : colors.danger[200],
                  },
                ]}>
                <Text style={[styles.errorText, { color: isDark ? colors.danger[300] : colors.danger[700] }]}>{error}</Text>
              </View>
            )}

            <View style={styles.inputContainer}>
              <Text style={[styles.fieldLabel, { color: textSecondary }]}>Name *</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.background.primary,
                    color: textPrimary,
                    borderColor: errors.name ? colors.danger[500] : cardBorder,
                  },
                ]}
                placeholder="e.g., John Smith"
                placeholderTextColor={textTertiary}
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
              <Text style={[styles.fieldLabel, { color: textSecondary }]}>Document ID</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.background.primary,
                    color: textPrimary,
                    borderColor: errors.documentId ? colors.danger[500] : cardBorder,
                  },
                ]}
                placeholder="e.g., AADHAR123456"
                autoCapitalize="characters"
                placeholderTextColor={textTertiary}
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
              <Text style={[styles.fieldLabel, { color: textSecondary }]}>Phone *</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.background.primary,
                    color: textPrimary,
                    borderColor: errors.phone ? colors.danger[500] : cardBorder,
                  },
                ]}
                placeholder="e.g., 9876543210"
                keyboardType="phone-pad"
                maxLength={15}
                placeholderTextColor={textTertiary}
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
              <Text style={[styles.fieldLabel, { color: textSecondary }]}>Address</Text>
              <TextInput
                style={[
                  styles.input,
                  styles.inputMultiline,
                  {
                    backgroundColor: colors.background.primary,
                    color: textPrimary,
                    borderColor: errors.address ? colors.danger[500] : cardBorder,
                  },
                ]}
                placeholder="e.g., 123 Main St, City"
                placeholderTextColor={textTertiary}
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
              <Text style={[styles.fieldLabel, { color: textSecondary }]}>Room *</Text>
              <TouchableOpacity
                style={[
                  styles.pickerButton,
                  {
                    backgroundColor: colors.background.primary,
                    borderColor: selectedRoom ? brandColor : cardBorder,
                  },
                ]}
                onPress={() => setShowRoomPicker(true)}
                activeOpacity={0.7}
                disabled={loading || roomsWithBeds.length === 0}>
                <Text
                  style={[
                    styles.pickerButtonText,
                    {
                      color: selectedRoom ? textPrimary : textTertiary,
                    },
                  ]}>
                  {selectedRoom ? `Room ${selectedRoom.roomNumber}` : 'Select Room'}
                </Text>
                <ChevronDown size={18} color={selectedRoom ? brandColor : textTertiary} />
              </TouchableOpacity>
              <Text style={[styles.pickerMeta, { color: textTertiary }]}>Pick a room to fetch available beds and default rent.</Text>
            </View>

            <View style={styles.inputContainer}>
              <Text style={[styles.fieldLabel, { color: textSecondary }]}>Bed *</Text>
              <TouchableOpacity
                style={[
                  styles.pickerButton,
                  {
                    backgroundColor: colors.background.primary,
                    borderColor: selectedBed ? brandColor : cardBorder,
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
                      color: selectedBed ? textPrimary : textTertiary,
                    },
                  ]}>
                  {selectedBed
                    ? `Bed ${selectedBed.bedNumber}`
                    : 'Select Bed'}
                </Text>
                <ChevronDown size={18} color={selectedBed ? brandColor : textTertiary} />
              </TouchableOpacity>
              {selectedRoom && availableBedsForRoom.length === 0 && (
                <View style={[styles.infoContainer, { backgroundColor: isDark ? colors.warning[900] : colors.warning[50], borderColor: isDark ? colors.warning[700] : colors.warning[200] }]}>
                  <Text style={[styles.infoText, { color: isDark ? colors.warning[300] : colors.warning[700] }]}>
                    No available beds in this room
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.inputContainer}>
              <Text style={[styles.fieldLabel, { color: textSecondary }]}>Rent Amount *</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.background.primary,
                    color: textPrimary,
                    borderColor: errors.rent ? colors.danger[500] : cardBorder,
                  },
                ]}
                placeholder="e.g., 5000"
                keyboardType="numeric"
                placeholderTextColor={textTertiary}
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

            {!isOnline && (
              <View style={[styles.offlineWarning, { backgroundColor: isDark ? colors.warning[900] : colors.warning[50], borderColor: isDark ? colors.warning[700] : colors.warning[200] }]}>
                <Text style={[styles.offlineWarningText, { color: isDark ? colors.warning[300] : colors.warning[900] }]}>
                  Offline: internet connection is required to add tenants.
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.submitButton,
                {
                  backgroundColor: brandColor,
                  opacity: submitDisabled ? 0.6 : 1,
                },
              ]}
              onPress={handleNext}
              activeOpacity={0.8}
              disabled={submitDisabled}>
              {loading ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={[styles.submitButtonText, { color: colors.white }]}> 
                  {isOnline ? 'Continue to Billing' : 'Offline'}
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
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setShowRoomPicker(false)} activeOpacity={1} />
          <View
            style={[
              styles.sheet,
              styles.sheetTablet,
              {
                backgroundColor: cardBg,
                maxWidth: isTablet ? modalMaxWidth : undefined,
              },
            ]}>
            <View style={styles.sheetHandle}>
              <View style={[styles.handleBar, { backgroundColor: colors.border.dark }]} />
            </View>

            <View style={[styles.sheetHeader, { borderBottomColor: colors.border.light }]}>
              <Text style={[styles.sheetTitle, { color: textPrimary }]}>
                Select Room
              </Text>
            </View>

            <ScrollView style={styles.sheetBody}>
              {roomsWithBeds.map((roomData, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.sheetOption,
                    { borderBottomColor: colors.border.light },
                  ]}
                  onPress={() => {
                    setSelectedRoom(roomData.room);
                    setShowRoomPicker(false);
                  }}
                  activeOpacity={0.75}>
                  <View style={styles.sheetOptionContent}>
                    <Text
                      style={[
                        styles.sheetOptionTitle,
                        {
                          color:
                            selectedRoom?.id === roomData.room.id
                              ? brandText
                              : textPrimary,
                        },
                      ]}>
                      Room {roomData.room.roomNumber}
                    </Text>
                    <Text style={[styles.sheetOptionMeta, { color: textSecondary }]}>
                      Floor {roomData.room.floor} • {roomData.availableBeds.length} available • ₹{roomData.room.price}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={[styles.sheetFooterBtn, { borderTopColor: colors.border.light }]}
              onPress={() => setShowRoomPicker(false)}
              activeOpacity={0.75}>
              <Text style={[styles.sheetFooterBtnText, { color: textSecondary }]}>
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
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setShowBedPicker(false)} activeOpacity={1} />
          <View
            style={[
              styles.sheet,
              styles.sheetTablet,
              {
                backgroundColor: cardBg,
                maxWidth: isTablet ? modalMaxWidth : undefined,
              },
            ]}>
            <View style={styles.sheetHandle}>
              <View style={[styles.handleBar, { backgroundColor: colors.border.dark }]} />
            </View>

            <View style={[styles.sheetHeader, { borderBottomColor: colors.border.light }]}>
              <Text style={[styles.sheetTitle, { color: textPrimary }]}>
                Select Bed
              </Text>
            </View>

            <ScrollView style={styles.sheetBody}>
              {availableBedsForRoom.map((bed, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.sheetOption,
                    { borderBottomColor: colors.border.light },
                  ]}
                  onPress={() => {
                    setSelectedBed(bed);
                    setShowBedPicker(false);
                  }}
                  activeOpacity={0.75}>
                  <Text
                    style={[
                      styles.sheetOptionTitle,
                      {
                        color:
                          selectedBed?.id === bed.id
                            ? brandText
                            : textPrimary,
                      },
                    ]}>
                    Bed {bed.bedNumber}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={[styles.sheetFooterBtn, { borderTopColor: colors.border.light }]}
              onPress={() => setShowBedPicker(false)}
              activeOpacity={0.75}>
              <Text style={[styles.sheetFooterBtnText, { color: textSecondary }]}>
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
  container: { flex: 1 },

  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  navBack: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navCenter: {
    flex: 1,
    alignItems: 'center',
  },
  navEyebrow: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 9,
    letterSpacing: typography.letterSpacing.wider,
    marginBottom: 1,
  },
  navTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    letterSpacing: typography.letterSpacing.tight,
  },
  navSpacer: {
    width: 36,
    height: 36,
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
  keyboardView: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
  },

  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  heroIconWrap: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCopy: {
    flex: 1,
  },
  heroEyebrow: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 9,
    letterSpacing: typography.letterSpacing.wider,
    marginBottom: 3,
  },
  heroTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    letterSpacing: typography.letterSpacing.tight,
    marginBottom: 2,
  },
  heroSubtitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: 19,
  },

  formCard: {
    width: '100%',
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.lg,
  },
  errorContainer: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: 16,
    marginTop: spacing.xs,
  },
  inputContainer: {
    marginBottom: spacing.lg,
  },
  fieldLabel: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.fontSize.xs,
    letterSpacing: typography.letterSpacing.wider,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  input: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.md,
  },
  inputMultiline: {
    minHeight: 82,
    textAlignVertical: 'top',
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  pickerButtonText: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.md,
  },
  pickerMeta: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    letterSpacing: typography.letterSpacing.wide,
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
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.fontSize.xs,
    letterSpacing: typography.letterSpacing.wide,
  },
  offlineWarning: {
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  offlineWarningText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: 20,
  },
  submitButton: {
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    ...shadows.md,
  },
  submitButtonText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    letterSpacing: typography.letterSpacing.wide,
  },

  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    ...shadows.xl,
  },
  sheetTablet: {
    alignSelf: 'center',
  },
  sheetHandle: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  handleBar: {
    width: 38,
    height: 4,
    borderRadius: 2,
    opacity: 0.35,
  },
  sheetHeader: {
    borderBottomWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  sheetTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    letterSpacing: typography.letterSpacing.tight,
    textAlign: 'center',
  },
  sheetBody: {
    maxHeight: 380,
  },
  sheetOption: {
    borderBottomWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  sheetOptionContent: {
    gap: spacing.xs,
  },
  sheetOptionTitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.md,
  },
  sheetOptionMeta: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
  },
  sheetFooterBtn: {
    borderTopWidth: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  sheetFooterBtnText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.fontSize.sm,
    letterSpacing: typography.letterSpacing.wide,
  },
});
