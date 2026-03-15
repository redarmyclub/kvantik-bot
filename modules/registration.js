/**
 * Модуль регистрации пользователей
 * Обрабатывает регистрацию родителей и добавление детей
 */

const logger = require('../utils/logger');
const createNotificationRouter = require('../utils/notificationRouter');

const registrationModule = {
  name: 'registration',
  version: '1.0.0',
  description: 'Регистрация пользователей и добавление детей',
  enabled: true,
  
  async init(context) {
    this.bot = context.bot;
    this.data = context.data;
    this.saveData = context.saveData;
    this.notificationRouter = createNotificationRouter(this.bot, logger);
    
    // Инициализация состояний пользователей
    if (!this.data.userStates) {
      this.data.userStates = {};
    }
    
    console.log('  📝 Регистрация: инициализировано');
  },
  
  commands: {
    register: async function(msg) {
      const chatId = msg.chat.id;
      return registrationModule.startRegistration(chatId);
    }
  },
  
  commandDescriptions: {
    register: 'Зарегистрироваться'
  },
  
  // Начать регистрацию
  startRegistration(chatId) {
    this.data.userStates[chatId] = {
      stage: 'waiting_parent_name',
      tempData: {}
    };
    this.saveData();
    
    this.bot.sendMessage(
      chatId,
      '📝 РЕГИСТРАЦИЯ\n\n' +
      'Как к вам обращаться? (Ваше имя)',
      { reply_markup: { remove_keyboard: true } }
    );
    
    return { success: true, handled: true };
  },
  
  // Начать добавление ребёнка
  startAddChild(chatId, userData) {
    if (!userData.isRegistered) {
      this.bot.sendMessage(chatId, '❌ Сначала пройдите регистрацию');
      return { success: false };
    }
    
    if (userData.children && userData.children.length >= 5) {
      this.bot.sendMessage(chatId, '❌ Максимум 5 детей');
      return { success: false };
    }
    
    this.data.userStates[chatId] = {
      stage: 'adding_child_name',
      tempChild: {}
    };
    this.saveData();
    
    this.bot.sendMessage(
      chatId,
      '👶 ДОБАВЛЕНИЕ РЕБЁНКА\n\n' +
      'Введите ФИО ребёнка:',
      { reply_markup: { remove_keyboard: true } }
    );
    
    return { success: true, handled: true };
  },
  
  // Обработка сообщений для регистрации
  async handleMessage(msg, userData) {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    const state = this.data.userStates[chatId];
    if (!state) return { handled: false };
    
    try {
      switch (state.stage) {
        case 'waiting_parent_name':
          state.tempData.parentName = text;
          state.stage = 'waiting_full_name';
          this.saveData();
          
          this.bot.sendMessage(
            chatId,
            `Приятно познакомиться, ${text}! 😊\n\n` +
            'Теперь введите ваше ФИО полностью:'
          );
          return { handled: true };
          
        case 'waiting_full_name':
          state.tempData.parentFullName = text;
          state.stage = 'waiting_phone';
          this.saveData();
          
          this.bot.sendMessage(
            chatId,
            'Отлично! Теперь введите ваш номер телефона:\n' +
            '(В формате: +7 XXX XXX-XX-XX или 8 XXX XXX-XX-XX)'
          );
          return { handled: true };
          
        case 'waiting_phone':
          const phone = text.replace(/[^\d+]/g, '');
          if (phone.length < 11) {
            this.bot.sendMessage(chatId, '❌ Неверный формат телефона. Попробуйте ещё раз:');
            return { handled: true };
          }
          
          // Сохраняем данные родителя
          userData.parentName = state.tempData.parentName;
          userData.parentFullName = state.tempData.parentFullName;
          userData.phone = phone;
          userData.isRegistered = true;
          userData.registeredAt = new Date().toISOString();
          
          if (!userData.children) {
            userData.children = [];
          }
          
          // Переходим к добавлению первого ребёнка
          state.stage = 'adding_child_name';
          state.tempChild = {};
          this.saveData();
          
          this.bot.sendMessage(
            chatId,
            '✅ Отлично! Вы зарегистрированы!\n\n' +
            '👶 Теперь добавим информацию о ребёнке.\n\n' +
            'Введите ФИО ребёнка:'
          );
          
          logger.info('REGISTRATION', `User registered: ${chatId}`, {
            name: userData.parentName,
            phone: userData.phone
          });
          
          return { handled: true };
          
        case 'adding_child_name':
          state.tempChild.fullName = text;
          state.stage = 'adding_child_birthdate';
          this.saveData();
          
          this.bot.sendMessage(
            chatId,
            'Дата рождения ребёнка?\n' +
            '(В формате: ДД.ММ.ГГГГ, например: 15.03.2015)'
          );
          return { handled: true };
          
        case 'adding_child_birthdate':
          const dateRegex = /^(\d{2})\.(\d{2})\.(\d{4})$/;
          if (!dateRegex.test(text)) {
            this.bot.sendMessage(chatId, '❌ Неверный формат даты. Используйте: ДД.ММ.ГГГГ');
            return { handled: true };
          }
          
          state.tempChild.birthDate = text;
          state.stage = 'adding_child_gender';
          this.saveData();
          
          this.bot.sendMessage(
            chatId,
            'Пол ребёнка?',
            {
              reply_markup: {
                keyboard: [
                  ['👦 Мальчик', '👧 Девочка']
                ],
                resize_keyboard: true,
                one_time_keyboard: true
              }
            }
          );
          return { handled: true };
          
        case 'adding_child_gender':
          let gender;
          if (text.includes('Мальчик') || text.toLowerCase().includes('мальчик')) {
            gender = 'Мальчик';
          } else if (text.includes('Девочка') || text.toLowerCase().includes('девочка')) {
            gender = 'Девочка';
          } else {
            this.bot.sendMessage(chatId, '❌ Выберите пол из кнопок ниже:', {
              reply_markup: {
                keyboard: [['👦 Мальчик', '👧 Девочка']],
                resize_keyboard: true
              }
            });
            return { handled: true };
          }
          
          state.tempChild.gender = gender;
          state.stage = 'adding_child_note';
          this.saveData();
          
          this.bot.sendMessage(
            chatId,
            'Есть ли какие-то особенности или пожелания?\n' +
            '(Или напишите "нет")',
            { reply_markup: { remove_keyboard: true } }
          );
          return { handled: true };
          
        case 'adding_child_note':
          const note = text.toLowerCase() === 'нет' ? '' : text;
          
          // Сохраняем ребёнка
          const child = {
            fullName: state.tempChild.fullName,
            birthDate: state.tempChild.birthDate,
            gender: state.tempChild.gender,
            note: note,
            registeredAt: new Date().toISOString()
          };
          
          userData.children.push(child);
          
          // Создаем клиента в CRM (если модуль доступен)
          let crmResult = { success: false, error: 'CRM не подключен' };
          const crmModule = require('./alfaCRM');
          if (crmModule && crmModule.enabled) {
            crmResult = await crmModule.createCustomer({
              childFullName: child.fullName,
              childBirthDate: child.birthDate,
              childGender: child.gender,
              parentFullName: userData.parentFullName,
              phone: userData.phone,
              note: child.note
            });
          }
          
          // Уведомление администраторов
          this.notifyAdmins(chatId, userData, child, crmResult);
          
          // Очищаем состояние
          delete this.data.userStates[chatId];
          this.saveData();
          
          let successMessage = '✅ РЕГИСТРАЦИЯ ЗАВЕРШЕНА!\n\n' +
            `Родитель: ${userData.parentFullName}\n` +
            `Ребёнок: ${child.fullName}\n` +
            `Дата рождения: ${child.birthDate}\n` +
            `Пол: ${child.gender}\n\n`;
          
          if (crmResult.success) {
            successMessage += `✅ Клиент создан в CRM (ID: ${crmResult.customerId})\n\n`;
          }
          
          successMessage += 'Спасибо! Скоро с вами свяжется администратор.';
          
          // Получаем функцию showUserMenu из context
          const { showUserMenu } = require('../bot');
          
          // Отправляем сообщение с меню
          await this.bot.sendMessage(chatId, successMessage);
          
          // Небольшая задержка перед показом меню
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Показываем полное пользовательское меню
          showUserMenu(chatId);
          
          logger.info('REGISTRATION', `Child added for user ${chatId}`, {
            childName: child.fullName,
            totalChildren: userData.children.length,
            crmId: crmResult.customerId || null
          });
          
          return { handled: true };
      }
    } catch (error) {
      logger.error('REGISTRATION', 'Error handling message', error.message);
      delete this.data.userStates[chatId];
      this.saveData();
      
      this.bot.sendMessage(
        chatId,
        '❌ Произошла ошибка. Попробуйте начать регистрацию заново: /register'
      );
      return { handled: true };
    }
    
    return { handled: false };
  },
  
  // Уведомление администраторов
  notifyAdmins(chatId, userData, child, crmResult = null) {
    let message =
      `🎉 НОВАЯ РЕГИСТРАЦИЯ!\n\n` +
      `👤 Родитель: ${userData.parentFullName}\n` +
      `📱 Телефон: ${userData.phone}\n` +
      `💬 Telegram ID: ${chatId}\n\n` +
      `👶 Ребёнок: ${child.fullName}\n` +
      `🎂 Дата рождения: ${child.birthDate}\n` +
      `👫 Пол: ${child.gender}\n` +
      `📝 Примечание: ${child.note || 'нет'}\n\n` +
      `👥 Всего детей: ${userData.children.length}`;
    
    if (crmResult) {
      if (crmResult.success) {
        message += `\n\n✅ Создан в CRM (ID: ${crmResult.customerId})`;
      } else {
        message += `\n\n❌ Ошибка CRM: ${crmResult.error}`;
      }
    }
    
    // Отправляем администраторам
    this.notificationRouter.sendAdminMessage(message).catch(() => {
      console.log('Не удалось отправить уведомление админу');
    });
  }
};

module.exports = registrationModule;
