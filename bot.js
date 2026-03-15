#!/usr/bin/env node
/**
 * KVANTIK BOT - Главный файл
 * Telegram бот для детского клуба "Квантик"
 * 
 * Версия: 2.0.0 (с системой модулей)
 */

const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// ============ УТИЛИТЫ И КОНФИГУРАЦИЯ ============
const config = require('./config/config');
const logger = require('./utils/logger');
const storage = require('./utils/storage');
const validator = require('./utils/validator');
const backup = require('./utils/backup');
const monitoring = require('./utils/monitoring');
const ModuleLoader = require('./core/moduleLoader');
const createNotificationRouter = require('./utils/notificationRouter');

// ============ ИНИЦИАЛИЗАЦИЯ БОТА ============
const TOKEN = config.telegram?.token;
if (!TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN не задан. Укажите токен в переменных окружения.');
}

const bot = new TelegramBot(TOKEN, { 
  polling: {
    interval: 300,
    autoStart: true,
    params: {
      timeout: 10
    }
  }
});

// ============ АДМИНИСТРАТОРЫ ============
const MAIN_ADMIN_ID = config.admin?.mainAdminId;
const ADDITIONAL_ADMINS = config.admin?.additionalAdmins || [];
const notificationRouter = createNotificationRouter(bot, logger);

// ============ ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ============
let userData = {};
let conversationHistory = {};
let userLeads = {};
let pendingQuestions = {};
let reviews = {};
const reminders = {};

// Защита от спама
const messageCounters = {};
const registrationAttempts = {};
const questionAttempts = {};
const bannedUsers = {};

// ============ СИСТЕМА ЗАГРУЗКИ МОДУЛЕЙ ============
const moduleLoader = new ModuleLoader(bot);

// ============ ФУНКЦИИ РАБОТЫ С ДАННЫМИ ============

function isAdmin(chatId) {
  const id = String(chatId);
  
  // Главный админ
  if (id === String(MAIN_ADMIN_ID)) return true;
  
  // Проверяем через модуль adminManagement
  const adminMgmt = moduleLoader?.getModule('adminManagement');
  if (adminMgmt) {
    return adminMgmt.isAdmin(chatId);
  }
  
  // Fallback на старый список
  return ADDITIONAL_ADMINS.includes(id);
}

function isMainAdmin(chatId) {
  return String(chatId) === String(MAIN_ADMIN_ID);
}

function isForceUserMode(chatId) {
  if (!isAdmin(chatId)) return false;
  const user = getUserData(chatId);
  return user.forceUserMode === true;
}

function isAdminInteractionMode(chatId) {
  return isAdmin(chatId) && !isForceUserMode(chatId);
}

function setForceUserMode(chatId, enabled) {
  if (!isAdmin(chatId)) return false;

  const user = getUserData(chatId);
  const nextValue = enabled === true;

  if (nextValue) {
    if (user.forceUserMode === true) return false;
    user.forceUserMode = true;
    return true;
  }

  if (user.forceUserMode === true) {
    delete user.forceUserMode;
    return true;
  }

  return false;
}

function getUserData(chatId) {
  if (!userData[chatId]) {
    userData[chatId] = {
      chatId: chatId,
      isRegistered: false,
      children: [],
      createdAt: new Date().toISOString()
    };
  }
  return userData[chatId];
}

function clearPendingUserState(chatId) {
  const user = getUserData(chatId);
  let changed = false;

  // Локальные временные поля в профиле пользователя
  const localTempFields = [
    'adminAction',
    'userAction',
    'adminTargetId',
    'stage',
    'tempChild',
    'tempData',
    'editingChildIndex',
    'draftRegistration',
    'registrationDraft',
    'pendingReminderAction',
    'pendingReminderTargetId'
  ];

  for (const field of localTempFields) {
    if (Object.prototype.hasOwnProperty.call(user, field)) {
      delete user[field];
      changed = true;
    }
  }

  // Временные состояния в модулях (registration/questions и любые аналогичные)
  for (const [moduleName, module] of moduleLoader.modules) {
    if (module?.data?.userStates && Object.prototype.hasOwnProperty.call(module.data.userStates, chatId)) {
      delete module.data.userStates[chatId];
      moduleLoader.saveModuleData(moduleName);
      changed = true;
    }
  }

  return changed;
}

function isInterruptingMenuButton(text) {
  const menuButtons = new Set([
    '🏠 Главное меню',
    '👨‍💼 Админ-панель',
    'Меню',
    '📝 Регистрация',
    '👶 Добавить ребёнка',
    '❓ Задать вопрос',
    '⭐️ Оставить отзыв',
    '🎟️ Ввести промокод',
    'ℹ️ О клубе',
    '👥 Пользователи',
    '❓ Неотвеченные',
    '📢 Рассылка',
    '✉️ Отправить сообщение',
    '📊 Статистика',
    '💾 Экспорт',
    '⏰ Напоминания',
    '🎟️ Промокоды',
    '📅 Расписание',
    '⚙️ Настройки',
    '👤 Пользовательский режим',
    '👑 Управление админами',
    '🔙 Назад в админ-панель',
    '📋 Список пользователей',
    '🔍 Найти пользователя',
    '📈 Статистика',
    '📋 Просмотр напоминаний',
    '📅 Установить пробное',
    '💰 Установить оплату',
    '👋 Отметить посещение',
    '➕ Создать промокод',
    '📋 Список промокодов',
    '📊 Статистика промокодов',
    '📅 Сегодня',
    '📆 Завтра',
    '📊 На неделю',
    '📥 Экспорт пользователей',
    '📥 Экспорт статистики',
    '➕ Добавить администратора',
    '➖ Удалить администратора',
    '📋 Список администраторов',
    '📈 Общая статистика',
    '📋 Конверсия',
    '📤 Всем',
    '✅ Зарегистрированным',
    '⏳ Незарегистрированным',
    '🔙 Назад'
  ]);

  return menuButtons.has(text);
}

function saveData() {
  try {
    storage.saveSync('users', userData);
    storage.saveSync('leads', userLeads);
    storage.saveSync('questions', pendingQuestions);
    storage.saveSync('reviews', reviews);
    moduleLoader.saveAllModuleData();
    logger.info('SYSTEM', 'Data saved successfully');
  } catch (error) {
    logger.error('SYSTEM', 'Error saving data', error.message);
  }
}

function loadData() {
  try {
    userData = storage.loadSync('users') || {};
    userLeads = storage.loadSync('leads') || {};
    pendingQuestions = storage.loadSync('questions') || {};
    reviews = storage.loadSync('reviews') || {};
    logger.info('SYSTEM', `Data loaded: ${Object.keys(userData).length} users`);
  } catch (error) {
    logger.error('SYSTEM', 'Error loading data', error.message);
  }
}

// ============ ЗАЩИТА ОТ СПАМА ============

function isUserBanned(chatId) {
  if (isAdmin(chatId)) return false;
  
  if (bannedUsers[chatId]) {
    const banEndTime = bannedUsers[chatId];
    if (Date.now() < banEndTime) {
      return true;
    } else {
      delete bannedUsers[chatId];
      return false;
    }
  }
  return false;
}

function checkMessageSpam(chatId) {
  if (isAdmin(chatId)) return false;
  
  const now = Date.now();
  const oneMinuteAgo = now - 60000;
  
  if (!messageCounters[chatId]) {
    messageCounters[chatId] = [];
  }
  
  messageCounters[chatId] = messageCounters[chatId].filter(time => time > oneMinuteAgo);
  messageCounters[chatId].push(now);
  
  const messageCount = messageCounters[chatId].length;
  const maxMessages = config.spam?.maxMessagesPerMinute || 10;
  
  if (messageCount >= maxMessages) {
    banUser(chatId, 'слишком много сообщений');
    return true;
  }
  
  return false;
}

function banUser(chatId, reason = 'спам') {
  if (isAdmin(chatId)) return;
  
  const banDuration = config.spam?.banDuration || (5 * 60 * 1000);
  bannedUsers[chatId] = Date.now() + banDuration;
  const banMinutes = Math.floor(banDuration / 60000);
  
  bot.sendMessage(
    chatId,
    `⛔️ ВЫ ВРЕМЕННО ЗАБЛОКИРОВАНЫ\n\n` +
    `Причина: ${reason}\n` +
    `Длительность: ${banMinutes} минут`
  );
  
  logger.security('AUTOBAN', chatId, reason);
}

