const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

// ============ НАСТРОЙКИ ============
const TOKEN = '7894495477:AAETGSdYcs3O0tAgzvEYmsOtJIYgK-ADsSg';

// Главный администратор (полный доступ)
const MAIN_ADMIN_ID = '805286122';

// Дополнительные администраторы (ограниченный доступ)
const ADDITIONAL_ADMINS = [
  // '123456789', // Пример: раскомментируйте и добавьте ID второго администратора
];

// Пути для сохранения данных
const DATA_DIR = path.join(__dirname, 'bot_data');
const USER_DATA_FILE = path.join(DATA_DIR, 'users.json');
const USER_LEADS_FILE = path.join(DATA_DIR, 'leads.json');
const PENDING_QUESTIONS_FILE = path.join(DATA_DIR, 'questions.json');
const REVIEWS_FILE = path.join(DATA_DIR, 'reviews.json');

// Пути для логов
const LOGS_DIR = path.join(__dirname, 'bot_logs');
const ADMIN_LOGS_FILE = path.join(LOGS_DIR, 'admin_actions.log');
const ERROR_LOGS_FILE = path.join(LOGS_DIR, 'errors.log');
const GENERAL_LOGS_FILE = path.join(LOGS_DIR, 'general.log');

// Создаём директории для данных и логов, если их нет
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log('📁 Создана директория для данных:', DATA_DIR);
}

if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  console.log('📁 Создана директория для логов:', LOGS_DIR);
}

// ============ СИСТЕМА ЛОГИРОВАНИЯ ============

function logToFile(filePath, message) {
  const timestamp = new Date().toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  
  const logMessage = `[${timestamp}] ${message}\n`;
  
  try {
    fs.appendFileSync(filePath, logMessage);
  } catch (error) {
    console.error('❌ Ошибка записи в лог:', error.message);
  }
}

function logAdminAction(adminId, action, details = '') {
  const role = adminId === MAIN_ADMIN_ID ? 'MAIN_ADMIN' : 'ADMIN';
  const message = `[${role}] ID: ${adminId} | ${action} | ${details}`;
  logToFile(ADMIN_LOGS_FILE, message);
  console.log(`📝 ADMIN LOG: ${message}`);
}

function logError(error, context = '') {
  const message = `ERROR: ${context} | ${error.message} | Stack: ${error.stack}`;
  logToFile(ERROR_LOGS_FILE, message);
  console.error(`❌ ERROR LOG: ${message}`);
}

function logGeneral(message) {
  logToFile(GENERAL_LOGS_FILE, message);
  console.log(`ℹ️  GENERAL LOG: ${message}`);
}

// Настройки защиты от спама
const SPAM_PROTECTION = {
  MAX_MESSAGES_PER_MINUTE: 10,      // Максимум сообщений в минуту
  MAX_REGISTRATIONS_PER_HOUR: 3,    // Максимум попыток регистрации в час
  MAX_QUESTIONS_PER_HOUR: 5,        // Максимум вопросов админу в час
  BAN_DURATION: 5 * 60 * 1000,      // Длительность бана: 5 минут
  WARNING_THRESHOLD: 7              // Предупреждение при 7 сообщениях
};

// OpenAI GPT-4 API настройки
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// Alfa CRM настройки
const ALFA_CRM_TOKEN = 'ВАШ_API_ТОКЕН_ОТ_ALFA_CRM';
const ALFA_CRM_BRANCH_ID = 1;
const ALFA_CRM_URL = 'https://dckvantik.s20.online/v2api';
const ALFA_CRM_EMAIL = 'ВАШ_EMAIL';
const ALFA_CRM_API_KEY = 'ВАШ_API_KEY';

// Переменная для хранения токена CRM
let alfaCRMToken = null;
let alfaCRMTokenExpiry = null;

// Создаем бота
const bot = new TelegramBot(TOKEN, { polling: true });

// Хранилище данных
let userData = {};
let conversationHistory = {};
let userLeads = {}; // Счётчик лидов для каждого пользователя
let pendingQuestions = {}; // Вопросы, ожидающие ответа администратора
let reviews = {}; // Отзывы пользователей
const reminders = {}; // Напоминания для пользователей

// Счётчики для защиты от спама
const messageCounters = {}; // Счётчик сообщений
const registrationAttempts = {}; // Попытки регистрации
const questionAttempts = {}; // Попытки задать вопрос админу
const bannedUsers = {}; // Забаненные пользователи

// ============ ФУНКЦИИ СОХРАНЕНИЯ/ЗАГРУЗКИ ДАННЫХ ============

function saveData() {
  try {
    fs.writeFileSync(USER_DATA_FILE, JSON.stringify(userData, null, 2));
    fs.writeFileSync(USER_LEADS_FILE, JSON.stringify(userLeads, null, 2));
    fs.writeFileSync(PENDING_QUESTIONS_FILE, JSON.stringify(pendingQuestions, null, 2));
    fs.writeFileSync(REVIEWS_FILE, JSON.stringify(reviews, null, 2));
    logGeneral('Данные сохранены успешно');
  } catch (error) {
    logError(error, 'Ошибка сохранения данных');
  }
}

function loadData() {
  try {
    if (fs.existsSync(USER_DATA_FILE)) {
      userData = JSON.parse(fs.readFileSync(USER_DATA_FILE, 'utf8'));
      logGeneral(`Загружены данные пользователей: ${Object.keys(userData).length} записей`);
    }
    
    if (fs.existsSync(USER_LEADS_FILE)) {
      userLeads = JSON.parse(fs.readFileSync(USER_LEADS_FILE, 'utf8'));
      logGeneral(`Загружены данные о лидах: ${Object.keys(userLeads).length} записей`);
    }
    
    if (fs.existsSync(PENDING_QUESTIONS_FILE)) {
      pendingQuestions = JSON.parse(fs.readFileSync(PENDING_QUESTIONS_FILE, 'utf8'));
      logGeneral(`Загружены вопросы: ${Object.keys(pendingQuestions).length} записей`);
    }
    
    if (fs.existsSync(REVIEWS_FILE)) {
      reviews = JSON.parse(fs.readFileSync(REVIEWS_FILE, 'utf8'));
      logGeneral(`Загружены отзывы: ${Object.keys(reviews).length} записей`);
    }
  } catch (error) {
    logError(error, 'Ошибка загрузки данных');
  }
}

// Автосохранение каждые 5 минут
setInterval(saveData, 5 * 60 * 1000);

// Сохранение при выходе
process.on('SIGINT', () => {
  console.log('\n⏸ Получен сигнал завершения...');
  saveData();
  console.log('👋 Бот остановлен');
  process.exit(0);
});

process.on('SIGTERM', () => {
  saveData();
  process.exit(0);
});

// ============ ЗАЩИТА ОТ СПАМА ============

