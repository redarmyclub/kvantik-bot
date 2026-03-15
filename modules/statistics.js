const logger = require('../utils/logger');

/**
 * Модуль статистики и аналитики
 * Автоматически загружается при старте бота
 */
const statisticsSystem = {
  name: 'statistics',
  version: '1.0.0',
  description: 'Статистика и аналитика',
  enabled: true,

  // Инициализация модуля
  async init(context) {
    this.bot = context.bot;
    this.data = context.data;
    this.saveData = context.saveData;
    
    // Инициализация хранилища статистики
    if (!this.data.statistics) {
      this.data.statistics = {};
    }
    
    console.log('  📊 Статистика: инициализировано');
  },

  // Команды модуля
  commands: {
    stats: async function(msg) {
      // Показать статистику
      const stats = statisticsSystem.getAggregatedStats(statisticsSystem.data.statistics, 7);
      return stats;
    }
  },

  commandDescriptions: {
    stats: 'Показать статистику'
  },
  
  // Запись события
  recordEvent: (statistics, type, data = {}) => {
    const today = new Date().toISOString().split('T')[0];
    
    if (!statistics[today]) {
      statistics[today] = {
        date: today,
        visitors: 0,
        registrations: 0,
        children: 0,
        questions: 0,
        reviews: 0,
        promoCodesUsed: 0,
        events: []
      };
    }
    
    const stats = statistics[today];
    
    switch (type) {
      case 'visitor':
        stats.visitors++;
        break;
      case 'registration':
        stats.registrations++;
        break;
      case 'child_added':
        stats.children++;
        break;
      case 'question':
        stats.questions++;
        break;
      case 'review':
        stats.reviews++;
        break;
      case 'promo_used':
        stats.promoCodesUsed++;
        break;
    }
    
    stats.events.push({
      type,
      timestamp: new Date().toISOString(),
      data
    });
    
    return stats;
  },
  
  // Получение статистики за период
  getStats: (statistics, startDate, endDate) => {
    const stats = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      if (statistics[dateStr]) {
        stats.push(statistics[dateStr]);
      }
    }
    
    return stats;
  },
  
  // Агрегированная статистика
  getAggregatedStats: (statistics, days = 7) => {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const periodStats = statisticsSystem.getStats(
      statistics,
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0]
    );
    
    const totals = {
      visitors: 0,
      registrations: 0,
      children: 0,
      questions: 0,
      reviews: 0,
      promoCodesUsed: 0
    };
    
    periodStats.forEach(day => {
      totals.visitors += day.visitors || 0;
      totals.registrations += day.registrations || 0;
      totals.children += day.children || 0;
      totals.questions += day.questions || 0;
      totals.reviews += day.reviews || 0;
      totals.promoCodesUsed += day.promoCodesUsed || 0;
    });
    
    const conversionRate = totals.visitors > 0
      ? ((totals.registrations / totals.visitors) * 100).toFixed(1)
      : 0;
    
    return {
      period: `${days} дней`,
      totals,
      conversionRate,
      avgPerDay: {
        visitors: (totals.visitors / days).toFixed(1),
        registrations: (totals.registrations / days).toFixed(1)
      }
    };
  },
  
  // Конверсия по дням недели
  getWeekdayStats: (statistics) => {
    const weekdays = {
      0: { name: 'Воскресенье', visitors: 0, registrations: 0, count: 0 },
      1: { name: 'Понедельник', visitors: 0, registrations: 0, count: 0 },
      2: { name: 'Вторник', visitors: 0, registrations: 0, count: 0 },
      3: { name: 'Среда', visitors: 0, registrations: 0, count: 0 },
      4: { name: 'Четверг', visitors: 0, registrations: 0, count: 0 },
      5: { name: 'Пятница', visitors: 0, registrations: 0, count: 0 },
      6: { name: 'Суббота', visitors: 0, registrations: 0, count: 0 }
    };
    
    Object.values(statistics).forEach(day => {
      const date = new Date(day.date);
      const weekday = date.getDay();
      
      weekdays[weekday].visitors += day.visitors || 0;
      weekdays[weekday].registrations += day.registrations || 0;
      weekdays[weekday].count++;
    });
    
    // Средние значения
    Object.values(weekdays).forEach(day => {
      if (day.count > 0) {
        day.avgVisitors = (day.visitors / day.count).toFixed(1);
        day.avgRegistrations = (day.registrations / day.count).toFixed(1);
        day.conversionRate = day.visitors > 0
          ? ((day.registrations / day.visitors) * 100).toFixed(1)
          : 0;
      }
    });
    
    return weekdays;
  },
  
  // Топ дней
  getTopDays: (statistics, metric = 'registrations', limit = 5) => {
    const days = Object.values(statistics);
    
    days.sort((a, b) => (b[metric] || 0) - (a[metric] || 0));
    
    return days.slice(0, limit).map(day => ({
      date: new Date(day.date).toLocaleDateString('ru-RU'),
      value: day[metric] || 0
    }));
  },
  
  // Форматированный отчёт
  formatReport: (statistics, userData, reviews, promoCodes) => {
    const stats7days = statisticsSystem.getAggregatedStats(statistics, 7);
    const stats30days = statisticsSystem.getAggregatedStats(statistics, 30);
    
    let report = `📊 СТАТИСТИКА\n\n`;
    
    // Общие показатели
    report += `📈 ВСЕГО:\n`;
    report += `• Пользователей: ${Object.keys(userData).length}\n`;
    report += `• Зарегистрировано: ${Object.values(userData).filter(u => u.isRegistered).length}\n`;
    report += `• Детей: ${Object.values(userData).reduce((sum, u) => sum + (u.children?.length || 0), 0)}\n`;
    report += `• Отзывов: ${Object.values(reviews).reduce((sum, r) => sum + (Array.isArray(r) ? r.length : 0), 0)}\n`;
    report += `• Промокодов: ${Object.keys(promoCodes).length}\n\n`;
    
    // За 7 дней
    report += `📅 ЗА 7 ДНЕЙ:\n`;
    report += `• Посетителей: ${stats7days.totals.visitors}\n`;
    report += `• Регистраций: ${stats7days.totals.registrations}\n`;
    report += `• Конверсия: ${stats7days.conversionRate}%\n`;
    report += `• Детей добавлено: ${stats7days.totals.children}\n`;
    report += `• Промокодов использовано: ${stats7days.totals.promoCodesUsed}\n\n`;
    
    // За 30 дней
    report += `📅 ЗА 30 ДНЕЙ:\n`;
    report += `• Посетителей: ${stats30days.totals.visitors}\n`;
    report += `• Регистраций: ${stats30days.totals.registrations}\n`;
    report += `• Конверсия: ${stats30days.conversionRate}%\n`;
    
    return report;
  },
  
  // Экспорт для Excel
  prepareForExport: (statistics) => {
    return Object.values(statistics).map(day => ({
      Дата: new Date(day.date).toLocaleDateString('ru-RU'),
      Посетители: day.visitors || 0,
      Регистрации: day.registrations || 0,
      Конверсия: day.visitors > 0
        ? `${((day.registrations / day.visitors) * 100).toFixed(1)}%`
        : '0%',
      Дети: day.children || 0,
      Вопросы: day.questions || 0,
      Отзывы: day.reviews || 0,
      Промокоды: day.promoCodesUsed || 0
    }));
  }
};

module.exports = statisticsSystem;