// ============ ОБРАБОТЧИКИ КОМАНД ============

// Главное меню для пользователей
function showUserMenu(chatId, text = '🏠 Главное меню') {
  const keyboardRows = [
    ['📝 Регистрация', '👶 Добавить ребёнка'],
    ['❓ Задать вопрос', '⭐️ Оставить отзыв'],
    ['🎟️ Ввести промокод', 'ℹ️ О клубе']
  ];

  if (isAdmin(chatId)) {
    keyboardRows.push(['👨‍💼 Админ-панель']);
  }

  const keyboard = {
    reply_markup: {
      keyboard: keyboardRows,
      resize_keyboard: true
    }
  };
  
  bot.sendMessage(chatId, text, keyboard);
}

// Главное меню для администраторов
function showAdminMenu(chatId, text = '👨‍💼 Админ-панель') {
  const isMainAdmin = String(MAIN_ADMIN_ID) === chatId.toString();
  
  const keyboard = {
    reply_markup: {
      keyboard: [
        ['👥 Пользователи', '❓ Неотвеченные'],
        ['📢 Рассылка', '✉️ Отправить сообщение'],
        ['📊 Статистика', '💾 Экспорт'],
        ['⏰ Напоминания', '🎟️ Промокоды'],
        ['📅 Расписание', '⚙️ Настройки'],
        isMainAdmin ? ['👑 Управление админами', '👤 Пользовательский режим'] : ['👤 Пользовательский режим']
      ].filter(Boolean),
      resize_keyboard: true
    }
  };
  
  bot.sendMessage(chatId, text, keyboard);
}

// Подменю: Пользователи
function showUsersMenu(chatId) {
  const keyboard = {
    reply_markup: {
      keyboard: [
        ['📋 Список пользователей', '🔍 Найти пользователя'],
        ['📈 Статистика'],
        ['🔙 Назад в админ-панель']
      ],
      resize_keyboard: true
    }
  };
  
  bot.sendMessage(chatId, '👥 Управление пользователями', keyboard);
}

// Подменю: Напоминания
function showRemindersMenu(chatId) {
  const keyboard = {
    reply_markup: {
      keyboard: [
        ['📅 Установить пробное', '💰 Установить оплату'],
        ['👋 Отметить посещение', '📋 Просмотр напоминаний'],
        ['🔙 Назад в админ-панель']
      ],
      resize_keyboard: true
    }
  };
  
  bot.sendMessage(chatId, '⏰ Управление напоминаниями', keyboard);
}

// Подменю: Промокоды
function showPromoMenu(chatId) {
  const keyboard = {
    reply_markup: {
      keyboard: [
        ['➕ Создать промокод', '📋 Список промокодов'],
        ['📊 Статистика промокодов'],
        ['🔙 Назад в админ-панель']
      ],
      resize_keyboard: true
    }
  };
  
  bot.sendMessage(chatId, '🎟️ Управление промокодами', keyboard);
}

// Подменю: Расписание
function showScheduleMenu(chatId) {
  const keyboard = {
    reply_markup: {
      keyboard: [
        ['📅 Сегодня', '📆 Завтра'],
        ['📊 На неделю'],
        ['🔙 Назад в админ-панель']
      ],
      resize_keyboard: true
    }
  };
  
  bot.sendMessage(chatId, '📅 Расписание занятий', keyboard);
}

// Подменю: Экспорт
function showExportMenu(chatId) {
  const keyboard = {
    reply_markup: {
      keyboard: [
        ['📥 Экспорт пользователей', '📥 Экспорт статистики'],
        ['🔙 Назад в админ-панель']
      ],
      resize_keyboard: true
    }
  };
  
  bot.sendMessage(chatId, '💾 Экспорт данных', keyboard);
}

// Подменю: Управление админами
function showAdminManagementMenu(chatId) {
  const keyboard = {
    reply_markup: {
      keyboard: [
        ['➕ Добавить администратора', '➖ Удалить администратора'],
        ['📋 Список администраторов'],
        ['🔙 Назад в админ-панель']
      ],
      resize_keyboard: true
    }
  };
  
  bot.sendMessage(chatId, '👑 Управление администраторами', keyboard);
}

// Универсальная функция показа меню
function showMainMenu(chatId, text) {
  if (isAdminInteractionMode(chatId)) {
    showAdminMenu(chatId, text);
  } else {
    showUserMenu(chatId, text);
  }
}

// Команда /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  
  if (isUserBanned(chatId)) return;
  if (checkMessageSpam(chatId)) return;
  
  const user = getUserData(chatId);

  const wasStateCleared = clearPendingUserState(chatId);
  const wasUserModeReset = setForceUserMode(chatId, false);
  if (wasStateCleared || wasUserModeReset) {
    saveData();
  }
  
  let welcomeMessage;
  
  if (isAdmin(chatId)) {
    welcomeMessage = 
      `👨‍💼 АДМИН-ПАНЕЛЬ\n\n` +
      `Добро пожаловать в панель управления ботом "Квантик"!\n\n` +
      `Используйте меню ниже для управления:`;
    showAdminMenu(chatId, welcomeMessage);
  } else {
    if (user.isRegistered) {
      welcomeMessage = 
        `👋 С возвращением, ${user.parentName}!\n\n` +
        `Рады видеть вас снова в детском клубе "Квантик"!\n\n` +
        `Выберите действие из меню ниже:`;
    } else {
      welcomeMessage = 
        `👋 Добро пожаловать в детский клуб "Квантик"!\n\n` +
        `Я помогу вам:\n` +
        `• Записаться на занятия\n` +
        `• Узнать расписание и цены\n` +
        `• Получить ответы на вопросы\n\n` +
        `Выберите действие из меню ниже:`;
    }
    showUserMenu(chatId, welcomeMessage);
  }
  
  logger.info('USER', chatId, 'Started bot');
});

// Команда /help
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  
  const helpMessage = 
    `📖 СПРАВКА\n\n` +
    `Основные команды:\n` +
    `/start - Главное меню\n` +
    `/help - Эта справка\n` +
    `/status - Мой статус\n\n` +
    `Для администраторов:\n` +
    `/admin - Панель администратора\n` +
    `/modules - Управление модулями`;
  
  bot.sendMessage(chatId, helpMessage);
});

// Команда /cancel
bot.onText(/\/cancel/, (msg) => {
  const chatId = msg.chat.id;

  if (isUserBanned(chatId)) return;
  if (checkMessageSpam(chatId)) return;

  const wasStateCleared = clearPendingUserState(chatId);
  if (wasStateCleared) {
    saveData();
  }

  showMainMenu(chatId, '❌ Текущий сценарий отменён');
});

// Команда /status
bot.onText(/\/status/, (msg) => {
  const chatId = msg.chat.id;
  const user = getUserData(chatId);
  
  let statusMessage = `👤 ВАШ СТАТУС\n\n`;
  
  if (user.isRegistered) {
    statusMessage += `✅ Зарегистрирован\n`;
    statusMessage += `👤 ${user.parentName}\n`;
    statusMessage += `📱 ${user.phone}\n`;
    statusMessage += `👶 Детей: ${user.children?.length || 0}\n`;
  } else {
    statusMessage += `❌ Не зарегистрирован\n\n`;
    statusMessage += `Используйте "📝 Регистрация" для записи`;
  }
  
  bot.sendMessage(chatId, statusMessage);
});

// Команда /modules (для админов)
bot.onText(/\/modules/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(chatId)) {
    bot.sendMessage(chatId, '❌ Доступно только администраторам');
    return;
  }
  
  const modules = moduleLoader.getAllModules();
  const stats = moduleLoader.getStats();
  
  let message = `📦 МОДУЛИ БОТА\n\n`;
  message += `Всего загружено: ${stats.total}\n`;
  message += `Доступно команд: ${stats.commands}\n\n`;
  
  modules.forEach(mod => {
    const status = mod.enabled ? '✅' : '❌';
    message += `${status} ${mod.name} v${mod.version}\n`;
    message += `   ${mod.description}\n\n`;
  });
  
  bot.sendMessage(chatId, message);
});

