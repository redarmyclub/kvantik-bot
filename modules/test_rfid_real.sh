#!/bin/bash

echo "=== ТЕСТ RFID КОМАНД (РЕАЛЬНЫЙ) ==="
echo ""

echo "1. Текущий пользователь:"
whoami
echo ""

echo "2. Проверка sudo без пароля:"
if sudo -n true 2>/dev/null; then
  echo "   ✅ sudo работает БЕЗ пароля"
else
  echo "   ❌ sudo ТРЕБУЕТ пароль"
fi
echo ""

echo "3. Путь к systemctl:"
which systemctl
echo ""

echo "4. Тест команды status:"
echo "   Выполняю: sudo systemctl status kvantik-rfid.service"
sudo systemctl status kvantik-rfid.service --no-pager -n 3 2>&1 | head -10
echo ""

echo "5. Проверка sudoers файла:"
if [ -f /etc/sudoers.d/kvantik-bot ]; then
  echo "   ✅ Файл существует"
  sudo cat /etc/sudoers.d/kvantik-bot
else
  echo "   ❌ Файл НЕ существует"
fi
echo ""

echo "6. Проверка прав sudo для текущего пользователя:"
sudo -l 2>&1 | grep systemctl | grep kvantik-rfid

