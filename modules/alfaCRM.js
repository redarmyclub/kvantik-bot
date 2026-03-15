/**
 * Модуль интеграции с Alfa CRM
 * Создание клиентов и получение расписания
 */

const axios = require('axios');
const logger = require('../utils/logger');

const ALFA_CRM_URL = process.env.ALFA_CRM_URL;
const ALFA_CRM_EMAIL = process.env.ALFA_CRM_EMAIL;
const ALFA_CRM_API_KEY = process.env.ALFA_CRM_API_KEY;
const ALFA_CRM_BRANCH_ID = process.env.ALFA_CRM_BRANCH_ID;
const CRM_ENABLED = process.env.USE_ALFA_CRM === 'true' && ALFA_CRM_URL && ALFA_CRM_API_KEY;

const alfaCrmModule = {
  name: 'alfaCRM',
  version: '1.0.0',
  description: 'Интеграция с Alfa CRM',
  enabled: CRM_ENABLED,
  
  async init(context) {
    this.bot = context.bot;
    this.data = context.data;
    this.saveData = context.saveData;
    
    // Токен и его срок действия
    this.token = null;
    this.tokenExpiry = null;
    
    if (CRM_ENABLED) {
      console.log('  🔗 Alfa CRM: инициализировано');
    } else {
      console.log('  ⚠️  Alfa CRM: отключен (включите USE_ALFA_CRM=true)');
    }
  },
  
  commands: {
    schedule: async function(msg, args) {
      if (!CRM_ENABLED) {
        await alfaCrmModule.bot.sendMessage(msg.chat.id, 
          '❌ Интеграция с Alfa CRM отключена');
        return { handled: true };
      }
      
      const period = args[0] || 'today';
      const schedule = await alfaCrmModule.getSchedule(period);
      
      if (schedule.success) {
        const formatted = alfaCrmModule.formatSchedule(schedule.data);
        await alfaCrmModule.bot.sendMessage(msg.chat.id, formatted);
      } else {
        await alfaCrmModule.bot.sendMessage(msg.chat.id, 
          `❌ Ошибка получения расписания: ${schedule.error}`);
      }
      
      return { handled: true };
    }
  },
  
  commandDescriptions: {
    schedule: 'Получить расписание (today/tomorrow/week)'
  },
  
  // Получение токена
  async getToken() {
    try {
      // Проверяем актуальность токена
      if (this.token && this.tokenExpiry && new Date() < this.tokenExpiry) {
        return this.token;
      }
      
      const response = await axios.post(`${ALFA_CRM_URL}/auth/login`, {
        email: ALFA_CRM_EMAIL,
        api_key: ALFA_CRM_API_KEY
      });
      
      if (response.data && response.data.token) {
        this.token = response.data.token;
        this.tokenExpiry = new Date(Date.now() + 23 * 60 * 60 * 1000); // 23 часа
        logger.info('CRM', 'Token obtained successfully');
        return this.token;
      }
      
      throw new Error('Не удалось получить токен');
    } catch (error) {
      logger.error('CRM', 'Error getting token', error.message);
      return null;
    }
  },
  
  // Создание клиента в CRM
  async createCustomer(data) {
    if (!CRM_ENABLED) {
      return { success: false, error: 'CRM отключен' };
    }
    
    try {
      const token = await this.getToken();
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
          'Заказчик': data.parentFullName,
          'Дата рождения': data.childBirthDate,
          'Пол': data.childGender
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
        logger.info('CRM', `Customer created: ${response.data.id}`);
        return { success: true, customerId: response.data.id };
      }
      
      return { success: false, error: 'Неизвестная ошибка' };
      
    } catch (error) {
      logger.error('CRM', 'Error creating customer', error.response?.data || error.message);
      return { success: false, error: error.message };
    }
  },
  
  // Получение расписания
  async getSchedule(period) {
    if (!CRM_ENABLED) {
      return { success: false, error: 'CRM отключен' };
    }
    
    try {
      const token = await this.getToken();
      if (!token) {
        return { success: false, error: 'Нет токена CRM' };
      }
      
      const { dateFrom, dateTo } = this.getPeriodDates(period);
      
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
      logger.error('CRM', 'Error getting schedule', error.message);
      return { success: false, error: error.message };
    }
  },
  
  // Получение дат для периода
  getPeriodDates(period) {
    const today = new Date();
    let dateFrom, dateTo;
    
    switch (period) {
      case 'today':
        dateFrom = dateTo = today.toISOString().split('T')[0];
        break;
      case 'tomorrow':
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        dateFrom = dateTo = tomorrow.toISOString().split('T')[0];
        break;
      case 'week':
        dateFrom = today.toISOString().split('T')[0];
        const weekLater = new Date(today);
        weekLater.setDate(weekLater.getDate() + 7);
        dateTo = weekLater.toISOString().split('T')[0];
        break;
      default:
        // Если передана конкретная дата в формате ГГГГ-ММ-ДД
        if (/^\d{4}-\d{2}-\d{2}$/.test(period)) {
          dateFrom = dateTo = period;
        } else {
          dateFrom = dateTo = today.toISOString().split('T')[0];
        }
    }
    
    return { dateFrom, dateTo };
  },
  
  // Форматирование расписания
  formatSchedule(lessons) {
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
};

module.exports = alfaCrmModule;