// ============ ОБРАБОТЧИК INLINE КНОПОК ============

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const messageId = query.message.message_id;
  
  try {
    // Ответить на вопрос
    if (data.startsWith('answer_')) {
      const questionId = data.replace('answer_', '');
      
      // Находим вопрос
      const questionsModule = moduleLoader.getModule('questions');
      if (!questionsModule) {
        bot.answerCallbackQuery(query.id, { text: '❌ Модуль вопросов не загружен' });
        return;
      }
      
      const question = pendingQuestions[questionId];
      if (!question) {
        bot.answerCallbackQuery(query.id, { text: '❌ Вопрос не найден' });
        return;
      }
      
      // Устанавливаем состояние для ответа
      const user = userData[chatId];
      if (!user) userData[chatId] = {};
      
      userData[chatId].adminAction = 'send_message';
      userData[chatId].adminTargetId = question.chatId;
      saveData();
      
      // Подтверждаем нажатие
      bot.answerCallbackQuery(query.id, { text: '✅ Введите ответ' });
      
      // Отправляем запрос на ввод ответа
      const targetUser = userData[question.chatId];
      bot.sendMessage(chatId,
        `✅ Пользователь: ${targetUser?.parentName || 'Гость'}\n\n` +
        `❓ Вопрос:\n${question.question}\n\n` +
        `Введите ваш ответ:`,
        { reply_markup: { remove_keyboard: true } }
      );
      
      return;
    }
    
    // Подтверждаем callback query
    bot.answerCallbackQuery(query.id);
    
  } catch (error) {
    logger.error('CALLBACK', 'Error handling callback query', error.message);
    bot.answerCallbackQuery(query.id, { text: '❌ Ошибка' });
  }
});

