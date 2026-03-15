#!/bin/bash

echo "=== ПРОВЕРКА МОДУЛЯ РАСПИСАНИЯ ==="
echo ""

BOT_DIR="/opt/kvantik-bot"

echo "1. Файл установлен?"
if [ -f $BOT_DIR/modules/scheduleManager.js ]; then
  echo "   ✅ Файл существует"
  
  echo ""
  echo "2. Версия модуля:"
  grep "version:" $BOT_DIR/modules/scheduleManager.js | head -1
  
  echo ""
  echo "3. Команды модуля:"
  grep "'/set_schedule_path':" $BOT_DIR/modules/scheduleManager.js
  
else
  echo "   ❌ Файл НЕ найден"
  echo ""
  echo "   Файлы в modules/:"
  ls -1 $BOT_DIR/modules/*.js | tail -5
fi

echo ""
echo "4. Логи загрузки модуля:"
sudo journalctl -u kvantik-bot -n 100 --no-pager | grep -i "schedule\|расписан"

echo ""
echo "5. Список загруженных модулей:"
sudo journalctl -u kvantik-bot --since "5 minutes ago" --no-pager | grep "MODULE_LOADER.*Loaded"

echo ""
echo "6. Проверка синтаксиса:"
if [ -f $BOT_DIR/modules/scheduleManager.js ]; then
  node --check $BOT_DIR/modules/scheduleManager.js && echo "   ✅ Синтаксис OK" || echo "   ❌ Ошибка синтаксиса"
fi

