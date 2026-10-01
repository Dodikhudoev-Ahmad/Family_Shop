# Family Shop — мобильное приложение (Expo)

React Native (Expo SDK 57, managed workflow, TypeScript strict). Использует тот же backend, что и сайт: `/api/v1/*`.

## Запуск

```bash
cd mobile
npm install
npx expo start          # откройте в Expo Go (QR-код)
```

По умолчанию приложение ходит на боевой API. Для локального бэкенда скопируйте `.env.example` в `.env.local`
и укажите адрес компьютера в сети (телефон не видит `localhost`):

```
EXPO_PUBLIC_API_URL=http://192.168.1.5:5280/api/v1
```

Release-сборка отказывается работать с не-`https://` адресом.

## Проверки

```bash
npm run typecheck       # tsc --noEmit
npm test                # unit-тесты (клиент API, токены, deviceId, i18n, тема, корзина, охранные проверки исходников)

# контрактный тест НАСТОЯЩЕГО клиента против настоящего бэкенда (регистрирует пользователей — только локальный бэкенд!)
FS_LIVE_API=http://localhost:5280/api/v1 npx jest __tests__/integration
```

## Авторизация (контракт с backend, см. CLAUDE.md §3.4)

- Эндпоинты `/api/v1/auth/mobile/{register,login,refresh,logout}`. Refresh-токен приходит в **теле** JSON.
- **Токены только в `expo-secure-store`** (`src/lib/storage/secureStorage.ts`, режим `WHEN_UNLOCKED_THIS_DEVICE_ONLY`).
  Access-токен (15 мин) живёт только в памяти. AsyncStorage используется лишь для языка, темы, корзины и избранного.
- `deviceId` — UUID, создаётся один раз при первом запуске и хранится в secure store; отправляется с каждым login/register/refresh/logout.
  Сервер хранит только его хеш; refresh с другого устройства отзывает сессию.
- Один общий refresh на всё приложение (`src/lib/api/client.ts`): сервер ротирует refresh-токен при каждом использовании,
  а повтор уже обменянного токена считает кражей и отзывает всю сессию — параллельные refresh недопустимы.
- Сессия отвергнута (401/403) — токены стираются, пользователь разлогинивается; сеть/5xx/429 — сессия сохраняется.
- Токены, пароли и тела запросов никогда не логируются (в `src` нет `console.*`, это проверяет тест).
- Заголовок `X-Client-Type` не используется.

## Структура

```
App.tsx                  провайдеры, шрифты, тема/язык
src/config.ts            адрес API (https в release)
src/lib/api/             клиент, токены, эндпоинты, DTO
src/lib/storage/         secure store (+ in-memory заглушка для web-превью)
src/i18n/                ru/kk/en (словари из frontend + раздел mobile), язык в AsyncStorage, дефолт ru
src/theme/               дизайн-токены (терракота #C17A54, светлая/тёмная, отступы, шрифты), дефолт light
src/state/               Auth, Categories, Cart, Favorites
src/navigation/          таб-бар + стеки (Каталог → Категория → Товар → Корзина → Checkout)
src/screens/             экраны
```

Веб-превью (`npx expo start --web`) нужно только для разработки: secure store на web не существует, поэтому секреты там живут в памяти.

## Пока не сделано (следующий шаг)

EAS Build, push-уведомления, иконка и splash (сейчас шаблонные).
