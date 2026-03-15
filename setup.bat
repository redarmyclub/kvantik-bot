@echo off
chcp 65001 >nul
cls

echo ═══════════════════════════════════════════════════════════
echo   🤖 KVANTIK BOT - Настройка для Windows
echo ═══════════════════════════════════════════════════════════
echo.

REM Проверка Node.js
echo Проверка Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js не установлен
    echo Установите Node.js с https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo ✅ Node.js установлен: %NODE_VERSION%
echo.

REM Проверка npm
echo Проверка npm...
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ npm не установлен
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('npm -v') do set NPM_VERSION=%%i
echo ✅ npm установлен: %NPM_VERSION%
echo.

REM Установка зависимостей
if not exist "node_modules\" (
    echo Установка зависимостей...
    call npm install
    if %errorlevel% neq 0 (
        echo ❌ Ошибка установки зависимостей
        pause
        exit /b 1
    )
    echo ✅ Зависимости установлены
) else (
    echo ✅ Зависимости уже установлены
)
echo.

REM Создание .env файла
if not exist ".env" (
    echo Создание .env файла...
    if exist ".env.example" (
        copy .env.example .env >nul
        echo ✅ Создан файл .env
        echo.
        echo ⚠️  ВАЖНО: Отредактируйте файл .env
        echo    Откройте .env в блокноте и добавьте:
        echo    - TELEGRAM_BOT_TOKEN (получите у @BotFather)
        echo    - MAIN_ADMIN_ID (узнайте у @userinfobot)
        echo.
        notepad .env
    ) else (
        echo ❌ Файл .env.example не найден
        pause
        exit /b 1
    )
) else (
    echo ✅ Файл .env уже существует
)
echo.

REM Создание директорий
echo Создание директорий...
if not exist "bot_data" mkdir bot_data
if not exist "bot_logs" mkdir bot_logs
if not exist "backups" mkdir backups
if not exist "exports" mkdir exports
echo ✅ Директории созданы
echo.

REM Проверка модулей
if exist "check.js" (
    echo Проверка системы модулей...
    call node check.js
    echo.
)

echo ═══════════════════════════════════════════════════════════
echo ✅ Настройка завершена
echo ═══════════════════════════════════════════════════════════
echo.
echo Следующие шаги:
echo.
echo 1. Убедитесь что в .env настроены:
echo    - TELEGRAM_BOT_TOKEN
echo    - MAIN_ADMIN_ID
echo.
echo 2. Запустите бота:
echo    npm start
echo.
echo Документация:
echo    - README.md - основная документация
echo    - MODULES_GUIDE.md - создание модулей
echo.
pause
