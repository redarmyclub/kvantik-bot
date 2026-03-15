/**
 * ПРИМЕР МОДУЛЯ: Система напоминаний
 * 
 * Этот файл демонстрирует структуру модуля для автоматической загрузки
 * Просто добавьте файл в папку modules/ и он автоматически подключится
 */

const reminderModule = {
  // ============ ОБЯЗАТЕЛЬНЫЕ ПОЛЯ ============
  
  name: 'reminders',
  version: '1.0.0',
  description: 'Система напоминаний для пользователей',
  enabled: true, // можно отключить модуль установив false
  
  // ============ ИНИЦИАЛИЗАЦИЯ ============
  
  /**
   * Вызывается при загрузке модуля
   * @param {Object} context - контекст модуля
   * @param {TelegramBot} context.bot - экземпляр бота
   * @param {Object} context.data - хранилище данных модуля
   * @param {Function} context.saveData - функция сохранения данных
   */
  async init(context) {
    this.bot = context.bot;
    this.data = context.data;
    this.saveData = context.saveData;
    
    // Инициализация хранилища
    if (!this.data.reminders) {
      this.data.reminders = {};
    }
    
    // Запуск проверки напоминаний каждую минуту
    this.interval = setInterval(() => this.checkReminders(), 60000);
    
    console.log('  ⏰ Напоминания: инициализировано');
  },
  
  // ============ КОМАНДЫ ============
  
  /**
   * Команды, которые обрабатывает этот модуль
   */
  commands: {
    // Команда: /remind <время> <текст>
    remind: async function(msg, args) {
      const chatId = msg.chat.id;
      const time = args[0]; // например: "10m" или "2h"
      const text = args.slice(1).join(' ');
      
      if (!time || !text) {
        return {
          success: false,
          message: 'Использование: /remind <время> <текст>\nПример: /remind 30m Проверить бронирование'
        };
      }
      
      const result = reminderModule.createReminder(chatId, time, text);
      return result;
    },
    
    // Команда: /myreminders
    myreminders: async function(msg) {
      const chatId = msg.chat.id;
      const reminders = reminderModule.getUserReminders(chatId);
      return { success: true, reminders };
    }
  },
  
  /**
   * Описания команд для справки
   */
  commandDescriptions: {
    remind: 'Создать напоминание (/remind 30m Текст)',
    myreminders: 'Показать мои напоминания'
  },
  
  // ============ МЕТОДЫ МОДУЛЯ ============
  
  /**
   * Создать напоминание
   */
  createReminder(chatId, timeStr, text) {
    const minutes = this.parseTime(timeStr);
    
    if (!minutes) {
      return {
        success: false,
        message: 'Неверный формат времени. Используйте: 10m, 2h, 1d'
      };
    }
    
    const remindAt = Date.now() + (minutes * 60 * 1000);
    const id = `${chatId}_${Date.now()}`;
    
    if (!this.data.reminders[chatId]) {
      this.data.reminders[chatId] = [];
    }
    
    this.data.reminders[chatId].push({
      id,
      text,
      remindAt,
      createdAt: Date.now(),
      sent: false
    });
    
    this.saveData();
    
    return {
      success: true,
      message: `✅ Напомню через ${timeStr}: ${text}`
    };
  },
  
  /**
   * Получить напоминания пользователя
   */
  getUserReminders(chatId) {
    const userReminders = this.data.reminders[chatId] || [];
    return userReminders.filter(r => !r.sent);
  },
  
  /**
   * Парсинг времени (10m, 2h, 1d)
   */
  parseTime(str) {
    const match = str.match(/^(\d+)([mhd])$/);
    if (!match) return null;
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    switch (unit) {
      case 'm': return value;
      case 'h': return value * 60;
      case 'd': return value * 60 * 24;
      default: return null;
    }
  },
  
  /**
   * Проверка и отправка напоминаний
   */
  async checkReminders() {
    const now = Date.now();
    
    for (const chatId in this.data.reminders) {
      const reminders = this.data.reminders[chatId];
      
      for (const reminder of reminders) {
        if (!reminder.sent && reminder.remindAt <= now) {
          try {
            await this.bot.sendMessage(
              chatId,
              `⏰ НАПОМИНАНИЕ:\n\n${reminder.text}`
            );
            reminder.sent = true;
          } catch (error) {
            console.error(`Ошибка отправки напоминания:`, error.message);
          }
        }
      }
    }
    
    this.saveData();
  },
  
  // ============ ДЕСТРУКТОР ============
  
  /**
   * Вызывается при выгрузке модуля
   */
  async destroy() {
    if (this.interval) {
      clearInterval(this.interval);
    }
    console.log('  ⏰ Напоминания: выгружено');
  }
};

// ============ ЭКСПОРТ ============
module.exports = reminderModule;
