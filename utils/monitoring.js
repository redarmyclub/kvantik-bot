const os = require('os');
const logger = require('./logger');
const backup = require('./backup');
const storage = require('./storage');

const monitoring = {
  // Получение статуса бота
  getStatus: (stats = {}) => {
    const uptime = process.uptime();
    const memUsage = process.memoryUsage();
    
    return {
      healthy: true,
      uptime: Math.floor(uptime),
      uptimeFormatted: formatUptime(uptime),
      memory: {
        used: memUsage.heapUsed,
        total: memUsage.heapTotal,
        usedFormatted: formatBytes(memUsage.heapUsed),
        totalFormatted: formatBytes(memUsage.heapTotal),
        percentage: ((memUsage.heapUsed / memUsage.heapTotal) * 100).toFixed(1)
      },
      system: {
        platform: os.platform(),
        cpus: os.cpus().length,
        totalMem: os.totalmem(),
        freeMem: os.freemem(),
        loadAvg: os.loadavg()
      },
      stats: stats || {}
    };
  },
  
  // Проверка здоровья
  healthCheck: async () => {
    const checks = {
      storage: false,
      backup: false,
      memory: false
    };
    
    try {
      // Проверка хранилища
      const info = await storage.getInfo();
      checks.storage = info.length > 0;
      
      // Проверка бэкапов (не критично, может не быть папки)
      try {
        const backups = await backup.listBackups();
        checks.backup = backups.length > 0;
      } catch (error) {
        // Если папки нет - не критично
        checks.backup = true;
      }
      
      // Проверка памяти
      const memUsage = process.memoryUsage();
      checks.memory = (memUsage.heapUsed / memUsage.heapTotal) < 0.9;
      
      // Считаем здоровым если хранилище работает и память в норме
      const healthy = checks.storage && checks.memory;
      
      return {
        healthy: healthy,
        checks,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Ошибка проверки здоровья', error);
      return {
        healthy: false,
        checks,
        error: error.message
      };
    }
  },
  
  // Получение детальной информации
  getDetailedInfo: async (userData = {}, reviews = {}, questions = {}) => {
    const status = monitoring.getStatus();
    const health = await monitoring.healthCheck();
    const dataInfo = await storage.getInfo();
    const backupsList = await backup.listBackups();
    
    return {
      status,
      health,
      data: {
        users: Object.keys(userData).length,
        registered: Object.values(userData).filter(u => u.isRegistered).length,
        children: Object.values(userData).reduce((sum, u) => sum + (u.children?.length || 0), 0),
        reviews: Object.keys(reviews).length,
        questions: Object.keys(questions).length,
        files: dataInfo
      },
      backups: {
        count: backupsList.length,
        latest: backupsList[0] || null,
        totalSize: backupsList.reduce((sum, b) => sum + b.size, 0)
      }
    };
  },
  
  // Форматированный отчет для администратора
  formatReport: (info) => {
    let report = `🖥 МОНИТОРИНГ БОТА\n\n`;
    
    // Статус
    report += `📊 СТАТУС:\n`;
    report += `• ${info.health.healthy ? '✅ Здоров' : '❌ Проблемы'}\n`;
    report += `• Uptime: ${info.status.uptimeFormatted}\n`;
    report += `• Память: ${info.status.memory.usedFormatted} / ${info.status.memory.totalFormatted} (${info.status.memory.percentage}%)\n\n`;
    
    // Данные
    report += `💾 ДАННЫЕ:\n`;
    report += `• Пользователей: ${info.data.users}\n`;
    report += `• Зарегистрировано: ${info.data.registered}\n`;
    report += `• Детей: ${info.data.children}\n`;
    report += `• Отзывов: ${info.data.reviews}\n`;
    report += `• Активных вопросов: ${info.data.questions}\n\n`;
    
    // Бэкапы
    report += `📦 БЭКАПЫ:\n`;
    report += `• Всего: ${info.backups.count}\n`;
    if (info.backups.latest) {
      report += `• Последний: ${info.backups.latest.formatted}\n`;
    }
    report += `\n`;
    
    // Проверки
    report += `🔍 ПРОВЕРКИ:\n`;
    report += `• Хранилище: ${info.health.checks.storage ? '✅' : '❌'}\n`;
    report += `• Бэкапы: ${info.health.checks.backup ? '✅' : '❌'}\n`;
    report += `• Память: ${info.health.checks.memory ? '✅' : '❌'}\n`;
    
    return report;
  },
  
  // Запуск мониторинга
  start: (bot, context) => {
    console.log('✅ Мониторинг запущен');
    
    // Периодические проверки здоровья бота (каждые 5 минут)
    setInterval(async () => {
      try {
        const health = await monitoring.healthCheck();
        if (!health.healthy) {
          console.warn('⚠️  Обнаружены проблемы со здоровьем бота');
          logger.warn('MONITORING', 'Health check failed', JSON.stringify(health.checks));
        }
      } catch (error) {
        logger.error('MONITORING', 'Health check error', error.message);
      }
    }, 5 * 60 * 1000); // Каждые 5 минут
  }
};

// Вспомогательные функции
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}д`);
  if (hours > 0) parts.push(`${hours}ч`);
  if (minutes > 0) parts.push(`${minutes}м`);
  
  return parts.join(' ') || '0м';
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = monitoring;