// ============ ОБРАБОТЧИК ТЕКСТОВЫХ СООБЩЕНИЙ ============

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  // Пропускаем команды
  if (text?.startsWith('/')) return;
  
  // Проверки
  if (isUserBanned(chatId)) return;
  if (checkMessageSpam(chatId)) return;
  
  const user = getUserData(chatId);
  const admin = isAdminInteractionMode(chatId);

  // Глобальный прерыватель: для админ-аккаунта всегда возвращаем в админ-режим
  if (text === '👨‍💼 Админ-панель' && isAdmin(chatId)) {
    const wasStateCleared = clearPendingUserState(chatId);
    const wasUserModeReset = setForceUserMode(chatId, false);
    if (wasStateCleared || wasUserModeReset) {
      saveData();
    }
    showAdminMenu(chatId);
    return;
  }

  // Любая кнопка меню/навигации должна прерывать застрявший сценарий
  if (isInterruptingMenuButton(text)) {
    const wasStateCleared = clearPendingUserState(chatId);
    if (wasStateCleared) {
      saveData();
    }
  }
  
  // КРИТИЧНО: Обработка состояний администратора ПЕРЕД всем остальным
  if (admin && user.adminAction) {
    await handleAdminState(chatId, text, user.adminAction);
    return;
  }
  
  // Обработка состояний пользователя (промокод и т.д.)
  if (!admin && user.userAction) {
    await handleUserState(chatId, text, user.userAction, user);
    return;
  }
  
  // Попытка обработать сообщение через модули (регистрация, вопросы и т.д.)
  try {
    // Сначала проверяем модули которые обрабатывают состояния пользователя
    const registrationModule = moduleLoader.getModule('registration');
    if (registrationModule) {
      const result = await registrationModule.handleMessage(msg, user);
      if (result?.handled) {
        saveData();
        return;
      }
    }
    
    const questionsModule = moduleLoader.getModule('questions');
    if (questionsModule) {
      const result = await questionsModule.handleMessage(msg, user);
      if (result?.handled) {
        saveData();
        return;
      }
    }
    
    // Затем пробуем другие модули
    const results = await moduleLoader.callModuleMethod('handleMessage', msg, user);
    if (results.some(r => r.result?.handled)) {
      saveData();
      return;
    }
  } catch (error) {
    logger.error('MODULE', 'Error handling message', error.message);
  }
  
  // ============ ОБРАБОТКА КНОПОК ============
  
  // === ОБЩИЕ КНОПКИ ===
  if (text === '🏠 Главное меню' || text === 'Меню') {
    showMainMenu(chatId);
    return;
  }
  
  if (text === 'ℹ️ О клубе') {
    bot.sendMessage(chatId, 
      `ℹ️ О КЛУБЕ "КВАНТИК"\n\n` +
      `Детский развивающий клуб в Ставрополе\n\n` +
      `📍 Адрес:\nг. Ставрополь, пр-т Кулакова, 5/3, 1 этаж\n\n` +
      `⏰ Режим работы:\nПН-ПТ 9:00-19:00\n\n` +
      `📞 Телефон:\n+7 (963) 384-09-77\n\n` +
      `🌐 Сайт:\nkvantik.durablesites.com\n\n` +
      `👶 Возраст: от 9 месяцев до 12 лет\n` +
      `🎯 Гибкий график посещения\n` +
      `👥 Камерные группы и индивидуальный подход\n\n` +
      `Пишите, звоните - мы всегда рады помочь! 😊`
    );
    return;
  }
  
  // === КНОПКИ ДЛЯ ПОЛЬЗОВАТЕЛЕЙ ===
  if (!admin) {
    let buttonHandled = false;
    
    switch (text) {
      case '📝 Регистрация':
        const regModule = moduleLoader.getModule('registration');
        if (regModule) {
          regModule.startRegistration(chatId);
        } else {
          bot.sendMessage(chatId, '❌ Модуль регистрации не загружен');
        }
        buttonHandled = true;
        break;
        
      case '👶 Добавить ребёнка':
        const addChildModule = moduleLoader.getModule('registration');
        if (addChildModule) {
          addChildModule.startAddChild(chatId, user);
        } else {
          bot.sendMessage(chatId, '❌ Модуль регистрации не загружен');
        }
        buttonHandled = true;
        break;
        
      case '❓ Задать вопрос':
        const qModule = moduleLoader.getModule('questions');
        if (qModule) {
          qModule.startQuestion(chatId);
        } else {
          bot.sendMessage(chatId, '❌ Модуль вопросов не загружен');
        }
        buttonHandled = true;
        break;
        
      case '⭐️ Оставить отзыв':
        const revModule = moduleLoader.getModule('questions');
        if (revModule) {
          revModule.startReview(chatId);
        } else {
          bot.sendMessage(chatId, '❌ Модуль отзывов не загружен');
        }
        buttonHandled = true;
        break;
        
      case '🎟️ Ввести промокод':
        user.userAction = 'enter_promo_code';
        saveData();
        bot.sendMessage(chatId,
          '🎟️ ВВЕСТИ ПРОМОКОД\n\n' +
          'Введите код промокода:\n\n' +
          'Пример: SUMMER2024',
          { reply_markup: { remove_keyboard: true } }
        );
        buttonHandled = true;
        break;
    }
    
    if (buttonHandled) {
      saveData();
      return;
    }
    
    // Если не кнопка - продолжаем обработку (дойдем до AI)
  }
  
  // === КНОПКИ ДЛЯ АДМИНИСТРАТОРОВ ===
  if (admin) {
    // Главное админ-меню
    if (text === '👤 Пользовательский режим') {
      const wasStateCleared = clearPendingUserState(chatId);
      const wasUserModeEnabled = setForceUserMode(chatId, true);
      if (wasStateCleared || wasUserModeEnabled) {
        saveData();
      }
      showUserMenu(chatId, 'Переключено в пользовательский режим.\nДля возврата используйте "👨‍💼 Админ-панель" или /start');
      return;
    }
    
    // Пользователи
    if (text === '👥 Пользователи') {
      showUsersMenu(chatId);
      return;
    }
    
    if (text === '📋 Список пользователей') {
      const users = userData || {};
      const total = Object.keys(users).length;
      const registered = Object.values(users).filter(u => u.isRegistered).length;
      
      let message = `👥 ПОЛЬЗОВАТЕЛИ (${total})\n\n`;
      message += `✅ Зарегистрировано: ${registered}\n`;
      message += `⏳ Не зарегистрировано: ${total - registered}\n\n`;
      
      const recent = Object.entries(users)
        .sort((a, b) => new Date(b[1].createdAt || 0) - new Date(a[1].createdAt || 0))
        .slice(0, 10);
      
      message += `📋 Последние 10:\n`;
      recent.forEach(([id, u]) => {
        const name = u.parentName || 'Гость';
        const status = u.isRegistered ? '✅' : '⏳';
        message += `${status} ${name} (${id})\n`;
      });
      
      message += `\nДля просмотра конкретного пользователя используйте кнопку "🔍 Найти пользователя"`;
      
      bot.sendMessage(chatId, message);
      return;
    }
    
    if (text === '🔍 Найти пользователя') {
      bot.sendMessage(chatId, 
        '🔍 Введите ID пользователя:\n\n' +
        'Пример: 123456789',
        { reply_markup: { remove_keyboard: true } }
      );
      
      // Устанавливаем состояние ожидания ID
      if (!userData[chatId]) userData[chatId] = {};
      userData[chatId].adminAction = 'awaiting_user_id';
      saveData();
      return;
    }
    
    if (text === '📈 Статистика') {
      const statsModule = moduleLoader.getModule('statistics');
      if (statsModule && statsModule.commands.stats) {
        await statsModule.commands.stats(msg);
      } else {
        bot.sendMessage(chatId, '❌ Модуль статистики не загружен');
      }
      return;
    }
    
    // Неотвеченные вопросы
    if (text === '❓ Неотвеченные') {
      const questionsModule = moduleLoader.getModule('questions');
      if (!questionsModule) {
        bot.sendMessage(chatId, '❌ Модуль вопросов не загружен');
        return;
      }
      
      const pending = questionsModule.getPendingQuestions();
      
      if (pending.length === 0) {
        bot.sendMessage(chatId, '✅ Нет неотвеченных вопросов', {
          reply_markup: {
            keyboard: [
              ['🔙 Назад в админ-панель']
            ],
            resize_keyboard: true
          }
        });
        return;
      }
      
      await bot.sendMessage(chatId, `❓ НЕОТВЕЧЕННЫЕ ВОПРОСЫ: ${pending.length}`, {
        reply_markup: {
          keyboard: [
            ['🔙 Назад в админ-панель']
          ],
          resize_keyboard: true
        }
      });
      
      // Отправляем каждый вопрос отдельным сообщением с инлайн-кнопкой
      for (const q of pending.slice(0, 10)) {
        const user = userData[q.chatId];
        const name = user?.parentName || 'Гость';
        
        // Используем либо questionId либо id
        const qId = q.questionId || q.id;
        
        let message = `❓ НОВЫЙ ВОПРОС\n\n`;
        message += `👤 От: ${name}\n`;
        message += `📱 Telegram ID: ${q.chatId}\n`;
        message += `📞 Телефон: ${user?.phone || 'не указан'}\n`;
        message += `\n❓ Вопрос:\n${q.question}\n\n`;
        message += `ID: ${qId}`;
        
        await bot.sendMessage(chatId, message, {
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Ответить', callback_data: `answer_${qId}` }]
            ]
          }
        });
      }
      
      return;
    }
    
    // Рассылка
    if (text === '📢 Рассылка') {
      bot.sendMessage(chatId,
        '📢 МАССОВАЯ РАССЫЛКА\n\n' +
        'Кому отправить сообщение?\n\n' +
        '• Всем - всем пользователям\n' +
        '• Зарегистрированным\n' +
        '• Незарегистрированным',
        {
          reply_markup: {
            keyboard: [
              ['📤 Всем', '✅ Зарегистрированным'],
              ['⏳ Незарегистрированным'],
              ['🔙 Назад в админ-панель']
            ],
            resize_keyboard: true
          }
        }
      );
      return;
    }
    
    if (text === '📤 Всем' || text === '✅ Зарегистрированным' || text === '⏳ Незарегистрированным') {
      let type = 'all';
      if (text === '✅ Зарегистрированным') type = 'registered';
      if (text === '⏳ Незарегистрированным') type = 'unregistered';
      
      userData[chatId].adminAction = 'broadcast_' + type;
      saveData();
      
      let count = 0;
      Object.values(userData).forEach(u => {
        if (type === 'all') count++;
        else if (type === 'registered' && u.isRegistered) count++;
        else if (type === 'unregistered' && !u.isRegistered) count++;
      });
      
      bot.sendMessage(chatId,
        `✅ Выбрано: ${text}\n` +
        `👥 Получателей: ${count}\n\n` +
        `Введите текст сообщения:`,
        { reply_markup: { remove_keyboard: true } }
      );
      return;
    }
    
    // Отправить сообщение
    if (text === '✉️ Отправить сообщение' || text === '✉️ Ответить на вопрос') {
      userData[chatId].adminAction = 'send_message';
      saveData();
      
      bot.sendMessage(chatId,
        '✉️ ОТПРАВКА СООБЩЕНИЯ\n\n' +
        'Шаг 1/2: Введите ID пользователя:\n\n' +
        'Пример: 123456789',
        { reply_markup: { remove_keyboard: true } }
      );
      return;
    }
    
    // Статистика
    if (text === '📊 Статистика') {
      bot.sendMessage(chatId,
        '📊 СТАТИСТИКА И ОТЧЁТЫ',
        {
          reply_markup: {
            keyboard: [
              ['📈 Общая статистика', '📋 Конверсия'],
              ['🔙 Назад в админ-панель']
            ],
            resize_keyboard: true
          }
        }
      );
      return;
    }
    
    if (text === '📈 Общая статистика' || text === '📋 Конверсия') {
      const statsModule = moduleLoader.getModule('statistics');
      if (statsModule) {
        try {
          const stats = statsModule.getStats ? statsModule.getStats() : statsModule.commands.stats(msg);
          
          let message = '📊 СТАТИСТИКА\n\n';
          
          if (text === '📈 Общая статистика') {
            message += `👥 Всего пользователей: ${Object.keys(userData).length}\n`;
            message += `✅ Зарегистрированных: ${Object.values(userData).filter(u => u.isRegistered).length}\n`;
            message += `❓ Вопросов: ${Object.keys(pendingQuestions || {}).length}\n`;
            message += `⭐️ Отзывов: ${Array.isArray(reviews) ? reviews.length : Object.keys(reviews || {}).length}\n`;
          } else {
            // Конверсия
            const total = Object.keys(userData).length;
            const registered = Object.values(userData).filter(u => u.isRegistered).length;
            const conversion = total > 0 ? ((registered / total) * 100).toFixed(1) : 0;
            
            message += `📊 Конверсия регистрации\n\n`;
            message += `Всего пользователей: ${total}\n`;
            message += `Зарегистрировано: ${registered}\n`;
            message += `Конверсия: ${conversion}%\n`;
          }
          
          bot.sendMessage(chatId, message);
        } catch (error) {
          logger.error('ADMIN', 'Error showing statistics', error.message);
          bot.sendMessage(chatId, '❌ Ошибка получения статистики');
        }
      } else {
        bot.sendMessage(chatId, '❌ Модуль статистики не загружен');
      }
      return;
    }
    
    // Экспорт
    if (text === '💾 Экспорт') {
      showExportMenu(chatId);
      return;
    }
    
    if (text === '📥 Экспорт пользователей') {
      try {
        bot.sendMessage(chatId, '📊 Создаю Excel файл...');
        
        const exporter = require('./utils/exporter');
        const result = await exporter.exportUsers(userData);
        
        if (result.success) {
          await bot.sendDocument(chatId, result.filepath, {
            caption: `📊 Экспорт пользователей\n\nВсего: ${Object.keys(userData).length}`
          });
        } else {
          bot.sendMessage(chatId, '❌ Ошибка создания файла');
        }
      } catch (error) {
        logger.error('ADMIN', 'Error exporting users', error.message);
        bot.sendMessage(chatId, '❌ Ошибка экспорта');
      }
      return;
    }
    
    if (text === '📥 Экспорт статистики') {
      try {
        bot.sendMessage(chatId, '📊 Создаю отчёт...');
        
        const stats = {
          totalUsers: Object.keys(userData).length,
          registeredUsers: Object.values(userData).filter(u => u.isRegistered).length,
          questions: Object.keys(pendingQuestions || {}).length,
          reviews: Array.isArray(reviews) ? reviews.length : Object.keys(reviews || {}).length,
          date: new Date().toLocaleDateString('ru-RU')
        };
        
        const exporter = require('./utils/exporter');
        const result = await exporter.exportStatistics(stats);
        
        if (result.success) {
          await bot.sendDocument(chatId, result.filepath, {
            caption: '📊 Экспорт статистики'
          });
        } else {
          bot.sendMessage(chatId, '❌ Ошибка создания файла');
        }
      } catch (error) {
        logger.error('ADMIN', 'Error exporting statistics', error.message);
        bot.sendMessage(chatId, '❌ Ошибка экспорта');
      }
      return;
    }
    
    // Напоминания
    if (text === '⏰ Напоминания') {
      showRemindersMenu(chatId);
      return;
    }
    
    if (text === '📅 Установить пробное') {
      userData[chatId].adminAction = 'set_trial';
      saveData();
      bot.sendMessage(chatId,
        '📅 УСТАНОВИТЬ ДАТУ ПРОБНОГО\n\n' +
        'Шаг 1/2: Введите ID пользователя:',
        { reply_markup: { remove_keyboard: true } }
      );
      return;
    }
    
    if (text === '💰 Установить оплату') {
      userData[chatId].adminAction = 'set_payment';
      saveData();
      bot.sendMessage(chatId,
        '💰 УСТАНОВИТЬ ДАТУ ОПЛАТЫ\n\n' +
        'Шаг 1/2: Введите ID пользователя:',
        { reply_markup: { remove_keyboard: true } }
      );
      return;
    }
    
    if (text === '👋 Отметить посещение') {
      userData[chatId].adminAction = 'set_visit';
      saveData();
      bot.sendMessage(chatId,
        '👋 ОТМЕТИТЬ ПОСЕЩЕНИЕ\n\n' +
        'Введите ID пользователя:',
        { reply_markup: { remove_keyboard: true } }
      );
      return;
    }
    
    if (text === '📋 Просмотр напоминаний') {
      userData[chatId].adminAction = 'view_reminders';
      saveData();
      bot.sendMessage(chatId,
        '📋 ПРОСМОТР НАПОМИНАНИЙ\n\n' +
        'Введите ID пользователя:',
        { reply_markup: { remove_keyboard: true } }
      );
      return;
    }
    
    // Промокоды
    if (text === '🎟️ Промокоды') {
      showPromoMenu(chatId);
      return;
    }
    
    if (text === '➕ Создать промокод') {
      userData[chatId].adminAction = 'create_promo_code';
      saveData();
      bot.sendMessage(chatId,
        '➕ СОЗДАТЬ ПРОМОКОД\n\n' +
        'Введите код промокода (например: SUMMER2024):',
        { reply_markup: { remove_keyboard: true } }
      );
      return;
    }
    
    if (text === '📋 Список промокодов') {
      const promoModule = moduleLoader.getModule('promoSystem');
      if (promoModule && promoModule.data.promoCodes) {
        const promoCodes = promoModule.data.promoCodes;
        const codes = Object.values(promoCodes);
        
        if (codes.length === 0) {
          bot.sendMessage(chatId, '📋 Промокодов пока нет');
          return;
        }
        
        let message = '📋 СПИСОК ПРОМОКОДОВ\n\n';
        
        codes.forEach(promo => {
          const status = promo.active ? '✅' : '❌';
          message += `${status} ${promo.code}\n`;
          message += `   Тип: ${promo.type}, Значение: ${promo.value}\n`;
          message += `   Использований: ${promo.usedCount}`;
          if (promo.maxUses) message += ` / ${promo.maxUses}`;
          message += `\n\n`;
        });
        
        bot.sendMessage(chatId, message);
      } else {
        bot.sendMessage(chatId, '❌ Модуль промокодов не загружен');
      }
      return;
    }
    
    if (text === '📊 Статистика промокодов') {
      const promoModule = moduleLoader.getModule('promoSystem');
      if (promoModule && promoModule.data.promoCodes) {
        const promoCodes = promoModule.data.promoCodes;
        const codes = Object.values(promoCodes);
        
        if (codes.length === 0) {
          bot.sendMessage(chatId, '📊 Промокодов пока нет');
          return;
        }
        
        const totalCodes = codes.length;
        const activeCodes = codes.filter(p => p.active).length;
        const totalUses = codes.reduce((sum, p) => sum + p.usedCount, 0);
        
        let message = '📊 СТАТИСТИКА ПРОМОКОДОВ\n\n';
        message += `Всего промокодов: ${totalCodes}\n`;
        message += `Активных: ${activeCodes}\n`;
        message += `Всего использований: ${totalUses}\n\n`;
        message += `Топ промокодов:\n`;
        
        codes.sort((a, b) => b.usedCount - a.usedCount).slice(0, 5).forEach((promo, i) => {
          message += `${i + 1}. ${promo.code} - ${promo.usedCount} исп.\n`;
        });
        
        bot.sendMessage(chatId, message);
      } else {
        bot.sendMessage(chatId, '❌ Модуль промокодов не загружен');
      }
      return;
    }
    
    // Расписание
    if (text === '📅 Расписание') {
      showScheduleMenu(chatId);
      return;
    }
    
    if (text === '📅 Сегодня') {
      const crmModule = moduleLoader.getModule('alfaCRM');
      if (crmModule && crmModule.enabled) {
        await crmModule.commands.schedule(msg, ['today']);
      } else {
        bot.sendMessage(chatId, '❌ Alfa CRM не подключен');
      }
      return;
    }
    
    if (text === '📆 Завтра') {
      const crmModule = moduleLoader.getModule('alfaCRM');
      if (crmModule && crmModule.enabled) {
        await crmModule.commands.schedule(msg, ['tomorrow']);
      } else {
        bot.sendMessage(chatId, '❌ Alfa CRM не подключен');
      }
      return;
    }
    
    if (text === '📊 На неделю') {
      const crmModule = moduleLoader.getModule('alfaCRM');
      if (crmModule && crmModule.enabled) {
        await crmModule.commands.schedule(msg, ['week']);
      } else {
        bot.sendMessage(chatId, '❌ Alfa CRM не подключен');
      }
      return;
    }
    
    // Возврат в админ-панель
    if (text === '🔙 Назад в админ-панель') {
      showAdminMenu(chatId);
      return;
    }
    
    // Настройки
    if (text === '⚙️ Настройки') {
      let message = '⚙️ НАСТРОЙКИ БОТА\n\n';
      message += `📊 Текущие настройки:\n\n`;
      message += `• Модулей загружено: ${moduleLoader.getStats().total}\n`;
      message += `• AI-помощник: ${process.env.USE_OPENAI === 'true' ? '✅ Включён' : '❌ Отключён'}\n`;
      message += `• Alfa CRM: ${process.env.USE_ALFA_CRM === 'true' ? '✅ Включён' : '❌ Отключён'}\n`;
      message += `• Промокоды: ${process.env.PROMO_CODES_ENABLED === 'true' ? '✅ Включены' : '❌ Отключены'}\n`;
      message += `• Бэкапы: ${process.env.BACKUP_ENABLED === 'true' ? '✅ Включены' : '❌ Отключены'}\n\n`;
      message += `Для изменения настроек отредактируйте файл .env`;
      
      bot.sendMessage(chatId, message);
      return;
    }
    
    // Управление админами (только для главного админа)
    if (text === '👑 Управление админами') {
      const isMainAdmin = String(MAIN_ADMIN_ID) === chatId.toString();
      
      if (!isMainAdmin) {
        bot.sendMessage(chatId, '❌ Эта функция доступна только главному администратору');
        return;
      }
      
      showAdminManagementMenu(chatId);
      return;
    }
    
    if (text === '➕ Добавить администратора') {
      const isMainAdmin = String(MAIN_ADMIN_ID) === chatId.toString();
      
      if (!isMainAdmin) {
        bot.sendMessage(chatId, '❌ Доступно только главному администратору');
        return;
      }
      
      userData[chatId].adminAction = 'add_admin';
      saveData();
      
      bot.sendMessage(chatId,
        '➕ ДОБАВЛЕНИЕ АДМИНИСТРАТОРА\n\n' +
        'Введите Telegram ID нового администратора\n\n' +
        '💡 Пользователь должен сначала написать боту /myid или /start',
        { reply_markup: { remove_keyboard: true } }
      );
      return;
    }
    
    if (text === '➖ Удалить администратора') {
      const isMainAdmin = String(MAIN_ADMIN_ID) === chatId.toString();
      
      if (!isMainAdmin) {
        bot.sendMessage(chatId, '❌ Доступно только главному администратору');
        return;
      }
      
      const adminMgmt = moduleLoader.getModule('adminManagement');
      if (!adminMgmt) {
        bot.sendMessage(chatId, '❌ Модуль управления админами не загружен');
        return;
      }
      
      const list = adminMgmt.getAdminsList();
      
      if (list.additional.length === 0) {
        bot.sendMessage(chatId, '📋 Дополнительных администраторов нет');
        showAdminManagementMenu(chatId);
        return;
      }
      
      userData[chatId].adminAction = 'remove_admin';
      saveData();
      
      let message = '➖ УДАЛЕНИЕ АДМИНИСТРАТОРА\n\n';
      message += 'Текущие администраторы:\n\n';
      list.additional.forEach((adminId, index) => {
        message += `${index + 1}. ID: ${adminId}\n`;
      });
      message += '\nВведите ID администратора для удаления:';
      
      bot.sendMessage(chatId, message, { reply_markup: { remove_keyboard: true } });
      return;
    }
    
    if (text === '📋 Список администраторов') {
      const isMainAdmin = String(MAIN_ADMIN_ID) === chatId.toString();
      
      if (!isMainAdmin) {
        bot.sendMessage(chatId, '❌ Доступно только главному администратору');
        return;
      }
      
      const adminMgmt = moduleLoader.getModule('adminManagement');
      if (adminMgmt && adminMgmt.commands.admins) {
        await adminMgmt.commands.admins(msg);
      }
      showAdminManagementMenu(chatId);
      return;
    }
    
    // По умолчанию для админа
    bot.sendMessage(chatId, 'Выберите действие из меню');
    return;
  }
  
  // === ОБРАБОТКА СВОБОДНОГО ТЕКСТА (НЕ КНОПОК) ===
  // Если дошли до сюда - это не кнопка, а обычное сообщение
  // Передаём в AI-помощник (если включен)
  if (!admin) {
    const aiModule = moduleLoader.getModule('ai_assistant');
    if (aiModule && aiModule.enabled) {
      await aiModule.askGPT(text, chatId, user);
    } else {
      bot.sendMessage(chatId, 
        'Я не понял ваш запрос. Используйте кнопки меню для навигации.');
    }
  }
  
  saveData();
});

