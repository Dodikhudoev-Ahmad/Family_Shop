#!/bin/bash
# Тест хука .githooks/pre-commit: на временном репозитории проверяет, что секреты блокируются, а обычный код и плейсхолдеры проходят.
# Запуск из корня репозитория: bash .githooks/test-pre-commit.sh. Код возврата 0 — все проверки прошли, 1 — есть провал.
# Тестовые «секреты» собираются из частей на лету и в репозиторий не попадают (каталог .githooks хук и так не проверяет).

HOOK="$(cd "$(dirname "$0")" && pwd)/pre-commit"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
cd "$TMP" || exit 1
git init -q . && git config user.email t@example.com && git config user.name test

PASSED=0
FAILED=0

# check <ожидание: block|pass> <имя> <содержимое файла>
check() {
  local expect="$1" name="$2" content="$3" rc
  printf '%s\n' "$content" > sample.txt
  git add sample.txt
  bash "$HOOK" > /dev/null 2>&1
  rc=$?
  git reset -q
  if { [ "$expect" = block ] && [ "$rc" -eq 1 ]; } || { [ "$expect" = pass ] && [ "$rc" -eq 0 ]; }; then
    PASSED=$((PASSED + 1))
  else
    FAILED=$((FAILED + 1))
    echo "ПРОВАЛ: $name (ожидали $expect, код хука $rc)" >&2
  fi
}

# Должны блокироваться
check block "пароль в строке подключения" "Host=db;$(printf 'Pass')word=Hunter2Hunter2"
check block "ключ подписи JWT" "$(printf 'Secret')Key = abcdefgh12345678"
check block "ключ API" "$(printf 'api')_key: ABCDEFGH12345678"
check block "строка postgresql:// с паролем" "$(printf 'postgre')sql://admin:s3cretpw@db.internal.local/app"
check block "ключ вида sk-" "key is $(printf 's')k-$(printf 'A1b2C3d4E5f6G7h8I9j0K1l2')"
check block "заголовок JWT" "$(printf 'ey')JhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
check block "длинная случайная строка" "x $(printf 'a8Xk2Qm9Zp4Lw7Rt1Vb6Ny3Hc5Jd0Fg8Se2Uo4Ik9Mq')"

# Должны проходить
check pass "обычный код" "var total = price * quantity;"
check pass "плейсхолдер CHANGE_ME" "$(printf 'Pass')word=CHANGE_ME"
check pass "слово token в коде" "const token = getToken();"
check pass "длинный идентификатор CamelCase" "public class ThisIsAVeryLongIdentifierNameForOrderStockTests {}"
check pass "длинное имя файла через дефисы" "see 2026-10-04-admin-cancel-shipped-order-return-stock-report.md"

echo "Хук pre-commit: прошло $PASSED, провалено $FAILED"
[ "$FAILED" -eq 0 ]
