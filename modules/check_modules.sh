#!/bin/bash

echo "=== ПРОВЕРКА МОДУЛЕЙ ==="
echo ""

BOT_DIR="/opt/kvantik-bot"

echo "1. Список модулей в папке:"
ls -1 $BOT_DIR/modules/*.js 2>/dev/null | while read f; do
  name=$(basename "$f")
  echo "   - $name"
done

echo ""
echo "2. Проверка attendance.js:"
if [ -f $BOT_DIR/modules/attendance.js ]; then
  version=$(grep "version:" $BOT_DIR/modules/attendance.js | head -1)
  echo "   ✅ Файл существует"
  echo "   $version"
  
  if grep -q "getModuleFunc" $BOT_DIR/modules/attendance.js; then
    echo "   ✅ getModuleFunc найдена"
  else
    echo "   ❌ getModuleFunc НЕ найдена"
  fi
  
  if grep -q "sendToAllAdmins" $BOT_DIR/modules/attendance.js; then
    echo "   ✅ sendToAllAdmins найдена"
  else
    echo "   ❌ sendToAllAdmins НЕ найдена"
  fi
else
  echo "   ❌ Файл НЕ найден"
fi

echo ""
echo "3. Проверка adminNotifications.js:"
if [ -f $BOT_DIR/modules/adminNotifications.js ]; then
  echo "   ✅ Файл существует"
  
  if grep -q "getAllAdminIds" $BOT_DIR/modules/adminNotifications.js; then
    echo "   ✅ getAllAdminIds найдена"
  else
    echo "   ❌ getAllAdminIds НЕ найдена"
  fi
else
  echo "   ❌ Файл НЕ найден"
fi

echo ""
echo "4. Проверка moduleLoader.js:"
if [ -f $BOT_DIR/moduleLoader.js ]; then
  echo "   ✅ Файл существует"
  
  if grep -q "getModule" $BOT_DIR/moduleLoader.js; then
    echo "   ✅ getModule найдена в loader"
  else
    echo "   ❌ getModule НЕ найдена в loader"
  fi
  
  echo ""
  echo "   Передаваемый context:"
  grep -A 10 "const context = {" $BOT_DIR/moduleLoader.js | head -15
else
  echo "   ❌ Файл НЕ найден"
fi

echo ""
echo "5. Проверка rfidManager.js:"
if [ -f $BOT_DIR/modules/rfidManager.js ]; then
  echo "   ✅ Файл существует"
  
  if grep -q "execPromise" $BOT_DIR/modules/rfidManager.js; then
    echo "   ✅ execPromise найдена"
  else
    echo "   ❌ execPromise НЕ найдена"
  fi
else
  echo "   ❌ Файл НЕ найден"
fi