// ============ ОБРАБОТКА ОШИБОК ============

bot.on('polling_error', (error) => {
  // Игнорируем некоторые несущественные ошибки
  const errorMessage = error.message || error.toString();
  
  // Список ошибок которые можно игнорировать
  const ignoredErrors = [
    'EFATAL',
    'ETELEGRAM: 409',
    'terminated by other',
    'Conflict: terminated'
  ];
  
  const shouldIgnore = ignoredErrors.some(err => errorMessage.includes(err));
  
  if (shouldIgnore) {
    // Только логируем, не показываем в консоль
    logger.warn('BOT', 'Polling error (ignored)', errorMessage);
  } else {
    console.error('❌ Polling error:', errorMessage);
    logger.error('BOT', 'Polling error', errorMessage);
  }
});

bot.on('error', (error) => {
  const errorMessage = error.message || error.toString();
  console.error('❌ Bot error:', errorMessage);
  logger.error('BOT', 'Bot error', errorMessage);
});

// ============ ОБРАБОТКА СОСТОЯНИЙ ПОЛЬЗОВАТЕЛЯ ============

async function handleUserState(chatId, text, action, user) {
  try {
    // Ввод промокода
    if (action === 'enter_promo_code') {
      const code = text.trim().toUpperCase();
      
      const promoModule = moduleLoader.getModule('promoSystem');
      if (!promoModule) {
        bot.sendMessage(chatId, '❌ Модуль промокодов не загружен');
        delete user.userAction;
        saveData();
        showUserMenu(chatId);
        return;
      }
      
      // Проверяем промокод
      const promo = promoModule.data.promoCodes[code];
      
      if (!promo) {
        bot.sendMessage(chatId, 
          '❌ Промокод не найден\n\n' +
          'Проверьте правильность кода и попробуйте ещё раз.'
        );
        delete user.userAction;
        saveData();
        showUserMenu(chatId);
        return;
      }
      
      if (!promo.active) {
        bot.sendMessage(chatId, '❌ Этот промокод больше не активен');
        delete user.userAction;
        saveData();
        showUserMenu(chatId);
        return;
      }
      
      // Проверяем срок действия
      if (promo.expiresAt) {
        const expiryDate = new Date(promo.expiresAt);
        if (expiryDate < new Date()) {
          bot.sendMessage(chatId, '❌ Срок действия промокода истёк');
          delete user.userAction;
          saveData();
          showUserMenu(chatId);
          return;
        }
      }
      
      // Проверяем лимит использований
      if (promo.maxUses && promo.usedCount >= promo.maxUses) {
        bot.sendMessage(chatId, '❌ Промокод исчерпан');
        delete user.userAction;
        saveData();
        showUserMenu(chatId);
        return;
      }
      
      // Проверяем использовал ли уже пользователь
      if (promo.usedBy.includes(chatId.toString())) {
        bot.sendMessage(chatId, '❌ Вы уже использовали этот промокод');
        delete user.userAction;
        saveData();
        showUserMenu(chatId);
        return;
      }
      
      // Применяем промокод
      promo.usedCount++;
      promo.usedBy.push(chatId.toString());
      
      // Сохраняем информацию о промокоде у пользователя
      if (!user.promoCodes) {
        user.promoCodes = [];
      }
      user.promoCodes.push({
        code: code,
        type: promo.type,
        value: promo.value,
        appliedAt: new Date().toISOString()
      });
      
      delete user.userAction;
      saveData();
      
      // Формируем сообщение
      let message = '✅ ПРОМОКОД АКТИВИРОВАН!\n\n';
      message += `Код: ${code}\n`;
      
      if (promo.type === 'percent') {
        message += `Скидка: ${promo.value}%\n`;
      } else if (promo.type === 'fixed') {
        message += `Скидка: ${promo.value} руб.\n`;
      } else if (promo.type === 'freeLesson') {
        message += `Бонус: Бесплатное занятие\n`;
      }
      
      message += '\nСкидка будет применена при оплате!';
      
      bot.sendMessage(chatId, message);
      
      logger.info('PROMO', chatId, `Promo code activated: ${code}`);
      
      // Уведомляем админов
      try {
        await notificationRouter.sendAdminMessage(
          `🎟️ ПРОМОКОД ИСПОЛЬЗОВАН\n\n` +
          `Код: ${code}\n` +
          `Пользователь: ${user.parentName || 'Гость'} (ID: ${chatId})\n` +
          `Тип: ${promo.type}\n` +
          `Значение: ${promo.value}`
        );
      } catch (error) {
        // Игнорируем ошибки отправки админам
      }
      
      showUserMenu(chatId);
      return;
    }
    
  } catch (error) {
    logger.error('USER', 'Error handling user state', error.message);
    delete user.userAction;
    saveData();
    bot.sendMessage(chatId, '❌ Произошла ошибка');
    showUserMenu(chatId);
  }
}

