/**
 * Модуль AI-помощника на базе GPT-4
 * Обрабатывает свободные вопросы пользователей
 */

const axios = require('axios');
const logger = require('../utils/logger');

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const AI_ENABLED = process.env.USE_OPENAI === 'true' && OPENAI_API_KEY;

const SYSTEM_PROMPT = `Ты — Квантик, дружелюбный виртуальный помощник детского клуба «Квантик» в Ставрополе, квалифицированный детский психолог и умелый консультант по продажам.

📋 ИНФОРМАЦИЯ О КЛУБЕ:
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

⚠️ КРИТИЧЕСКИ ВАЖНО - РЕГИСТРАЦИЯ:
• НИКОГДА не говори "Начинаем регистрацию" или "Отлично! Начинаем регистрацию"
• НИКОГДА не проси указать ФИО или другие данные для регистрации
• Если клиент хочет записаться - скажи: "Для записи нажмите кнопку 'Регистрация' в меню"
• Или: "Позвоните нам: +7 (963) 384-09-77"
• Регистрация происходит ТОЛЬКО через кнопку меню!

КАК ПСИХОЛОГ:
• Давай профессиональные рекомендации
• Будь эмпатичным к переживаниям родителей
• При сложных вопросах предлагай консультацию специалиста

КАК КОНСУЛЬТАНТ ПО ПРОДАЖАМ:
• Продавай через ценность, не будь навязчивым
• Используй технику "боль-решение"
• Создавай лёгкое FOMO: "70% выбирают Премиум"
• Подчёркивай экономию
• Мягко подводи к записи

СТИЛЬ:
• Дружелюбный, тёплый, профессиональный
• 1-3 эмодзи на сообщение
• Кратко (2-4 предложения)
• НИКОГДА не используй ** для выделения текста
• Используй только обычный текст и эмодзи

🚫 ВАЖНО:
• НЕ выдумывай информацию
• НЕ обещай гарантий
• Не используй слово "продлёнка" для основного клуба
• При сомнениях предлагай связаться: +7 (963) 384-09-77

💡 ПРИМЕРЫ:

В: "Моему 2 года, что есть?"
О: Для 2 лет отлично подойдёт Кванти-сад (20 000₽/мес) или курс "Малышок" (5 300₽/8 занятий) с мамой. 💙 Что в приоритете: регулярный присмотр или занятия 2-3 раза в неделю?

В: "Дорого"
О: Понимаю! 💙 Давайте посчитаем: няня — 16-20 тыс. У нас 4 800₽ с развитием, уроками, социализацией. Плюс экономите своё время! Начните с Активного или попробуйте день за 500₽?

В: "Хочу записать дочку на английский"
О: Отлично! У нас есть английский для разных возрастов (5 800₽/8 занятий). Сколько лет дочке? Подберу подходящую группу! Для записи нажмите кнопку 📝 Регистрация в меню или звоните: +7 (963) 384-09-77

Будь лучшим помощником! 🌟`;

