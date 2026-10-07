# Отчёт: п. 8c — шапка пропадала внизу страницы на телефоне [FE]

Дата: 2026-10-07. Только `frontend/` (+ docs); backend, mobile и прод не тронуты, не пушилось.

## Итог
На телефоне и планшете (≤ 1024 px) шапка (градиент, поиск, табы) теперь всегда на экране, в том числе внизу страницы. На десктопе поведение прежнее.

## Причина
Sticky не был сломан: `.header-stack` — `position: sticky; top: 0; z-index: 100`, у предков (`html`, `body`, `.app-shell`) нет `overflow` кроме `overflow-x: clip`, нет `transform`/`contain`/`height: 100%`, скроллится `window`. Шапку убирал сам «умный» хедер: `HeaderVisibilityContext` при прокрутке вниз ставит `header-stack--hidden` (`translateY(-100%)`). Замер до правки (320 px, колесо вниз до конца): `top = −104`, `hidden = true` на главной, каталоге, товаре, корзине и профиле.

## Что изменено
- [HeaderVisibilityContext.tsx](../../frontend/src/context/HeaderVisibilityContext.tsx): при `(max-width: 1024px)` скрытие не включается (`canTuckAway`); без `matchMedia` (jsdom) поведение прежнее.
- docs: [Design.md](../Design.md), п. 2 (правился первым); `CLAUDE.md` §6 — пометка «только > 1024 px» (решение владельца).
- Тесты: [HeaderVisibilityContext.test.tsx](../../frontend/src/context/HeaderVisibilityContext.test.tsx) (узкий экран не скрывает), [homeCss.test.ts](../../frontend/src/styles/homeCss.test.ts) («sticky header»: `html`/`body` без `overflow: hidden|auto|scroll`, `.header-stack` sticky/top 0/z-index 100, у `.app-shell` нет overflow/transform/contain).

## Решения
- Выбрано отключить скрытие, а не лечить CSS: чинить было нечего. Это отступление от `CLAUDE.md` §6 «умный header» на телефоне — по вашей постановке «должна быть sticky». Если нужен возврат, достаточно убрать условие `canTuckAway`.
- `z-index: 100` и нижняя панель/`--tabbar-clearance` не менялись.
- Safe-area сверху: `viewport-fit`/inset не добавлялись (вне задачи, в PWA-режиме не используется).

## Тесты
`vitest` 455 passed (48 файлов), `tsc -b` чисто, `bash .githooks/test-pre-commit.sh` 12/12.

## Живая проверка
Vite + headless Chromium, API замокан (24 товара), колесо вниз до конца и `scrollTo(400)`: главная, каталог, товар, корзина, профиль × варианты a/b × светлая/тёмная × 320/375/430/768. Критерий: `getBoundingClientRect().top == 0` внизу и в середине. Результат — в разделе ниже.

**Результат:** 80 комбинаций (5 страниц × варианты a/b × светлая/тёмная × 320/375/430/768): внизу страницы и в середине `top = 0`, класс `header-stack--hidden` не ставится, прокрутка реально доходила до конца. До правки — `top = −104` везде. Просмотрены кадры: низ главной 375 и 768 (вариант a, светлая), середина главной 375 (вариант b, тёмная) — [screenshots-2026-10-07-sticky-8c/](screenshots-2026-10-07-sticky-8c/). Каталог, товар и корзина на 375 просмотрены в рабочем каталоге (без сохранения).
Замечание: в замоканном API категорий нет, поэтому полоса табов на каталоге в кадрах пустая; на бесконечный режим это не влияет.
