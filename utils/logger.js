const fs = require('fs');
const path = require('path');
const config = require('../config/config');

// Создаём директории для логов
const logsDir = config.paths.logs;
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logFiles = {
  admin: path.join(logsDir, 'admin_actions.log'),
  error: path.join(logsDir, 'errors.log'),
  general: path.join(logsDir, 'general.log'),
  promo: path.join(logsDir, 'promo.log'),
  export: path.join(logsDir, 'export.log')
};

function formatTimestamp() {
  return new Date().toLocaleString('ru-RU', {
    timeZone: config.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function writeLog(file, level, message, meta = {}) {
  const timestamp = formatTimestamp();
  const metaStr = Object.keys(meta).length > 0 ? ` | ${JSON.stringify(meta)}` : '';
  const logLine = `[${timestamp}] [${level}] ${message}${metaStr}\n`;
  
  try {
    fs.appendFileSync(file, logLine);
  } catch (error) {
    console.error('Ошибка записи в лог:', error.message);
  }
}

const logger = {
  // Общие логи
  info: (context, message, meta) => {
    const fullMessage = `[${context}] ${message}`;
    writeLog(logFiles.general, 'INFO', fullMessage, typeof meta === 'object' ? meta : { meta });
    if (config.logLevel === 'info' || config.nodeEnv === 'development') {
      console.log(`ℹ️  ${fullMessage}`, meta || '');
    }
  },
  
  warn: (context, message, meta) => {
    const fullMessage = `[${context}] ${message}`;
    writeLog(logFiles.general, 'WARN', fullMessage, typeof meta === 'object' ? meta : { meta });
    console.warn(`⚠️  ${fullMessage}`, meta || '');
  },
  
  error: (context, message, error) => {
    const fullMessage = `[${context}] ${message}`;
    const errorDetails = error instanceof Error ? {
      message: error.message,
      stack: error.stack
    } : (typeof error === 'object' ? error : { error });
    
    writeLog(logFiles.error, 'ERROR', fullMessage, errorDetails);
    console.error(`❌ ${fullMessage}`, errorDetails);
  },
  
  // Логи безопасности
  security: (action, userId, details = '') => {
    const message = `${action} | User: ${userId} | ${details}`;
    writeLog(logFiles.admin, 'SECURITY', message);
    console.log(`🔒 ${message}`);
  },
  
  // Логи администраторов
  admin: (adminId, action, details = '') => {
    const isMainAdmin = adminId === config.admin.mainAdminId;
    const role = isMainAdmin ? 'MAIN_ADMIN' : 'ADMIN';
    const message = `[${role}] ID: ${adminId} | ${action} | ${details}`;
    
    writeLog(logFiles.admin, 'ADMIN', message);
    console.log(`📝 ${message}`);
  },
  
  // Логи промокодов
  promo: (userId, promoCode, action, details = '') => {
    const message = `User: ${userId} | Promo: ${promoCode} | ${action} | ${details}`;
    writeLog(logFiles.promo, 'PROMO', message);
    console.log(`🎁 ${message}`);
  },
  
  // Логи экспорта
  export: (type, count, destination) => {
    const message = `Export ${type}: ${count} records to ${destination}`;
    writeLog(logFiles.export, 'EXPORT', message);
    console.log(`📊 ${message}`);
  },
  
  // Ротация логов (удаление старых)
  rotateLogs: () => {
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 дней
    const now = Date.now();
    
    Object.values(logFiles).forEach(file => {
      try {
        const stats = fs.statSync(file);
        if (now - stats.mtimeMs > maxAge) {
          const archiveName = `${file}.${new Date(stats.mtime).toISOString().split('T')[0]}.old`;
          fs.renameSync(file, archiveName);
          logger.info(`Лог архивирован: ${path.basename(file)}`);
        }
      } catch (error) {
        // Файл не существует
      }
    });
  }
};

// Ротация логов раз в день
setInterval(() => {
  logger.rotateLogs();
}, 24 * 60 * 60 * 1000);

module.exports = logger;
