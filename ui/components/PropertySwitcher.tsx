import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native';
import { Building2, ChevronDown, Check } from 'lucide-react-native';
import { spacing, typography, radius, shadows } from '@/theme';
import { useTheme } from '@/context/ThemeContext';
import { useProperty } from '@/context/PropertyContext';
import useResponsiveLayout from '@/hooks/useResponsiveLayout';

export default function PropertySwitcher() {
  const { colors } = useTheme();
  const { properties, selectedProperty, switchProperty } = useProperty();
  const { isTablet, width, modalMaxWidth } = useResponsiveLayout();
  const [modalVisible, setModalVisible] = useState(false);
  const computedModalWidth = Math.min(modalMaxWidth, width - spacing.xl * 2);

  if (!selectedProperty) {
    return null;
  }

  return (
    <>
      <TouchableOpacity
        style={[styles.container, { backgroundColor: colors.background.secondary, borderColor: colors.border.light }]}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.7}>
        <Building2 size={20} color={colors.primary[500]} />
        <View style={styles.textContainer}>
          <Text style={[styles.propertyName, { color: colors.text.primary }]} numberOfLines={1}>
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
              { backgroundColor: colors.background.secondary },
              isTablet && { width: computedModalWidth },
            ]}>
            <View style={[styles.header, { borderBottomColor: colors.border.light }]}>
              <Text style={[styles.headerTitle, { color: colors.text.primary }]}>
                Switch Property
              </Text>
            </View>

            <ScrollView style={[styles.scrollView, isTablet && styles.scrollViewTablet]}>
              {properties.map((property) => (
                <TouchableOpacity
                  key={property.id}
                  style={[
                    styles.propertyItem,
                    { borderBottomColor: colors.border.light },
                  ]}
                  onPress={() => {
                    switchProperty(property.id);
                    setModalVisible(false);
                  }}
                  activeOpacity={0.7}>
                  <View style={styles.propertyInfo}>
                    <Text style={[styles.propertyItemName, { color: colors.text.primary }]}>
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
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  textContainer: {
    flex: 1,
    marginLeft: spacing.sm,
    marginRight: spacing.sm,
  },
  propertyName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
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
    maxHeight: '75%',
    ...shadows.xl,
  },
  modalContainerTablet: {
    width: '100%',
    maxHeight: '80%',
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  header: {
    padding: spacing.md,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    textAlign: 'center',
  },
  scrollView: {
    maxHeight: '60%',
  },
  scrollViewTablet: {
    maxHeight: 520,
  },
  propertyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1,
  },
  propertyInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  propertyItemName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  propertyAddress: {
    fontSize: typography.fontSize.xs,
  },
  closeButton: {
    padding: spacing.md,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
});
