/**
 * Модуль системы напоминаний
 * Дни рождения, пробные занятия, оплата, неактивность
 */

const cron = require('node-cron');
const logger = require('../utils/logger');

const remindersModule = {
  name: 'reminders',
  version: '1.0.0',
  description: 'Система напоминаний и уведомлений',
  enabled: true,
  
  cronJobs: [],
  
  async init(context) {
    this.bot = context.bot;
    this.data = context.data;
    this.saveData = context.saveData;
    this.getUserData = context.getUserData; // Функция получения данных пользователя
    this.users = context.users;              // Объект всех пользователей
    
    // Запускаем cron задачи
    this.startCronJobs();
    
    console.log('  ⏰ Напоминания: инициализировано (4 задачи)');
  },
  
  commands: {
    set_trial: async function(msg, args) {
      // Только для администраторов
      const chatId = msg.chat.id;
      const isAdmin = process.env.MAIN_ADMIN_ID === chatId.toString();
      
      if (!isAdmin) {
        await remindersModule.bot.sendMessage(chatId, '❌ Доступно только администраторам');
        return { handled: true };
      }
      
      if (args.length < 2) {
        await remindersModule.bot.sendMessage(chatId, 
          'Использование: /set_trial CHAT_ID ДД.ММ.ГГГГ\n' +
          'Пример: /set_trial 123456789 25.12.2024');
        return { handled: true };
      }
      
      const targetId = args[0];
      const date = args[1];
      
      const userData = remindersModule.users?.[targetId];
      if (!userData) {
        await remindersModule.bot.sendMessage(chatId, '❌ Пользователь не найден');
        return { handled: true };
      }
      
      userData.trialLessonDate = date;
      remindersModule.saveData();
      
      await remindersModule.bot.sendMessage(chatId, 
        `✅ Дата пробного занятия установлена: ${date}\n` +
        `Пользователь: ${userData.parentName || targetId}`);
      
      return { handled: true };
    },
    
    set_payment: async function(msg, args) {
      const chatId = msg.chat.id;
      const isAdmin = process.env.MAIN_ADMIN_ID === chatId.toString();
      
      if (!isAdmin) {
        await remindersModule.bot.sendMessage(chatId, '❌ Доступно только администраторам');
        return { handled: true };
      }
      
      if (args.length < 2) {
        await remindersModule.bot.sendMessage(chatId, 
          'Использование: /set_payment CHAT_ID ДД.ММ.ГГГГ\n' +
          'Пример: /set_payment 123456789 31.12.2024');
        return { handled: true };
      }
      
      const targetId = args[0];
      const date = args[1];
      
      const userData = remindersModule.users?.[targetId];
      if (!userData) {
        await remindersModule.bot.sendMessage(chatId, '❌ Пользователь не найден');
        return { handled: true };
      }
      
      userData.paymentDueDate = date;
      remindersModule.saveData();
      
      await remindersModule.bot.sendMessage(chatId, 
        `✅ Дата оплаты установлена: ${date}\n` +
        `Пользователь: ${userData.parentName || targetId}`);
      
      return { handled: true };
    },
    
    set_visit: async function(msg, args) {
      const chatId = msg.chat.id;
      const isAdmin = process.env.MAIN_ADMIN_ID === chatId.toString();
      
      if (!isAdmin) {
        await remindersModule.bot.sendMessage(chatId, '❌ Доступно только администраторам');
        return { handled: true };
      }
      
      if (args.length < 1) {
        await remindersModule.bot.sendMessage(chatId, 
          'Использование: /set_visit CHAT_ID\n' +
          'Пример: /set_visit 123456789');
        return { handled: true };
      }
      
      const targetId = args[0];
      
      const userData = remindersModule.users?.[targetId];
      if (!userData) {
        await remindersModule.bot.sendMessage(chatId, '❌ Пользователь не найден');
        return { handled: true };
      }
      
      userData.lastVisitDate = new Date().toISOString();
      remindersModule.saveData();
      
      await remindersModule.bot.sendMessage(chatId, 
        `✅ Отмечено посещение\n` +
        `Пользователь: ${userData.parentName || targetId}\n` +
        `Дата: ${new Date().toLocaleDateString('ru-RU')}`);
      
      return { handled: true };
    },
    
    reminders: async function(msg, args) {
      const chatId = msg.chat.id;
      const isAdmin = process.env.MAIN_ADMIN_ID === chatId.toString();
      
      if (!isAdmin) {
        await remindersModule.bot.sendMessage(chatId, '❌ Доступно только администраторам');
        return { handled: true };
      }
      
      if (args.length < 1) {
        await remindersModule.bot.sendMessage(chatId, 
          'Использование: /reminders CHAT_ID\n' +
          'Пример: /reminders 123456789');
        return { handled: true };
      }
      
      const targetId = args[0];
      const userData = remindersModule.users?.[targetId];
      
      if (!userData) {
        await remindersModule.bot.sendMessage(chatId, '❌ Пользователь не найден');
        return { handled: true };
      }
      
      let message = `⏰ НАПОМИНАНИЯ\n\n` +
        `Пользователь: ${userData.parentName || targetId}\n\n`;
      
      if (userData.trialLessonDate) {
        message += `📅 Пробное занятие: ${userData.trialLessonDate}\n`;
      }
      if (userData.paymentDueDate) {
        message += `💰 Оплата до: ${userData.paymentDueDate}\n`;
      }
      if (userData.lastVisitDate) {
        const lastVisit = new Date(userData.lastVisitDate);
        message += `👋 Последний визит: ${lastVisit.toLocaleDateString('ru-RU')}\n`;
      }
      
      if (!userData.trialLessonDate && !userData.paymentDueDate && !userData.lastVisitDate) {
        message += 'Напоминаний нет';
      }
      
      await remindersModule.bot.sendMessage(chatId, message);
      return { handled: true };
    }
  },
  
  commandDescriptions: {
    set_trial: '[Админ] Установить дату пробного занятия',
    set_payment: '[Админ] Установить дату оплаты',
    set_visit: '[Админ] Отметить посещение',
    reminders: '[Админ] Посмотреть напоминания клиента'
  },
  
  // Запуск cron задач
  startCronJobs() {
    // 1. Дни рождения - каждый день в 9:00
    this.cronJobs.push(
      cron.schedule('0 9 * * *', () => {
        this.checkBirthdays();
      })
    );
    
    // 2. Пробные занятия - каждый день в 10:00
    this.cronJobs.push(
      cron.schedule('0 10 * * *', () => {
        this.checkTrialLessons();
      })
    );
    
    // 3. Оплата - каждый день в 11:00
    this.cronJobs.push(
      cron.schedule('0 11 * * *', () => {
        this.checkPayments();
      })
    );
    
    // 4. Неактивные клиенты - каждый понедельник в 12:00
    this.cronJobs.push(
      cron.schedule('0 12 * * 1', () => {
        this.checkInactiveClients();
      })
    );
    
    logger.info('REMINDERS', 'Cron jobs started');
  },
  
  // Проверка дней рождения
  checkBirthdays() {
    logger.info('REMINDERS', 'Checking birthdays');
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const users = this.users || {};
    
    Object.keys(users).forEach(chatId => {
      const user = users[chatId];
      
      // Проверяем день рождения каждого ребёнка
      if (user.children && user.children.length > 0) {
        user.children.forEach(child => {
          if (child.birthDate) {
            const birthDate = this.parseDate(child.birthDate);
            if (birthDate) {
              birthDate.setFullYear(today.getFullYear());
              
              if (birthDate.getTime() === today.getTime()) {
                // День рождения сегодня!
                this.bot.sendMessage(
                  chatId,
                  `🎉 С ДНЁМ РОЖДЕНИЯ!\n\n` +
                  `Поздравляем ${child.fullName} с днём рождения! 🎂\n\n` +
                  `Желаем радости, улыбок и незабываемых моментов! 🎈`
                ).catch(err => logger.error('REMINDERS', 'Error sending birthday message', err.message));
                
                // Уведомляем администратора
                const adminMessage = `🎂 День рождения!\n\n` +
                  `Ребёнок: ${child.fullName}\n` +
                  `Родитель: ${user.parentName} (${chatId})`;
                
                this.bot.sendMessage(process.env.MAIN_ADMIN_ID, adminMessage)
                  .catch(() => {});
              }
            }
          }
        });
      }
    });
  },
  
  // Проверка пробных занятий
  checkTrialLessons() {
    logger.info('REMINDERS', 'Checking trial lessons');
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const users = this.users || {};
    
    Object.keys(users).forEach(chatId => {
      const user = users[chatId];
      
      if (user.trialLessonDate) {
        const trialDate = this.parseDate(user.trialLessonDate);
        if (trialDate && trialDate.getTime() === tomorrow.getTime()) {
          this.bot.sendMessage(
            chatId,
            `⏰ НАПОМИНАНИЕ\n\n` +
            `Завтра у вас пробное занятие в клубе "Квантик"!\n\n` +
            `Ждём вас по адресу: пр-т Кулакова, 5/3, 1 этаж\n` +
            `📞 Вопросы: +7 (963) 384-09-77`
          ).catch(err => logger.error('REMINDERS', 'Error sending trial reminder', err.message));
        }
      }
    });
  },
  
  // Проверка оплаты
  checkPayments() {
    logger.info('REMINDERS', 'Checking payments');
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const threeDaysLater = new Date(today);
    threeDaysLater.setDate(threeDaysLater.getDate() + 3);
    
    const users = this.users || {};
    
    Object.keys(users).forEach(chatId => {
      const user = users[chatId];
      
      if (user.paymentDueDate) {
        const dueDate = this.parseDate(user.paymentDueDate);
        
        if (dueDate) {
          // За 3 дня
          if (dueDate.getTime() === threeDaysLater.getTime()) {
            this.bot.sendMessage(
              chatId,
              `💰 НАПОМИНАНИЕ ОБ ОПЛАТЕ\n\n` +
              `Через 3 дня (${user.paymentDueDate}) необходимо внести оплату.\n\n` +
              `Вы можете оплатить онлайн или в клубе.\n` +
              `📞 Вопросы: +7 (963) 384-09-77`
            ).catch(err => logger.error('REMINDERS', 'Error sending payment reminder', err.message));
          }
          
          // В день оплаты
          if (dueDate.getTime() === today.getTime()) {
            this.bot.sendMessage(
              chatId,
              `💰 СРОК ОПЛАТЫ\n\n` +
              `Сегодня последний день для внесения оплаты.\n\n` +
              `Вы можете оплатить онлайн или в клубе.\n` +
              `📞 Вопросы: +7 (963) 384-09-77`
            ).catch(err => logger.error('REMINDERS', 'Error sending payment due reminder', err.message));
          }
        }
      }
    });
  },
  
  // Проверка неактивных клиентов
  checkInactiveClients() {
    logger.info('REMINDERS', 'Checking inactive clients');
    
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    
    const users = this.users || {};
    
    Object.keys(users).forEach(chatId => {
      const user = users[chatId];
      
      if (user.lastVisitDate) {
        const lastVisit = new Date(user.lastVisitDate);
        
        if (lastVisit < twoWeeksAgo) {
          this.bot.sendMessage(
            chatId,
            `👋 МЫ СКУЧАЕМ!\n\n` +
            `${user.parentName}, мы давно вас не видели в клубе "Квантик"!\n\n` +
            `Приходите, у нас много интересного! 🎨📚🎮\n` +
            `📞 Звоните: +7 (963) 384-09-77`
          ).catch(err => logger.error('REMINDERS', 'Error sending inactive reminder', err.message));
        }
      }
    });
  },
  
  // Парсинг даты из строки ДД.ММ.ГГГГ
  parseDate(dateStr) {
    const parts = dateStr.split('.');
    if (parts.length !== 3) return null;
    const date = new Date(parts[2], parts[1] - 1, parts[0]);
    date.setHours(0, 0, 0, 0);
    return date;
  },
  
  // Остановка при выключении модуля
  async destroy() {
    this.cronJobs.forEach(job => job.stop());
    logger.info('REMINDERS', 'Cron jobs stopped');
  }
};

module.exports = remindersModule;
