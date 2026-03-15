/**
 * ПРОСТОЙ ТЕСТОВЫЙ МОДУЛЬ
 * 
 * Демонстрирует базовую функциональность системы модулей
 */

const testModule = {
  // Обязательные поля
  name: 'test',
  version: '1.0.0',
  description: 'Простой тестовый модуль для проверки системы',
  enabled: true,
  
  // Инициализация
  async init(context) {
    this.bot = context.bot;
    this.data = context.data;
    this.saveData = context.saveData;
    
    // Инициализация данных
    if (!this.data.testCounter) {
      this.data.testCounter = 0;
    }
    
    console.log('  🧪 Test модуль инициализирован');
  },
  
  // Команды
  commands: {
    // Команда /test
    test: async function(msg) {
      const chatId = msg.chat.id;
      
      testModule.data.testCounter++;
      testModule.saveData();
      
      await testModule.bot.sendMessage(
        chatId,
        `✅ Тестовая команда работает!\n\n` +
        `Модуль вызван ${testModule.data.testCounter} раз(а)`
      );
      
      return { success: true };
    },
    
    // Команда /hello
    hello: async function(msg, args) {
      const chatId = msg.chat.id;
      const name = args.join(' ') || 'Гость';
      
      await testModule.bot.sendMessage(
        chatId,
        `👋 Привет, ${name}!`
      );
      
      return { success: true };
    }
  },
  
  // Описания команд
  commandDescriptions: {
    test: 'Тестовая команда модуля',
    hello: 'Поприветствовать (/hello Имя)'
  },
  
  // Обработка сообщений
  async handleMessage(msg) {
    const text = msg.text;
    
    // Если сообщение содержит слово "тест"
    if (text && text.toLowerCase().includes('тест')) {
      await this.bot.sendMessage(
        msg.chat.id,
        '🧪 Тестовый модуль обнаружил слово "тест"!'
      );
      
      // Не блокируем дальнейшую обработку
      return { handled: false };
    }
    
    return { handled: false };
  }
};

module.exports = testModule;
