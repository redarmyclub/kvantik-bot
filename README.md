# 🤖 Kvantik Bot v2.0 - Модульная архитектура

Telegram бот для детского клуба "Квантик" с автоматической системой загрузки модулей.

## 🎯 Основные возможности

- ✅ **Модульная архитектура** - добавляйте новые функции, просто создав файл в папке `modules/`
- ✅ **Автоматическая загрузка** - все модули подключаются автоматически при старте
- ✅ **Горячая перезагрузка** - обновляйте модули без перезапуска бота
- ✅ **Система промокодов** - создание, управление и отслеживание использования
- ✅ **Статистика и аналитика** - детальная информация о конверсии и активности
- ✅ **Защита от спама** - автоматическая блокировка при злоупотреблении
- ✅ **Бэкапы** - автоматическое резервное копирование данных
- ✅ **Мониторинг** - отслеживание здоровья бота и производительности

## 📁 Структура проекта

```
kvantik-bot2/
├── bot.js                 # Главный файл (новый, с модулями)
├── bot_fixed.js           # Старый файл (для совместимости)
├── package.json
├── .env.example
│
├── config/
│   └── config.js          # Конфигурация
│
├── core/
│   └── moduleLoader.js    # Система загрузки модулей
│
├── modules/               # 📦 МОДУЛИ БОТА
│   ├── promoSystem.js     # Система промокодов
│   ├── statistics.js      # Статистика
│   └── _example_*.js      # Примеры (не загружаются автоматически)
│
├── utils/                 # Утилиты
│   ├── logger.js          # Логирование
│   ├── storage.js         # Хранение данных
│   ├── validator.js       # Валидация
│   ├── backup.js          # Бэкапы
│   ├── monitoring.js      # Мониторинг
│   └── exporter.js        # Экспорт в Excel
│
├── bot_data/              # Данные бота
│   ├── users.json
│   ├── leads.json
│   ├── questions.json
│   └── reviews.json
│
└── bot_logs/              # Логи
    ├── general.log
    ├── errors.log
    └── admin_actions.log
```

## 🚀 Быстрый старт

### 1. Установка

```bash
# Клонирование или распаковка проекта
cd kvantik-bot2

# Установка зависимостей
npm install

# Копирование файла конфигурации
cp .env.example .env
```

### 2. Настройка

Отредактируйте файл `.env`:

```env
# Обязательно
TELEGRAM_BOT_TOKEN=ваш_токен_от_BotFather
MAIN_ADMIN_ID=ваш_telegram_id

# Опционально
ADDITIONAL_ADMINS=123456789,987654321
PROMO_CODES_ENABLED=true
BACKUP_ENABLED=true
```

### 3. Запуск

```bash
# Запуск бота
npm start

# Запуск в режиме разработки (с автоперезагрузкой)
npm run dev

# Запуск старой версии (без модулей)
npm run old
```

## 📦 Создание модуля

### Шаг 1: Создайте файл

Создайте новый файл в папке `modules/`, например `modules/myModule.js`

### Шаг 2: Структура модуля

```javascript
/**
 * Модуль: Моя функция
 */
const myModule = {
  // ============ ОБЯЗАТЕЛЬНЫЕ ПОЛЯ ============
  
  name: 'myModule',
  version: '1.0.0',
  description: 'Описание модуля',
  enabled: true,
  
  // ============ ИНИЦИАЛИЗАЦИЯ ============
  
  async init(context) {
    this.bot = context.bot;
    this.data = context.data;
    this.saveData = context.saveData;
    
    // Ваш код инициализации
    if (!this.data.myData) {
      this.data.myData = {};
    }
    
    console.log('  ✓ Мой модуль загружен');
  },
  
  // ============ КОМАНДЫ ============
  
  commands: {
    mycommand: async function(msg, args) {
      const chatId = msg.chat.id;
      
      // Ваша логика
      
      return {
        success: true,
        message: 'Готово!'
      };
    }
  },
  
  commandDescriptions: {
    mycommand: 'Описание команды'
  },
  
  // ============ МЕТОДЫ ============
  
  myMethod() {
    // Ваша логика
  },
  
  // ============ ОБРАБОТЧИК СООБЩЕНИЙ ============
  
  async handleMessage(msg) {
    // Если модуль обработал сообщение
    if (/* условие */) {
      return { handled: true };
    }
    
    // Если не обработал
    return { handled: false };
  },
  
  // ============ ДЕСТРУКТОР ============
  
  async destroy() {
    // Очистка ресурсов при выгрузке модуля
    console.log('  ✓ Мой модуль выгружен');
  }
};

module.exports = myModule;
```

### Шаг 3: Перезапустите бота

```bash
# Просто перезапустите
npm start
```

Модуль автоматически загрузится!

## 🔧 Доступ к боту и данным из модуля

```javascript
async init(context) {
  // Экземпляр Telegram бота
  this.bot = context.bot;
  
  // Отправка сообщения
  this.bot.sendMessage(chatId, 'Привет!');
  
  // Хранилище данных модуля
  this.data = context.data;
  this.data.myValue = 123;
  
  // Сохранение данных
  context.saveData();
}
```

## 📝 Примеры модулей

### Пример 1: Простой модуль

