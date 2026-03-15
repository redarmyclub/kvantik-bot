#!/bin/bash

echo "=== ТЕСТ СИСТЕМЫ УВЕДОМЛЕНИЙ ==="
echo ""

BOT_DIR="/opt/kvantik-bot"

echo "1. Проверка файла данных adminNotifications:"
if [ -f $BOT_DIR/data/modules/adminNotifications.json ]; then
  echo "   ✅ Файл данных существует"
  echo "   Содержимое:"
  cat $BOT_DIR/data/modules/adminNotifications.json | python3 -m json.tool 2>/dev/null || cat $BOT_DIR/data/modules/adminNotifications.json
else
  echo "   ❌ Файл данных НЕ существует"
  echo "   Ищем в других местах:"
  find $BOT_DIR -name "adminNotifications.json" 2>/dev/null
fi

echo ""
echo "2. Проверка инициализации модулей в bot.js:"
if [ -f $BOT_DIR/bot.js ]; then
  echo "   ✅ bot.js найден"
  echo ""
  echo "   Строки с 'getModule':"
  grep -n "getModule" $BOT_DIR/bot.js | head -10
  
  echo ""
  echo "   Строки с 'context':"
  grep -n "const context = {" $BOT_DIR/bot.js -A 10 | head -20
else
  echo "   ❌ bot.js НЕ найден"
fi

echo ""
echo "3. Логи бота (последние упоминания модулей):"
sudo journalctl -u kvantik-bot -n 50 --no-pager | grep -i "модуль\|module\|admin\|attendance"

