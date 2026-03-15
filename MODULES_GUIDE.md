# 📦 Быстрое руководство: Создание модулей

## Минимальный модуль (5 строк)

```javascript
// modules/mymodule.js
module.exports = {
  name: 'mymodule',
  version: '1.0.0',
  description: 'Мой модуль',
  enabled: true
};
```

## Модуль с командой

```javascript
// modules/ping.js
module.exports = {
  name: 'ping',
  version: '1.0.0',
  description: 'Тест связи',
  enabled: true,
  
  async init(context) {
    this.bot = context.bot;
  },
  
  commands: {
    ping: async function(msg) {
      await this.bot.sendMessage(msg.chat.id, '🏓 Pong!');
      return { success: true };
    }
  }
};
```

## Модуль с данными

```javascript
// modules/votes.js
module.exports = {
  name: 'votes',
  version: '1.0.0',
  description: 'Система голосования',
  enabled: true,
  
  async init(context) {
    this.bot = context.bot;
    this.data = context.data;
    this.saveData = context.saveData;
    
    if (!this.data.votes) {
      this.data.votes = {};
    }
  },
  
  commands: {
    vote: async function(msg, args) {
      const chatId = msg.chat.id;
      const option = args[0];
      
      if (!this.data.votes[option]) {
        this.data.votes[option] = 0;
      }
      
      this.data.votes[option]++;
      this.saveData();
      
      await this.bot.sendMessage(
        chatId,
        `✅ Голос учтён! ${option}: ${this.data.votes[option]}`
      );
      
      return { success: true };
    },
    
    results: async function(msg) {
      const chatId = msg.chat.id;
      const results = Object.entries(this.data.votes)
        .map(([key, val]) => `${key}: ${val}`)
        .join('\n');
      
      await this.bot.sendMessage(chatId, `📊 Результаты:\n${results}`);
      return { success: true };
    }
  }
};
```

## Модуль с таймером

```javascript
// modules/reminder.js
module.exports = {
  name: 'reminder',
  version: '1.0.0',
  description: 'Ежечасное напоминание',
  enabled: true,
  
  async init(context) {
    this.bot = context.bot;
    this.adminId = '123456789'; // Ваш ID
    
    // Каждый час
    this.interval = setInterval(() => {
      this.sendReminder();
    }, 60 * 60 * 1000);
  },
  
  async sendReminder() {
    await this.bot.sendMessage(
      this.adminId,
      '⏰ Ежечасное напоминание!'
    );
  },
  
  async destroy() {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }
};
```

## Модуль с обработкой сообщений

```javascript
// modules/wordcount.js
module.exports = {
  name: 'wordcount',
  version: '1.0.0',
  description: 'Подсчёт слов',
  enabled: true,
  
  async init(context) {
    this.bot = context.bot;
  },
  
  async handleMessage(msg) {
    const text = msg.text;
    
    if (text && text.startsWith('Посчитай:')) {
      const content = text.substring(9).trim();
      const words = content.split(/\s+/).length;
      
      await this.bot.sendMessage(
        msg.chat.id,
        `📝 Слов в тексте: ${words}`
      );
      
      return { handled: true }; // Сообщение обработано
    }
    
    return { handled: false }; // Не обработано
  }
};
```

## Полезные функции в context

```javascript
async init(context) {
  // Telegram Bot API
  this.bot = context.bot;
  
  // Хранилище данных модуля (автоматически сохраняется в bot_data/moduleName.json)
  this.data = context.data;
  
  // Функция сохранения данных
  this.saveData = context.saveData;
}
```

## Примеры использования bot API

```javascript
// Отправка сообщения
await this.bot.sendMessage(chatId, 'Текст');

// Отправка с клавиатурой
await this.bot.sendMessage(chatId, 'Выберите:', {
  reply_markup: {
    keyboard: [
      ['Кнопка 1', 'Кнопка 2'],
      ['Кнопка 3']
    ],
    resize_keyboard: true
  }
});

// Отправка фото
await this.bot.sendPhoto(chatId, 'path/to/photo.jpg');

// Удаление сообщения
await this.bot.deleteMessage(chatId, messageId);
```

## Структура файла модуля

```javascript
module.exports = {
  // ========== ОБЯЗАТЕЛЬНО ==========
  name: 'modulename',           // Уникальное имя
  version: '1.0.0',             // Версия
  description: 'Описание',      // Краткое описание
  enabled: true,                // Включён ли модуль
  
  // ========== ОПЦИОНАЛЬНО ==========
  
  // Инициализация
  async init(context) {
    // Код инициализации
  },
  
  // Команды бота
  commands: {
    command1: async function(msg, args) {},
    command2: async function(msg, args) {}
  },
  
  // Описания команд
  commandDescriptions: {
    command1: 'Описание команды 1',
    command2: 'Описание команды 2'
  },
  
  // Обработка сообщений
  async handleMessage(msg) {
    return { handled: false };
  },
  
  // Ваши методы
  myMethod() {},
  
  // Деинициализация
  async destroy() {
    // Очистка ресурсов
  }
};
```

## Быстрый чеклист

1. ✅ Создайте файл в `modules/`
2. ✅ Экспортируйте объект с полями `name`, `version`, `description`, `enabled`
3. ✅ Добавьте `async init(context)` если нужен доступ к боту
4. ✅ Добавьте команды в объект `commands`
5. ✅ Перезапустите бота: `npm start`

Готово! Модуль автоматически загрузится 🎉

## Отключение модуля

### Способ 1: В коде
```javascript
enabled: false
```

### Способ 2: Переименование файла
```bash
mv modules/mymodule.js modules/_mymodule.js
```

Файлы с префиксом `_` не загружаются автоматически.

## Примеры в проекте

Посмотрите готовые примеры:
- `modules/promoSystem.js` - Система промокодов
- `modules/statistics.js` - Статистика
- `modules/_example_reminders.js` - Пример модуля с напоминаниями
