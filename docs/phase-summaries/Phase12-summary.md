# Фаза 12. Домен и деплой (familyshop10.kz) [FULL]

Ретро-отчёт, восстановлен по `git log` и `claude.md` (разделы 1, 3.3, 3.4). Дата: 2026-10-03 (серия `92bbf0b` … `00cb8bd`). Связанные фазы 10–11 (ForwardLimit, часовой пояс) вошли сюда в части, касающейся деплоя.
Предложенный тег: `v0.12-domain` на `00cb8bd`.

## Что построено

- CORS и Origin-проверка из конфига `Cors:AllowedOrigins` (+ www/корень/старый railway), `AllowedHosts` для api.familyshop10.kz — `92bbf0b`.
- Refresh-cookie: `Domain=.familyshop10.kz; Secure; HttpOnly; SameSite=Strict`; Development — Lax без Domain; старый railway-хост — прежний `SameSite=None` — `9463443`.
- Публичный URL загрузок `Uploads:PublicBaseUrl`, идемпотентный перенос хоста старых URL на старте — `f4ba60b`.
- Адрес API из окружения у сайта (`VITE_API_URL`, `robots.txt`, `sitemap.xml`) — `4ff042a`, `de52242`; у mobile — `1f835f8`.
- Документация переезда — `9a273f8`.
- `AllowedHosts` из конфига/переменной, тесты фильтра Host — `ac261dc`.
- `Cors__AllowedOrigins` строкой через запятую — `00cb8bd`.
- Раньше в тот же день: ForwardedHeaders за прокси Railway (`89b7758`), Idempotency-Key (`890ce81`, `ac29f97`), часовой пояс магазина (`bb0d3c9`, `1bdae90`), Volume и `Uploads__Path` (2026-10-02, `d6d70c2`, `cbf4bed`).

## Ключевые файлы

- `backend/Api/Security/RefreshCookiePolicy.cs`, `CorsOrigins.cs`, `ForwardedHeadersSetup.cs`
- `backend/Api/appsettings.Production.json`
- `backend/Infrastructure/Persistence/UploadUrlNormalizer.cs`
- `backend/Application/Common/StoreClock.cs`

## Миграции

`AddIdempotencyKeys` (идемпотентная). Для домена миграций нет.

## Архитектурные решения

- Решение о cookie принимается по хосту запроса, поэтому `Delete()` шлёт те же атрибуты, что и `Append()`.
- Список доверенных прокси очищен (адрес прокси Railway не фиксирован); опционально закрепляется `ForwardedHeaders__KnownNetworks__0`.
- Конфиг через переменные окружения без релиза (`AllowedHosts`, `Cors__*`).

## Известные ограничения

- Старые адреса Railway ещё работают; ветку `SameSite=None` и старые origin убрать по команде заказчика.
- Подмена `X-Forwarded-For` на самой платформе не проверена (`TODO.md`, п. 3).
- Заголовки безопасности на хосте фронтенда не настроены (`TODO.md`).
- Volume на Railway подключается вручную; TODO: уточнить, подключён ли на проде.
