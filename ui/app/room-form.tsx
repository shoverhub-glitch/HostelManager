import { useState, useEffect } from 'react';
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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { DoorOpen, ChevronLeft, ChevronDown } from 'lucide-react-native';
import { spacing, typography, radius, shadows } from '@/theme';
import { useTheme } from '@/context/ThemeContext';
import { useProperty } from '@/context/PropertyContext';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { roomService } from '@/services/apiClient';
import { clearScreenCache } from '@/services/screenCache';
import UpgradeModal from '@/components/UpgradeModal';

const FLOOR_OPTIONS = [
  'Ground Floor',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  'Other',
];

export default function RoomFormScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { roomId } = useLocalSearchParams<{ roomId?: string }>();
  const { selectedPropertyId } = useProperty();
  const isOnline = useNetworkStatus();
  const [roomNumber, setRoomNumber] = useState('');
  const [floor, setFloor] = useState('');
  const [customFloor, setCustomFloor] = useState('');
  const [price, setPrice] = useState('');
  const [numberOfBeds, setNumberOfBeds] = useState('');
  const [originalBedCount, setOriginalBedCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(!!roomId);
  const [error, setError] = useState<string | null>(null);
  const [showFloorPicker, setShowFloorPicker] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showBedChangeWarning, setShowBedChangeWarning] = useState(false);
  const [bedChangePreview, setBedChangePreview] = useState<any>(null);
  const [checkingBedChange, setCheckingBedChange] = useState(false);

  const isEdit = !!roomId;

  // Load room data if editing
  useEffect(() => {
    if (isEdit && roomId) {
      loadRoomData();
    }
  }, [roomId]);

  const loadRoomData = async () => {
    try {
      setInitialLoading(true);
      const response = await roomService.getRoomById(roomId!);
      if (response.data) {
        const room = response.data;
        setRoomNumber(room.roomNumber);
        setFloor(room.floor);
        setPrice(room.price.toString());
        setNumberOfBeds(room.numberOfBeds.toString());
        setOriginalBedCount(room.numberOfBeds);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load room data');
    } finally {
      setInitialLoading(false);
    }
  };

  const handleBedCountChange = (value: string) => {
    setNumberOfBeds(value);
    setError(null);
  };

  const checkBedCountChange = async () => {
    const bedsNum = parseInt(numberOfBeds, 10);
    
    if (isNaN(bedsNum) || bedsNum <= 0) {
      setError('Number of beds must be greater than 0');
      return false;
    }
    
    // If bed count is being reduced in edit mode, show warning
    if (isEdit && bedsNum < originalBedCount) {
      try {
        setCheckingBedChange(true);
        const preview = await roomService.previewBedCountChange(roomId!, bedsNum);
        setBedChangePreview(preview.data);
        
        if (preview.data.affectedTenants && preview.data.affectedTenants.length > 0) {
          setShowBedChangeWarning(true);
          return false; // Wait for user confirmation
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to check bed count change');
        return false;
      } finally {
        setCheckingBedChange(false);
      }
    }
    
    return true;
  };

  const handleSubmit = async () => {
    if (!roomNumber || !floor) {
      setError('Room number and floor are required');
      return;
    }

    if (!isEdit && (!price || !numberOfBeds)) {
      setError('All fields are required');
      return;
    }

    const priceNum = price ? parseFloat(price) : 0;
    const bedsNum = numberOfBeds ? parseInt(numberOfBeds, 10) : 0;

    if (!isEdit && (isNaN(priceNum) || priceNum < 0)) {
      setError('Price must be a valid number >= 0');
      return;
    }

    if (isNaN(bedsNum) || bedsNum <= 0) {
      setError('Number of beds must be greater than 0');
      return;
    }

    if (floor === 'Other' && !customFloor.trim()) {
      setError('Please enter a floor number');
      return;
    }

    if (!selectedPropertyId) {
      setError('No property selected. Please select a property first.');
      return;
    }

    // Check for bed count changes before submitting
    if (isEdit && bedsNum !== originalBedCount) {
      const canProceed = await checkBedCountChange();
      if (!canProceed) {
        return; // Wait for user to confirm the bed change warning
      }
    }

    await performSubmit();
  };

  const performSubmit = async () => {
    const priceNum = price ? parseFloat(price) : 0;
    const bedsNum = numberOfBeds ? parseInt(numberOfBeds, 10) : 0;
    const finalFloor = floor === 'Other' ? customFloor.trim() : floor;

    if (!selectedPropertyId) {
      setError('No property selected. Please select a property first.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      if (isEdit && roomId) {
        // Update roomNumber, floor, and numberOfBeds if changed
        const updateData: any = {
          roomNumber: roomNumber.trim(),
          floor: finalFloor,
          propertyId: selectedPropertyId,
        };
        
        // Include numberOfBeds if it has changed
        if (bedsNum !== originalBedCount) {
          updateData.numberOfBeds = bedsNum;
        }
        
        await roomService.updateRoom(roomId, updateData);
      } else {
        // Create new room
        await roomService.createRoom({
          propertyId: selectedPropertyId,
          roomNumber: roomNumber.trim(),
          floor: finalFloor,
          price: priceNum,
          numberOfBeds: bedsNum,
        });
      }

      clearScreenCache('rooms:');
      clearScreenCache('dashboard:');

      router.back();
    } catch (err: any) {
      if (err?.code === 'SUBSCRIPTION_LIMIT_EXCEEDED' || err?.details?.status === 402) {
        setShowUpgradeModal(true);
      } else {
        setError(err?.message || `Failed to ${isEdit ? 'update' : 'create'} room`);
      }
    } finally {
      setLoading(false);
    }
  };

  const displayFloor = floor === 'Other' && customFloor ? customFloor : floor || 'Select Floor';

  if (initialLoading) {
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
          <Text style={[styles.headerTitle, { color: colors.text.primary }]}>
            {isEdit ? 'Edit Room' : 'Add Room'}
          </Text>
          <View style={styles.placeholder} />
        </View>
        <View style={[styles.loadingContainer, { backgroundColor: colors.background.primary }]}>
          <ActivityIndicator size="large" color={colors.primary[500]} />
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
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>
          {isEdit ? 'Edit Room' : 'Add Room'}
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
            <View style={[styles.logoCircle, { backgroundColor: colors.primary[50] }]}>
              <DoorOpen size={32} color={colors.primary[500]} />
            </View>
            <Text style={[styles.title, { color: colors.text.primary }]}>
              {isEdit ? 'Edit Room Details' : 'Create Room'}
            </Text>
            {isEdit && (
              <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
                Price cannot be changed. Reducing beds may affect tenants.
              </Text>
            )}
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
              <Text style={[styles.label, { color: colors.text.primary }]}>Room Number</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.background.secondary,
                    color: colors.text.primary,
                    borderColor: colors.border.medium,
                  },
                ]}
                placeholder="e.g., A-101"
                placeholderTextColor={colors.text.tertiary}
                value={roomNumber}
                onChangeText={setRoomNumber}
                editable={!loading}
                autoFocus
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: colors.text.primary }]}>Floor</Text>
              <TouchableOpacity
                style={[
                  styles.pickerButton,
                  {
                    backgroundColor: colors.background.secondary,
                    borderColor: colors.border.medium,
                  },
                ]}
                onPress={() => setShowFloorPicker(true)}
                activeOpacity={0.7}
                disabled={loading}>
                <Text
                  style={[
                    styles.pickerButtonText,
                    {
                      color: floor ? colors.text.primary : colors.text.tertiary,
                    },
                  ]}>
                  {displayFloor}
                </Text>
                <ChevronDown size={20} color={colors.text.tertiary} />
              </TouchableOpacity>
            </View>

            {floor === 'Other' && (
              <View style={styles.inputContainer}>
                <Text style={[styles.label, { color: colors.text.primary }]}>
                  Custom Floor
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.background.secondary,
                      color: colors.text.primary,
                      borderColor: colors.border.medium,
                    },
                  ]}
                  placeholder="Enter floor number"
                  placeholderTextColor={colors.text.tertiary}
                  value={customFloor}
                  onChangeText={setCustomFloor}
                  editable={!loading}
                />
              </View>
            )}

            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: colors.text.primary }]}>Price</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: isEdit ? colors.background.tertiary : colors.background.secondary,
                    color: isEdit ? colors.text.tertiary : colors.text.primary,
                    borderColor: colors.border.medium,
                  },
                ]}
                placeholder="e.g., 5000"
                keyboardType="numeric"
                placeholderTextColor={colors.text.tertiary}
                value={price}
                onChangeText={setPrice}
                editable={!loading && !isEdit}
              />
              {isEdit && (
                <Text style={[styles.fieldNote, { color: colors.text.tertiary }]}>
                  Cannot be changed after creation
                </Text>
              )}
            </View>

            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: colors.text.primary }]}>Number of Beds</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.background.secondary,
                    color: colors.text.primary,
                    borderColor: colors.border.medium,
                  },
                ]}
                placeholder="e.g., 4"
                keyboardType="numeric"
                placeholderTextColor={colors.text.tertiary}
                value={numberOfBeds}
                onChangeText={handleBedCountChange}
                editable={!loading}
              />
              {isEdit && parseInt(numberOfBeds, 10) !== originalBedCount && (
                <Text style={[styles.fieldNote, { color: colors.warning[600] }]}>
                  ⚠️ Changing bed count may affect existing tenants
                </Text>
              )}
            </View>

            {!isOnline && (
              <View style={[styles.offlineWarning, { backgroundColor: colors.warning[50], borderColor: colors.warning[200] }]}>
                <Text style={[styles.offlineWarningText, { color: colors.warning[900] }]}>
                  📡 Offline - You cannot create rooms without internet connection
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.submitButton,
                {
                  backgroundColor: colors.primary[500],
                  opacity: loading || !isOnline ? 0.6 : 1,
                },
              ]}
              onPress={handleSubmit}
              activeOpacity={0.8}
              disabled={loading || !isOnline}>
              {loading ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={[styles.submitButtonText, { color: colors.white }]}>
                  {isOnline ? (isEdit ? 'Update Room' : 'Create Room') : 'Offline'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={showFloorPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFloorPicker(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: colors.modal.overlay }]}>
          <View style={[styles.modalContainer, { backgroundColor: colors.background.secondary }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border.light }]}>
              <Text style={[styles.modalTitle, { color: colors.text.primary }]}>
                Select Floor
              </Text>
            </View>

            <ScrollView style={styles.modalScrollView}>
              {FLOOR_OPTIONS.map((option, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.modalOption,
                    { borderBottomColor: colors.border.light },
                  ]}
                  onPress={() => {
                    setFloor(option);
                    if (option !== 'Other') {
                      setCustomFloor('');
                    }
                    setShowFloorPicker(false);
                  }}
                  activeOpacity={0.7}>
                  <Text
                    style={[
                      styles.modalOptionText,
                      {
                        color:
                          floor === option ? colors.primary[500] : colors.text.primary,
                        fontWeight:
                          floor === option
                            ? typography.fontWeight.semibold
                            : typography.fontWeight.regular,
                      },
                    ]}>
                    {option}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={[styles.modalCloseButton, { borderTopColor: colors.border.light }]}
              onPress={() => setShowFloorPicker(false)}
              activeOpacity={0.7}>
              <Text style={[styles.modalCloseButtonText, { color: colors.text.secondary }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showBedChangeWarning}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBedChangeWarning(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View style={[styles.bedChangeModalContent, { backgroundColor: colors.background.primary }]}>
            <Text style={[styles.bedChangeModalTitle, { color: colors.text.primary }]}>
              Bed Count Change Warning
            </Text>
            
            <Text style={[styles.bedChangeModalMessage, { color: colors.text.secondary }]}>
              You are reducing beds from {originalBedCount} to {numberOfBeds}. This will affect the following tenants:
            </Text>

            {bedChangePreview?.affectedTenants && (
              <View style={[styles.tenantsList, { backgroundColor: colors.background.secondary }]}>
                {bedChangePreview.affectedTenants.map((tenant: any, index: number) => (
                  <View key={index} style={[styles.tenantItem, { borderBottomColor: colors.border.light }]}>
                    <View style={styles.tenantInfo}>
                      <Text style={[styles.tenantName, { color: colors.text.primary }]}>
                        {tenant.name}
                      </Text>
                      <Text style={[styles.tenantBed, { color: colors.text.tertiary }]}>
                        Bed #{tenant.bedNumber}
                      </Text>
                    </View>
                    <View style={[
                      styles.actionBadge,
                      { 
                        backgroundColor: tenant.action === 'relocate' 
                          ? colors.success[50] 
                          : colors.warning[50] 
                      }
                    ]}>
                      <Text style={[
                        styles.actionBadgeText,
                        { 
                          color: tenant.action === 'relocate' 
                            ? colors.success[700] 
                            : colors.warning[700] 
                        }
                      ]}>
                        {tenant.action === 'relocate' 
                          ? (tenant.location === 'same_room' 
                            ? '🔄 Same Room' 
                            : '🔄 Other Room')
                          : '⚠️ Will Vacate'}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {(bedChangePreview?.availableBedsInSameRoom !== undefined || 
              bedChangePreview?.availableBedsInProperty !== undefined) && (
              <View style={[styles.infoBox, { backgroundColor: colors.background.secondary }]}>
                {bedChangePreview?.availableBedsInSameRoom !== undefined && (
                  <Text style={[styles.infoText, { color: colors.text.secondary }]}>
                    📍 Available beds in same room: <Text style={{ fontWeight: typography.fontWeight.bold }}>
                      {bedChangePreview.availableBedsInSameRoom}
                    </Text>
                  </Text>
                )}
                {bedChangePreview?.availableBedsInProperty !== undefined && (
                  <Text style={[styles.infoText, { color: colors.text.secondary, marginTop: spacing.xs }]}>
                    🏠 Available beds in other rooms: <Text style={{ fontWeight: typography.fontWeight.bold }}>
                      {bedChangePreview.availableBedsInProperty}
                    </Text>
                  </Text>
                )}
              </View>
            )}

            <View style={styles.bedChangeModalActions}>
              <TouchableOpacity
                style={[styles.bedChangeModalButton, { backgroundColor: colors.background.secondary }]}
                onPress={() => {
                  setShowBedChangeWarning(false);
                  setNumberOfBeds(originalBedCount.toString()); // Reset to original
                }}
                disabled={loading}>
                <Text style={[styles.bedChangeModalButtonText, { color: colors.text.primary }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.bedChangeModalButton, { backgroundColor: colors.primary[500] }]}
                onPress={() => {
                  setShowBedChangeWarning(false);
                  performSubmit(); // Proceed with the update
                }}
                disabled={loading}>
                {loading ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={[styles.bedChangeModalButtonText, { color: colors.white }]}>
                    Confirm & Update
                  </Text>
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
  subtitle: {
    fontSize: typography.fontSize.sm,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  inputContainer: {
    marginBottom: spacing.xl,
  },
  label: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.sm,
  },
  fieldNote: {
    fontSize: typography.fontSize.xs,
    marginTop: spacing.xs,
    fontStyle: 'italic',
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
  bedChangeModalContent: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    margin: spacing.lg,
    maxHeight: '80%',
  },
  bedChangeModalTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  bedChangeModalMessage: {
    fontSize: typography.fontSize.md,
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  tenantsList: {
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.lg,
    maxHeight: 300,
  },
  tenantItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
  },
  tenantInfo: {
    flex: 1,
  },
  tenantName: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  tenantBed: {
    fontSize: typography.fontSize.sm,
  },
  actionBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  actionBadgeText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  infoBox: {
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
  },
  infoText: {
    fontSize: typography.fontSize.sm,
    textAlign: 'center',
  },
  bedChangeModalActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  bedChangeModalButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bedChangeModalButtonText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
});