function isUserBanned(chatId) {
  if (isAdmin(chatId)) return false; // Админы не банятся
  
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

function banUser(chatId, reason = 'спам') {
  if (isAdmin(chatId)) return; // Админов не баним
  
  bannedUsers[chatId] = Date.now() + SPAM_PROTECTION.BAN_DURATION;
  const banMinutes = Math.floor(SPAM_PROTECTION.BAN_DURATION / 60000);
  
  bot.sendMessage(
    chatId,
    `⛔️ ВЫ ВРЕМЕННО ЗАБЛОКИРОВАНЫ\n\n` +
    `Причина: ${reason}\n` +
    `Длительность: ${banMinutes} минут\n\n` +
    `Пожалуйста, подождите и не отправляйте слишком много сообщений.`
  );
  
  // Уведомляем администраторов
  const user = getUserData(chatId);
  const userName = user.parentName || 'Гость';
  const adminNotification = `⚠️ АВТОБАН ПОЛЬЗОВАТЕЛЯ\n\n` +
    `👤 ${userName} (ID: ${chatId})\n` +
    `⛔️ Причина: ${reason}\n` +
    `⏱ Длительность: ${banMinutes} минут`;
  
  bot.sendMessage(MAIN_ADMIN_ID, adminNotification);
  ADDITIONAL_ADMINS.forEach(adminId => {
    bot.sendMessage(adminId, adminNotification);
  });
}

function checkMessageSpam(chatId) {
  if (isAdmin(chatId)) return false;
  
  const now = Date.now();
  const oneMinuteAgo = now - 60000;
  
  if (!messageCounters[chatId]) {
    messageCounters[chatId] = [];
  }
  
  // Удаляем старые записи (старше минуты)
  messageCounters[chatId] = messageCounters[chatId].filter(time => time > oneMinuteAgo);
  
  // Добавляем текущее сообщение
  messageCounters[chatId].push(now);
  
  const messageCount = messageCounters[chatId].length;
  
  // Предупреждение
  if (messageCount === SPAM_PROTECTION.WARNING_THRESHOLD) {
    bot.sendMessage(
      chatId,
      '⚠️ ВНИМАНИЕ!\n\n' +
      'Вы отправляете слишком много сообщений.\n' +
      `При превышении ${SPAM_PROTECTION.MAX_MESSAGES_PER_MINUTE} сообщений в минуту последует временная блокировка.`
    );
  }
  
  // Бан за спам
  if (messageCount > SPAM_PROTECTION.MAX_MESSAGES_PER_MINUTE) {
    banUser(chatId, `превышен лимит сообщений (${messageCount}/${SPAM_PROTECTION.MAX_MESSAGES_PER_MINUTE} в минуту)`);
    return true;
  }
  
  return false;
}

function checkRegistrationSpam(chatId) {
  if (isAdmin(chatId)) return false;
  
  const now = Date.now();
  const oneHourAgo = now - 3600000;
  
  if (!registrationAttempts[chatId]) {
    registrationAttempts[chatId] = [];
  }
  
  registrationAttempts[chatId] = registrationAttempts[chatId].filter(time => time > oneHourAgo);
  registrationAttempts[chatId].push(now);
  
  if (registrationAttempts[chatId].length > SPAM_PROTECTION.MAX_REGISTRATIONS_PER_HOUR) {
    banUser(chatId, `превышен лимит попыток регистрации (${registrationAttempts[chatId].length}/${SPAM_PROTECTION.MAX_REGISTRATIONS_PER_HOUR} в час)`);
    return true;
  }
  
  return false;
}

function checkQuestionSpam(chatId) {
  if (isAdmin(chatId)) return false;
  
  const now = Date.now();
  const oneHourAgo = now - 3600000;
  
  if (!questionAttempts[chatId]) {
    questionAttempts[chatId] = [];
  }
  
  questionAttempts[chatId] = questionAttempts[chatId].filter(time => time > oneHourAgo);
  questionAttempts[chatId].push(now);
  
  if (questionAttempts[chatId].length > SPAM_PROTECTION.MAX_QUESTIONS_PER_HOUR) {
    banUser(chatId, `превышен лимит вопросов администратору (${questionAttempts[chatId].length}/${SPAM_PROTECTION.MAX_QUESTIONS_PER_HOUR} в час)`);
    return true;
  }
  
  return false;
}

// ============ ПРОВЕРКА РОЛИ ============

/**
 * Проверяет, является ли пользователь главным администратором
 */
function isMainAdmin(chatId) {
  return chatId.toString() === MAIN_ADMIN_ID;
}

/**
 * Проверяет, является ли пользователь администратором (любым)
 */
function isAdmin(chatId) {
  const id = chatId.toString();
  return id === MAIN_ADMIN_ID || ADDITIONAL_ADMINS.includes(id);
}

/**
 * Возвращает роль пользователя
 * @returns {'main_admin' | 'admin' | 'user'}
 */
function getUserRole(chatId) {
  const id = chatId.toString();
  if (id === MAIN_ADMIN_ID) return 'main_admin';
  if (ADDITIONAL_ADMINS.includes(id)) return 'admin';
  return 'user';
}

/**
 * Возвращает правильную клавиатуру в зависимости от роли пользователя
 */
function getKeyboard(chatId) {
  return isAdmin(chatId) ? adminKeyboard : mainKeyboard;
}

const getUserData = (chatId) => {
  if (!userData[chatId]) {
    userData[chatId] = {
      stage: 'greeting',
      isRegistered: false,
      waitingForAdminResponse: false,
      
      // Данные родителя (регистрируется один раз)
      parentName: '',           // Имя для общения
      parentFullName: '',       // ФИО родителя
      phone: '',                // Телефон
      
      // Дети (массив)
      children: [],             // [{fullName, birthDate, gender, note, registeredAt}]
      
      // Источник
      source: 'Telegram Bot',
      
      // Напоминания (на уровне родителя)
      trialLessonDate: null,
      paymentDueDate: null,
      lastVisitDate: null,
      
      // Состояния администратора
      adminAction: null,
      adminTargetChatId: null,
      adminTempData: null,
      
      // Временные данные для добавления ребёнка
      tempChild: null
    };
  }
  return userData[chatId];
};

// Проверка количества созданных лидов (теперь считаем детей)
const canCreateLead = (chatId) => {
  const user = getUserData(chatId);
  if (!user.children) {
    user.children = [];
  }
  return user.children.length < 5; // Максимум 5 детей
};


// ============ GPT-4 AI ФУНКЦИИ ============

const SYSTEM_PROMPT = `Ты — Квантик, дружелюбный виртуальный помощник детского клуба «Квантик» в Ставрополе, квалифицированный детский психолог и умелый консультант по продажам.

📋 ИНФОРМАЦИЯ О КЛУБЕ (ОБНОВЛЕННАЯ):
• Концепция: Принципиально не продлёнка. Это клуб — место, куда дети приходят с друзьями по собственному выбору.
• Адрес: г. Ставрополь, пр-т Кулакова, 5/3, 1 этаж.
• Телефон: +7 (963) 384-09-77.
• Сайт: kvantik.durablesites.com
• Возраст: Основной клуб — 6-12 лет. Также есть программы от 9 месяцев до 7 лет (Кванти-сад, развивающие курсы).

✨ ОСНОВНЫЕ ПРЕИМУЩЕСТВА:
• 🔄 Гибкий график (для детей 6-12 лет) — основа концепции
• 🎯 Клуб, а не учебное заведение
• 👥 Камерные группы и индивидуальный подход

💳 ФОРМАТЫ И ЦЕНЫ:

1. ОСНОВНОЙ КЛУБ (6-12 лет):
• Активный: 40ч/мес — 4 800₽
• Премиум: 80ч/мес — 9 200₽ (самый популярный)
• Максимум: 120ч/мес — 12 600₽
• Трансфер из школы: 7 000₽/20 дней

2. КВАНТИ-САД (1.5-7 лет):
• Полдня (4ч): 16 000-20 000₽/мес
• Полный день (8ч): 24 000-26 500₽/мес
• Разово: 1 400₽ (полдня), 2 800₽ (день)

3. РАЗВИВАЮЩИЕ КУРСЫ:
• Для малышей (9 мес-5 лет): 5 300₽/8 занятий
• Подготовка к школе: 5 300₽/8 занятий
• Творчество, робототехника: 5 800₽/8 занятий

4. КОРРЕКЦИОННЫЕ УСЛУГИ:
• Логопед: 8 200₽/8 занятий
• Психолог: 9 600₽/8 занятий
• Диагностика: 1 000-2 200₽

🎯 ТВОЯ РОЛЬ:

ВАЖНО - ОПРЕДЕЛЕНИЕ РОЛИ ПОЛЬЗОВАТЕЛЯ:
• Если в начале сообщения указано [АДМИНИСТРАТОР] - это администратор клуба, твой коллега
• Если указано [Родитель: Имя] - это зарегистрированный родитель
• Если нет меток - это обычный посетитель (гость)

КАК ОБЩАТЬСЯ С АДМИНИСТРАТОРОМ:
• Обращайся на "ты", дружелюбно и коллегиально
• Помогай с техническими вопросами о работе бота
• Объясняй, как использовать команды
• Будь кратким и по делу
• Не предлагай записаться или купить услуги
• Помогай с управлением клиентами и расписанием

КОМАНДЫ ДЛЯ АДМИНИСТРАТОРА (расскажи, если спросит):
• /myid - посмотреть свой ID
• /schedule today/tomorrow/week/ГГГГ-ММ-ДД - расписание
• /send_schedule CHAT_ID today/tomorrow/week - отправить расписание клиенту
• /set_trial CHAT_ID ДД.ММ.ГГГГ - установить дату пробного
• /set_payment CHAT_ID ДД.ММ.ГГГГ - установить дату оплаты
• /set_visit CHAT_ID - отметить посещение
• /reminders CHAT_ID - посмотреть напоминания клиента
• /reply CHAT_ID текст - ответить на вопрос клиента
• /clear - очистить историю диалога

ВАЖНО ПРИ ОБРАЩЕНИИ К ОБЫЧНЫМ ПОЛЬЗОВАТЕЛЯМ:
• Если пользователь зарегистрирован — обращайся к нему по имени!
• Используй дружелюбный, персонализированный тон
• Помни контекст предыдущих разговоров

⚠️ КРИТИЧЕСКИ ВАЖНО - РЕГИСТРАЦИЯ:
• НИКОГДА не говори "Начинаем регистрацию" или "Отлично! Начинаем регистрацию"
• НИКОГДА не используй эмодзи 📝 в своих ответах (это кнопка регистрации!)
• НИКОГДА не проси указать ФИО или другие данные для регистрации
• Если клиент хочет записаться - скажи: "Для записи нажмите кнопку ЗАПИСАТЬСЯ в меню" (без эмодзи!)
• Или: "Позвоните нам: +7 (963) 384-09-77"
• Регистрация происходит ТОЛЬКО через кнопку меню, не через диалог с тобой!
• Если спрашивают про запись на конкретную программу - отвечай по программе, но НЕ начинай регистрацию сам

КАК ПСИХОЛОГ:
• Давай профессиональные рекомендации
• Будь эмпатичным к переживаниям родителей
• При сложных вопросах предлагай консультацию специалиста

КАК КОНСУЛЬТАНТ ПО ПРОДАЖАМ (только для родителей и гостей):
• Продавай через ценность, не будь навязчивым
• Используй технику "боль-решение"
• Создавай лёгкое FOMO: "70% выбирают Премиум"
• Подчёркивай экономию
• Мягко подводи к записи
• При возражениях переводи в плюсы

СТИЛЬ:
• Дружелюбный, тёплый, профессиональный
• 1-3 эмодзи на сообщение
• Кратко (2-4 предложения)
• Адаптируй тон под собеседника
• НИКОГДА не используй ** для выделения текста (не используй жирный шрифт через звёздочки)
• Используй только обычный текст и эмодзи для оформления

🚫 ВАЖНО:
• НЕ выдумывай информацию
• НЕ обещай гарантий
• Не используй слово "продлёнка" для основного клуба
• При сомнениях предлагай связаться: +7 (963) 384-09-77
• НИКОГДА не используй ** в тексте

💡 ПРИМЕРЫ:

АДМИНИСТРАТОР:
В: "Как отправить расписание клиенту?"
О: Привет! Используй команду /send_schedule CHAT_ID today (или tomorrow/week). Например: /send_schedule 123456789 week - отправит расписание на неделю. ID клиента можно узнать из уведомлений о регистрации 👍

В: "Как работают напоминания?"
О: Напоминания работают автоматически по cron:
- Дни рождения: 9:00 каждый день
- Пробные занятия: 10:00 (за день)
- Оплата: 11:00 (за 3 дня и в день)
- Неактивные: понедельник 12:00

Установить можно командами /set_trial, /set_payment, /set_visit. Посмотреть: /reminders CHAT_ID 📊

РОДИТЕЛЬ:
В: "Моему 2 года, что есть?"
О: Для 2 лет отлично подойдёт Кванти-сад (20 000₽/мес) или курс "Малышок" (5 300₽/8 занятий) с мамой. 💙 Что в приоритете: регулярный присмотр или занятия 2-3 раза в неделю?

В: "Дорого"
О: Понимаю! 💙 Давайте посчитаем: няня — 16-20 тыс. У нас 4 800₽ с развитием, уроками, социализацией. Плюс экономите своё время! Начните с Активного или попробуйте день за 500₽?

В: "Хочу записать дочку на английский"
О: Отлично! У нас есть английский для разных возрастов (5 800₽/8 занятий). Сколько лет дочке? Подберу подходящую группу! Для записи нажмите кнопку ЗАПИСАТЬСЯ в меню или звоните: +7 (963) 384-09-77

Будь лучшим помощником! 🌟`;

async function askGPT4(userMessage, chatId) {
  try {
    const user = getUserData(chatId);
    
    if (!conversationHistory[chatId]) {
      conversationHistory[chatId] = [];
    }

    // Добавляем контекст о пользователе
    let contextMessage = userMessage;
    
    // Проверяем, является ли пользователь администратором
    if (isAdmin(chatId)) {
      contextMessage = `[АДМИНИСТРАТОР] ${userMessage}`;
    } else if (user.isRegistered && user.parentName) {
      contextMessage = `[Родитель: ${user.parentName}] ${userMessage}`;
    }

    conversationHistory[chatId].push({
      role: 'user',
      content: contextMessage
    });

    const response = await axios.post(
      OPENAI_API_URL,
      {
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...conversationHistory[chatId]
        ],
        temperature: 0.7,
        max_tokens: 500
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const aiResponse = response.data.choices[0].message.content;
    const tokensUsed = response.data.usage.total_tokens;

    conversationHistory[chatId].push({
      role: 'assistant',
      content: aiResponse
    });

    if (conversationHistory[chatId].length > 20) {
      conversationHistory[chatId] = conversationHistory[chatId].slice(-20);
    }

    return {
      success: true,
      response: aiResponse,
      tokensUsed: tokensUsed
    };

  } catch (error) {
    console.error('❌ Ошибка GPT-4:', error.response?.data || error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// ============ КЛАВИАТУРЫ ============

const removeKeyboard = {
  reply_markup: {
    remove_keyboard: true
  }
};

// Клавиатура с кнопкой отмены
const cancelKeyboard = {
  reply_markup: {
    keyboard: [
      ['❌ Отменить']
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  }
};

// Клавиатура для выбора пола
const genderKeyboard = {
  reply_markup: {
    keyboard: [
      ['👦 Мальчик', '👧 Девочка'],
      ['❌ Отменить']
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  }
};

// Клавиатура для примечания
const noteKeyboard = {
  reply_markup: {
    keyboard: [
      ['✅ Без примечаний'],
      ['❌ Отменить']
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  }
};

// Клавиатура для оценки (рейтинг)
const ratingKeyboard = {
  reply_markup: {
    keyboard: [
      ['⭐️', '⭐️⭐️', '⭐️⭐️⭐️'],
      ['⭐️⭐️⭐️⭐️', '⭐️⭐️⭐️⭐️⭐️'],
      ['❌ Отменить']
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  }
};

// Меню профиля
const profileMenuKeyboard = {
  reply_markup: {
    keyboard: [
      ['✏️ Изменить имя', '✏️ Изменить телефон'],
      ['👶 Редактировать детей'],
      ['🔙 Назад в главное меню']
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  }
};

// Меню редактирования детей (динамическое)
function getChildrenEditKeyboard(children) {
  const buttons = [];
  
  children.forEach((child, index) => {
    const shortName = child.fullName.split(' ')[1] || child.fullName.substring(0, 15);
    buttons.push([`${index + 1}. ${shortName}`]);
  });
  
  buttons.push(['🔙 Назад в профиль']);
  
  return {
    reply_markup: {
      keyboard: buttons,
      resize_keyboard: true,
      one_time_keyboard: false
    }
  };
}

// Меню действий с ребёнком
const childActionKeyboard = {
  reply_markup: {
    keyboard: [
      ['✏️ Изменить имя', '✏️ Изменить дату рождения'],
      ['✏️ Изменить пол', '✏️ Изменить примечание'],
      ['🗑 Удалить ребёнка'],
      ['🔙 Назад к списку детей']
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  }
};

// ГЛАВНАЯ КЛАВИАТУРА ДЛЯ ПОЛЬЗОВАТЕЛЕЙ
const mainKeyboard = {
  reply_markup: {
    keyboard: [
      ['📝 Записаться', '👶 Добавить ребёнка'],
      ['👨‍👩‍👧‍👦 Мои дети', '⚙️ Мой профиль'],
      ['⭐️ Оставить отзыв', '📞 Контакты'],
      ['👤 Связаться с администратором']
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  }
};

// КЛАВИАТУРА ДЛЯ АДМИНИСТРАТОРА
const adminKeyboard = {
  reply_markup: {
    keyboard: [
      ['📊 Статистика', '📋 Активные вопросы'],
      ['📅 Расписание', '🔔 Напоминания'],
      ['👥 Управление админами', '⚙️ Управление клиентами'],
      ['🔙 Главное меню']
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  }
};

// ПОДМЕНЮ: Управление расписанием
const scheduleMenuKeyboard = {
  reply_markup: {
    keyboard: [
      ['📅 На сегодня', '📅 На завтра'],
      ['📅 На неделю', '📅 На конкретную дату'],
      ['📤 Отправить клиенту'],
      ['🔙 Назад в админ-меню']
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  }
};

// ПОДМЕНЮ: Управление напоминаниями
const remindersMenuKeyboard = {
  reply_markup: {
    keyboard: [
      ['⏰ Установить пробное занятие'],
      ['💳 Установить дату оплаты'],
      ['✅ Отметить посещение'],
      ['👁 Посмотреть напоминания'],
      ['🔙 Назад в админ-меню']
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  }
};

// ПОДМЕНЮ: Управление администраторами (только для главного админа)
const adminManagementKeyboard = {
  reply_markup: {
    keyboard: [
      ['➕ Добавить администратора'],
      ['➖ Удалить администратора'],
      ['📋 Список администраторов'],
      ['🔙 Назад в админ-меню']
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  }
};

// ПОДМЕНЮ: Управление клиентами
const clientManagementKeyboard = {
  reply_markup: {
    keyboard: [
      ['💬 Ответить на вопрос', '✉️ Отправить сообщение'],
      ['📢 Массовая рассылка', '📋 Список ожидающих ответа'],
      ['🗑 Очистить историю диалога'],
      ['🔙 Назад в админ-меню']
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  }
};

// ============ ALFA CRM ФУНКЦИИ ============

async function getAlfaCRMToken() {
  try {
    if (alfaCRMToken && alfaCRMTokenExpiry && new Date() < alfaCRMTokenExpiry) {
      return alfaCRMToken;
    }

    const response = await axios.post(`${ALFA_CRM_URL}/auth/login`, {
      email: ALFA_CRM_EMAIL,
      api_key: ALFA_CRM_API_KEY
    });

    if (response.data && response.data.token) {
      alfaCRMToken = response.data.token;
      alfaCRMTokenExpiry = new Date(Date.now() + 23 * 60 * 60 * 1000);
      console.log('✅ Alfa CRM токен получен');
      return alfaCRMToken;
    }

    throw new Error('Не удалось получить токен');
  } catch (error) {
    console.error('❌ Ошибка получения токена Alfa CRM:', error.message);
    return null;
  }
}

async function createCustomerInAlfaCRM(data) {
  try {
    const token = await getAlfaCRMToken();
    if (!token) {
      return { success: false, error: 'Нет токена CRM' };
    }

    const customerData = {
      name: data.childFullName,
      branch_ids: [ALFA_CRM_BRANCH_ID],
      responsible_id: null,
      note: `Регистрация через Telegram бот\n\nРодитель: ${data.parentFullName}\nДата рождения: ${data.childBirthDate}\nПол: ${data.childGender}\n${data.note || ''}`,
      email: null,
      dop_data: {
        Заказчик: data.parentFullName,
        'Дата рождения': data.childBirthDate,
        Пол: data.childGender
      }
    };

    if (data.phone) {
      customerData.phone = data.phone;
    }

    const response = await axios.post(
      `${ALFA_CRM_URL}/customer`,
      customerData,
      {
        headers: {
          'X-ALFACRM-TOKEN': token,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data && response.data.id) {
      console.log('✅ Клиент создан в Alfa CRM:', response.data.id);
      return { success: true, customerId: response.data.id };
    }

    return { success: false, error: 'Неизвестная ошибка' };

  } catch (error) {
    console.error('❌ Ошибка создания клиента в Alfa CRM:', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
}

async function getAlfaCRMSchedule(dateFrom, dateTo) {
  try {
    const token = await getAlfaCRMToken();
    if (!token) {
      return { success: false, error: 'Нет токена CRM' };
    }

    const response = await axios.get(`${ALFA_CRM_URL}/lesson`, {
      headers: {
        'X-ALFACRM-TOKEN': token
      },
      params: {
        date_from: dateFrom,
        date_to: dateTo,
        branch_id: ALFA_CRM_BRANCH_ID
      }
    });

    if (response.data) {
      return { success: true, data: response.data };
    }

    return { success: false, error: 'Нет данных' };

  } catch (error) {
    console.error('❌ Ошибка получения расписания:', error.message);
    return { success: false, error: error.message };
  }
}

// Форматирование расписания
function formatSchedule(lessons) {
  if (!lessons || lessons.length === 0) {
    return '📅 Занятий не запланировано.';
  }

  let message = '📅 РАСПИСАНИЕ ЗАНЯТИЙ:\n\n';
  
  const groupedByDate = {};
  
  lessons.forEach(lesson => {
    const date = lesson.date || 'Дата не указана';
    if (!groupedByDate[date]) {
      groupedByDate[date] = [];
    }
    groupedByDate[date].push(lesson);
  });

  Object.keys(groupedByDate).sort().forEach(date => {
    const dateObj = new Date(date);
    const dayName = dateObj.toLocaleDateString('ru-RU', { weekday: 'long' });
    const formattedDate = dateObj.toLocaleDateString('ru-RU');
    
    message += `📆 ${dayName}, ${formattedDate}\n`;
    
    groupedByDate[date].forEach(lesson => {
      const time = lesson.time_from || 'Время не указано';
      const subject = lesson.subject_name || 'Занятие';
      const teacher = lesson.teacher_name || '';
      
      message += `⏰ ${time} - ${subject}`;
      if (teacher) {
        message += ` (${teacher})`;
      }
      message += '\n';
    });
    
    message += '\n';
  });

  return message;
}

// ============ УВЕДОМЛЕНИЯ ============

function notifyAdmin(data, crmResult) {
  const childInfo = data.childNumber ? ` (ребёнок #${data.childNumber})` : '';
  const message = `🎉 НОВАЯ РЕГИСТРАЦИЯ!${childInfo}\n\n` +
    `👤 Родитель: ${data.parentFullName}\n` +
    `👦 Ребёнок: ${data.childFullName}\n` +
    `🎂 ДР: ${data.childBirthDate}\n` +
    `👫 Пол: ${data.childGender}\n` +
    `📱 Телефон: ${data.phone || 'не указан'}\n` +
    `💬 Telegram ID: ${data.chatId}\n` +
    `📝 Примечание: ${data.note || 'нет'}\n\n` +
    `${crmResult.success ? `✅ Создан в CRM (ID: ${crmResult.customerId})` : `❌ Ошибка CRM: ${crmResult.error}`}`;
  
  // Уведомляем главного администратора
  bot.sendMessage(MAIN_ADMIN_ID, message);
  
  // Уведомляем дополнительных администраторов
  ADDITIONAL_ADMINS.forEach(adminId => {
    bot.sendMessage(adminId, message);
  });
}

// ============ СИСТЕМА НАПОМИНАНИЙ ============

function parseDate(dateStr) {
  const parts = dateStr.split('.');
  if (parts.length !== 3) return null;
  return new Date(parts[2], parts[1] - 1, parts[0]);
}

cron.schedule('0 9 * * *', () => {
  console.log('⏰ Проверка дней рождения...');
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  Object.keys(userData).forEach(chatId => {
    const user = userData[chatId];
    if (user.childBirthDate) {
      const birthDate = parseDate(user.childBirthDate);
      if (birthDate) {
        birthDate.setFullYear(today.getFullYear());
        
        if (birthDate.getTime() === today.getTime()) {
          const keyboard = getKeyboard(chatId);
          bot.sendMessage(
            chatId,
            `🎉 С ДНЁМ РОЖДЕНИЯ!\n\n` +
            `Поздравляем ${user.childFullName || 'вашего ребёнка'} с днём рождения! 🎂\n\n` +
            `Желаем радости, улыбок и незабываемых моментов! 🎈`,
            keyboard
          );
          
          // Уведомляем всех администраторов
          const adminMessage = `🎂 День рождения у клиента!\n\n` +
            `Ребёнок: ${user.childFullName}\n` +
            `Родитель: ${user.parentName} (${chatId})`;
          
          bot.sendMessage(MAIN_ADMIN_ID, adminMessage);
          ADDITIONAL_ADMINS.forEach(adminId => {
            bot.sendMessage(adminId, adminMessage);
          });
        }
      }
    }
  });
});

cron.schedule('0 10 * * *', () => {
  console.log('⏰ Напоминания о пробных занятиях...');
  
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  
  Object.keys(userData).forEach(chatId => {
    const user = userData[chatId];
    if (user.trialLessonDate) {
      const trialDate = parseDate(user.trialLessonDate);
      if (trialDate && trialDate.getTime() === tomorrow.getTime()) {
        const keyboard = getKeyboard(chatId);
        bot.sendMessage(
          chatId,
          `⏰ НАПОМИНАНИЕ!\n\n` +
          `Завтра у вас пробное занятие! 🎯\n\n` +
          `Ждём вас по адресу:\n` +
          `пр-т Кулакова, 5/3, 1 этаж\n\n` +
          `До встречи! 👋`,
          keyboard
        );
      }
    }
  });
});

cron.schedule('0 11 * * *', () => {
  console.log('⏰ Напоминания об оплате...');
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const in3days = new Date();
  in3days.setDate(in3days.getDate() + 3);
  in3days.setHours(0, 0, 0, 0);
  
  Object.keys(userData).forEach(chatId => {
    const user = userData[chatId];
    if (user.paymentDueDate) {
      const dueDate = parseDate(user.paymentDueDate);
      if (dueDate) {
        const keyboard = getKeyboard(chatId);
        
        if (dueDate.getTime() === in3days.getTime()) {
          bot.sendMessage(
            chatId,
            `⏰ НАПОМИНАНИЕ ОБ ОПЛАТЕ\n\n` +
            `Через 3 дня истекает срок оплаты абонемента.\n\n` +
            `Дата: ${user.paymentDueDate}\n\n` +
            `Для продления свяжитесь с нами:\n` +
            `📱 +7 (963) 384-09-77`,
            keyboard
          );
        }
        
        if (dueDate.getTime() === today.getTime()) {
          bot.sendMessage(
            chatId,
            `⚠️ СРОК ОПЛАТЫ СЕГОДНЯ!\n\n` +
            `Пожалуйста, оплатите абонемент сегодня.\n\n` +
            `Свяжитесь с нами:\n` +
            `📱 +7 (963) 384-09-77`,
            keyboard
          );
        }
      }
    }
  });
});

cron.schedule('0 12 * * 1', () => {
  console.log('⏰ Проверка неактивных клиентов...');
  
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  
  Object.keys(userData).forEach(chatId => {
    const user = userData[chatId];
    if (user.lastVisitDate) {
      const lastVisit = parseDate(user.lastVisitDate);
      if (lastVisit && lastVisit < weekAgo) {
        const keyboard = getKeyboard(chatId);
        bot.sendMessage(
          chatId,
          `💙 Скучаем по вам!\n\n` +
          `Давно не виделись! Как дела? 😊\n\n` +
          `Приходите к нам снова, будем рады встрече!\n\n` +
          `📱 +7 (963) 384-09-77`,
          keyboard
        );
      }
    }
  });
});

// ============ КОМАНДЫ АДМИНИСТРАТОРА (оставлены только вспомогательные) ============

bot.onText(/\/myid/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `Ваш Telegram ID: ${chatId}`);
});

// ============ ОБРАБОТКА СООБЩЕНИЙ ============

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text || text.startsWith('/')) return;

  // ========== ПРОВЕРКА НА СПАМ ==========
  
  // Проверяем, забанен ли пользователь
  if (isUserBanned(chatId)) {
    return; // Игнорируем сообщения от забаненных
  }
  
  // Проверяем на спам (кроме администраторов)
  if (!isAdmin(chatId) && checkMessageSpam(chatId)) {
    return; // Пользователь забанен за спам
  }

  const user = getUserData(chatId);

  // ========== УНИВЕРСАЛЬНАЯ КНОПКА ОТМЕНЫ ==========
  
  if (text === '❌ Отменить') {
    // Сбрасываем все состояния
    user.stage = 'greeting';
    user.tempChild = null;
    user.adminAction = null;
    user.adminTargetChatId = null;
    user.adminTempData = null;
    user.waitingForAdminResponse = false;
    
    const keyboard = getKeyboard(chatId);
    bot.sendMessage(
      chatId,
      '↩️ Действие отменено\n\nВозвращаемся в главное меню',
      keyboard
    );
    return;
  }

  // ========== ОБРАБОТКА МНОГОШАГОВЫХ ДЕЙСТВИЙ АДМИНИСТРАТОРА ==========
  
  if (isAdmin(chatId) && user.adminAction) {
    
    // РАСПИСАНИЕ: Запрос конкретной даты
    if (user.adminAction === 'schedule_date') {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(text)) {
        bot.sendMessage(
          chatId,
          '❌ Неверный формат даты!\n\nИспользуйте: ГГГГ-ММ-ДД\nНапример: 2024-12-25',
          removeKeyboard
        );
        return;
      }
      
      bot.sendChatAction(chatId, 'typing');
      const result = await getAlfaCRMSchedule(text, text);
      
      user.adminAction = null;
      
      if (result.success && result.data.items && result.data.items.length > 0) {
        const message = formatSchedule(result.data.items);
        bot.sendMessage(chatId, message, scheduleMenuKeyboard);
      } else {
        bot.sendMessage(chatId, '📅 Занятий на эту дату не запланировано.', scheduleMenuKeyboard);
      }
      return;
    }
    
    // РАСПИСАНИЕ: Отправка клиенту - получение Chat ID
    if (user.adminAction === 'send_schedule_get_chat_id') {
      if (!userData[text]) {
        bot.sendMessage(
          chatId,
          '❌ Клиент с таким ID не найден\n\nПопробуйте другой ID',
          removeKeyboard
        );
        return;
      }
      
      user.adminTargetChatId = text;
      user.adminAction = 'send_schedule_get_period';
      
      const targetUser = userData[text];
      const targetName = targetUser.parentName || 'Гость';
      
      bot.sendMessage(
        chatId,
        `✅ Клиент найден: ${targetName} (${text})\n\n` +
        `Шаг 2/2: Выберите период:\n\n` +
        `Напишите: today, tomorrow или week`,
        removeKeyboard
      );
      return;
    }
    
    // РАСПИСАНИЕ: Отправка клиенту - получение периода
    if (user.adminAction === 'send_schedule_get_period') {
      const period = text.toLowerCase();
      
      if (!['today', 'tomorrow', 'week'].includes(period)) {
        bot.sendMessage(
          chatId,
          '❌ Неверный период!\n\nИспользуйте: today, tomorrow или week',
          removeKeyboard
        );
        return;
      }
      
      bot.sendChatAction(chatId, 'typing');
      
      let dateFrom, dateTo;
      const today = new Date();
      
      if (period === 'today') {
        dateFrom = today.toISOString().split('T')[0];
        dateTo = dateFrom;
      } else if (period === 'tomorrow') {
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        dateFrom = tomorrow.toISOString().split('T')[0];
        dateTo = dateFrom;
      } else {
        dateFrom = today.toISOString().split('T')[0];
        const weekLater = new Date(today);
        weekLater.setDate(weekLater.getDate() + 7);
        dateTo = weekLater.toISOString().split('T')[0];
      }
      
      const result = await getAlfaCRMSchedule(dateFrom, dateTo);
      const targetChatId = user.adminTargetChatId;
      
      user.adminAction = null;
      user.adminTargetChatId = null;
      
      if (result.success && result.data.items && result.data.items.length > 0) {
        const message = formatSchedule(result.data.items);
        const targetKeyboard = getKeyboard(targetChatId);
        bot.sendMessage(targetChatId, message, targetKeyboard);
        bot.sendMessage(chatId, `✅ Расписание отправлено клиенту ${targetChatId}`, scheduleMenuKeyboard);
      } else {
        bot.sendMessage(chatId, '❌ Не удалось получить расписание', scheduleMenuKeyboard);
      }
      return;
    }
    
    // НАПОМИНАНИЯ: Установка пробного - получение Chat ID
    if (user.adminAction === 'set_trial_get_chat_id') {
      if (!userData[text]) {
        bot.sendMessage(
          chatId,
          '❌ Клиент с таким ID не найден\n\nПопробуйте другой ID',
          removeKeyboard
        );
        return;
      }
      
      user.adminTargetChatId = text;
      user.adminAction = 'set_trial_get_date';
      
      const targetUser = userData[text];
      const targetName = targetUser.parentName || 'Гость';
      
      bot.sendMessage(
        chatId,
        `✅ Клиент найден: ${targetName} (${text})\n\n` +
        `Шаг 2/2: Введите дату пробного занятия\n\n` +
        `Формат: ДД.ММ.ГГГГ\nНапример: 25.12.2024`,
        removeKeyboard
      );
      return;
    }
    
    // НАПОМИНАНИЯ: Установка пробного - получение даты
    if (user.adminAction === 'set_trial_get_date') {
      const dateRegex = /^\d{2}\.\d{2}\.\d{4}$/;
      if (!dateRegex.test(text)) {
        bot.sendMessage(
          chatId,
          '❌ Неверный формат даты!\n\nИспользуйте: ДД.ММ.ГГГГ\nНапример: 25.12.2024',
          removeKeyboard
        );
        return;
      }
      
      const targetChatId = user.adminTargetChatId;
      userData[targetChatId].trialLessonDate = text;
      
      user.adminAction = null;
      user.adminTargetChatId = null;
      
      bot.sendMessage(chatId, `✅ Дата пробного занятия установлена: ${text}`, remindersMenuKeyboard);
      return;
    }
    
    // НАПОМИНАНИЯ: Установка оплаты - получение Chat ID
    if (user.adminAction === 'set_payment_get_chat_id') {
      if (!userData[text]) {
        bot.sendMessage(
          chatId,
          '❌ Клиент с таким ID не найден\n\nПопробуйте другой ID',
          removeKeyboard
        );
        return;
      }
      
      user.adminTargetChatId = text;
      user.adminAction = 'set_payment_get_date';
      
      const targetUser = userData[text];
      const targetName = targetUser.parentName || 'Гость';
      
      bot.sendMessage(
        chatId,
        `✅ Клиент найден: ${targetName} (${text})\n\n` +
        `Шаг 2/2: Введите дату следующей оплаты\n\n` +
        `Формат: ДД.ММ.ГГГГ\nНапример: 31.12.2024`,
        removeKeyboard
      );
      return;
    }
    
    // НАПОМИНАНИЯ: Установка оплаты - получение даты
    if (user.adminAction === 'set_payment_get_date') {
      const dateRegex = /^\d{2}\.\d{2}\.\d{4}$/;
      if (!dateRegex.test(text)) {
        bot.sendMessage(
          chatId,
          '❌ Неверный формат даты!\n\nИспользуйте: ДД.ММ.ГГГГ\nНапример: 31.12.2024',
          removeKeyboard
        );
        return;
      }
      
      const targetChatId = user.adminTargetChatId;
      userData[targetChatId].paymentDueDate = text;
      
      user.adminAction = null;
      user.adminTargetChatId = null;
      
      bot.sendMessage(chatId, `✅ Дата следующей оплаты установлена: ${text}`, remindersMenuKeyboard);
      return;
    }
    
    // НАПОМИНАНИЯ: Отметка посещения
    if (user.adminAction === 'set_visit_get_chat_id') {
      if (!userData[text]) {
        bot.sendMessage(
          chatId,
          '❌ Клиент с таким ID не найден\n\nПопробуйте другой ID',
          removeKeyboard
        );
        return;
      }
      
      const today = new Date();
      const dateStr = today.toLocaleDateString('ru-RU').split('.').join('.');
      
      userData[text].lastVisitDate = dateStr;
      
      user.adminAction = null;
      
      const targetUser = userData[text];
      const targetName = targetUser.parentName || 'Гость';
      
      bot.sendMessage(
        chatId,
        `✅ Посещение отмечено для ${targetName}\n\nДата: ${dateStr}`,
        remindersMenuKeyboard
      );
      return;
    }
    
    // НАПОМИНАНИЯ: Просмотр напоминаний
    if (user.adminAction === 'view_reminders_get_chat_id') {
      if (!userData[text]) {
        bot.sendMessage(
          chatId,
          '❌ Клиент с таким ID не найден\n\nПопробуйте другой ID',
          removeKeyboard
        );
        return;
      }
      
      const targetUser = userData[text];
      
      const message = `📊 НАПОМИНАНИЯ\n\n` +
        `👤 ${targetUser.parentName || 'Не указано'}\n` +
        `👦 ${targetUser.childFullName || 'Не указано'}\n\n` +
        `🎯 Пробное: ${targetUser.trialLessonDate || 'не установлено'}\n` +
        `💳 Оплата: ${targetUser.paymentDueDate || 'не установлено'}\n` +
        `📅 Последнее посещение: ${targetUser.lastVisitDate || 'не отмечено'}`;
      
      user.adminAction = null;
      
      bot.sendMessage(chatId, message, remindersMenuKeyboard);
      return;
    }
    
    // УПРАВЛЕНИЕ АДМИНАМИ: Добавление
    if (user.adminAction === 'add_admin') {
      const newAdminId = text;
      
      if (newAdminId === MAIN_ADMIN_ID) {
        bot.sendMessage(chatId, '❌ Это ID главного администратора', removeKeyboard);
        return;
      }
      
      if (ADDITIONAL_ADMINS.includes(newAdminId)) {
        bot.sendMessage(chatId, '⚠️ Этот пользователь уже является администратором', removeKeyboard);
        return;
      }
      
      ADDITIONAL_ADMINS.push(newAdminId);
      
      user.adminAction = null;
      
      bot.sendMessage(
        chatId,
        `✅ Администратор добавлен!\n\n` +
        `ID: ${newAdminId}\n\n` +
        `⚠️ ВАЖНО: После перезапуска бота изменения будут потеряны.\n` +
        `Добавьте ID в код:\nADDITIONAL_ADMINS = ['${ADDITIONAL_ADMINS.join("', '")}']`,
        adminManagementKeyboard
      );
      
      // Уведомляем нового администратора
      bot.sendMessage(
        newAdminId,
        '🎉 Вы назначены администратором бота Квантик!\n\n' +
        'Теперь вам доступны административные функции.\n' +
        'Нажмите /start для начала работы.'
      );
      return;
    }
    
    // УПРАВЛЕНИЕ АДМИНАМИ: Удаление
    if (user.adminAction === 'remove_admin') {
      const adminId = text;
      
      if (adminId === MAIN_ADMIN_ID) {
        bot.sendMessage(chatId, '❌ Нельзя удалить главного администратора', removeKeyboard);
        return;
      }
      
      const index = ADDITIONAL_ADMINS.indexOf(adminId);
      
      if (index === -1) {
        bot.sendMessage(chatId, '❌ Этот пользователь не является администратором', removeKeyboard);
        return;
      }
      
      ADDITIONAL_ADMINS.splice(index, 1);
      
      user.adminAction = null;
      
      bot.sendMessage(
        chatId,
        `✅ Администратор удалён!\n\n` +
        `ID: ${adminId}\n\n` +
        `⚠️ ВАЖНО: Не забудьте обновить код после перезапуска.`,
        adminManagementKeyboard
      );
      
      // Уведомляем бывшего администратора
      bot.sendMessage(
        adminId,
        '📢 Ваши права администратора были отозваны.\n\n' +
        'Теперь вы можете использовать бота как обычный пользователь.',
        mainKeyboard
      );
      return;
    }
    
    // УПРАВЛЕНИЕ КЛИЕНТАМИ: Ответ на вопрос - получение Chat ID
    if (user.adminAction === 'reply_question_get_chat_id') {
      if (!pendingQuestions[text]) {
        bot.sendMessage(
          chatId,
          `⚠️ Нет вопроса от пользователя ${text}\n\nПроверьте ID и попробуйте снова`,
          removeKeyboard
        );
        return;
      }
      
      user.adminTargetChatId = text;
      user.adminAction = 'reply_question_get_answer';
      
      const q = pendingQuestions[text];
      
      bot.sendMessage(
        chatId,
        `💬 Вопрос от ${q.userName} (${text}):\n\n` +
        `"${q.question}"\n\n` +
        `Шаг 2/2: Введите ваш ответ:`,
        removeKeyboard
      );
      return;
    }
    
    // УПРАВЛЕНИЕ КЛИЕНТАМИ: Ответ на вопрос - получение ответа
    if (user.adminAction === 'reply_question_get_answer') {
      const targetChatId = user.adminTargetChatId;
      const reply = text;
      
      const targetKeyboard = getKeyboard(targetChatId);
      
      bot.sendMessage(
        targetChatId,
        `💬 ОТВЕТ ОТ АДМИНИСТРАТОРА:\n\n${reply}`,
        targetKeyboard
      );
      
      delete pendingQuestions[targetChatId];
      
      if (userData[targetChatId]) {
        userData[targetChatId].waitingForAdminResponse = false;
      }
      
      user.adminAction = null;
      user.adminTargetChatId = null;
      
      bot.sendMessage(chatId, `✅ Ответ отправлен клиенту ${targetChatId}`, clientManagementKeyboard);
      return;
    }
    
    // УПРАВЛЕНИЕ КЛИЕНТАМИ: Отправка произвольного сообщения - получение Chat ID
    if (user.adminAction === 'send_message_get_chat_id') {
      const targetChatId = text;
      
      // Проверяем, существует ли такой пользователь
      if (!userData[targetChatId]) {
        bot.sendMessage(
          chatId,
          '❌ Пользователь с таким ID не найден в базе бота\n\n' +
          '💡 Пользователь должен хотя бы раз написать боту, чтобы появиться в базе.\n\n' +
          'Попробуйте другой ID или попросите клиента написать /start боту',
          removeKeyboard
        );
        return;
      }
      
      user.adminTargetChatId = targetChatId;
      user.adminAction = 'send_message_get_text';
      
      const targetUser = userData[targetChatId];
      const targetName = targetUser.parentName || 'Гость';
      const targetPhone = targetUser.phone || 'не указан';
      
      bot.sendMessage(
        chatId,
        `✅ Клиент найден!\n\n` +
        `👤 Имя: ${targetName}\n` +
        `📱 Телефон: ${targetPhone}\n` +
        `💬 ID: ${targetChatId}\n\n` +
        `Шаг 2/2: Введите текст сообщения для отправки:`,
        removeKeyboard
      );
      return;
    }
    
    // УПРАВЛЕНИЕ КЛИЕНТАМИ: Отправка произвольного сообщения - получение текста
    if (user.adminAction === 'send_message_get_text') {
      const targetChatId = user.adminTargetChatId;
      const messageText = text;
      
      const targetKeyboard = getKeyboard(targetChatId);
      const targetUser = userData[targetChatId];
      const targetName = targetUser.parentName || 'Гость';
      
      try {
        bot.sendMessage(
          targetChatId,
          `📨 СООБЩЕНИЕ ОТ АДМИНИСТРАТОРА:\n\n${messageText}`,
          targetKeyboard
        );
        
        // Логирование действия администратора
        logAdminAction(chatId, 'SEND_MESSAGE', `To: ${targetChatId} (${targetName}) | Text: ${messageText.substring(0, 50)}...`);
        
        user.adminAction = null;
        user.adminTargetChatId = null;
        
        bot.sendMessage(
          chatId,
          `✅ Сообщение успешно отправлено!\n\n` +
          `👤 Получатель: ${targetName}\n` +
          `💬 ID: ${targetChatId}\n\n` +
          `📨 Текст сообщения:\n"${messageText}"`,
          clientManagementKeyboard
        );
      } catch (error) {
        logError(error, `Отправка сообщения клиенту ${targetChatId}`);
        
        user.adminAction = null;
        user.adminTargetChatId = null;
        
        bot.sendMessage(
          chatId,
          `❌ Ошибка при отправке сообщения\n\n` +
          `Возможно, пользователь заблокировал бота.\n\n` +
          `Ошибка: ${error.message}`,
          clientManagementKeyboard
        );
      }
      return;
    }
    
    // УПРАВЛЕНИЕ КЛИЕНТАМИ: Массовая рассылка - выбор типа получателей
    if (user.adminAction === 'broadcast_get_type') {
      const broadcastType = text.toLowerCase();
      
      if (!['all', 'registered', 'unregistered'].includes(broadcastType)) {
        bot.sendMessage(
          chatId,
          '❌ Неверный выбор!\n\nВведите: all, registered или unregistered',
          removeKeyboard
        );
        return;
      }
      
      user.adminTempData = broadcastType;
      user.adminAction = 'broadcast_get_message';
      
      let recipients = 0;
      Object.keys(userData).forEach(id => {
        if (isAdmin(id)) return;
        if (broadcastType === 'all') recipients++;
        else if (broadcastType === 'registered' && userData[id].isRegistered) recipients++;
        else if (broadcastType === 'unregistered' && !userData[id].isRegistered) recipients++;
      });
      
      bot.sendMessage(
        chatId,
        `📢 Подтверждение рассылки\n\n` +
        `👥 Получателей: ${recipients} чел.\n` +
        `📋 Тип: ${broadcastType === 'all' ? 'Все' : broadcastType === 'registered' ? 'Зарегистрированные' : 'Незарегистрированные'}\n\n` +
        `Введите текст сообщения для отправки:`,
        removeKeyboard
      );
      return;
    }
    
    // УПРАВЛЕНИЕ КЛИЕНТАМИ: Массовая рассылка - отправка сообщения
    if (user.adminAction === 'broadcast_get_message') {
      const messageText = text;
      const broadcastType = user.adminTempData;
      
      bot.sendMessage(chatId, '⏳ Начинаю рассылку...', removeKeyboard);
      
      let sentCount = 0;
      let errorCount = 0;
      const errors = [];
      
      for (const targetChatId of Object.keys(userData)) {
        // Пропускаем администраторов
        if (isAdmin(targetChatId)) continue;
        
        const targetUser = userData[targetChatId];
        
        // Фильтрация по типу
        if (broadcastType === 'registered' && !targetUser.isRegistered) continue;
        if (broadcastType === 'unregistered' && targetUser.isRegistered) continue;
        
        try {
          const targetKeyboard = getKeyboard(targetChatId);
          await bot.sendMessage(
            targetChatId,
            `📢 СООБЩЕНИЕ ОТ АДМИНИСТРАТОРА:\n\n${messageText}`,
            targetKeyboard
          );
          sentCount++;
          
          // Небольшая задержка между сообщениями, чтобы не получить ban от Telegram
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          errorCount++;
          errors.push({
            chatId: targetChatId,
            name: targetUser.parentName || 'Гость',
            error: error.message
          });
        }
      }
      
      user.adminAction = null;
      user.adminTempData = null;
      
      let resultMessage = `✅ РАССЫЛКА ЗАВЕРШЕНА!\n\n` +
        `📤 Отправлено: ${sentCount}\n` +
        `❌ Ошибок: ${errorCount}\n\n` +
        `📨 Текст сообщения:\n"${messageText}"`;
      
      if (errorCount > 0 && errorCount <= 5) {
        resultMessage += '\n\n⚠️ Ошибки отправки:';
        errors.forEach(err => {
          resultMessage += `\n• ${err.name} (${err.chatId}): ${err.error}`;
        });
      } else if (errorCount > 5) {
        resultMessage += `\n\n⚠️ Слишком много ошибок (${errorCount}). Возможно, многие пользователи заблокировали бота.`;
      }
      
      bot.sendMessage(chatId, resultMessage, clientManagementKeyboard);
      return;
    }
    
    // УПРАВЛЕНИЕ КЛИЕНТАМИ: Очистка истории
    if (user.adminAction === 'clear_history_get_chat_id') {
      if (conversationHistory[text]) {
        conversationHistory[text] = [];
        bot.sendMessage(chatId, `✅ История диалога очищена для пользователя ${text}`, clientManagementKeyboard);
      } else {
        bot.sendMessage(chatId, `📝 История диалога пуста для пользователя ${text}`, clientManagementKeyboard);
      }
      
      user.adminAction = null;
      return;
    }
  }

  // ========== РЕГИСТРАЦИЯ ==========
  
  // ========== ПЕРВИЧНАЯ РЕГИСТРАЦИЯ РОДИТЕЛЯ ==========
  
  if (user.stage === 'registration_parent_name') {
    user.parentName = text;
    user.stage = 'registration_parent_fullname';
    bot.sendMessage(
      chatId,
      `Приятно познакомиться, ${user.parentName}! 😊\n\n` +
      `Теперь укажите ваше ФИО полностью\n` +
      `(это нужно для документов)\n\n` +
      `Например: Иванова Анна Петровна`,
      cancelKeyboard
    );
    return;
  }

  if (user.stage === 'registration_parent_fullname') {
    user.parentFullName = text;
    user.stage = 'registration_phone';
    bot.sendMessage(
      chatId,
      `Отлично! Теперь укажите ваш номер телефона\n\n` +
      `Формат: +7 (xxx) xxx-xx-xx\nили просто: 89xxxxxxxxx`,
      cancelKeyboard
    );
    return;
  }

  if (user.stage === 'registration_phone') {
    user.phone = text;
    user.isRegistered = true;
    user.stage = 'add_child_fullname';
    user.tempChild = {};
    
    bot.sendMessage(
      chatId,
      `✅ Отлично, ${user.parentName}!\n\n` +
      `Теперь добавим вашего первого ребёнка 👶\n\n` +
      `Введите ФИО ребёнка\n\n` +
      `Например: Иванов Иван Иванович`,
      cancelKeyboard
    );
    return;
  }

  // ========== ДОБАВЛЕНИЕ РЕБЁНКА ==========
  
  if (user.stage === 'add_child_fullname') {
    if (!user.tempChild) {
      user.tempChild = {};
    }
    user.tempChild.fullName = text;
    user.stage = 'add_child_birthdate';
    bot.sendMessage(
      chatId,
      `Укажите дату рождения ребёнка\n\n` +
      `Формат: ДД.ММ.ГГГГ\nНапример: 15.03.2015`,
      cancelKeyboard
    );
    return;
  }

  if (user.stage === 'add_child_birthdate') {
    const dateRegex = /^\d{2}\.\d{2}\.\d{4}$/;
    if (!dateRegex.test(text)) {
      bot.sendMessage(
        chatId,
        '❌ Неверный формат!\n\nИспользуйте: ДД.ММ.ГГГГ\nНапример: 15.03.2015',
        cancelKeyboard
      );
      return;
    }
    
    user.tempChild.birthDate = text;
    user.stage = 'add_child_gender';
    bot.sendMessage(
      chatId,
      `Укажите пол ребёнка:`,
      genderKeyboard
    );
    return;
  }

  if (user.stage === 'add_child_gender') {
    let gender = null;
    
    if (text === '👦 Мальчик' || text.toLowerCase().includes('мальчик')) {
      gender = 'Мальчик';
    } else if (text === '👧 Девочка' || text.toLowerCase().includes('девочка')) {
      gender = 'Девочка';
    }
    
    if (!gender) {
      bot.sendMessage(
        chatId,
        '❌ Пожалуйста, выберите пол ребёнка с помощью кнопок',
        genderKeyboard
      );
      return;
    }
    
    user.tempChild.gender = gender;
    user.stage = 'add_child_note';
    bot.sendMessage(
      chatId,
      `Последний шаг! 🎉\n\n` +
      `Есть ли дополнительные пожелания или комментарии по этому ребёнку?\n\n` +
      `Можете написать текст или нажать "✅ Без примечаний"`,
      noteKeyboard
    );
    return;
  }

  if (user.stage === 'add_child_note') {
    let note = '';
    if (text !== '✅ Без примечаний' && text.toLowerCase() !== 'нет') {
      note = text;
    }
    
    user.tempChild.note = note;
    user.tempChild.registeredAt = new Date().toISOString();
    
    // Добавляем ребёнка в массив
    if (!user.children) {
      user.children = [];
    }
    user.children.push(user.tempChild);
    
    // Создаём заявку в CRM
    const registrationData = {
      parentName: user.parentName,
      parentFullName: user.parentFullName,
      childFullName: user.tempChild.fullName,
      childBirthDate: user.tempChild.birthDate,
      childGender: user.tempChild.gender,
      phone: user.phone,
      source: user.source,
      note: note,
      chatId: chatId,
      childNumber: user.children.length
    };
    
    bot.sendMessage(chatId, '⏳ Отправляю заявку...', removeKeyboard);
    
    const crmResult = await createCustomerInAlfaCRM(registrationData);
    notifyAdmin(registrationData, crmResult);
    
    // Сохраняем данные
    saveData();
    
    const keyboard = getKeyboard(chatId);
    
    const childrenCount = user.children.length;
    const childrenLeft = 5 - childrenCount;
    
    bot.sendMessage(
      chatId,
      '✅ Ребёнок успешно добавлен!\n\n' +
      `👤 Родитель: ${user.parentFullName}\n` +
      `👦 Ребёнок: ${user.tempChild.fullName}\n` +
      `🎂 ДР: ${user.tempChild.birthDate}\n` +
      `👫 Пол: ${user.tempChild.gender}\n` +
      `📱 ${user.phone}\n\n` +
      `💡 Всего детей: ${childrenCount}/5\n` +
      `Можно добавить ещё: ${childrenLeft}\n\n` +
      `🎉 Наш менеджер свяжется с вами в течение часа!\n\n` +
      `Если есть вопросы — спрашивайте, ${user.parentName}! 😊`,
      keyboard
    );

    user.stage = 'greeting';
    user.tempChild = null;
    
    setTimeout(() => {
      bot.sendMessage(chatId, 'Чем ещё могу помочь? 💬', keyboard);
    }, 2000);
    return;
  }

  // ========== ОБРАБОТКА КОМАНД ==========
  
  // КНОПКА "📝 Записаться" - регистрация родителя или добавление ребёнка
  if (text === '📝 Записаться') {
    // Проверка на спам регистраций
    if (checkRegistrationSpam(chatId)) {
      return;
    }
    
    // Если родитель уже зарегистрирован - предлагаем добавить ребёнка
    if (user.isRegistered) {
      if (!canCreateLead(chatId)) {
        const keyboard = getKeyboard(chatId);
        bot.sendMessage(
          chatId,
          '⚠️ Вы достигли лимита детей (5 детей)\n\n' +
          'Для добавления ещё детей свяжитесь с нами:\n' +
          '📱 +7 (963) 384-09-77',
          keyboard
        );
        return;
      }
      
      const childrenLeft = 5 - (user.children?.length || 0);
      
      user.stage = 'add_child_fullname';
      user.tempChild = {};
      
      bot.sendMessage(
        chatId,
        `Добавляем ребёнка! 👶\n\n` +
        `💡 Можно добавить ещё: ${childrenLeft} детей\n\n` +
        `Введите ФИО ребёнка\n\n` +
        `Например: Иванов Иван Иванович`,
        cancelKeyboard
      );
      return;
    }
    
    // Первичная регистрация родителя
    user.stage = 'registration_parent_name';
    bot.sendMessage(
      chatId,
      `Добро пожаловать! 🎉\n\n` +
      `Начинаем регистрацию.\n\n` +
      `📝 Сначала давайте познакомимся!\n\n` +
      `Как к вам обращаться? (ваше имя)\n\n` +
      `Например: Анна, Мария`,
      cancelKeyboard
    );
    return;
  }

  // КНОПКА "👶 Добавить ребёнка" - только для зарегистрированных
  if (text === '👶 Добавить ребёнка') {
    if (!user.isRegistered) {
      const keyboard = getKeyboard(chatId);
      bot.sendMessage(
        chatId,
        '⚠️ Сначала нужно зарегистрироваться!\n\n' +
        'Нажмите кнопку "📝 Записаться" для регистрации.',
        keyboard
      );
      return;
    }
    
    // Проверка на спам регистраций
    if (checkRegistrationSpam(chatId)) {
      return;
    }
    
    if (!canCreateLead(chatId)) {
      const keyboard = getKeyboard(chatId);
      bot.sendMessage(
        chatId,
        '⚠️ Вы достигли лимита детей (5 детей)\n\n' +
        'Для добавления ещё детей свяжитесь с нами:\n' +
        '📱 +7 (963) 384-09-77',
        keyboard
      );
      return;
    }
    
    const childrenLeft = 5 - (user.children?.length || 0);
    
    user.stage = 'add_child_fullname';
    user.tempChild = {};
    
    bot.sendMessage(
      chatId,
      `Добавляем ребёнка! 👶\n\n` +
      `💡 Можно добавить ещё: ${childrenLeft} детей\n\n` +
      `Введите ФИО ребёнка\n\n` +
      `Например: Иванов Иван Иванович`,
      cancelKeyboard
    );
    return;
  }

  // КНОПКА "👨‍👩‍👧‍👦 Мои дети" - просмотр списка детей
  if (text === '👨‍👩‍👧‍👦 Мои дети') {
    if (!user.isRegistered) {
      const keyboard = getKeyboard(chatId);
      bot.sendMessage(
        chatId,
        '⚠️ Сначала нужно зарегистрироваться!\n\n' +
        'Нажмите кнопку "📝 Записаться" для регистрации.',
        keyboard
      );
      return;
    }
    
    const keyboard = getKeyboard(chatId);
    
    if (!user.children || user.children.length === 0) {
      bot.sendMessage(
        chatId,
        '👨‍👩‍👧‍👦 У вас пока нет добавленных детей\n\n' +
        'Нажмите "👶 Добавить ребёнка" чтобы добавить.',
        keyboard
      );
      return;
    }
    
    let message = `👨‍👩‍👧‍👦 ВАШИ ДЕТИ:\n\n`;
    message += `👤 Родитель: ${user.parentFullName}\n`;
    message += `📱 Телефон: ${user.phone}\n\n`;
    message += `────────────────\n\n`;
    
    user.children.forEach((child, index) => {
      message += `${index + 1}. ${child.fullName}\n`;
      message += `   🎂 Дата рождения: ${child.birthDate}\n`;
      message += `   👫 Пол: ${child.gender}\n`;
      if (child.note) {
        message += `   📝 Примечание: ${child.note}\n`;
      }
      message += `   📅 Добавлен: ${new Date(child.registeredAt).toLocaleDateString('ru-RU')}\n\n`;
    });
    
    message += `────────────────\n`;
    message += `💡 Всего детей: ${user.children.length}/5`;
    
    bot.sendMessage(chatId, message, keyboard);
    return;
  }

  // КНОПКА "⚙️ Мой профиль"
  if (text === '⚙️ Мой профиль') {
    if (!user.isRegistered) {
      const keyboard = getKeyboard(chatId);
      bot.sendMessage(
        chatId,
        '⚠️ Сначала нужно зарегистрироваться!\n\n' +
        'Нажмите кнопку "📝 Записаться" для регистрации.',
        keyboard
      );
      return;
    }
    
    const childrenCount = user.children?.length || 0;
    
    let message = `⚙️ МОЙ ПРОФИЛЬ\n\n`;
    message += `👤 Имя: ${user.parentName}\n`;
    message += `📋 ФИО: ${user.parentFullName}\n`;
    message += `📱 Телефон: ${user.phone}\n`;
    message += `👶 Детей: ${childrenCount}/5\n\n`;
    message += `Выберите что хотите изменить:`;
    
    bot.sendMessage(chatId, message, profileMenuKeyboard);
    return;
  }

  // КНОПКА "⭐️ Оставить отзыв"
  if (text === '⭐️ Оставить отзыв') {
    user.stage = 'review_rating';
    bot.sendMessage(
      chatId,
      '⭐️ ОЦЕНКА НАШЕЙ РАБОТЫ\n\n' +
      'Спасибо, что хотите оставить отзыв!\n\n' +
      'Оцените нашу работу от 1 до 5 звёзд:',
      ratingKeyboard
    );
    return;
  }

  // ВОЗВРАТ В ГЛАВНОЕ МЕНЮ
  if (text === '🔙 Назад в главное меню') {
    user.stage = 'greeting';
    user.tempChild = null;
    user.editingChildIndex = null;
    const keyboard = getKeyboard(chatId);
    bot.sendMessage(chatId, '🏠 Главное меню', keyboard);
    return;
  }

  // ВОЗВРАТ В ПРОФИЛЬ
  if (text === '🔙 Назад в профиль') {
    user.stage = 'greeting';
    user.tempChild = null;
    user.editingChildIndex = null;
    
    const childrenCount = user.children?.length || 0;
    let message = `⚙️ МОЙ ПРОФИЛЬ\n\n`;
    message += `👤 Имя: ${user.parentName}\n`;
    message += `📋 ФИО: ${user.parentFullName}\n`;
    message += `📱 Телефон: ${user.phone}\n`;
    message += `👶 Детей: ${childrenCount}/5`;
    
    bot.sendMessage(chatId, message, profileMenuKeyboard);
    return;
  }

  if (text === '📞 Контакты') {
    const keyboard = getKeyboard(chatId);
    bot.sendMessage(
      chatId,
      '📞 КОНТАКТЫ КВАНТИК\n\n' +
      '📱 Телефон: +7 (963) 384-09-77\n' +
      '🌐 Сайт: kvantik.durablesites.com\n\n' +
      '📍 Адрес:\n' +
      'г. Ставрополь\n' +
      'пр-т Кулакова, 5/3, 1 этаж\n\n' +
      '🗺 Построить маршрут:\n' +
      'https://2gis.ru/stavropol/firm/70000001075445011\n\n' +
      'Приезжайте в гости! 🎉',
      keyboard
    );
    return;
  }

  // Обработка запроса расписания от пользователя
  if (text.toLowerCase().includes('расписание') || text.toLowerCase().includes('занятия на')) {
    bot.sendChatAction(chatId, 'typing');
    
    // Получаем расписание на неделю
    const today = new Date();
    const dateFrom = today.toISOString().split('T')[0];
    const weekLater = new Date(today);
    weekLater.setDate(weekLater.getDate() + 7);
    const dateTo = weekLater.toISOString().split('T')[0];
    
    const result = await getAlfaCRMSchedule(dateFrom, dateTo);
    
    const keyboard = getKeyboard(chatId);
    
    if (result.success && result.data.items && result.data.items.length > 0) {
      const message = formatSchedule(result.data.items);
      bot.sendMessage(chatId, message, keyboard);
      
      // Уведомляем администратора
      if (!isAdmin(chatId)) {
        const adminMessage = `📅 Пользователь ${user.parentName || 'Гость'} (${chatId}) запросил расписание`;
        bot.sendMessage(MAIN_ADMIN_ID, adminMessage);
        ADDITIONAL_ADMINS.forEach(adminId => {
          bot.sendMessage(adminId, adminMessage);
        });
      }
    } else {
      bot.sendMessage(
        chatId,
        '📅 К сожалению, не удалось загрузить актуальное расписание.\n\n' +
        'Пожалуйста, свяжитесь с нами для уточнения:\n' +
        '📱 +7 (963) 384-09-77',
        keyboard
      );
    }
    return;
  }

  if (text === '👤 Связаться с администратором') {
    // Проверка на спам вопросов
    if (checkQuestionSpam(chatId)) {
      return;
    }
    
    user.stage = 'waiting_admin_question';
    user.waitingForAdminResponse = true;
    bot.sendMessage(
      chatId,
      '👤 Вы можете задать вопрос администратору.\n\n' +
      'Напишите ваш вопрос, и администратор ответит вам в ближайшее время.\n\n' +
      '💡 Обычно мы отвечаем в течение 1-2 часов в рабочее время.\n\n' +
      '⚠️ ВАЖНО: Администратор видит всю историю вашего общения с ботом. ' +
      'Пожалуйста, используйте бот только для вопросов, связанных с детским клубом "Квантик".',
      removeKeyboard
    );
    return;
  }

  // Обработка вопроса для администратора
  // ========== СИСТЕМА ОТЗЫВОВ ==========
  
  if (user.stage === 'review_rating') {
    let rating = 0;
    if (text === '⭐️') rating = 1;
    else if (text === '⭐️⭐️') rating = 2;
    else if (text === '⭐️⭐️⭐️') rating = 3;
    else if (text === '⭐️⭐️⭐️⭐️') rating = 4;
    else if (text === '⭐️⭐️⭐️⭐️⭐️') rating = 5;
    
    if (rating === 0) {
      bot.sendMessage(
        chatId,
        '❌ Пожалуйста, выберите оценку с помощью кнопок',
        ratingKeyboard
      );
      return;
    }
    
    user.tempReview = { rating, timestamp: new Date().toISOString() };
    user.stage = 'review_text';
    
    bot.sendMessage(
      chatId,
      `Отлично! Вы поставили ${rating} ${rating === 1 ? 'звезду' : rating < 5 ? 'звезды' : 'звёзд'} ⭐️\n\n` +
      `Теперь напишите текст отзыва или нажмите "✅ Без комментария"`,
      noteKeyboard
    );
    return;
  }
  
  if (user.stage === 'review_text') {
    let reviewText = '';
    if (text !== '✅ Без примечаний' && text !== '✅ Без комментария') {
      reviewText = text;
    }
    
    user.tempReview.text = reviewText;
    user.tempReview.userName = user.parentName || 'Гость';
    user.tempReview.userFullName = user.parentFullName;
    
    // Сохраняем отзыв
    if (!reviews[chatId]) {
      reviews[chatId] = [];
    }
    reviews[chatId].push(user.tempReview);
    
    saveData();
    logGeneral(`Новый отзыв от ${user.parentName} (${chatId}): ${user.tempReview.rating} звёзд`);
    
    // Уведомляем администраторов
    const adminMessage = `⭐️ НОВЫЙ ОТЗЫВ!\n\n` +
      `👤 ${user.parentFullName || 'Гость'}\n` +
      `💬 Telegram ID: ${chatId}\n` +
      `⭐️ Оценка: ${user.tempReview.rating}/5\n` +
      `📝 Текст: ${reviewText || 'без комментария'}\n` +
      `📅 Дата: ${new Date().toLocaleString('ru-RU')}`;
    
    bot.sendMessage(MAIN_ADMIN_ID, adminMessage);
    ADDITIONAL_ADMINS.forEach(adminId => {
      bot.sendMessage(adminId, adminMessage);
    });
    
    const keyboard = getKeyboard(chatId);
    bot.sendMessage(
      chatId,
      `✅ Спасибо за отзыв!\n\n` +
      `Ваше мнение очень важно для нас! 💙`,
      keyboard
    );
    
    user.stage = 'greeting';
    user.tempReview = null;
    return;
  }
  
  // ========== РЕДАКТИРОВАНИЕ ПРОФИЛЯ ==========
  
  // Изменение имени родителя
  if (text === '✏️ Изменить имя') {
    user.stage = 'edit_parent_name';
    bot.sendMessage(
      chatId,
      `Текущее имя: ${user.parentName}\n\n` +
      `Введите новое имя:`,
      cancelKeyboard
    );
    return;
  }
  
  if (user.stage === 'edit_parent_name') {
    const oldName = user.parentName;
    user.parentName = text;
    saveData();
    logGeneral(`Пользователь ${chatId} изменил имя: ${oldName} → ${text}`);
    
    user.stage = 'greeting';
    bot.sendMessage(
      chatId,
      `✅ Имя успешно изменено!\n\n` +
      `Было: ${oldName}\n` +
      `Стало: ${text}`,
      profileMenuKeyboard
    );
    return;
  }
  
  // Изменение телефона
  if (text === '✏️ Изменить телефон') {
    user.stage = 'edit_phone';
    bot.sendMessage(
      chatId,
      `Текущий телефон: ${user.phone}\n\n` +
      `Введите новый номер телефона:`,
      cancelKeyboard
    );
    return;
  }
  
  if (user.stage === 'edit_phone') {
    const oldPhone = user.phone;
    user.phone = text;
    saveData();
    logGeneral(`Пользователь ${chatId} изменил телефон: ${oldPhone} → ${text}`);
    
    user.stage = 'greeting';
    bot.sendMessage(
      chatId,
      `✅ Телефон успешно изменён!\n\n` +
      `Было: ${oldPhone}\n` +
      `Стало: ${text}`,
      profileMenuKeyboard
    );
    return;
  }
  
  // Редактирование детей
  if (text === '👶 Редактировать детей') {
    if (!user.children || user.children.length === 0) {
      bot.sendMessage(
        chatId,
        '❌ У вас пока нет добавленных детей\n\n' +
        'Нажмите "👶 Добавить ребёнка" чтобы добавить.',
        profileMenuKeyboard
      );
      return;
    }
    
    let message = `👶 РЕДАКТИРОВАНИЕ ДЕТЕЙ\n\n`;
    message += `Выберите ребёнка для редактирования:\n\n`;
    
    user.children.forEach((child, index) => {
      message += `${index + 1}. ${child.fullName}\n`;
    });
    
    user.stage = 'select_child_to_edit';
    bot.sendMessage(chatId, message, getChildrenEditKeyboard(user.children));
    return;
  }
  
  if (text === '🔙 Назад к списку детей') {
    if (!user.children || user.children.length === 0) {
      const keyboard = getKeyboard(chatId);
      bot.sendMessage(chatId, '❌ У вас нет детей', keyboard);
      return;
    }
    
    let message = `👶 РЕДАКТИРОВАНИЕ ДЕТЕЙ\n\n`;
    message += `Выберите ребёнка для редактирования:\n\n`;
    
    user.children.forEach((child, index) => {
      message += `${index + 1}. ${child.fullName}\n`;
    });
    
    user.stage = 'select_child_to_edit';
    user.editingChildIndex = null;
    bot.sendMessage(chatId, message, getChildrenEditKeyboard(user.children));
    return;
  }
  
  // Выбор ребёнка для редактирования
  if (user.stage === 'select_child_to_edit') {
    const match = text.match(/^(\d+)\./);
    if (!match) {
      bot.sendMessage(
        chatId,
        '❌ Пожалуйста, выберите ребёнка из списка',
        getChildrenEditKeyboard(user.children)
      );
      return;
    }
    
    const childIndex = parseInt(match[1]) - 1;
    if (childIndex < 0 || childIndex >= user.children.length) {
      bot.sendMessage(
        chatId,
        '❌ Неверный номер ребёнка',
        getChildrenEditKeyboard(user.children)
      );
      return;
    }
    
    user.editingChildIndex = childIndex;
    const child = user.children[childIndex];
    
    let message = `✏️ РЕДАКТИРОВАНИЕ РЕБЁНКА\n\n`;
    message += `👦 ${child.fullName}\n`;
    message += `🎂 ${child.birthDate}\n`;
    message += `👫 ${child.gender}\n`;
    if (child.note) {
      message += `📝 ${child.note}\n`;
    }
    message += `\nЧто хотите изменить?`;
    
    user.stage = 'child_edit_action';
    bot.sendMessage(chatId, message, childActionKeyboard);
    return;
  }
  
  // Действия с ребёнком
  if (user.stage === 'child_edit_action') {
    const childIndex = user.editingChildIndex;
    const child = user.children[childIndex];
    
    if (text === '✏️ Изменить имя') {
      user.stage = 'edit_child_name';
      bot.sendMessage(
        chatId,
        `Текущее имя: ${child.fullName}\n\n` +
        `Введите новое ФИО ребёнка:`,
        cancelKeyboard
      );
      return;
    }
    
    if (text === '✏️ Изменить дату рождения') {
      user.stage = 'edit_child_birthdate';
      bot.sendMessage(
        chatId,
        `Текущая дата: ${child.birthDate}\n\n` +
        `Введите новую дату (ДД.ММ.ГГГГ):`,
        cancelKeyboard
      );
      return;
    }
    
    if (text === '✏️ Изменить пол') {
      user.stage = 'edit_child_gender';
      bot.sendMessage(
        chatId,
        `Текущий пол: ${child.gender}\n\n` +
        `Выберите новый пол:`,
        genderKeyboard
      );
      return;
    }
    
    if (text === '✏️ Изменить примечание') {
      user.stage = 'edit_child_note';
      bot.sendMessage(
        chatId,
        `Текущее примечание: ${child.note || 'нет'}\n\n` +
        `Введите новое примечание:`,
        noteKeyboard
      );
      return;
    }
    
    if (text === '🗑 Удалить ребёнка') {
      user.stage = 'confirm_delete_child';
      bot.sendMessage(
        chatId,
        `⚠️ УДАЛЕНИЕ РЕБЁНКА\n\n` +
        `Вы действительно хотите удалить:\n` +
        `${child.fullName}?\n\n` +
        `Напишите "УДАЛИТЬ" для подтверждения\n` +
        `Или нажмите "❌ Отменить"`,
        cancelKeyboard
      );
      return;
    }
  }
  
  // Подтверждение удаления ребёнка
  if (user.stage === 'confirm_delete_child') {
    if (text !== 'УДАЛИТЬ') {
      bot.sendMessage(
        chatId,
        '❌ Удаление отменено\n\n' +
        'Напишите "УДАЛИТЬ" (заглавными буквами) для подтверждения',
        cancelKeyboard
      );
      return;
    }
    
    const childIndex = user.editingChildIndex;
    const deletedChild = user.children[childIndex];
    
    user.children.splice(childIndex, 1);
    saveData();
    logGeneral(`Пользователь ${chatId} удалил ребёнка: ${deletedChild.fullName}`);
    
    user.stage = 'greeting';
    user.editingChildIndex = null;
    
    const keyboard = getKeyboard(chatId);
    bot.sendMessage(
      chatId,
      `✅ Ребёнок удалён\n\n` +
      `${deletedChild.fullName}\n\n` +
      `Осталось детей: ${user.children.length}/5`,
      keyboard
    );
    return;
  }
  
  // Редактирование полей ребёнка
  if (user.stage === 'edit_child_name') {
    const childIndex = user.editingChildIndex;
    const oldName = user.children[childIndex].fullName;
    user.children[childIndex].fullName = text;
    saveData();
    logGeneral(`Пользователь ${chatId} изменил имя ребёнка: ${oldName} → ${text}`);
    
    user.stage = 'child_edit_action';
    bot.sendMessage(
      chatId,
      `✅ Имя изменено!\n\n` +
      `Было: ${oldName}\n` +
      `Стало: ${text}`,
      childActionKeyboard
    );
    return;
  }
  
  if (user.stage === 'edit_child_birthdate') {
    const dateRegex = /^\d{2}\.\d{2}\.\d{4}$/;
    if (!dateRegex.test(text)) {
      bot.sendMessage(
        chatId,
        '❌ Неверный формат!\n\nИспользуйте: ДД.ММ.ГГГГ',
        cancelKeyboard
      );
      return;
    }
    
    const childIndex = user.editingChildIndex;
    const oldDate = user.children[childIndex].birthDate;
    user.children[childIndex].birthDate = text;
    saveData();
    logGeneral(`Пользователь ${chatId} изменил дату рождения ребёнка: ${oldDate} → ${text}`);
    
    user.stage = 'child_edit_action';
    bot.sendMessage(
      chatId,
      `✅ Дата рождения изменена!\n\n` +
      `Было: ${oldDate}\n` +
      `Стало: ${text}`,
      childActionKeyboard
    );
    return;
  }
  
  if (user.stage === 'edit_child_gender') {
    let gender = null;
    if (text === '👦 Мальчик' || text.toLowerCase().includes('мальчик')) {
      gender = 'Мальчик';
    } else if (text === '👧 Девочка' || text.toLowerCase().includes('девочка')) {
      gender = 'Девочка';
    }
    
    if (!gender) {
      bot.sendMessage(
        chatId,
        '❌ Пожалуйста, выберите пол с помощью кнопок',
        genderKeyboard
      );
      return;
    }
    
    const childIndex = user.editingChildIndex;
    const oldGender = user.children[childIndex].gender;
    user.children[childIndex].gender = gender;
    saveData();
    logGeneral(`Пользователь ${chatId} изменил пол ребёнка: ${oldGender} → ${gender}`);
    
    user.stage = 'child_edit_action';
    bot.sendMessage(
      chatId,
      `✅ Пол изменён!\n\n` +
      `Было: ${oldGender}\n` +
      `Стало: ${gender}`,
      childActionKeyboard
    );
    return;
  }
  
  if (user.stage === 'edit_child_note') {
    let note = '';
    if (text !== '✅ Без примечаний') {
      note = text;
    }
    
    const childIndex = user.editingChildIndex;
    const oldNote = user.children[childIndex].note || 'нет';
    user.children[childIndex].note = note;
    saveData();
    logGeneral(`Пользователь ${chatId} изменил примечание ребёнка`);
    
    user.stage = 'child_edit_action';
    bot.sendMessage(
      chatId,
      `✅ Примечание изменено!\n\n` +
      `Было: ${oldNote}\n` +
      `Стало: ${note || 'нет'}`,
      childActionKeyboard
    );
    return;
  }

  // ========== ВОПРОС АДМИНИСТРАТОРУ ==========
  
  if (user.stage === 'waiting_admin_question') {
    const userName = user.isRegistered ? user.parentName : 'Гость';
    const userInfo = user.isRegistered 
      ? `Родитель: ${user.parentName}\nТелефон: ${user.phone || 'не указан'}\n`
      : 'Незарегистрированный пользователь\n';
    
    // Сохраняем вопрос
    pendingQuestions[chatId] = {
      question: text,
      timestamp: new Date(),
      userName: userName,
      userInfo: userInfo
    };
    
    // Сохраняем данные
    saveData();
    
    // Уведомляем администраторов
    const adminNotification = `🔔 ВОПРОС ОТ ПОЛЬЗОВАТЕЛЯ:\n\n` +
      `👤 ${userName} (ID: ${chatId})\n` +
      `${userInfo}\n` +
      `❓ Вопрос:\n${text}\n\n` +
      `⏰ Время: ${new Date().toLocaleString('ru-RU')}\n\n` +
      `📝 Для ответа используйте:\n/reply ${chatId} ваш_ответ`;
    
    bot.sendMessage(MAIN_ADMIN_ID, adminNotification);
    ADDITIONAL_ADMINS.forEach(adminId => {
      bot.sendMessage(adminId, adminNotification);
    });
    
    const keyboard = getKeyboard(chatId);
    
    // Подтверждаем пользователю
    bot.sendMessage(
      chatId,
      '✅ Ваш вопрос отправлен администратору!\n\n' +
      '⏰ Мы ответим вам в ближайшее время.\n\n' +
      'Пока можете задавать другие вопросы боту 💬',
      keyboard
    );
    
    user.stage = 'greeting';
    return;
  }

  // ========== ОБРАБОТКА КНОПОК АДМИНИСТРАТОРА ==========
  
  if (isAdmin(chatId)) {
    
    // === ГЛАВНОЕ МЕНЮ АДМИНИСТРАТОРА ===
    
    if (text === '🔙 Главное меню') {
      user.adminAction = null;
      user.adminTargetChatId = null;
      user.adminTempData = null;
      bot.sendMessage(chatId, '🏠 Главное меню администратора', adminKeyboard);
      return;
    }
    
    if (text === '🔙 Назад в админ-меню') {
      user.adminAction = null;
      user.adminTargetChatId = null;
      user.adminTempData = null;
      bot.sendMessage(chatId, '🔙 Возврат в админ-меню', adminKeyboard);
      return;
    }
    
    if (text === '📊 Статистика') {
      const totalUsers = Object.keys(userData).length;
      const registeredUsers = Object.values(userData).filter(u => u.isRegistered).length;
      
      // Подсчёт детей
      let totalChildren = 0;
      Object.values(userData).forEach(u => {
        if (u.children && u.children.length > 0) {
          totalChildren += u.children.length;
        }
      });
      
      const pendingQuestionsCount = Object.keys(pendingQuestions).length;
      
      bot.sendMessage(
        chatId,
        `📊 СТАТИСТИКА БОТА\n\n` +
        `👥 Всего пользователей: ${totalUsers}\n` +
        `✅ Зарегистрировано родителей: ${registeredUsers}\n` +
        `👶 Всего детей: ${totalChildren}\n` +
        `📝 Средняя детей на родителя: ${registeredUsers > 0 ? (totalChildren / registeredUsers).toFixed(1) : 0}\n` +
        `❓ Активных вопросов: ${pendingQuestionsCount}`,
        adminKeyboard
      );
      return;
    }
    
    if (text === '📋 Активные вопросы') {
      if (Object.keys(pendingQuestions).length === 0) {
        bot.sendMessage(chatId, '📋 Активных вопросов нет', adminKeyboard);
        return;
      }
      
      let message = '📋 АКТИВНЫЕ ВОПРОСЫ:\n\n';
      Object.keys(pendingQuestions).forEach((userId, index) => {
        const q = pendingQuestions[userId];
        message += `${index + 1}. ${q.userName} (ID: ${userId})\n`;
        message += `❓ ${q.question}\n`;
        message += `⏰ ${q.timestamp.toLocaleString('ru-RU')}\n\n`;
      });
      
      message += `\nДля ответа используйте:\n⚙️ Управление клиентами → 💬 Ответить на вопрос`;
      
      bot.sendMessage(chatId, message, adminKeyboard);
      return;
    }
    
    // === МЕНЮ РАСПИСАНИЯ ===
    
    if (text === '📅 Расписание') {
      bot.sendMessage(
        chatId,
        '📅 УПРАВЛЕНИЕ РАСПИСАНИЕМ\n\nВыберите действие:',
        scheduleMenuKeyboard
      );
      return;
    }
    
    if (text === '📅 На сегодня') {
      bot.sendChatAction(chatId, 'typing');
      const today = new Date();
      const dateFrom = today.toISOString().split('T')[0];
      const dateTo = dateFrom;
      
      const result = await getAlfaCRMSchedule(dateFrom, dateTo);
      
      if (result.success && result.data.items && result.data.items.length > 0) {
        const message = formatSchedule(result.data.items);
        bot.sendMessage(chatId, message, scheduleMenuKeyboard);
      } else {
        bot.sendMessage(chatId, '📅 Занятий на сегодня не запланировано.', scheduleMenuKeyboard);
      }
      return;
    }
    
    if (text === '📅 На завтра') {
      bot.sendChatAction(chatId, 'typing');
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateFrom = tomorrow.toISOString().split('T')[0];
      const dateTo = dateFrom;
      
      const result = await getAlfaCRMSchedule(dateFrom, dateTo);
      
      if (result.success && result.data.items && result.data.items.length > 0) {
        const message = formatSchedule(result.data.items);
        bot.sendMessage(chatId, message, scheduleMenuKeyboard);
      } else {
        bot.sendMessage(chatId, '📅 Занятий на завтра не запланировано.', scheduleMenuKeyboard);
      }
      return;
    }
    
    if (text === '📅 На неделю') {
      bot.sendChatAction(chatId, 'typing');
      const today = new Date();
      const dateFrom = today.toISOString().split('T')[0];
      const weekLater = new Date(today);
      weekLater.setDate(weekLater.getDate() + 7);
      const dateTo = weekLater.toISOString().split('T')[0];
      
      const result = await getAlfaCRMSchedule(dateFrom, dateTo);
      
      if (result.success && result.data.items && result.data.items.length > 0) {
        const message = formatSchedule(result.data.items);
        bot.sendMessage(chatId, message, scheduleMenuKeyboard);
      } else {
        bot.sendMessage(chatId, '📅 Занятий на неделю не запланировано.', scheduleMenuKeyboard);
      }
      return;
    }
    
    if (text === '📅 На конкретную дату') {
      user.adminAction = 'schedule_date';
      bot.sendMessage(
        chatId,
        '📅 Введите дату в формате ГГГГ-ММ-ДД\n\nНапример: 2024-12-25',
        cancelKeyboard
      );
      return;
    }
    
    if (text === '📤 Отправить клиенту') {
      user.adminAction = 'send_schedule_get_chat_id';
      bot.sendMessage(
        chatId,
        '📤 ОТПРАВКА РАСПИСАНИЯ КЛИЕНТУ\n\n' +
        'Шаг 1/2: Введите Telegram ID клиента\n\n' +
        'ID можно найти в уведомлениях о регистрации или вопросах',
        removeKeyboard
      );
      return;
    }
    
    // === МЕНЮ НАПОМИНАНИЙ ===
    
    if (text === '🔔 Напоминания') {
      bot.sendMessage(
        chatId,
        '🔔 УПРАВЛЕНИЕ НАПОМИНАНИЯМИ\n\nВыберите действие:',
        remindersMenuKeyboard
      );
      return;
    }
    
    if (text === '⏰ Установить пробное занятие') {
      user.adminAction = 'set_trial_get_chat_id';
      bot.sendMessage(
        chatId,
        '⏰ УСТАНОВКА ДАТЫ ПРОБНОГО ЗАНЯТИЯ\n\n' +
        'Шаг 1/2: Введите Telegram ID клиента',
        removeKeyboard
      );
      return;
    }
    
    if (text === '💳 Установить дату оплаты') {
      user.adminAction = 'set_payment_get_chat_id';
      bot.sendMessage(
        chatId,
        '💳 УСТАНОВКА ДАТЫ ОПЛАТЫ\n\n' +
        'Шаг 1/2: Введите Telegram ID клиента',
        removeKeyboard
      );
      return;
    }
    
    if (text === '✅ Отметить посещение') {
      user.adminAction = 'set_visit_get_chat_id';
      bot.sendMessage(
        chatId,
        '✅ ОТМЕТКА ПОСЕЩЕНИЯ\n\n' +
        'Введите Telegram ID клиента',
        removeKeyboard
      );
      return;
    }
    
    if (text === '👁 Посмотреть напоминания') {
      user.adminAction = 'view_reminders_get_chat_id';
      bot.sendMessage(
        chatId,
        '👁 ПРОСМОТР НАПОМИНАНИЙ\n\n' +
        'Введите Telegram ID клиента',
        removeKeyboard
      );
      return;
    }
    
    // === МЕНЮ УПРАВЛЕНИЯ АДМИНИСТРАТОРАМИ (только для главного админа) ===
    
    if (text === '👥 Управление админами') {
      if (!isMainAdmin(chatId)) {
        bot.sendMessage(
          chatId,
          '❌ Эта функция доступна только главному администратору',
          adminKeyboard
        );
        return;
      }
      
      bot.sendMessage(
        chatId,
        '👥 УПРАВЛЕНИЕ АДМИНИСТРАТОРАМИ\n\nВыберите действие:',
        adminManagementKeyboard
      );
      return;
    }
    
    if (text === '➕ Добавить администратора') {
      if (!isMainAdmin(chatId)) {
        bot.sendMessage(chatId, '❌ Доступно только главному администратору', adminKeyboard);
        return;
      }
      
      user.adminAction = 'add_admin';
      bot.sendMessage(
        chatId,
        '➕ ДОБАВЛЕНИЕ АДМИНИСТРАТОРА\n\n' +
        'Введите Telegram ID нового администратора\n\n' +
        '💡 Пользователь должен сначала написать боту /myid',
        removeKeyboard
      );
      return;
    }
    
    if (text === '➖ Удалить администратора') {
      if (!isMainAdmin(chatId)) {
        bot.sendMessage(chatId, '❌ Доступно только главному администратору', adminKeyboard);
        return;
      }
      
      if (ADDITIONAL_ADMINS.length === 0) {
        bot.sendMessage(
          chatId,
          '📋 Дополнительных администраторов нет',
          adminManagementKeyboard
        );
        return;
      }
      
      user.adminAction = 'remove_admin';
      
      let message = '➖ УДАЛЕНИЕ АДМИНИСТРАТОРА\n\n';
      message += 'Текущие администраторы:\n\n';
      ADDITIONAL_ADMINS.forEach((adminId, index) => {
        message += `${index + 1}. ID: ${adminId}\n`;
      });
      message += '\nВведите ID администратора для удаления:';
      
      bot.sendMessage(chatId, message, removeKeyboard);
      return;
    }
    
    if (text === '📋 Список администраторов') {
      if (!isMainAdmin(chatId)) {
        bot.sendMessage(chatId, '❌ Доступно только главному администратору', adminKeyboard);
        return;
      }
      
      let message = '👥 СПИСОК АДМИНИСТРАТОРОВ:\n\n';
      message += `👑 Главный администратор:\n${MAIN_ADMIN_ID}\n\n`;
      
      if (ADDITIONAL_ADMINS.length > 0) {
        message += `👤 Дополнительные администраторы:\n`;
        ADDITIONAL_ADMINS.forEach((adminId, index) => {
          message += `${index + 1}. ${adminId}\n`;
        });
      } else {
        message += `👤 Дополнительных администраторов нет`;
      }
      
      bot.sendMessage(chatId, message, adminManagementKeyboard);
      return;
    }
    
    // === МЕНЮ УПРАВЛЕНИЯ КЛИЕНТАМИ ===
    
    if (text === '⚙️ Управление клиентами') {
      bot.sendMessage(
        chatId,
        '⚙️ УПРАВЛЕНИЕ КЛИЕНТАМИ\n\nВыберите действие:',
        clientManagementKeyboard
      );
      return;
    }
    
    if (text === '💬 Ответить на вопрос') {
      if (Object.keys(pendingQuestions).length === 0) {
        bot.sendMessage(
          chatId,
          '📋 Нет вопросов, ожидающих ответа',
          clientManagementKeyboard
        );
        return;
      }
      
      user.adminAction = 'reply_question_get_chat_id';
      
      let message = '💬 ОТВЕТ НА ВОПРОС КЛИЕНТА\n\n';
      message += 'Активные вопросы:\n\n';
      
      Object.keys(pendingQuestions).forEach((userId, index) => {
        const q = pendingQuestions[userId];
        message += `${index + 1}. ID: ${userId}\n`;
        message += `   ${q.userName}: ${q.question}\n\n`;
      });
      
      message += 'Шаг 1/2: Введите ID клиента:';
      
      bot.sendMessage(chatId, message, removeKeyboard);
      return;
    }
    
    if (text === '✉️ Отправить сообщение') {
      if (!isMainAdmin(chatId)) {
        bot.sendMessage(
          chatId,
          '❌ Эта функция доступна только главному администратору',
          clientManagementKeyboard
        );
        return;
      }
      
      user.adminAction = 'send_message_get_chat_id';
      bot.sendMessage(
        chatId,
        '✉️ ОТПРАВКА СООБЩЕНИЯ КЛИЕНТУ\n\n' +
        'Шаг 1/2: Введите Telegram ID клиента\n\n' +
        '💡 ID можно найти в уведомлениях о регистрации, вопросах или попросить клиента написать /myid',
        removeKeyboard
      );
      return;
    }
    
    if (text === '📢 Массовая рассылка') {
      if (!isMainAdmin(chatId)) {
        bot.sendMessage(
          chatId,
          '❌ Эта функция доступна только главному администратору',
          clientManagementKeyboard
        );
        return;
      }
      
      const totalUsers = Object.keys(userData).filter(id => !isAdmin(id)).length;
      const registeredUsers = Object.values(userData).filter(u => u.isRegistered && !isAdmin(u)).length;
      
      if (totalUsers === 0) {
        bot.sendMessage(
          chatId,
          '❌ В базе нет пользователей для рассылки',
          clientManagementKeyboard
        );
        return;
      }
      
      user.adminAction = 'broadcast_get_type';
      bot.sendMessage(
        chatId,
        '📢 МАССОВАЯ РАССЫЛКА\n\n' +
        `👥 Всего пользователей: ${totalUsers}\n` +
        `✅ Зарегистрированных: ${registeredUsers}\n` +
        `👤 Незарегистрированных: ${totalUsers - registeredUsers}\n\n` +
        'Кому отправить сообщение?\n\n' +
        'Введите:\n' +
        '• all - всем пользователям\n' +
        '• registered - только зарегистрированным\n' +
        '• unregistered - только незарегистрированным',
        removeKeyboard
      );
      return;
    }
    
    if (text === '📋 Список ожидающих ответа') {
      if (Object.keys(pendingQuestions).length === 0) {
        bot.sendMessage(
          chatId,
          '📋 Нет вопросов, ожидающих ответа',
          clientManagementKeyboard
        );
        return;
      }
      
      let message = '📋 ВОПРОСЫ БЕЗ ОТВЕТА:\n\n';
      
      Object.keys(pendingQuestions).forEach((userId, index) => {
        const q = pendingQuestions[userId];
        message += `${index + 1}. ${q.userName} (ID: ${userId})\n`;
        message += `❓ ${q.question}\n`;
        message += `⏰ ${q.timestamp.toLocaleString('ru-RU')}\n\n`;
      });
      
      bot.sendMessage(chatId, message, clientManagementKeyboard);
      return;
    }
    
    if (text === '🗑 Очистить историю диалога') {
      user.adminAction = 'clear_history_get_chat_id';
      bot.sendMessage(
        chatId,
        '🗑 ОЧИСТКА ИСТОРИИ ДИАЛОГА\n\n' +
        'Введите Telegram ID клиента\n\n' +
        '💡 Для очистки своей истории введите: ' + chatId,
        removeKeyboard
      );
      return;
    }
  }

  // ========== ВСЁ ОСТАЛЬНОЕ → GPT-4 ==========
  
  bot.sendChatAction(chatId, 'typing');
  
  const aiResult = await askGPT4(text, chatId);
  
  const keyboard = getKeyboard(chatId);
  
  if (aiResult.success) {
    bot.sendMessage(chatId, aiResult.response, keyboard);
    
    if (!isAdmin(chatId)) {
      const gptNotification = `💬 Диалог с GPT-4:\n\n` +
        `👤 ${user.isRegistered ? `${user.parentName} (родитель)` : 'Гость'} (${chatId}):\n${text}\n\n` +
        `🤖 Квантик:\n${aiResult.response.substring(0, 300)}${aiResult.response.length > 300 ? '...' : ''}\n\n` +
        `📊 Токены: ${aiResult.tokensUsed}`;
      
      bot.sendMessage(MAIN_ADMIN_ID, gptNotification);
      ADDITIONAL_ADMINS.forEach(adminId => {
        bot.sendMessage(adminId, gptNotification);
      });
    }
  } else {
    bot.sendMessage(
      chatId,
      'Извините, произошла ошибка 😔\n\nСвяжитесь с нами:\n📱 +7 (963) 384-09-77',
      keyboard
    );
  }
});

// ========== ОБРАБОТКА КОМАНДЫ /start ==========
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const user = getUserData(chatId);
  
  // Очищаем состояние при новом старте
  user.stage = 'greeting';
  
  const keyboard = getKeyboard(chatId);
  const role = getUserRole(chatId);
  
  if (role === 'main_admin') {
    bot.sendMessage(
      chatId,
      `👋 Добро пожаловать, главный администратор!\n\n` +
      `🔧 Панель управления ботом Квантик\n\n` +
      `Вам доступны все функции, включая:\n` +
      `• Управление администраторами\n` +
      `• Работа с клиентами\n` +
      `• Управление расписанием\n` +
      `• Настройка напоминаний\n\n` +
      `Используйте кнопки меню или команды.\n` +
      `Для полного списка команд: 💬 Помощь по командам`,
      keyboard
    );
  } else if (role === 'admin') {
    bot.sendMessage(
      chatId,
      `👋 Добро пожаловать в админ-панель бота Квантик!\n\n` +
      `Вам доступны функции администратора:\n` +
      `• Работа с клиентами\n` +
      `• Управление расписанием\n` +
      `• Настройка напоминаний\n\n` +
      `Используйте кнопки меню или команды.\n` +
      `Для просмотра всех команд: 💬 Помощь по командам`,
      keyboard
    );
  } else {
    bot.sendMessage(
      chatId,
      `Привет! 👋\n\n` +
      `Я — Квантик, виртуальный помощник детского клуба «Квантик»!\n\n` +
      `Помогу записаться на занятия, расскажу о программах и отвечу на вопросы 😊\n\n` +
      `⚠️ ВАЖНОЕ УВЕДОМЛЕНИЕ:\n` +
      `Администраторы клуба имеют доступ к истории вашего общения с ботом для улучшения качества обслуживания.\n\n` +
      `Что вас интересует?`,
      keyboard
    );
  }
});

bot.on('polling_error', (error) => {
  console.log('❌ Ошибка:', error.message);
});

// Загружаем данные при запуске
loadData();

console.log('🚀 Бот Квантик запущен!');
console.log('🤖 GPT-4 AI интегрирован');
console.log('📊 ID главного администратора:', MAIN_ADMIN_ID);
console.log('👥 Дополнительные администраторы:', ADDITIONAL_ADMINS.length > 0 ? ADDITIONAL_ADMINS.join(', ') : 'нет');
console.log('✅ Система регистрации активирована');
console.log('🔒 Лимит заявок: 5 на пользователя');
console.log('⏰ Система напоминаний активирована');
console.log('🛡 Защита от спама активирована:');
console.log(`   - Максимум сообщений: ${SPAM_PROTECTION.MAX_MESSAGES_PER_MINUTE}/мин`);
console.log(`   - Максимум регистраций: ${SPAM_PROTECTION.MAX_REGISTRATIONS_PER_HOUR}/час`);
console.log(`   - Максимум вопросов: ${SPAM_PROTECTION.MAX_QUESTIONS_PER_HOUR}/час`);
console.log(`   - Длительность бана: ${SPAM_PROTECTION.BAN_DURATION / 60000} минут`);
console.log('💾 Автосохранение: каждые 5 минут');
console.log('📁 Директория данных:', DATA_DIR);
console.log('📅 Cron-задачи запущены:');
console.log('   - Дни рождения: каждый день в 9:00');
console.log('   - Пробные занятия: каждый день в 10:00');
console.log('   - Напоминания об оплате: каждый день в 11:00');
console.log('   - Неактивные клиенты: каждый понедельник в 12:00');
