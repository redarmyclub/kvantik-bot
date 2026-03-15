/**
 * Модуль вопросов администратору и отзывов
 */

const logger = require('../utils/logger');

const questionsModule = {
  name: 'questions',
  version: '1.0.0',
  description: 'Вопросы администратору и отзывы',
  enabled: true,
  
  async init(context) {
    this.bot = context.bot;
    this.data = context.data;
    this.saveData = context.saveData;
    
    // Инициализация хранилищ
    if (!this.data.pendingQuestions) {
      this.data.pendingQuestions = {};
    }
    if (!this.data.reviews) {
      this.data.reviews = {};
    }
    if (!this.data.userStates) {
      this.data.userStates = {};
    }
    
    console.log('  ❓ Вопросы и отзывы: инициализировано');
  },
  
  commands: {
    ask: async function(msg) {
      const chatId = msg.chat.id;
      return questionsModule.startQuestion(chatId);
    },
    
    review: async function(msg) {
      const chatId = msg.chat.id;
      return questionsModule.startReview(chatId);
    }
  },
  
  commandDescriptions: {
    ask: 'Задать вопрос администратору',
    review: 'Оставить отзыв'
  },
  
  // Начать задавать вопрос
  startQuestion(chatId) {
    this.data.userStates[chatId] = {
      stage: 'waiting_question',
      type: 'question'
    };
    this.saveData();
    
    this.bot.sendMessage(
      chatId,
      '❓ ЗАДАТЬ ВОПРОС\n\n' +
      'Напишите ваш вопрос, и администратор ответит вам как можно скорее:',
      { reply_markup: { remove_keyboard: true } }
    );
    
    return { success: true, handled: true };
  },
  
  // Начать оставлять отзыв
  startReview(chatId) {
    this.data.userStates[chatId] = {
      stage: 'waiting_review',
      type: 'review'
    };
    this.saveData();
    
    this.bot.sendMessage(
      chatId,
      '⭐️ ОСТАВИТЬ ОТЗЫВ\n\n' +
      'Напишите ваш отзыв о клубе Квантик.\n' +
      'Мы будем рады услышать ваше мнение!',
      { reply_markup: { remove_keyboard: true } }
    );
    
    return { success: true, handled: true };
  },
  
  // Обработка сообщений
  async handleMessage(msg, userData) {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    const state = this.data.userStates[chatId];
    if (!state) return { handled: false };
    
    try {
      if (state.stage === 'waiting_question') {
        // Сохраняем вопрос
        const questionId = `q_${chatId}_${Date.now()}`;
        this.data.pendingQuestions[questionId] = {
          questionId: questionId,  // ← ДОБАВЛЕНО!
          chatId: chatId,
          userName: userData.parentName || 'Гость',
          question: text,
          createdAt: new Date().toISOString(),
          answered: false
        };
        
        // Уведомляем администраторов
        this.notifyAdminsQuestion(chatId, userData, text, questionId);
        
        delete this.data.userStates[chatId];
        this.saveData();
        
        const { showUserMenu } = require('../bot');
        
        this.bot.sendMessage(
          chatId,
          '✅ Ваш вопрос отправлен администратору!\n\n' +
          'Ожидайте ответа. Обычно мы отвечаем в течение нескольких часов.'
        );
        
        // Показываем полное пользовательское меню
        showUserMenu(chatId);
        
        logger.info('QUESTIONS', `Question from ${chatId}`, { questionId });
        
        return { handled: true };
      }
      
      if (state.stage === 'waiting_review') {
        // Сохраняем отзыв
        if (!this.data.reviews[chatId]) {
          this.data.reviews[chatId] = [];
        }
        
        this.data.reviews[chatId].push({
          text: text,
          createdAt: new Date().toISOString(),
          userName: userData.parentName || 'Гость'
        });
        
        // Уведомляем администраторов
        this.notifyAdminsReview(chatId, userData, text);
        
        delete this.data.userStates[chatId];
        this.saveData();
        
        const { showUserMenu } = require('../bot');
        
        this.bot.sendMessage(
          chatId,
          '✅ Спасибо за ваш отзыв! 💙\n\n' +
          'Ваше мнение очень важно для нас!'
        );
        
        // Показываем полное пользовательское меню
        showUserMenu(chatId);
        
        logger.info('REVIEWS', `Review from ${chatId}`);
        
        return { handled: true };
      }
    } catch (error) {
      logger.error('QUESTIONS', 'Error handling message', error.message);
      delete this.data.userStates[chatId];
      this.saveData();
      
      this.bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте позже.');
      return { handled: true };
    }
    
    return { handled: false };
  },
  
  // Уведомление администраторов о вопросе
  notifyAdminsQuestion(chatId, userData, question, questionId) {
    const message =
      `❓ НОВЫЙ ВОПРОС\n\n` +
      `👤 От: ${userData.parentName || 'Гость'}\n` +
      `📱 Telegram ID: ${chatId}\n` +
      `📞 Телефон: ${userData.phone || 'не указан'}\n\n` +
      `❓ Вопрос:\n${question}\n\n` +
      `ID: ${questionId}`;
    
    const MAIN_ADMIN_ID = process.env.MAIN_ADMIN_ID || '805286122';
    
    this.bot.sendMessage(MAIN_ADMIN_ID, message, {
      reply_markup: {
        inline_keyboard: [[
          {
            text: '✅ Ответить',
            callback_data: `answer_${questionId}`
          }
        ]]
      }
    }).catch(() => {
      console.log('Не удалось отправить уведомление админу');
    });
  },
  
  // Уведомление администраторов об отзыве
  notifyAdminsReview(chatId, userData, review) {
    const message =
      `⭐️ НОВЫЙ ОТЗЫВ\n\n` +
      `👤 От: ${userData.parentName || 'Гость'}\n` +
      `📱 Telegram ID: ${chatId}\n\n` +
      `💬 Отзыв:\n${review}`;
    
    const MAIN_ADMIN_ID = process.env.MAIN_ADMIN_ID || '805286122';
    
    this.bot.sendMessage(MAIN_ADMIN_ID, message).catch(() => {
      console.log('Не удалось отправить уведомление админу');
    });
  },
  
  // Получить список неотвеченных вопросов
  getPendingQuestions() {
    return Object.entries(this.data.pendingQuestions)
      .filter(([id, q]) => !q.answered)
      .map(([id, q]) => ({ id, ...q }));
  },
  
  // Отметить вопрос как отвеченный
  markQuestionAnswered(questionId) {
    if (this.data.pendingQuestions[questionId]) {
      this.data.pendingQuestions[questionId].answered = true;
      this.data.pendingQuestions[questionId].answeredAt = new Date().toISOString();
      this.saveData();
      return true;
    }
    return false;
  }
};

module.exports = questionsModule;