```javascript
// modules/hello.js
const helloModule = {
  name: 'hello',
  version: '1.0.0',
  description: 'Приветствие пользователей',
  enabled: true,
  
  async init(context) {
    this.bot = context.bot;
    console.log('  👋 Hello модуль загружен');
  },
  
  commands: {
    hello: async function(msg) {
      const chatId = msg.chat.id;
      await helloModule.bot.sendMessage(chatId, '👋 Привет!');
      return { success: true };
    }
  },
  
  commandDescriptions: {
    hello: 'Поприветствовать'
  }
};

module.exports = helloModule;
```

### Пример 2: Модуль с данными

```javascript
// modules/counter.js
const counterModule = {
  name: 'counter',
  version: '1.0.0',
  description: 'Счётчик сообщений',
  enabled: true,
  
  async init(context) {
    this.bot = context.bot;
    this.data = context.data;
    this.saveData = context.saveData;
    
    if (!this.data.counts) {
      this.data.counts = {};
    }
  },
  
  async handleMessage(msg) {
    const chatId = msg.chat.id;
    
    if (!this.data.counts[chatId]) {
      this.data.counts[chatId] = 0;
    }
    
    this.data.counts[chatId]++;
    this.saveData();
    
    return { handled: false }; // Не блокируем другие обработчики
  },
  
  commands: {
    mycount: async function(msg) {
      const chatId = msg.chat.id;
      const count = counterModule.data.counts[chatId] || 0;
      
      await counterModule.bot.sendMessage(
        chatId,
        `Вы отправили ${count} сообщений`
      );
      
      return { success: true };
    }
  },
  
  commandDescriptions: {
    mycount: 'Показать мой счётчик'
  }
};

module.exports = counterModule;
```

### Пример 3: Модуль с таймером

```javascript
// modules/notifications.js
const notificationsModule = {
  name: 'notifications',
  version: '1.0.0',
  description: 'Ежедневные уведомления',
  enabled: true,
  
  async init(context) {
    this.bot = context.bot;
    this.data = context.data;
    
    // Запуск таймера каждые 24 часа
    this.interval = setInterval(() => {
      this.sendDailyNotifications();
    }, 24 * 60 * 60 * 1000);
    
    console.log('  🔔 Notifications запущен');
  },
  
  async sendDailyNotifications() {
    // Ваша логика рассылки
    console.log('Отправка ежедневных уведомлений...');
  },
  
  async destroy() {
    if (this.interval) {
      clearInterval(this.interval);
    }
    console.log('  🔔 Notifications остановлен');
  }
};

module.exports = notificationsModule;
```

## 🎮 Управление модулями

### Просмотр загруженных модулей

```
/modules
```

Показывает список всех загруженных модулей с их статусом и описанием.

### Перезагрузка модуля (только для админов)

```javascript
// В коде бота или через команду
await moduleLoader.reloadModule('moduleName');
```

### Выгрузка модуля

```javascript
await moduleLoader.unloadModule('moduleName');
```

## 🔐 Безопасность

### Защита от спама

Бот автоматически блокирует пользователей при:
- Более 10 сообщений в минуту
- Более 3 попыток регистрации в час
- Более 5 вопросов админу в час

### Администраторы

```env
# Главный администратор (полный доступ)
MAIN_ADMIN_ID=123456789

# Дополнительные администраторы (через запятую)
ADDITIONAL_ADMINS=111111111,222222222
```

## 📊 Мониторинг

Бот автоматически отслеживает:
- Количество пользователей
- Количество сообщений
- Загрузку модулей
- Ошибки и исключения

Логи сохраняются в `bot_logs/`:
- `general.log` - общие события
- `errors.log` - ошибки
- `admin_actions.log` - действия администраторов

## 💾 Бэкапы

### Автоматические бэкапы

```env
BACKUP_ENABLED=true
BACKUP_INTERVAL_HOURS=24
```

Бэкапы сохраняются в папке `backups/` с ротацией за последние 7 дней.

### Ручной бэкап

```bash
npm run backup
```

## 📤 Экспорт данных

Экспорт в Excel:

```bash
npm run export
```

Файлы сохраняются в папке `exports/`.

## 🐛 Отладка

### Режим разработки

```bash
npm run dev
```

### Просмотр логов

```bash
# Просмотр общих логов
tail -f bot_logs/general.log

# Просмотр ошибок
tail -f bot_logs/errors.log

# Просмотр действий администраторов
tail -f bot_logs/admin_actions.log
```

## ❓ FAQ

### Как отключить модуль?

Установите `enabled: false` в файле модуля или переименуйте файл с префиксом `_` (например, `_myModule.js`)

### Как добавить новую команду?

Добавьте её в объект `commands` любого модуля:

```javascript
commands: {
  newcommand: async function(msg, args) {
    // Ваша логика
  }
}
```

### Как сохранить данные модуля?

```javascript
async init(context) {
  this.data = context.data;
  this.saveData = context.saveData;
  
  // Изменение данных
  this.data.value = 123;
  
  // Сохранение
  this.saveData();
}
```

### Как узнать ID пользователя Telegram?

1. Напишите боту [@userinfobot](https://t.me/userinfobot)
2. Он отправит вам ваш ID

## 🔄 Миграция со старой версии

Старая версия бота (`bot_fixed.js`) остаётся для совместимости:

```bash
# Запуск старой версии
npm run old
```

Все данные автоматически совместимы между версиями.

## 📞 Поддержка

При возникновении проблем:
1. Проверьте логи в `bot_logs/`
2. Убедитесь, что все переменные в `.env` настроены
3. Проверьте, что модули корректно экспортируют объект

## 📄 Лицензия

ISC License

---

**Версия:** 2.0.0  
**Автор:** Kvantik Team  
**Дата:** Декабрь 2025
