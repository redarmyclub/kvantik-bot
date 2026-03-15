@echo off
chcp 65001 >nul

if exist ".env" (
    echo Файл .env уже существует
    choice /C YN /M "Перезаписать"
    if errorlevel 2 exit /b
)

if exist ".env.example" (
    copy .env.example .env
    echo ✅ Создан файл .env
    echo.
    echo Откройте .env в блокноте и заполните:
    echo - TELEGRAM_BOT_TOKEN=ваш_токен
    echo - MAIN_ADMIN_ID=ваш_id
    echo.
    notepad .env
) else (
    echo ❌ Файл .env.example не найден
)

pause