// ============ ОБРАБОТКА СОСТОЯНИЙ АДМИНИСТРАТОРА ============

async function handleAdminState(chatId, text, action) {
  const user = userData[chatId];
  
  try {
    // Поиск пользователя
    if (action === 'awaiting_user_id') {
      const targetId = text.trim();
      const targetUser = userData[targetId];
      
      if (!targetUser) {
        bot.sendMessage(chatId, 
          '❌ Пользователь не найден\n\n' +
          'Попробуйте другой ID',
          { reply_markup: { remove_keyboard: true } }
        );
        return;
      }
      
      let message = `👤 ИНФОРМАЦИЯ О ПОЛЬЗОВАТЕЛЕ\n\n`;
      message += `💬 ID: ${targetId}\n`;
      message += `📝 Имя: ${targetUser.parentName || 'не указано'}\n`;
      message += `👤 ФИО: ${targetUser.parentFullName || 'не указано'}\n`;
      message += `📱 Телефон: ${targetUser.phone || 'не указан'}\n`;
      message += `✅ Статус: ${targetUser.isRegistered ? 'Зарегистрирован' : 'Не зарегистрирован'}\n`;
      
      if (targetUser.children && targetUser.children.length > 0) {
        message += `\n👶 Дети (${targetUser.children.length}):\n`;
        targetUser.children.forEach((child, i) => {
          message += `${i + 1}. ${child.fullName} (${child.birthDate}, ${child.gender})\n`;
        });
      }
      
      if (targetUser.createdAt) {
        const date = new Date(targetUser.createdAt);
        message += `\n📅 Создан: ${date.toLocaleDateString('ru-RU')}`;
      }
      
      delete user.adminAction;
      saveData();
      
      bot.sendMessage(chatId, message);
      showUsersMenu(chatId);
      return;
    }
    
    // Отправка сообщения - получение ID
    if (action === 'send_message') {
      const targetId = text.trim();
      const targetUser = userData[targetId];
      
      if (!targetUser) {
        bot.sendMessage(chatId, 
          '❌ Пользователь не найден\n\n' +
          'Попробуйте другой ID',
          { reply_markup: { remove_keyboard: true } }
        );
        return;
      }
      
      user.adminAction = 'send_message_text';
      user.adminTargetId = targetId;
      saveData();
      
      bot.sendMessage(chatId,
        `✅ Пользователь найден: ${targetUser.parentName || 'Гость'}\n\n` +
        `Шаг 2/2: Введите текст сообщения:`,
        { reply_markup: { remove_keyboard: true } }
      );
      return;
    }
    
    // Отправка сообщения - получение текста
    if (action === 'send_message_text') {
      const targetId = user.adminTargetId;
      const message = text;
      
      try {
        await bot.sendMessage(targetId, `📨 СООБЩЕНИЕ ОТ АДМИНИСТРАТОРА:\n\n${message}`);
        bot.sendMessage(chatId, `✅ Сообщение отправлено пользователю ${targetId}`);
      } catch (error) {
        bot.sendMessage(chatId, `❌ Ошибка: ${error.message}`);
      }
      
      delete user.adminAction;
      delete user.adminTargetId;
      saveData();
      showAdminMenu(chatId);
      return;
    }
    
    // Рассылка
    if (action.startsWith('broadcast_')) {
      const type = action.replace('broadcast_', '');
      const message = text;
      
      bot.sendMessage(chatId, '⏳ Начинаю рассылку...');
      
      let sentCount = 0;
      let errorCount = 0;
      
      for (const targetId of Object.keys(userData)) {
        if (isAdmin(targetId)) continue;
        
        const targetUser = userData[targetId];
        
        if (type === 'registered' && !targetUser.isRegistered) continue;
        if (type === 'unregistered' && targetUser.isRegistered) continue;
        
        try {
          await bot.sendMessage(targetId, `📢 СООБЩЕНИЕ ОТ АДМИНИСТРАТОРА:\n\n${message}`);
          sentCount++;
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          errorCount++;
        }
      }
      
      delete user.adminAction;
      saveData();
      
      bot.sendMessage(chatId, 
        `✅ РАССЫЛКА ЗАВЕРШЕНА!\n\n` +
        `📤 Отправлено: ${sentCount}\n` +
        `❌ Ошибок: ${errorCount}`);
      showAdminMenu(chatId);
      return;
    }
    
    // Установить пробное - получение ID
    if (action === 'set_trial') {
      const targetId = text.trim();
      
      if (!userData[targetId]) {
        bot.sendMessage(chatId, '❌ Пользователь не найден');
        return;
      }
      
      user.adminAction = 'set_trial_date';
      user.adminTargetId = targetId;
      saveData();
      
      bot.sendMessage(chatId,
        `✅ Пользователь найден: ${userData[targetId].parentName || 'Гость'}\n\n` +
        `Шаг 2/2: Введите дату пробного занятия\n` +
        `Формат: ДД.ММ.ГГГГ\n` +
        `Пример: 25.12.2024`,
        { reply_markup: { remove_keyboard: true } }
      );
      return;
    }
    
    // Установить пробное - получение даты
    if (action === 'set_trial_date') {
      const targetId = user.adminTargetId;
      const date = text.trim();
      
      // Валидация даты
      if (!/^\d{2}\.\d{2}\.\d{4}$/.test(date)) {
        bot.sendMessage(chatId, '❌ Неверный формат даты. Используйте: ДД.ММ.ГГГГ');
        return;
      }
      
      userData[targetId].trialLessonDate = date;
      
      delete user.adminAction;
      delete user.adminTargetId;
      saveData();
      
      bot.sendMessage(chatId, 
        `✅ Дата пробного занятия установлена!\n\n` +
        `Пользователь: ${userData[targetId].parentName}\n` +
        `Дата: ${date}`);
      showRemindersMenu(chatId);
      return;
    }
    
    // Установить оплату - получение ID
    if (action === 'set_payment') {
      const targetId = text.trim();
      
      if (!userData[targetId]) {
        bot.sendMessage(chatId, '❌ Пользователь не найден');
        return;
      }
      
      user.adminAction = 'set_payment_date';
      user.adminTargetId = targetId;
      saveData();
      
      bot.sendMessage(chatId,
        `✅ Пользователь найден: ${userData[targetId].parentName || 'Гость'}\n\n` +
        `Шаг 2/2: Введите дату оплаты\n` +
        `Формат: ДД.ММ.ГГГГ\n` +
        `Пример: 31.12.2024`,
        { reply_markup: { remove_keyboard: true } }
      );
      return;
    }
    
    // Установить оплату - получение даты
    if (action === 'set_payment_date') {
      const targetId = user.adminTargetId;
      const date = text.trim();
      
      if (!/^\d{2}\.\d{2}\.\d{4}$/.test(date)) {
        bot.sendMessage(chatId, '❌ Неверный формат даты. Используйте: ДД.ММ.ГГГГ');
        return;
      }
      
      userData[targetId].paymentDueDate = date;
      
      delete user.adminAction;
      delete user.adminTargetId;
      saveData();
      
      bot.sendMessage(chatId, 
        `✅ Дата оплаты установлена!\n\n` +
        `Пользователь: ${userData[targetId].parentName}\n` +
        `Дата: ${date}`);
      showRemindersMenu(chatId);
      return;
    }
    
    // Отметить посещение
    if (action === 'set_visit') {
      const targetId = text.trim();
      
      if (!userData[targetId]) {
        bot.sendMessage(chatId, '❌ Пользователь не найден');
        return;
      }
      
      userData[targetId].lastVisitDate = new Date().toISOString();
      
      delete user.adminAction;
      saveData();
      
      bot.sendMessage(chatId, 
        `✅ Посещение отмечено!\n\n` +
        `Пользователь: ${userData[targetId].parentName}\n` +
        `Дата: ${new Date().toLocaleDateString('ru-RU')}`);
      showRemindersMenu(chatId);
      return;
    }
    
    // Просмотр напоминаний
    if (action === 'view_reminders') {
      const targetId = text.trim();
      const targetUser = userData[targetId];
      
      if (!targetUser) {
        bot.sendMessage(chatId, '❌ Пользователь не найден');
        return;
      }
      
      let message = `⏰ НАПОМИНАНИЯ\n\n`;
      message += `Пользователь: ${targetUser.parentName || 'Гость'}\n\n`;
      
      if (targetUser.trialLessonDate) {
        message += `📅 Пробное занятие: ${targetUser.trialLessonDate}\n`;
      }
      if (targetUser.paymentDueDate) {
        message += `💰 Оплата до: ${targetUser.paymentDueDate}\n`;
      }
      if (targetUser.lastVisitDate) {
        const lastVisit = new Date(targetUser.lastVisitDate);
        message += `👋 Последний визит: ${lastVisit.toLocaleDateString('ru-RU')}\n`;
      }
      
      if (!targetUser.trialLessonDate && !targetUser.paymentDueDate && !targetUser.lastVisitDate) {
        message += 'Напоминаний нет';
      }
      
      delete user.adminAction;
      saveData();
      
      bot.sendMessage(chatId, message);
      showRemindersMenu(chatId);
      return;
    }
    
    // Добавление администратора
    if (action === 'add_admin') {
      const newAdminId = text.trim();
      
      // Проверка формата ID
      if (!/^\d+$/.test(newAdminId)) {
        bot.sendMessage(chatId, '❌ Неверный формат ID. Введите числовой ID');
        return;
      }
      
      const adminMgmt = moduleLoader.getModule('adminManagement');
      if (!adminMgmt) {
        bot.sendMessage(chatId, '❌ Модуль управления админами не загружен');
        delete user.adminAction;
        saveData();
        showAdminMenu(chatId);
        return;
      }
      
      const result = await adminMgmt.addAdmin(newAdminId);
      
      if (result.success) {
        bot.sendMessage(chatId, `✅ ${result.message}\n\nID: ${newAdminId}`);
        
        // Уведомляем нового админа
        try {
          await bot.sendMessage(
            newAdminId,
            '👑 Вам предоставлены права администратора!\n\n' +
            'Используйте /start для доступа к админ-панели'
          );
        } catch (error) {
          bot.sendMessage(chatId,
            '⚠️ Не удалось уведомить пользователя. ' +
            'Возможно, он еще не писал боту'
          );
        }
      } else {
        bot.sendMessage(chatId, `❌ ${result.message}`);
      }
      
      delete user.adminAction;
      saveData();
      showAdminManagementMenu(chatId);
      return;
    }
    
    // Удаление администратора
    if (action === 'remove_admin') {
      const adminId = text.trim();
      
      const adminMgmt = moduleLoader.getModule('adminManagement');
      if (!adminMgmt) {
        bot.sendMessage(chatId, '❌ Модуль управления админами не загружен');
        delete user.adminAction;
        saveData();
        showAdminMenu(chatId);
        return;
      }
      
      const result = await adminMgmt.removeAdmin(adminId);
      
      if (result.success) {
        bot.sendMessage(chatId, `✅ ${result.message}\n\nID: ${adminId}`);
        
        // Уведомляем бывшего админа
        try {
          await bot.sendMessage(
            adminId,
            '👋 Ваши права администратора были отозваны\n\n' +
            'Теперь у вас обычный доступ к боту'
          );
        } catch (error) {
          // Игнорируем ошибку
        }
      } else {
        bot.sendMessage(chatId, `❌ ${result.message}`);
      }
      
      delete user.adminAction;
      saveData();
      showAdminManagementMenu(chatId);
      return;
    }
    
    // Создание промокода
    if (action === 'create_promo_code') {
      const code = text.trim().toUpperCase();
      
      // Валидация кода
      if (code.length < 3 || code.length > 20) {
        bot.sendMessage(chatId, '❌ Код должен быть от 3 до 20 символов');
        return;
      }
      
      if (!/^[A-Z0-9]+$/.test(code)) {
        bot.sendMessage(chatId, '❌ Код может содержать только латинские буквы и цифры');
        return;
      }
      
      const promoModule = moduleLoader.getModule('promoSystem');
      if (!promoModule) {
        bot.sendMessage(chatId, '❌ Модуль промокодов не загружен');
        delete user.adminAction;
        saveData();
        showAdminMenu(chatId);
        return;
      }
      
      // Проверка что код не существует
      if (promoModule.data.promoCodes[code]) {
        bot.sendMessage(chatId, '❌ Такой промокод уже существует');
        return;
      }
      
      // Создаём промокод
      promoModule.data.promoCodes[code] = {
        code: code,
        type: 'percent',
        value: 10,
        maxUses: null,
        usedCount: 0,
        usedBy: [],
        createdAt: new Date().toISOString(),
        expiresAt: null,
        active: true,
        description: ''
      };
      
      delete user.adminAction;
      saveData();
      
      bot.sendMessage(chatId,
        `✅ Промокод создан!\n\n` +
        `Код: ${code}\n` +
        `Тип: Процент\n` +
        `Скидка: 10%\n` +
        `Использований: 0`
      );
      
      showPromoMenu(chatId);
      return;
    }
    
  } catch (error) {
    logger.error('ADMIN', 'Error handling admin state', error.message);
    delete user.adminAction;
    delete user.adminTargetId;
    saveData();
    bot.sendMessage(chatId, '❌ Произошла ошибка');
    showAdminMenu(chatId);
  }
}

