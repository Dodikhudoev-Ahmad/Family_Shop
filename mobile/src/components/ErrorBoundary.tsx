import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import i18n from '../i18n';
import { fontSizes, fonts, MIN_TOUCH_TARGET, palettes, radius, spacing } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
  /** Bumped on every restart so the whole subtree below is rebuilt from scratch (and rehydrates from storage). */
  attempt: number;
}

function Fallback({ onRestart }: { onRestart: () => void }) {
  // Colours from the active theme when it is available; the boundary must still render if the theme itself is what broke.
  let colors = palettes.light;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- guarded: a missing provider must not crash the crash screen
    colors = useTheme().colors;
  } catch {
    // no ThemeProvider above: keep the default palette
  }
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md, backgroundColor: colors.bg }}>
      <Text accessibilityRole="header" style={{ color: colors.text, fontFamily: fonts.heading, fontSize: fontSizes.xxl, textAlign: 'center' }}>
        {i18n.t('errors.boundaryTitle')}
      </Text>
      <Text style={{ color: colors.textSecondary, fontFamily: fonts.body, fontSize: fontSizes.md, textAlign: 'center' }}>{i18n.t('mobile.boundaryText')}</Text>
      <View
        accessibilityRole="button"
        accessibilityLabel={i18n.t('mobile.restart')}
        onStartShouldSetResponder={() => true}
        onResponderRelease={onRestart}
        style={{ minHeight: MIN_TOUCH_TARGET + 4, minWidth: 200, borderRadius: radius.md, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg }}
      >
        <Text style={{ color: colors.white, fontFamily: fonts.bodySemibold, fontSize: fontSizes.md }}>{i18n.t('mobile.restart')}</Text>
      </View>
    </View>
  );
}

/**
 * Last line of defence: an error thrown while rendering shows "Something went wrong" with a restart button instead of a
 * blank screen. Nothing about the error (message, stack, component names) is shown to the user - it stays with the developer.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, attempt: 0 };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Deliberately empty: no console output (it could carry tokens in a message) and no reporter is wired up yet.
  }

  private restart = () => this.setState((s) => ({ failed: false, attempt: s.attempt + 1 }));

  render() {
    if (this.state.failed) return <Fallback onRestart={this.restart} />;
    return <View key={this.state.attempt} style={{ flex: 1 }}>{this.props.children}</View>;
  }
}
