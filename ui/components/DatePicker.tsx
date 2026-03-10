import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { spacing, typography, radius } from '@/theme';
import { useTheme } from '@/context/ThemeContext';

interface DatePickerProps {
  value: string;
  onChange: (date: string) => void;
  label: string;
  disabled?: boolean;
  required?: boolean;
  restrictToLast30Days?: boolean;
  restrictToNext30Days?: boolean;
}

export default function DatePicker({
  value,
  onChange,
  label,
  disabled = false,
  required = false,
  restrictToLast30Days = false,
  restrictToNext30Days = false,
}: DatePickerProps) {
  const { colors } = useTheme();
  const [showModal, setShowModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(
    value ? new Date(value) : new Date()
  );

  // Calculate date range: today and 30 days before (if enabled) OR 30 days ahead (if enabled)
  let today: Date | undefined;
  let minDate: Date | undefined;
  let maxDate: Date | undefined;
  
  if (restrictToLast30Days) {
    today = new Date();
    today.setHours(0, 0, 0, 0);
    minDate = new Date(today);
    minDate.setDate(today.getDate() - 29); // 30 days including today
    maxDate = today;
  } else if (restrictToNext30Days) {
    today = new Date();
    today.setHours(0, 0, 0, 0);
    minDate = today;
    maxDate = new Date(today);
    maxDate.setDate(today.getDate() + 30); // 30 days from today
  }

  // Helper to check if a date is in range
  const isDateInRange = (date: Date) => {
    if (!restrictToLast30Days && !restrictToNext30Days) return true;
    if (!minDate || !maxDate) return true;
    return date >= minDate && date <= maxDate;
  };

  const formatDisplayDate = (dateString: string): string => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const year = date.getFullYear();
    const month = months[date.getMonth()];
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getDaysInMonth = (date: Date): number => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date): number => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  // Allow navigation to any month/year, but only enable selection for valid dates
  const handlePreviousMonth = () => {
    const newDate = new Date(selectedDate);
    newDate.setMonth(newDate.getMonth() - 1);
    setSelectedDate(newDate);
  };

  const handleNextMonth = () => {
    const newDate = new Date(selectedDate);
    newDate.setMonth(newDate.getMonth() + 1);
    setSelectedDate(newDate);
  };

  const handleSelectDate = (day: number) => {
    const newDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), day);
    if (!isDateInRange(newDate)) return;
    const isoString = newDate.toISOString();
    onChange(isoString);
    setShowModal(false);
  };

  const renderCalendar = () => {
    const daysInMonth = getDaysInMonth(selectedDate);
    const firstDay = getFirstDayOfMonth(selectedDate);
    const days: (number | null)[] = [];

    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }

    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }

    const currentValue = value ? new Date(value) : null;
    const isSelectedMonth =
      currentValue &&
      currentValue.getMonth() === selectedDate.getMonth() &&
      currentValue.getFullYear() === selectedDate.getFullYear();

    return (
      <View style={styles.calendarGrid}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <View key={day} style={styles.dayHeader}>
            <Text style={[styles.dayHeaderText, { color: colors.text.secondary }]}>
              {day}
            </Text>
          </View>
        ))}
        {days.map((day, index) => {
          if (day === null) {
            return <View key={`empty-${index}`} style={styles.dayCell} />;
          }

          const cellDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), day);
          const isSelected = isSelectedMonth && currentValue?.getDate() === day;
          const isDisabled = !isDateInRange(cellDate);

          return (
            <TouchableOpacity
              key={day}
              style={[styles.dayCell,
                isSelected && {
                  backgroundColor: colors.primary[500],
                  borderRadius: radius.md,
                },
                isDisabled && { opacity: 0.3 }
              ]}
              onPress={() => handleSelectDate(day)}
              activeOpacity={isDisabled ? 1 : 0.7}
              disabled={isDisabled}
            >
              <Text
                style={[styles.dayText,
                  {
                    color: isSelected ? colors.white : colors.text.primary,
                    fontWeight: isSelected ? typography.fontWeight.bold : typography.fontWeight.regular,
                  },
                  isDisabled && { color: colors.text.tertiary }
                ]}
              >
                {day}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const currentMonth = months[selectedDate.getMonth()];
  const currentYear = selectedDate.getFullYear();

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.text.primary }]}>
        {label}
        {required && <Text style={{ color: colors.danger[500] }}> *</Text>}
      </Text>
      <TouchableOpacity
        style={[
          styles.input,
          {
            backgroundColor: disabled ? colors.background.tertiary : colors.background.secondary,
            borderColor: colors.border.medium,
            opacity: disabled ? 0.6 : 1,
          },
        ]}
        onPress={() => !disabled && setShowModal(true)}
        activeOpacity={0.7}
        disabled={disabled}>
        <Text
          style={[
            styles.inputText,
            {
              color: value ? colors.text.primary : colors.text.tertiary,
            },
          ]}>
          {value ? formatDisplayDate(value) : 'Select date'}
        </Text>
      </TouchableOpacity>

      <Modal
        visible={showModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: colors.background.secondary }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border.light }]}>
              <TouchableOpacity onPress={handlePreviousMonth} activeOpacity={0.7}>
                <ChevronLeft size={24} color={colors.primary[500]} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: colors.text.primary }]}>
                {currentMonth} {currentYear}
              </Text>
              <TouchableOpacity onPress={handleNextMonth} activeOpacity={0.7}>
                <ChevronRight size={24} color={colors.primary[500]} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScrollView}>
              {renderCalendar()}
            </ScrollView>

            <TouchableOpacity
              style={[styles.modalCloseButton, { borderTopColor: colors.border.light }]}
              onPress={() => setShowModal(false)}
              activeOpacity={0.7}>
              <Text style={[styles.modalCloseButtonText, { color: colors.text.secondary }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.xl,
  },
  label: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.sm,
  },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    gap: spacing.sm,
  },
  inputText: {
    fontSize: typography.fontSize.md,
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  modalContainer: {
    borderRadius: radius.lg,
    width: '100%',
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  modalScrollView: {
    padding: spacing.lg,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayHeader: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  dayHeaderText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: {
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
});