// ============ ЗАПУСК БОТА ============

async function startBot() {
  console.log('\n' + '='.repeat(50));
  console.log('🤖 KVANTIK BOT v2.0.0');
  console.log('='.repeat(50) + '\n');
  
  try {
    // Загрузка данных
    console.log('📂 Загрузка данных...');
    loadData();
    
    // Установка глобального контекста для модулей
    moduleLoader.setGlobalContext(getUserData, userData);
    
    // Загрузка модулей
    console.log('');
    await moduleLoader.loadAll();
    
    // Инициализация бэкапов
    if (config.backup?.enabled) {
      console.log('\n💾 Инициализация системы бэкапов...');
      await backup.init();
    }
    
    // Запуск мониторинга
    console.log('\n📊 Запуск мониторинга...');
    monitoring.start(bot, {
      moduleLoader,
      userData,
      userLeads,
      pendingQuestions,
      reviews
    });
    
    // Автосохранение каждые 5 минут
    setInterval(saveData, 5 * 60 * 1000);
    
    console.log('\n' + '='.repeat(50));
    console.log('✅ БОТ УСПЕШНО ЗАПУЩЕН');
    console.log(`👤 Главный админ: ${MAIN_ADMIN_ID}`);
    console.log(`📦 Загружено модулей: ${moduleLoader.getStats().total}`);
    console.log('='.repeat(50) + '\n');
    
    logger.info('SYSTEM', 'Bot started successfully');
    
    // Уведомление главного админа
    if (MAIN_ADMIN_ID) {
      notificationRouter.sendAdminMessage(
        `✅ Бот успешно запущен\n\n` +
        `📦 Модулей: ${moduleLoader.getStats().total}\n` +
        `👥 Пользователей: ${Object.keys(userData).length}\n` +
        `📊 Версия: 2.0.0`,
        { chatId: MAIN_ADMIN_ID }
      ).catch(() => {});
    }
    
  } catch (error) {
    console.error('❌ Ошибка запуска бота:', error);
    logger.error('SYSTEM', 'Failed to start bot', error.message);
    process.exit(1);
  }
}

