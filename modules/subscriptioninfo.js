/**
 * Модуль информации об абонементе v2.0
 * 
 * Функции:
 * - Показывает оставшиеся часы и срок действия
 * - Дублирует запросы администраторам
 * - Автоматически уведомляет о низком балансе часов
 * - Уведомляет о приближении даты окончания абонемента
 */

const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const createNotificationRouter = require('../utils/notificationRouter');

module.exports = {
  name: 'subscriptionInfo',
  version: '2.0.0',
  description: 'Информация об абонементе с уведомлениями',
  author: 'Kvantik Team',
  
  // Инициализация модуля
  async init(context) {
    this.bot = context.bot;
    this.getUserData = context.getUserData;
    this.users = context.users;
    this.data = context.data;
    this.saveData = context.saveData;
    this.notificationRouter = createNotificationRouter(this.bot, logger);
    
    // Инициализируем хранилище для отслеживания уведомлений
    if (!this.data.notifiedUsers) {
      this.data.notifiedUsers = {};
    }
    
    // Получаем путь к Excel
    this.excelPath = this.getExcelPath();
    
    console.log('  💳 Модуль информации об абонементе v2.0 инициализирован');
    
    // Регистрируем обработчик кнопки
    this.bot.on('message', async (msg) => {
      if (msg.text === '💳 Мой абонемент') {
        await this.handleSubscriptionInfo(msg);
      }
    });
    
    // Запускаем периодическую проверку (каждые 12 часов)
    this.startPeriodicCheck();
  },
  
  // Получение пути к Excel файлу
  getExcelPath() {
    const attendanceConfigPath = path.join(__dirname, '../bot_data/attendance.json');
    
    if (fs.existsSync(attendanceConfigPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(attendanceConfigPath, 'utf8'));
        if (config.excelPath && fs.existsSync(config.excelPath)) {
          console.log('  💳 Используется путь из attendance:', config.excelPath);
          return config.excelPath;
        }
      } catch (error) {
        console.log('  ⚠️  Не удалось прочитать конфигурацию attendance');
      }
    }
    
    return this.data.excelPath || '';
  },
  
  // Запуск периодической проверки
  startPeriodicCheck() {
    // Проверяем каждые 12 часов
    setInterval(() => {
      this.checkAllSubscriptions();
    }, 12 * 60 * 60 * 1000);
    
    // Первая проверка через 5 минут после запуска
    setTimeout(() => {
      this.checkAllSubscriptions();
    }, 5 * 60 * 1000);
    
    console.log('  ⏰ Периодическая проверка абонементов запущена (каждые 12 часов)');
  },
  
  // Проверка всех абонементов
  async checkAllSubscriptions() {
    try {
      this.excelPath = this.getExcelPath();
      
      if (!this.excelPath || !fs.existsSync(this.excelPath)) {
        return;
      }
      
      console.log('  🔍 Проверка абонементов...');
      
      const children = await this.readChildrenData();
      const currentDate = new Date();
      
      for (const child of children) {
        const parentPhone = this.normalizePhone(child.parent_phone);
        if (!parentPhone) continue;
        
        // Находим родителя
        const parent = this.findParentByPhone(parentPhone);
        if (!parent) continue;
        
        const remainingHours = parseFloat(child.remaining_hours) || 0;
        const packageHours = parseFloat(child.package_hours) || 0;
        
        // Проверяем низкий баланс часов
        await this.checkLowBalance(parent, child, remainingHours);
        
        // Проверяем дату окончания абонемента (если есть)
        await this.checkExpirationDate(parent, child, currentDate);
      }
      
      console.log('  ✅ Проверка абонементов завершена');
      
    } catch (error) {
      console.error('  ❌ Ошибка проверки абонементов:', error.message);
    }
  },
  
  // Проверка низкого баланса часов
  async checkLowBalance(parent, child, remainingHours) {
    const childKey = `${child.card_id}_hours`;
    const notifiedData = this.data.notifiedUsers[childKey] || {};
    
    // Уведомление когда осталось 10 часов
    if (remainingHours <= 10 && remainingHours > 5 && !notifiedData.hours_10) {
      await this.sendLowBalanceNotification(parent, child, remainingHours, '10 часов');
      this.data.notifiedUsers[childKey] = { ...notifiedData, hours_10: true };
      this.saveData();
    }
    
    // Уведомление когда осталось 5 часов
    if (remainingHours <= 5 && remainingHours > 0 && !notifiedData.hours_5) {
      await this.sendLowBalanceNotification(parent, child, remainingHours, '5 часов');
      this.data.notifiedUsers[childKey] = { ...notifiedData, hours_5: true };
      this.saveData();
    }
    
    // Сброс флагов если абонемент продлён
    if (remainingHours > 10 && (notifiedData.hours_10 || notifiedData.hours_5)) {
      delete this.data.notifiedUsers[childKey];
      this.saveData();
    }
  },
  
  // Проверка даты окончания
  async checkExpirationDate(parent, child, currentDate) {
    // Если есть дата окончания в данных
    if (child.expiration_date) {
      const expirationDate = new Date(child.expiration_date);
      const daysUntilExpiration = Math.ceil((expirationDate - currentDate) / (1000 * 60 * 60 * 24));
      
      const childKey = `${child.card_id}_expiration`;
      const notifiedData = this.data.notifiedUsers[childKey] || {};
      
      // Уведомление за 7 дней
      if (daysUntilExpiration <= 7 && daysUntilExpiration > 3 && !notifiedData.days_7) {
        await this.sendExpirationNotification(parent, child, daysUntilExpiration);
        this.data.notifiedUsers[childKey] = { ...notifiedData, days_7: true };
        this.saveData();
      }
      
      // Уведомление за 3 дня
      if (daysUntilExpiration <= 3 && daysUntilExpiration > 0 && !notifiedData.days_3) {
        await this.sendExpirationNotification(parent, child, daysUntilExpiration);
        this.data.notifiedUsers[childKey] = { ...notifiedData, days_3: true };
        this.saveData();
      }
      
      // Сброс флагов если абонемент продлён
      if (daysUntilExpiration > 7 && (notifiedData.days_7 || notifiedData.days_3)) {
        delete this.data.notifiedUsers[childKey];
        this.saveData();
      }
    }
  },
  
  // Отправка уведомления о низком балансе
  async sendLowBalanceNotification(parent, child, remainingHours, threshold) {
    const childName = `${child.first_name} ${child.last_name}`.trim();
    
    const message = `⚠️ ВНИМАНИЕ: ЗАКАНЧИВАЮТСЯ ЧАСЫ\n\n` +
      `👶 Ребёнок: ${childName}\n` +
      `⏳ Осталось часов: ${remainingHours.toFixed(2)} ч.\n\n` +
      `Рекомендуем продлить абонемент, чтобы избежать перерыва в посещениях.\n\n` +
      `📞 Для продления обращайтесь:\n+7 (963) 384-09-77\n\n` +
      `Детский клуб "Квантик"`;
    
    try {
      // Отправляем родителю
      await this.notificationRouter.sendParentMessage(parent.chatId, message);
      console.log(`  ⚠️  Уведомление о низком балансе: ${childName} → ${parent.chatId}`);
      
      // Уведомляем администраторов
      await this.notifyAdmins(`📊 Низкий баланс часов\n\n` +
        `👶 ${childName}\n` +
        `👤 Родитель: ${parent.parentName || 'Неизвестно'}\n` +
        `📞 ${parent.phone}\n` +
        `⏳ Осталось: ${remainingHours.toFixed(2)} ч.`);
      
    } catch (error) {
      console.error('  ❌ Ошибка отправки уведомления о балансе:', error.message);
    }
  },
  
  // Отправка уведомления об окончании срока
  async sendExpirationNotification(parent, child, daysLeft) {
    const childName = `${child.first_name} ${child.last_name}`.trim();
    
    const message = `⏰ ИСТЕКАЕТ СРОК АБОНЕМЕНТА\n\n` +
      `👶 Ребёнок: ${childName}\n` +
      `📅 До окончания: ${daysLeft} ${this.getDaysWord(daysLeft)}\n\n` +
      `После истечения срока абонемент станет недействительным.\n\n` +
      `📞 Для продления обращайтесь:\n+7 (963) 384-09-77\n\n` +
      `Детский клуб "Квантик"`;
    
    try {
      // Отправляем родителю
      await this.notificationRouter.sendParentMessage(parent.chatId, message);
      console.log(`  ⏰ Уведомление об истечении срока: ${childName} → ${parent.chatId}`);
      
      // Уведомляем администраторов
      await this.notifyAdmins(`📅 Истекает срок абонемента\n\n` +
        `👶 ${childName}\n` +
        `👤 Родитель: ${parent.parentName || 'Неизвестно'}\n` +
        `📞 ${parent.phone}\n` +
        `📅 До окончания: ${daysLeft} ${this.getDaysWord(daysLeft)}`);
      
    } catch (error) {
      console.error('  ❌ Ошибка отправки уведомления об истечении:', error.message);
    }
  },
  
  // Уведомление администраторов
  async notifyAdmins(message) {
    try {
      await this.notificationRouter.sendAdminMessage(`🔔 УВЕДОМЛЕНИЕ\n\n${message}`);
    } catch (error) {
      console.error('  ❌ Ошибка отправки админу:', error.message);
    }
  },
  
  // Основной обработчик запроса информации
  async handleSubscriptionInfo(msg) {
    const chatId = msg.chat.id;
    
    try {
      this.excelPath = this.getExcelPath();
      
      const user = this.users[chatId];
      
      if (!user || !user.isRegistered) {
        return this.bot.sendMessage(chatId, 
          '❌ Вы не зарегистрированы.\n\n' +
          'Пожалуйста, пройдите регистрацию через кнопку "📝 Регистрация"'
        );
      }
      
      const userPhone = this.normalizePhone(user.phone);
      
      if (!userPhone) {
        return this.bot.sendMessage(chatId,
          '❌ Не удалось определить ваш номер телефона.\n\n' +
          'Обратитесь к администратору.'
        );
      }
      
      if (!this.excelPath || !fs.existsSync(this.excelPath)) {
        return this.bot.sendMessage(chatId,
          '❌ Система временно недоступна.\n\n' +
          'Обратитесь к администратору.'
        );
      }
      
      const children = await this.readChildrenData();
      
      const userChildren = children.filter(child => 
        this.normalizePhone(child.parent_phone) === userPhone
      );
      
      if (userChildren.length === 0) {
        return this.bot.sendMessage(chatId,
          '❌ Не найдены данные об абонементе.\n\n' +
          'Возможно, ваш номер не указан в системе. Обратитесь к администратору.'
        );
      }
      
      // Формируем сообщение для родителя
      let message = '💳 ИНФОРМАЦИЯ ОБ АБОНЕМЕНТЕ\n\n';
      let adminMessage = '📊 ЗАПРОС ИНФОРМАЦИИ ОБ АБОНЕМЕНТЕ\n\n' +
        `👤 Родитель: ${user.parentFullName || user.parentName || 'Неизвестно'}\n` +
        `📞 Телефон: ${user.phone}\n` +
        `🆔 Chat ID: ${chatId}\n\n`;
      
      for (const child of userChildren) {
        const childName = `${child.first_name} ${child.last_name}`.trim();
        const packageHours = parseFloat(child.package_hours) || 0;
        const remainingHours = parseFloat(child.remaining_hours) || 0;
        const usedHours = parseFloat(child.used_hours) || 0;
        
        const usedPercent = packageHours > 0 ? Math.round((usedHours / packageHours) * 100) : 0;
        const progressBar = this.createProgressBar(usedPercent);
        const daysInfo = this.calculateDaysRemaining(remainingHours);
        
        // Сообщение родителю
        message += `👶 ${childName}\n`;
        message += `━━━━━━━━━━━━━━━━━━━━\n`;
        message += `📊 Всего часов: ${packageHours} ч.\n`;
        message += `✅ Использовано: ${usedHours.toFixed(2)} ч.\n`;
        message += `⏳ Осталось: ${remainingHours.toFixed(2)} ч.\n\n`;
        message += `${progressBar} ${usedPercent}%\n\n`;
        
        if (daysInfo) {
          message += `📅 ${daysInfo}\n\n`;
        }
        
        // Информация о дате окончания (если есть)
        if (child.expiration_date) {
          const expirationDate = new Date(child.expiration_date);
          const daysLeft = Math.ceil((expirationDate - new Date()) / (1000 * 60 * 60 * 24));
          
          if (daysLeft > 0) {
            message += `📆 Абонемент действует до: ${expirationDate.toLocaleDateString('ru-RU')}\n`;
            message += `⏱️ Осталось дней: ${daysLeft}\n\n`;
          } else {
            message += `⚠️ Срок действия абонемента истёк!\n\n`;
          }
        }
        
        // Предупреждения
        if (remainingHours < 5) {
          message += `⚠️ Осталось мало часов!\nПора продлевать абонемент.\n\n`;
        } else if (remainingHours < 10) {
          message += `💡 Скоро потребуется продление.\n\n`;
        }
        
        // Сообщение администратору
        adminMessage += `👶 ${childName}\n`;
        adminMessage += `  📊 Всего: ${packageHours} ч.\n`;
        adminMessage += `  ✅ Использовано: ${usedHours.toFixed(2)} ч.\n`;
        adminMessage += `  ⏳ Осталось: ${remainingHours.toFixed(2)} ч.\n`;
        if (child.expiration_date) {
          const expirationDate = new Date(child.expiration_date);
          const daysLeft = Math.ceil((expirationDate - new Date()) / (1000 * 60 * 60 * 24));
          adminMessage += `  📆 До окончания: ${daysLeft > 0 ? daysLeft + ' дн.' : 'истёк'}\n`;
        }
        adminMessage += `\n`;
      }
      
      message += `📞 Для продления обращайтесь:\n+7 (963) 384-09-77`;
      
      // Отправляем родителю
      await this.bot.sendMessage(chatId, message);
      
      // Дублируем администратору
      await this.notifyAdmins(adminMessage);
      
      console.log(`  💳 Информация отправлена: ${user.phone} → ${chatId}`);
      
    } catch (error) {
      console.error('❌ Ошибка получения информации об абонементе:', error.message);
      this.bot.sendMessage(chatId,
        '❌ Произошла ошибка при получении информации.\n\n' +
        'Попробуйте позже или обратитесь к администратору.'
      );
    }
  },
  
  // Чтение данных о детях из Excel
  async readChildrenData() {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(this.excelPath);
    
    const sheet = workbook.getWorksheet('Children');
    const children = [];
    
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      
      const card_id = row.getCell(1).value;
      if (!card_id) return;
      
      // Проверяем наличие даты в колонке J (или другой)
      let expirationDate = null;
      const expirationValue = row.getCell(10).value; // Колонка J
      if (expirationValue) {
        expirationDate = new Date(expirationValue);
      }
      
      children.push({
        card_id: String(card_id),
        first_name: String(row.getCell(2).value || '').trim(),
        last_name: String(row.getCell(3).value || '').trim(),
        package_hours: row.getCell(4).value || 0,
        used_hours: row.getCell(5).value || 0,
        remaining_hours: row.getCell(6).value || 0,
        parent_phone: this.normalizePhone(row.getCell(7).value),
        status: String(row.getCell(9).value || '').trim(),
        expiration_date: expirationDate
      });
    });
    
    return children;
  },
  
  // Поиск родителя по телефону
  findParentByPhone(phone) {
    const normalizedPhone = this.normalizePhone(phone);
    
    for (const [chatId, user] of Object.entries(this.users)) {
      const userPhone = this.normalizePhone(user.phone);
      
      if (userPhone === normalizedPhone) {
        return {
          chatId,
          parentName: user.parentFullName || user.parentName,
          phone: user.phone
        };
      }
    }
    
    return null;
  },
  
  // Нормализация телефона
  normalizePhone(phone) {
    if (!phone) return '';
    return String(phone).replace(/\D/g, '');
  },
  
  // Создание прогресс-бара
  createProgressBar(percent) {
    const filled = Math.round(percent / 10);
    const empty = 10 - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  },
  
  // Расчет оставшихся дней
  calculateDaysRemaining(remainingHours) {
    if (remainingHours <= 0) {
      return 'Абонемент закончился';
    }
    
    const avgHoursPerDay = 3.5;
    const daysLeft = Math.ceil(remainingHours / avgHoursPerDay);
    
    if (daysLeft < 7) {
      return `Примерно ${daysLeft} ${this.getDaysWord(daysLeft)} посещений`;
    } else if (daysLeft < 30) {
      const weeks = Math.ceil(daysLeft / 7);
      return `Примерно ${weeks} ${this.getWeeksWord(weeks)} посещений`;
    } else {
      const months = Math.ceil(daysLeft / 30);
      return `Примерно ${months} ${this.getMonthsWord(months)} посещений`;
    }
  },
  
  // Склонение слов
  getDaysWord(n) {
    if (n % 10 === 1 && n % 100 !== 11) return 'день';
    if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return 'дня';
    return 'дней';
  },
  
  getWeeksWord(n) {
    if (n === 1) return 'неделя';
    if (n >= 2 && n <= 4) return 'недели';
    return 'недель';
  },
  
  getMonthsWord(n) {
    if (n === 1) return 'месяц';
    if (n >= 2 && n <= 4) return 'месяца';
    return 'месяцев';
  },
  
  // Уничтожение модуля
  async destroy() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    console.log('  💳 Модуль информации об абонементе выгружен');
  }
};
