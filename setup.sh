#!/bin/bash

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}🤖 KVANTIK BOT - Быстрый старт${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Проверка Node.js
echo -e "${YELLOW}Проверка Node.js...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js не установлен${NC}"
    echo "Установите Node.js: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v)
echo -e "${GREEN}✅ Node.js установлен: $NODE_VERSION${NC}"
echo ""

# Проверка npm
echo -e "${YELLOW}Проверка npm...${NC}"
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm не установлен${NC}"
    exit 1
fi

NPM_VERSION=$(npm -v)
echo -e "${GREEN}✅ npm установлен: $NPM_VERSION${NC}"
echo ""

# Установка зависимостей
echo -e "${YELLOW}Установка зависимостей...${NC}"
if [ ! -d "node_modules" ]; then
    npm install
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Зависимости установлены${NC}"
    else
        echo -e "${RED}❌ Ошибка установки зависимостей${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✅ Зависимости уже установлены${NC}"
fi
echo ""

# Проверка .env файла
echo -e "${YELLOW}Проверка конфигурации...${NC}"
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  Файл .env не найден${NC}"
    echo -e "${BLUE}Создание из примера...${NC}"
    
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo -e "${GREEN}✅ Создан файл .env${NC}"
        echo ""
        echo -e "${YELLOW}⚠️  ВАЖНО: Отредактируйте файл .env${NC}"
        echo "Добавьте ваш TELEGRAM_BOT_TOKEN и MAIN_ADMIN_ID"
        echo ""
        echo "После редактирования запустите: npm start"
        exit 0
    else
        echo -e "${RED}❌ Файл .env.example не найден${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✅ Файл .env найден${NC}"
    
    # Проверка обязательных параметров
    if ! grep -q "TELEGRAM_BOT_TOKEN=.*[0-9]" .env; then
        echo -e "${RED}❌ TELEGRAM_BOT_TOKEN не настроен в .env${NC}"
        echo "Получите токен у @BotFather и добавьте в .env"
        exit 1
    fi
    
    if ! grep -q "MAIN_ADMIN_ID=.*[0-9]" .env; then
        echo -e "${RED}❌ MAIN_ADMIN_ID не настроен в .env${NC}"
        echo "Узнайте ваш Telegram ID у @userinfobot и добавьте в .env"
        exit 1
    fi
fi
echo ""

# Создание необходимых директорий
echo -e "${YELLOW}Создание директорий...${NC}"
mkdir -p bot_data bot_logs backups exports core modules utils config
echo -e "${GREEN}✅ Директории созданы${NC}"
echo ""

# Проверка системы модулей
echo -e "${YELLOW}Проверка системы модулей...${NC}"
if [ -f "check.js" ]; then
    node check.js
    if [ $? -eq 0 ]; then
        echo ""
        echo -e "${GREEN}✅ Система модулей готова${NC}"
    else
        echo ""
        echo -e "${YELLOW}⚠️  Обнаружены проблемы в модулях${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Скрипт проверки не найден${NC}"
fi
echo ""

# Итог
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}✅ Быстрый старт завершён${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${YELLOW}Следующие шаги:${NC}"
echo ""
echo -e "1. Убедитесь что в .env настроены:"
echo -e "   - ${BLUE}TELEGRAM_BOT_TOKEN${NC}"
echo -e "   - ${BLUE}MAIN_ADMIN_ID${NC}"
echo ""
echo -e "2. Запустите бота:"
echo -e "   ${GREEN}npm start${NC}"
echo ""
echo -e "3. Для разработки используйте:"
echo -e "   ${GREEN}npm run dev${NC}"
echo ""
echo -e "4. Документация:"
echo -e "   - README.md - основная документация"
echo -e "   - MODULES_GUIDE.md - создание модулей"
echo ""
echo -e "${BLUE}========================================${NC}"