// ============ GRACEFUL SHUTDOWN ============

async function shutdown() {
  console.log('\n⏸  Остановка бота...');
  
  try {
    // Сохранение данных
    saveData();
    
    // Выгрузка модулей
    for (const [name] of moduleLoader.modules) {
      await moduleLoader.unloadModule(name);
    }
    
    // Остановка бота
    await bot.stopPolling();
    
    console.log('✅ Бот остановлен');
    logger.info('SYSTEM', 'Bot stopped gracefully');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка при остановке:', error);
    process.exit(1);
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Глобальные обработчики необработанных ошибок
process.on('unhandledRejection', (reason, promise) => {
  const errorMsg = reason?.message || reason?.toString() || 'Unknown error';
  
  // Игнорируем некоторые известные ошибки которые не критичны
  const ignoredErrors = [
    'AggregateError',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND'
  ];
  
  const shouldIgnore = ignoredErrors.some(err => errorMsg.includes(err));
  
  if (shouldIgnore) {
    logger.warn('SYSTEM', 'Unhandled rejection (ignored)', errorMsg);
  } else {
    console.error('❌ Unhandled Rejection:', reason);
    logger.error('SYSTEM', 'Unhandled rejection', errorMsg);
  }
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  logger.error('SYSTEM', 'Uncaught exception', error.message);
  
  // Критическая ошибка - перезапускаем бот
  setTimeout(() => {
    console.log('🔄 Перезапуск бота...');
    process.exit(1);
  }, 1000);
});

// Запуск
startBot();

// ============ ЭКСПОРТ ============
module.exports = {
  bot,
  moduleLoader,
  userData,
  userLeads,
  pendingQuestions,
  reviews,
  isAdmin,
  isMainAdmin,
  getUserData,
  saveData,
  showUserMenu,
  showAdminMenu
};
