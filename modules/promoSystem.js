const logger = require('../utils/logger');
const validator = require('../utils/validator');

/**
 * Модуль системы промокодов
 * Автоматически загружается при старте бота
 */
const promoSystem = {
  name: 'promoSystem',
  version: '1.0.0',
  description: 'Система управления промокодами',
  enabled: true,

  // Инициализация модуля
  async init(context) {
    this.bot = context.bot;
    this.data = context.data;
    this.saveData = context.saveData;
    
    // Инициализация хранилища промокодов
    if (!this.data.promoCodes) {
      this.data.promoCodes = {};
    }
    
    console.log('  📱 Промокоды: инициализировано');
  },

  // Команды модуля
  commands: {
    create_promo: async function(msg, args) {
      // Создание промокода через команду
      const code = args[0];
      const type = args[1] || 'percent';
      const value = parseInt(args[2]) || 10;
      
      return promoSystem.create(promoSystem.data.promoCodes, code, { type, value });
    }
  },

  commandDescriptions: {
    create_promo: 'Создать промокод'
  },
  // Создание промокода
  create: (promoCodes, code, options = {}) => {
    const validation = validator.validatePromoCode(code);
    if (!validation.valid) {
      return { success: false, message: validation.message };
    }
    
    const promoCode = validation.value;
    
    if (promoCodes[promoCode]) {
      return { success: false, message: 'Промокод уже существует' };
    }
    
    promoCodes[promoCode] = {
      code: promoCode,
      type: options.type || 'percent', // percent, fixed, freeLesson
      value: options.value || 10,
      maxUses: options.maxUses || null, // null = безлимит
      usedCount: 0,
      usedBy: [], // массив chatId
      createdAt: new Date().toISOString(),
      expiresAt: options.expiresAt || null,
      active: true,
      description: options.description || ''
    };
    
    logger.promo('SYSTEM', promoCode, 'CREATED', `Type: ${options.type}, Value: ${options.value}`);
    
    return { success: true, promoCode: promoCodes[promoCode] };
  },
  
  // Применение промокода
  apply: (promoCodes, code, chatId) => {
    const validation = validator.validatePromoCode(code);
    if (!validation.valid) {
      return { success: false, message: 'Неверный формат промокода' };
    }
    
    const promoCode = validation.value;
    const promo = promoCodes[promoCode];
    
    if (!promo) {
      return { success: false, message: 'Промокод не найден' };
    }
    
    if (!promo.active) {
      return { success: false, message: 'Промокод деактивирован' };
    }
    
    // Проверка срока действия
    if (promo.expiresAt) {
      const expireDate = new Date(promo.expiresAt);
      if (new Date() > expireDate) {
        return { success: false, message: 'Срок действия промокода истёк' };
      }
    }
    
    // Проверка лимита использований
    if (promo.maxUses && promo.usedCount >= promo.maxUses) {
      return { success: false, message: 'Промокод исчерпан' };
    }
    
    // Проверка повторного использования
    if (promo.usedBy.includes(chatId)) {
      return { success: false, message: 'Вы уже использовали этот промокод' };
    }
    
    // Применяем промокод
    promo.usedCount++;
    promo.usedBy.push(chatId);
    
    logger.promo(chatId, promoCode, 'APPLIED', `Type: ${promo.type}, Value: ${promo.value}`);
    
    return {
      success: true,
      promo: promo,
      message: promoSystem.formatDiscount(promo)
    };
  },
  
  // Деактивация промокода
  deactivate: (promoCodes, code) => {
    const validation = validator.validatePromoCode(code);
    if (!validation.valid) {
      return { success: false, message: validation.message };
    }
    
    const promoCode = validation.value;
    const promo = promoCodes[promoCode];
    
    if (!promo) {
      return { success: false, message: 'Промокод не найден' };
    }
    
    promo.active = false;
    logger.promo('SYSTEM', promoCode, 'DEACTIVATED', '');
    
    return { success: true };
  },
  
  // Активация промокода
  activate: (promoCodes, code) => {
    const validation = validator.validatePromoCode(code);
    if (!validation.valid) {
      return { success: false, message: validation.message };
    }
    
    const promoCode = validation.value;
    const promo = promoCodes[promoCode];
    
    if (!promo) {
      return { success: false, message: 'Промокод не найден' };
    }
    
    promo.active = true;
    logger.promo('SYSTEM', promoCode, 'ACTIVATED', '');
    
    return { success: true };
  },
  
  // Статистика по промокоду
  getStats: (promoCodes, code) => {
    const promo = promoCodes[code];
    
    if (!promo) {
      return null;
    }
    
    const remaining = promo.maxUses ? promo.maxUses - promo.usedCount : 'безлимит';
    const expireDate = promo.expiresAt ? new Date(promo.expiresAt).toLocaleDateString('ru-RU') : 'не ограничен';
    
    return {
      code: promo.code,
      type: promo.type,
      value: promo.value,
      usedCount: promo.usedCount,
      maxUses: promo.maxUses || 'безлимит',
      remaining: remaining,
      active: promo.active,
      expiresAt: expireDate,
      createdAt: new Date(promo.createdAt).toLocaleDateString('ru-RU')
    };
  },
  
  // Список всех промокодов
  list: (promoCodes, activeOnly = false) => {
    return Object.values(promoCodes)
      .filter(promo => !activeOnly || promo.active)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },
  
  // Форматирование скидки для пользователя
  formatDiscount: (promo) => {
    switch (promo.type) {
      case 'percent':
        return `🎁 Скидка ${promo.value}%`;
      case 'fixed':
        return `🎁 Скидка ${promo.value}₽`;
      case 'freeLesson':
        return `🎁 Бесплатное пробное занятие`;
      default:
        return `🎁 Специальное предложение`;
    }
  },
  
  // Форматированный отчёт о промокоде
  formatPromoReport: (promo) => {
    if (!promo) return 'Промокод не найден';
    
    let report = `🎁 ПРОМОКОД: ${promo.code}\n\n`;
    report += `📊 Тип: ${promoTypeToRussian(promo.type)}\n`;
    report += `💰 Значение: ${promo.value}${promo.type === 'percent' ? '%' : '₽'}\n`;
    report += `📈 Использовано: ${promo.usedCount}`;
    
    if (promo.maxUses) {
      report += ` / ${promo.maxUses}`;
    }
    report += `\n`;
    
    report += `🔘 Статус: ${promo.active ? '✅ Активен' : '❌ Неактивен'}\n`;
    
    if (promo.expiresAt) {
      const expireDate = new Date(promo.expiresAt);
      const isExpired = new Date() > expireDate;
      report += `⏰ Действует до: ${expireDate.toLocaleDateString('ru-RU')}`;
      report += isExpired ? ' (истёк)' : '';
      report += `\n`;
    }
    
    if (promo.description) {
      report += `📝 Описание: ${promo.description}\n`;
    }
    
    report += `📅 Создан: ${new Date(promo.createdAt).toLocaleDateString('ru-RU')}`;
    
    return report;
  }
};

function promoTypeToRussian(type) {
  const types = {
    'percent': 'Процентная скидка',
    'fixed': 'Фиксированная скидка',
    'freeLesson': 'Бесплатное занятие'
  };
  return types[type] || type;
}

module.exports = promoSystem;
