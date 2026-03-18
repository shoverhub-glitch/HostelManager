import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { ChevronDown, Check } from 'lucide-react-native';
import { spacing, radius, shadows, colors  } from '@/theme';
import { typography,textPresets } from '@/theme/typography';
import { useTheme } from '@/context/ThemeContext';
import { useProperty } from '@/context/PropertyContext';
import useResponsiveLayout from '@/hooks/useResponsiveLayout';

export default function PropertyDropdown() {
  const { colors } = useTheme();
  const { properties, selectedProperty, switchProperty } = useProperty();
  const { isTablet, width, modalMaxWidth } = useResponsiveLayout();
  const [modalVisible, setModalVisible] = useState(false);
  const computedModalWidth = Math.min(modalMaxWidth, width - spacing.xl * 2);

  if (!selectedProperty || properties.length <= 1) {
    return null;
  }

  return (
    <>
      <TouchableOpacity
        style={[
          styles.container,
          { backgroundColor: colors.background.secondary, borderColor: colors.border.light },
        ]}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.7}>
        <View style={styles.content}>
          <Text style={[styles.label, { color: colors.text.secondary }]}>Switch Property</Text>
          <Text style={[styles.selected, { color: colors.text.primary }]} numberOfLines={1}>
            {selectedProperty.name}
          </Text>
        </View>
        <ChevronDown size={16} color={colors.text.tertiary} />
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}>
        <View style={[styles.overlay, isTablet && styles.overlayTablet]}>
          <View
            style={[
              styles.modalContainer,
              isTablet && styles.modalContainerTablet,
              { backgroundColor: colors.white },
              isTablet && { width: computedModalWidth },
            ]}>
            <View style={[styles.header, { borderBottomColor: colors.border.light }]}>
              <Text style={[styles.headerTitle, { color: colors.text.primary }]}>
                Select Property
              </Text>
            </View>

            <ScrollView style={[styles.scrollView, isTablet && styles.scrollViewTablet]}>
              {properties.map((property) => (
                <TouchableOpacity
                  key={property.id}
                  style={[
                    styles.propertyOption,
                    {
                      borderBottomColor: colors.border.light,
                      backgroundColor:
                        selectedProperty.id === property.id
                          ? colors.primary[50]
                          : colors.white,
                    },
                  ]}
                  onPress={() => {
                    switchProperty(property.id);
                    setModalVisible(false);
                  }}
                  activeOpacity={0.7}>
                  <View style={styles.optionContent}>
                    <Text style={[styles.propertyName, { color: colors.text.primary }]}>
                      {property.name}
                    </Text>
                    <Text style={[styles.propertyAddress, { color: colors.text.secondary }]}>
                      {property.address}
                    </Text>
                  </View>
                  {selectedProperty.id === property.id && (
                    <Check size={20} color={colors.primary[500]} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={[styles.closeButton, { borderTopColor: colors.border.light }]}
              onPress={() => setModalVisible(false)}
              activeOpacity={0.7}>
              <Text style={[styles.closeButtonText, { color: colors.text.secondary }]}>
                Close
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  content: {
    flex: 1,
    marginRight: spacing.md,
  },
  label: {
    ...textPresets.label,
    marginBottom: spacing.xs,
  },
  selected: {
    ...textPresets.bodyMedium,
    color: colors.text.primary,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  overlayTablet: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  modalContainer: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '70%',
    ...shadows.xl,
  },
  modalContainerTablet: {
    width: '100%',
    maxHeight: '80%',
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  header: {
    padding: spacing.lg,
    borderBottomWidth: 1,
  },
  headerTitle: {
    ...textPresets.h4,
    color: colors.text.primary,
    textAlign: 'center',
  },
  scrollView: {
    maxHeight: 400,
  },
  scrollViewTablet: {
    maxHeight: 520,
  },
  propertyOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  optionContent: {
    flex: 1,
    marginRight: spacing.md,
  },
  propertyName: {
    ...textPresets.bodyMedium,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  propertyAddress: {
    ...textPresets.caption,
    color: colors.text.secondary,
  },
  closeButton: {
    padding: spacing.lg,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  closeButtonText: {
    ...textPresets.button,
    color: colors.text.secondary,
  },
});
