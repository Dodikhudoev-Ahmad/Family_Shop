import { useNavigation, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Text, View } from 'react-native';
import { ConfirmSheet } from '../components/forms';
import { SkeletonBlock } from '../components/Skeleton';
import { Button, Screen, StateMessage } from '../components/ui';
import type { SessionDto } from '../lib/api/types';
import { formatOrderDate } from '../lib/orders';
import { useAuth } from '../state/AuthContext';
import { useSessions } from '../state/useSessions';
import { fontSizes, fonts, radius, spacing } from '../theme/tokens';
import { useThemedStyles } from '../theme/ThemeContext';
import type { ColorTokens } from '../theme/tokens';

const styles = (c: ColorTokens) => ({
  list: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  intro: { color: c.textSecondary, fontFamily: fonts.body, fontSize: fontSizes.md },
  card: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: c.border },
  cardCurrent: { borderColor: c.accent },
  top: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: spacing.sm },
  name: { flexShrink: 1, color: c.text, fontFamily: fonts.bodySemibold, fontSize: fontSizes.md },
  badge: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: c.accentSoft },
  badgeText: { color: c.accent, fontFamily: fonts.bodySemibold, fontSize: fontSizes.xs },
  meta: { color: c.textSecondary, fontFamily: fonts.body, fontSize: fontSizes.sm },
  error: { color: c.error, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm },
});

type Pending = { kind: 'session'; session: SessionDto } | { kind: 'all' } | null;

/** "Devices": every live session, the current one marked, sign out one device or all of them (each asks first). */
export function DevicesScreen() {
  const s = useThemedStyles(styles);
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const { user, isLoading: authLoading, logout, logoutAll } = useAuth();
  const { sessions, error, loading, reload, revoke } = useSessions();
  const [pending, setPending] = useState<Pending>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigation.popToTop();
  }, [authLoading, user, navigation]);

  const label = (session: SessionDto) =>
    session.deviceName || (session.clientType === 'Web' ? t('mobile.deviceWeb') : t('mobile.deviceMobile'));

  const confirm = async () => {
    const action = pending;
    setPending(null);
    setActionError(null);
    if (!action) return;
    try {
      if (action.kind === 'all') await logoutAll();
      // Ending THIS device's session is a normal sign-out: the server revokes it and the app forgets its tokens.
      else if (action.session.isCurrent) await logout();
      else await revoke(action.session.sessionId);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : t('errors.failed'));
    }
  };

  if (loading && sessions === null) {
    return (
      <Screen>
        <View style={{ padding: spacing.md, gap: spacing.md }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {[0, 1].map((i) => (
            <SkeletonBlock key={i} height={110} style={{ borderRadius: radius.md }} />
          ))}
        </View>
      </Screen>
    );
  }
  if (error && sessions === null) {
    return (
      <Screen>
        <StateMessage message={error} actionLabel={t('mobile.retry')} onAction={() => void reload()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={sessions ?? []}
        keyExtractor={(session) => session.sessionId}
        contentContainerStyle={s.list}
        refreshing={loading}
        onRefresh={() => void reload()}
        ListHeaderComponent={<Text style={s.intro}>{t('mobile.devicesIntro')}</Text>}
        ListEmptyComponent={<StateMessage message={t('mobile.devicesEmpty')} />}
        renderItem={({ item }) => (
          <View style={[s.card, item.isCurrent && s.cardCurrent]}>
            <View style={s.top}>
              <Text style={s.name} numberOfLines={2}>
                {label(item)}
              </Text>
              {item.isCurrent ? (
                <View style={s.badge}>
                  <Text style={s.badgeText}>{t('mobile.thisDevice')}</Text>
                </View>
              ) : null}
            </View>
            <Text style={s.meta}>{item.clientType === 'Web' ? t('mobile.deviceWeb') : t('mobile.deviceMobile')}</Text>
            <Text style={s.meta}>{t('mobile.lastActive', { date: formatOrderDate(item.lastUsedAt) })}</Text>
            <Button
              variant="secondary"
              label={item.isCurrent ? t('mobile.signOutDevice') : t('mobile.signOutOther')}
              accessibilityLabel={`${item.isCurrent ? t('mobile.signOutDevice') : t('mobile.signOutOther')}: ${label(item)}`}
              onPress={() => setPending({ kind: 'session', session: item })}
            />
          </View>
        )}
        ListFooterComponent={
          <View style={{ gap: spacing.sm }}>
            {actionError ? (
              <Text style={s.error} accessibilityRole="alert">
                {actionError}
              </Text>
            ) : null}
            {(sessions ?? []).length > 0 ? <Button label={t('mobile.logoutAll')} variant="secondary" onPress={() => setPending({ kind: 'all' })} /> : null}
          </View>
        }
      />

      {pending ? (
        <ConfirmSheet
          title={
            pending.kind === 'all'
              ? t('mobile.logoutAllTitle')
              : pending.session.isCurrent
                ? t('mobile.signOutThisTitle')
                : t('mobile.signOutOtherTitle', { name: label(pending.session) })
          }
          description={pending.kind === 'all' ? t('mobile.logoutAllText') : pending.session.isCurrent ? t('header.logoutDescription') : t('mobile.signOutOtherText')}
          confirmLabel={pending.kind === 'all' ? t('mobile.logoutAll') : t('mobile.signOut')}
          onConfirm={() => void confirm()}
          onCancel={() => setPending(null)}
        />
      ) : null}
    </Screen>
  );
}