const aiModule = {
  name: 'ai_assistant',
  version: '1.0.0',
  description: 'AI-помощник на базе GPT-4',
  enabled: AI_ENABLED,
  
  async init(context) {
    this.bot = context.bot;
    this.data = context.data;
    this.saveData = context.saveData;
    
    // Инициализация истории разговоров
    if (!this.data.conversationHistory) {
      this.data.conversationHistory = {};
    }
    
    if (AI_ENABLED) {
      console.log('  🤖 AI-помощник: инициализировано (GPT-4)');
    } else {
      console.log('  ⚠️  AI-помощник: отключен (установите OPENAI_API_KEY)');
    }
  },
  
  commands: {
    ai: async function(msg, args) {
      if (!AI_ENABLED) {
        await aiModule.bot.sendMessage(msg.chat.id, 
          '❌ AI-помощник отключен. Установите OPENAI_API_KEY в .env');
        return { handled: true };
      }
      
      const question = args.join(' ');
      if (!question) {
        await aiModule.bot.sendMessage(msg.chat.id, 
          'Использование: /ai ваш вопрос\n\nПример: /ai Сколько стоит занятие?');
        return { handled: true };
      }
      
      await aiModule.askGPT(question, msg.chat.id);
      return { handled: true };
    },
    
    clear: async function(msg) {
      const chatId = msg.chat.id;
      if (aiModule.data.conversationHistory[chatId]) {
        delete aiModule.data.conversationHistory[chatId];
        aiModule.saveData();
        await aiModule.bot.sendMessage(chatId, '✅ История диалога очищена');
      } else {
        await aiModule.bot.sendMessage(chatId, 'История диалога уже пуста');
      }
      return { handled: true };
    }
  },
  
  commandDescriptions: {
    ai: 'Задать вопрос AI-помощнику',
    clear: 'Очистить историю диалога с AI'
  },
  
  // Обработка сообщений - отвечаем только если AI включен и никто другой не обработал
  async handleMessage(msg, userData) {
    // Если AI отключен - не обрабатываем
    if (!AI_ENABLED) {
      return { handled: false };
    }
    
    const chatId = msg.chat.id;
    const text = msg.text;
    
    // Пропускаем команды
    if (text?.startsWith('/')) {
      return { handled: false };
    }
    
    // Пропускаем пустые сообщения
    if (!text || text.trim() === '') {
      return { handled: false };
    }
    
    // Список всех кнопок (полный список с эмодзи)
    const buttonTexts = [
      // Пользовательские кнопки
      '🏠 Главное меню', 'Меню',
      '📝 Регистрация', 'Регистрация',
      '👶 Добавить ребёнка', 'Добавить ребёнка',
      '❓ Задать вопрос', 'Задать вопрос',
      '⭐️ Оставить отзыв', 'Оставить отзыв',
      '🎟️ Ввести промокод', 'Ввести промокод',
      'ℹ️ О клубе', 'О клубе',
      
      // Админские главные кнопки
      '👥 Пользователи', 'Пользователи',
      '❓ Неотвеченные', 'Неотвеченные',
      '📢 Рассылка', 'Рассылка',
      '✉️ Отправить сообщение', 'Отправить сообщение',
      '✉️ Ответить на вопрос', 'Ответить на вопрос',
      '📊 Статистика', 'Статистика',
      '💾 Экспорт', 'Экспорт',
      '⏰ Напоминания', 'Напоминания',
      '🎟️ Промокоды', 'Промокоды',
      '📅 Расписание', 'Расписание',
      '⚙️ Настройки', 'Настройки',
      '👤 Пользовательский режим', 'Пользовательский режим',
      '🔙 Назад в админ-панель', 'Назад в админ-панель',
      
      // Подменю: Пользователи
      '📋 Список пользователей', 'Список пользователей',
      '🔍 Найти пользователя', 'Найти пользователя',
      '📈 Статистика',
      
      // Подменю: Рассылка
      '📤 Всем', 'Всем',
      '✅ Зарегистрированным', 'Зарегистрированным',
      '⏳ Незарегистрированным', 'Незарегистрированным',
      
      // Подменю: Статистика
      '📈 Общая статистика', 'Общая статистика',
      '📋 Конверсия', 'Конверсия',
      
      // Подменю: Экспорт
      '📥 Экспорт пользователей', 'Экспорт пользователей',
      '📥 Экспорт статистики', 'Экспорт статистики',
      
      // Подменю: Напоминания
      '📅 Установить пробное', 'Установить пробное',
      '💰 Установить оплату', 'Установить оплату',
      '👋 Отметить посещение', 'Отметить посещение',
      '📋 Просмотр напоминаний', 'Просмотр напоминаний',
      
      // Подменю: Промокоды
      '➕ Создать промокод', 'Создать промокод',
      '📋 Список промокодов', 'Список промокодов',
      '📊 Статистика промокодов', 'Статистика промокодов',
      
      // Подменю: Расписание
      '📅 Сегодня', 'Сегодня',
      '📆 Завтра', 'Завтра',
      '📊 На неделю', 'На неделю',
      
      // Подменю: Управление админами
      '👑 Управление админами', 'Управление админами',
      '➕ Добавить администратора', 'Добавить администратора',
      '➖ Удалить администратора', 'Удалить администратора',
      '📋 Список администраторов', 'Список администраторов'
    ];
    
    // Проверяем точное совпадение с любой кнопкой
    if (buttonTexts.includes(text)) {
      return { handled: false };
    }
    
    // Отвечаем на свободные вопросы
    await this.askGPT(text, chatId, userData);
    return { handled: true };
  },
  
  // Запрос к GPT-4
  async askGPT(userMessage, chatId, userData = null) {
    try {
      if (!this.data.conversationHistory[chatId]) {
        this.data.conversationHistory[chatId] = [];
      }
      
      // Добавляем контекст о пользователе
      let contextMessage = userMessage;
      
      if (userData && userData.isRegistered && userData.parentName) {
        contextMessage = `[Родитель: ${userData.parentName}] ${userMessage}`;
      }
      
      this.data.conversationHistory[chatId].push({
        role: 'user',
        content: contextMessage
      });
      
      // Ограничиваем историю последними 10 сообщениями
      if (this.data.conversationHistory[chatId].length > 10) {
        this.data.conversationHistory[chatId] = this.data.conversationHistory[chatId].slice(-10);
      }
      
      const response = await axios.post(
        OPENAI_API_URL,
        {
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            ...this.data.conversationHistory[chatId]
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
      
      this.data.conversationHistory[chatId].push({
        role: 'assistant',
        content: aiResponse
      });
      
      this.saveData();
      
      await this.bot.sendMessage(chatId, aiResponse);
      
      logger.info('AI', `Response sent to ${chatId}`);
      
    } catch (error) {
      logger.error('AI', 'Error calling GPT-4', error.message);
      
      // Удаляем последнее сообщение пользователя из истории
      if (this.data.conversationHistory[chatId]) {
        this.data.conversationHistory[chatId].pop();
      }
      
      let errorMessage = '❌ Произошла ошибка при обращении к AI-помощнику.';
      
      if (error.response?.status === 401) {
        errorMessage = '❌ Неверный API ключ OpenAI';
      } else if (error.response?.status === 429) {
        errorMessage = '❌ Превышен лимит запросов к OpenAI';
      } else if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
        errorMessage = '❌ Нет подключения к интернету или OpenAI недоступен';
      } else if (error.message && error.message.includes('AggregateError')) {
        errorMessage = '❌ Проблема с подключением к OpenAI. Попробуйте позже.';
      }
      
      try {
        await this.bot.sendMessage(chatId, errorMessage);
      } catch (sendError) {
        logger.error('AI', 'Error sending error message', sendError.message);
      }
    }
  }
};

module.exports = aiModule;
