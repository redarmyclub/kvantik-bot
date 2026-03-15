# 🪟 Инструкция для Windows

## Быстрая установка

### Способ 1: Автоматический (рекомендуется)

Просто запустите файл:
```
setup.bat
```

Скрипт автоматически:
- ✅ Проверит Node.js и npm
- ✅ Установит зависимости
- ✅ Создаст .env файл
- ✅ Откроет .env для редактирования
- ✅ Проверит систему модулей

### Способ 2: Ручной

1. **Создать .env файл:**
   
   Запустите:
   ```
   create-env.bat
   ```
   
   Или вручную в PowerShell:
   ```powershell
   Copy-Item .env.example .env
   notepad .env
   ```
   
   Или в CMD:
   ```cmd
   copy .env.example .env
   notepad .env
   ```

2. **Заполнить .env:**
   
   В открывшемся блокноте заполните:
   ```
   TELEGRAM_BOT_TOKEN=ваш_токен_от_BotFather
   MAIN_ADMIN_ID=ваш_telegram_id
   ```
   
   Сохраните и закройте.

3. **Установить зависимости:**
   ```
   npm install
   ```

4. **Запустить бота:**
   ```
   npm start
   ```

## Получение токена и ID

### Telegram Bot Token
1. Напишите [@BotFather](https://t.me/BotFather) в Telegram
2. Отправьте команду `/newbot`
3. Следуйте инструкциям
4. Скопируйте полученный токен

### Ваш Telegram ID
1. Напишите [@userinfobot](https://t.me/userinfobot) в Telegram
2. Бот отправит вам ваш ID
3. Скопируйте число

## Команды для Windows

### PowerShell
```powershell
# Создать .env
Copy-Item .env.example .env

# Отредактировать
notepad .env

# Установить зависимости
npm install

# Запустить
npm start
```

### CMD
```cmd
# Создать .env
copy .env.example .env

# Отредактировать
notepad .env

# Установить зависимости
npm install

# Запустить
npm start
```

## Решение проблем

### "cp не является командой"
В Windows используйте `copy` вместо `cp`:
```cmd
copy .env.example .env
```

### "nano не является командой"
В Windows используйте `notepad`:
```cmd
notepad .env
```

### Ошибка при npm install
Попробуйте:
```cmd
npm install --legacy-peer-deps
```

### Ошибка синтаксиса в monitoring.js
Эта ошибка уже исправлена в новой версии архива.

## Проверка установки

После установки запустите:
```cmd
node check.js
```

Должно показать:
```
✅ Module Loader
✅ Promo System Module
✅ Statistics Module
✅ Test Module
✅ ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ
```

## Режимы запуска

```cmd
# Обычный запуск
npm start

# Режим разработки (нужен nodemon)
npm run dev

# Старая версия
npm run old
```

## Установка nodemon (для режима разработки)

```cmd
npm install -g nodemon
```

После этого можно использовать:
```cmd
npm run dev
```

## Структура после установки

```
kvantik-bot2/
├── bot.js              - Главный файл
├── .env                - Конфигурация (создаётся)
├── setup.bat           - Автоматическая настройка
├── create-env.bat      - Создать .env
│
├── bot_data/           - Данные (создаётся автоматически)
├── bot_logs/           - Логи (создаётся автоматически)
├── backups/            - Бэкапы
└── exports/            - Экспорты
```

## Просмотр логов

```cmd
# Общие логи
type bot_logs\general.log

# Ошибки
type bot_logs\errors.log

# Последние 10 строк ошибок
powershell -command "Get-Content bot_logs\errors.log -Tail 10"
```

## Остановка бота

Нажмите `Ctrl+C` в окне терминала

## Запуск в фоне

### Вариант 1: PM2 (рекомендуется)
```cmd
npm install -g pm2
pm2 start bot.js --name kvantik-bot
pm2 save
pm2 startup
```

### Вариант 2: NSSM (Windows Service)
1. Скачайте [NSSM](https://nssm.cc/download)
2. Установите как службу:
```cmd
nssm install KvantikBot "C:\path\to\node.exe" "C:\path\to\bot.js"
nssm start KvantikBot
```

## Обновление

1. Сделайте бэкап данных:
```cmd
xcopy bot_data bot_data_backup /E /I
```

2. Распакуйте новую версию

3. Скопируйте .env:
```cmd
copy старая_папка\.env .
```

4. Установите зависимости:
```cmd
npm install
```

5. Запустите:
```cmd
npm start
```

## Документация

- **README.md** - Полная документация
- **MODULES_GUIDE.md** - Создание модулей
- **INSTALL.md** - Подробная установка
- **WINDOWS.md** - Эта инструкция

## Поддержка

Если возникли проблемы:
1. Проверьте логи: `type bot_logs\errors.log`
2. Запустите проверку: `node check.js`
3. Убедитесь что .env заполнен правильно

---

Версия: 2.0.0
Платформа: Windows 10/11
Node.js: >= 16.0.0
