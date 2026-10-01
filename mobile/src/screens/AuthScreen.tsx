import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';
import { AuthForm } from '../components/AuthForm';
import { Screen } from '../components/ui';
import type { CartStackParamList } from '../navigation/types';
import { useAuth } from '../state/AuthContext';
import { spacing } from '../theme/tokens';

/** Sign-in screen opened from the checkout: once signed in it goes straight on to the checkout. */
export function AuthScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<CartStackParamList>>();
  const route = useRoute<RouteProp<CartStackParamList, 'Auth'>>();
  const { user } = useAuth();
  const next = route.params?.next;

  // Opened on top of the checkout: signing in just goes back to it, which now sees the user
  // (replacing instead would leave a second checkout underneath).
  useEffect(() => {
    if (user) navigation.goBack();
  }, [user, navigation]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.md }} keyboardShouldPersistTaps="handled">
        <AuthForm intro={next === 'Checkout' ? t('auth.intro') : undefined} />
      </ScrollView>
    </Screen>
  );
}
