import { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { RefreshCw, AlertTriangle } from 'lucide-react-native';
import { spacing, radius, shadows } from '@/theme';
import { typography ,textPresets} from '@/theme/typography';
import { ThemeContext } from '@/context/ThemeContext';
import { colors, lightTheme } from '@/theme/colors';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  static contextType = ThemeContext;

  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    const colors = (this.context as any)?.colors ?? lightTheme;

    if (this.state.hasError) {
      return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
          <View style={styles.content}>
            <View style={[styles.iconContainer, { backgroundColor: colors.danger[100] }]}>
              <AlertTriangle size={48} color={colors.danger[500]} />
            </View>
            
            <Text style={[styles.title, { color: colors.text.primary }]}>Something went wrong</Text>
            <Text style={[styles.message, { color: colors.text.secondary }]}> 
              The application encountered an unexpected error.
            </Text>

            {this.state.error && (
              <View style={[styles.errorDetails, { backgroundColor: colors.background.secondary }]}>
                <Text style={[styles.errorText, { color: colors.text.secondary }]}>{this.state.error.toString()}</Text>
              </View>
            )}
            <TouchableOpacity style={[styles.button, { backgroundColor: colors.primary[500] }]} onPress={this.handleReset}>
              <RefreshCw size={20} color={colors.white} style={styles.buttonIcon} />
              <Text style={[styles.buttonText, { color: colors.white }]}>Try Again</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    ...textPresets.h2,
    color: colors.text.primary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  message: {
    ...textPresets.body,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  errorDetails: {
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.xl,
    width: '100%',
  },
  errorText: {
    ...textPresets.hint,
    fontFamily: 'monospace',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.full,
    ...shadows.sm,
  },
  buttonIcon: {
    marginRight: spacing.sm,
  },
  buttonText: {
    ...textPresets.button,
    color: colors.white,
  },
});
