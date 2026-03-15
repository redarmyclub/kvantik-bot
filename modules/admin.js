/**
 * Модуль администрирования
 * Команды и функции для администраторов
 */

const logger = require('../utils/logger');

const adminModule = {
  name: 'admin',
  version: '1.0.0',
  description: 'Команды администрирования',
  enabled: true,
  
  async init(context) {
    this.bot = context.bot;
    this.data = context.data;
    this.saveData = context.saveData;
    this.users = context.users;
    this.getUserData = context.getUserData;
    
    // Состояния администраторов
    if (!this.data.adminStates) {
      this.data.adminStates = {};
    }
    
    console.log('  👨‍💼 Администрирование: инициализировано');
  },
  
  commands: {
    myid: async function(msg) {
      const chatId = msg.chat.id;
      await adminModule.bot.sendMessage(chatId, `Ваш Telegram ID: ${chatId}`);
      return { handled: true };
    },
    
    reply: async function(msg, args) {
      const chatId = msg.chat.id;
      const isAdmin = adminModule.isAdmin(chatId);
      
      if (!isAdmin) {
        await adminModule.bot.sendMessage(chatId, '❌ Доступно только администраторам');
        return { handled: true };
      }
      
      if (args.length < 2) {
        await adminModule.bot.sendMessage(chatId, 
          'Использование: /reply CHAT_ID текст ответа\n' +
          'Пример: /reply 123456789 Спасибо за вопрос!');
        return { handled: true };
      }
      
      const targetId = args[0];
      const reply = args.slice(1).join(' ');
      
      try {
        await adminModule.bot.sendMessage(
          targetId,
          `💬 ОТВЕТ ОТ АДМИНИСТРАТОРА:\n\n${reply}`
        );
        
        // Отмечаем вопрос как отвеченный
        const questionsModule = require('./questions');
        if (questionsModule) {
          Object.keys(questionsModule.data.pendingQuestions || {}).forEach(qId => {
            if (questionsModule.data.pendingQuestions[qId].chatId == targetId) {
              questionsModule.markQuestionAnswered(qId);
            }
          });
        }
        
        await adminModule.bot.sendMessage(chatId, `✅ Ответ отправлен пользователю ${targetId}`);
        logger.info('ADMIN', `Reply sent to ${targetId} by ${chatId}`);
      } catch (error) {
        await adminModule.bot.sendMessage(chatId, `❌ Ошибка: ${error.message}`);
        logger.error('ADMIN', `Failed to reply to ${targetId}`, error.message);
      }
      
      return { handled: true };
    },
    
    send: async function(msg, args) {
      const chatId = msg.chat.id;
      const isAdmin = adminModule.isAdmin(chatId);
      
      if (!isAdmin) {
        await adminModule.bot.sendMessage(chatId, '❌ Доступно только администраторам');
        return { handled: true };
      }
      
      if (args.length < 2) {
        await adminModule.bot.sendMessage(chatId, 
          'Использование: /send CHAT_ID текст сообщения\n' +
          'Пример: /send 123456789 Добрый день!');
        return { handled: true };
      }
      
      const targetId = args[0];
      const message = args.slice(1).join(' ');
      
      try {
        await adminModule.bot.sendMessage(
          targetId,
          `📨 СООБЩЕНИЕ ОТ АДМИНИСТРАТОРА:\n\n${message}`
        );
        
        await adminModule.bot.sendMessage(chatId, `✅ Сообщение отправлено пользователю ${targetId}`);
        logger.info('ADMIN', `Message sent to ${targetId} by ${chatId}`);
      } catch (error) {
        await adminModule.bot.sendMessage(chatId, `❌ Ошибка: ${error.message}`);
        logger.error('ADMIN', `Failed to send message to ${targetId}`, error.message);
      }
      
      return { handled: true };
    },
    
    broadcast: async function(msg, args) {
      const chatId = msg.chat.id;
      const isMainAdmin = process.env.MAIN_ADMIN_ID === chatId.toString();
      
      if (!isMainAdmin) {
        await adminModule.bot.sendMessage(chatId, '❌ Доступно только главному администратору');
        return { handled: true };
      }
      
      if (args.length < 2) {
        await adminModule.bot.sendMessage(chatId, 
          'Использование: /broadcast [all|registered|unregistered] текст\n' +
          'Пример: /broadcast all Внимание! Важное объявление');
        return { handled: true };
      }
      
      const type = args[0].toLowerCase();
      const message = args.slice(1).join(' ');
      
      if (!['all', 'registered', 'unregistered'].includes(type)) {
        await adminModule.bot.sendMessage(chatId, '❌ Тип должен быть: all, registered или unregistered');
        return { handled: true };
      }
      
      await adminModule.bot.sendMessage(chatId, '⏳ Начинаю рассылку...');
      
      let sentCount = 0;
      let errorCount = 0;
      
      const users = adminModule.users || {};
      
      for (const targetId of Object.keys(users)) {
        if (adminModule.isAdmin(targetId)) continue;
        
        const user = users[targetId];
        
        if (type === 'registered' && !user.isRegistered) continue;
        if (type === 'unregistered' && user.isRegistered) continue;
        
        try {
          await adminModule.bot.sendMessage(
            targetId,
            `📢 СООБЩЕНИЕ ОТ АДМИНИСТРАТОРА:\n\n${message}`
          );
          sentCount++;
          await new Promise(resolve => setTimeout(resolve, 100)); // Задержка
        } catch (error) {
          errorCount++;
        }
      }
      
      await adminModule.bot.sendMessage(chatId, 
        `✅ РАССЫЛКА ЗАВЕРШЕНА!\n\n` +
        `📤 Отправлено: ${sentCount}\n` +
        `❌ Ошибок: ${errorCount}`);
      
      logger.info('ADMIN', `Broadcast completed: ${sentCount} sent, ${errorCount} errors`);
      
      return { handled: true };
    },
    
    users: async function(msg) {
      const chatId = msg.chat.id;
      const isAdmin = adminModule.isAdmin(chatId);
      
      if (!isAdmin) {
        await adminModule.bot.sendMessage(chatId, '❌ Доступно только администраторам');
        return { handled: true };
      }
      
      const users = adminModule.users || {};
      const total = Object.keys(users).length;
      const registered = Object.values(users).filter(u => u.isRegistered).length;
      const unregistered = total - registered;
      
      let message = `👥 СТАТИСТИКА ПОЛЬЗОВАТЕЛЕЙ\n\n`;
      message += `Всего: ${total}\n`;
      message += `Зарегистрировано: ${registered}\n`;
      message += `Не зарегистрировано: ${unregistered}\n\n`;
      
      // Последние 5 пользователей
      const recent = Object.entries(users)
        .sort((a, b) => new Date(b[1].createdAt || 0) - new Date(a[1].createdAt || 0))
        .slice(0, 5);
      
      if (recent.length > 0) {
        message += `📋 Последние пользователи:\n`;
        recent.forEach(([id, user]) => {
          const name = user.parentName || 'Гость';
          const status = user.isRegistered ? '✅' : '⏳';
          message += `${status} ${name} (${id})\n`;
        });
      }
      
      await adminModule.bot.sendMessage(chatId, message);
      return { handled: true };
    },
    
    user: async function(msg, args) {
      const chatId = msg.chat.id;
      const isAdmin = adminModule.isAdmin(chatId);
      
      if (!isAdmin) {
        await adminModule.bot.sendMessage(chatId, '❌ Доступно только администраторам');
        return { handled: true };
      }
      
      if (args.length < 1) {
        await adminModule.bot.sendMessage(chatId, 
          'Использование: /user CHAT_ID\n' +
          'Пример: /user 123456789');
        return { handled: true };
      }
      
      const targetId = args[0];
      const user = adminModule.users?.[targetId];
      
      if (!user) {
        await adminModule.bot.sendMessage(chatId, '❌ Пользователь не найден');
        return { handled: true };
      }
      
      let message = `👤 ИНФОРМАЦИЯ О ПОЛЬЗОВАТЕЛЕ\n\n`;
      message += `💬 ID: ${targetId}\n`;
      message += `📝 Имя: ${user.parentName || 'не указано'}\n`;
      message += `👤 ФИО: ${user.parentFullName || 'не указано'}\n`;
      message += `📱 Телефон: ${user.phone || 'не указан'}\n`;
      message += `✅ Статус: ${user.isRegistered ? 'Зарегистрирован' : 'Не зарегистрирован'}\n`;
      
      if (user.children && user.children.length > 0) {
        message += `\n👶 Дети (${user.children.length}):\n`;
        user.children.forEach((child, i) => {
          message += `${i + 1}. ${child.fullName} (${child.birthDate}, ${child.gender})\n`;
        });
      }
      
      if (user.createdAt) {
        const date = new Date(user.createdAt);
        message += `\n📅 Создан: ${date.toLocaleDateString('ru-RU')}`;
      }
      
      await adminModule.bot.sendMessage(chatId, message);
      return { handled: true };
    },
    
    pending: async function(msg) {
      const chatId = msg.chat.id;
      const isAdmin = adminModule.isAdmin(chatId);
      
      if (!isAdmin) {
        await adminModule.bot.sendMessage(chatId, '❌ Доступно только администраторам');
        return { handled: true };
      }
      
      const questionsModule = require('./questions');
      if (!questionsModule) {
        await adminModule.bot.sendMessage(chatId, '❌ Модуль вопросов не загружен');
        return { handled: true };
      }
      
      const pending = questionsModule.getPendingQuestions();
      
      if (pending.length === 0) {
        await adminModule.bot.sendMessage(chatId, '✅ Нет неотвеченных вопросов');
        return { handled: true };
      }
      
      let message = `❓ НЕОТВЕЧЕННЫЕ ВОПРОСЫ (${pending.length}):\n\n`;
      
      pending.slice(0, 5).forEach((q, i) => {
        const user = adminModule.users?.[q.chatId];
        const name = user?.parentName || 'Гость';
        message += `${i + 1}. От: ${name} (${q.chatId})\n`;
        message += `   Вопрос: ${q.question.substring(0, 50)}...\n`;
        message += `   Дата: ${new Date(q.createdAt).toLocaleDateString('ru-RU')}\n\n`;
      });
      
      message += `\nОтветить: /reply CHAT_ID текст ответа`;
      
      await adminModule.bot.sendMessage(chatId, message);
      return { handled: true };
    }
  },
  
  commandDescriptions: {
    myid: 'Узнать свой Telegram ID',
    reply: '[Админ] Ответить на вопрос пользователя',
    send: '[Админ] Отправить сообщение пользователю',
    broadcast: '[Главный админ] Массовая рассылка',
    users: '[Админ] Статистика пользователей',
    user: '[Админ] Информация о пользователе',
    pending: '[Админ] Список неотвеченных вопросов'
  },
  
  // Проверка является ли пользователь администратором
  isAdmin(chatId) {
    const id = String(chatId);
    const MAIN_ADMIN_ID = process.env.MAIN_ADMIN_ID || '805286122';
    const ADDITIONAL_ADMINS = process.env.ADDITIONAL_ADMINS 
      ? process.env.ADDITIONAL_ADMINS.split(',').map(i => i.trim())
      : [];
    
    return id === String(MAIN_ADMIN_ID) || ADDITIONAL_ADMINS.includes(id);
  }
};

module.exports = adminModule;
