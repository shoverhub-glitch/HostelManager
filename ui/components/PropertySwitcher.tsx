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

export default function PropertySwitcher() {
  const { colors } = useTheme();
  const { properties, selectedProperty, switchProperty } = useProperty();
  const [modalVisible, setModalVisible] = useState(false);

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
        <View style={styles.overlay}>
          <View style={[styles.modalContainer, { backgroundColor: colors.background.secondary }]}>
            <View style={[styles.header, { borderBottomColor: colors.border.light }]}>
              <Text style={[styles.headerTitle, { color: colors.text.primary }]}>
                Switch Property
              </Text>
            </View>

            <ScrollView style={styles.scrollView}>
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
  modalContainer: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '75%',
    ...shadows.xl,
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
