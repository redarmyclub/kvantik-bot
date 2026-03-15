require('dotenv').config();

const appEnv = process.env.APP_ENV || (process.env.NODE_ENV === 'production' ? 'production' : 'development');
const envSuffix = appEnv === 'production' ? 'PROD' : 'DEV';

function getEnvBySuffix(baseName, fallback = '') {
  const suffixed = process.env[`${baseName}_${envSuffix}`];
  if (suffixed !== undefined && suffixed !== '') return suffixed;

  const generic = process.env[baseName];
  if (generic !== undefined && generic !== '') return generic;

  return fallback;
}

function getBooleanEnv(name, defaultValue) {
  const value = process.env[name];
  if (value === undefined || value === '') return defaultValue;
  return value === 'true';
}

const resolvedTelegramToken = getEnvBySuffix('TELEGRAM_BOT_TOKEN', '');
const resolvedMainAdminId = getEnvBySuffix('MAIN_ADMIN_ID', '');
const resolvedAdditionalAdmins = getEnvBySuffix('ADDITIONAL_ADMINS', '');

// Совместимость со старыми модулями, которые читают process.env напрямую
if (resolvedTelegramToken && !process.env.TELEGRAM_BOT_TOKEN) {
  process.env.TELEGRAM_BOT_TOKEN = resolvedTelegramToken;
}
if (resolvedMainAdminId && !process.env.MAIN_ADMIN_ID) {
  process.env.MAIN_ADMIN_ID = resolvedMainAdminId;
}
if (resolvedAdditionalAdmins && !process.env.ADDITIONAL_ADMINS) {
  process.env.ADDITIONAL_ADMINS = resolvedAdditionalAdmins;
}

const config = {
  appEnv,

  // Telegram
  telegram: {
    token: resolvedTelegramToken,
  },
  
  // Администраторы
  admin: {
    mainAdminId: resolvedMainAdminId,
    additionalAdmins: resolvedAdditionalAdmins
      ? resolvedAdditionalAdmins.split(',').map(id => id.trim()).filter(Boolean)
      : []
  },

  // Безопасная маршрутизация уведомлений
  notifications: {
    allowParentNotifications: getBooleanEnv('ALLOW_PARENT_NOTIFICATIONS', appEnv === 'production'),
    dryRun: getBooleanEnv('DRY_RUN_NOTIFICATIONS', false),
    adminNotificationChatId: getEnvBySuffix('ADMIN_NOTIFICATION_CHAT_ID', resolvedMainAdminId),
    adminTestChatId: process.env.ADMIN_TEST_CHAT_ID || '',
    routeAdminToTestChatInDev: appEnv !== 'production' && !!process.env.ADMIN_TEST_CHAT_ID
  },
  
  // OpenAI
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4',
    enabled: !!process.env.OPENAI_API_KEY
  },
  
  // Alfa CRM (ОТКЛЮЧЕНО)
  alfaCRM: {
    enabled: process.env.ALFA_CRM_ENABLED === 'true',
    email: process.env.ALFA_CRM_EMAIL,
    apiKey: process.env.ALFA_CRM_API_KEY,
    branchId: process.env.ALFA_CRM_BRANCH_ID
  },
  
  // Google Sheets
  googleSheets: {
    enabled: process.env.GOOGLE_SHEETS_ENABLED === 'true',
    spreadsheetId: process.env.GOOGLE_SHEETS_ID,
    serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  },
  
  // Защита от спама
  spam: {
    maxMessagesPerMinute: parseInt(process.env.MAX_MESSAGES_PER_MINUTE) || 10,
    maxRegistrationsPerHour: parseInt(process.env.MAX_REGISTRATIONS_PER_HOUR) || 3,
    maxQuestionsPerHour: parseInt(process.env.MAX_QUESTIONS_PER_HOUR) || 5,
    banDuration: (parseInt(process.env.BAN_DURATION_MINUTES) || 5) * 60 * 1000,
    warningThreshold: 7
  },
  
  // Промокоды
  promo: {
    enabled: process.env.PROMO_CODES_ENABLED === 'true',
    defaultDiscount: parseInt(process.env.DEFAULT_DISCOUNT_PERCENT) || 10
  },
  
  // Бэкапы
  backup: {
    enabled: process.env.BACKUP_ENABLED === 'true',
    intervalHours: parseInt(process.env.BACKUP_INTERVAL_HOURS) || 24,
    keepDays: 7
  },

  // Посещаемость
  attendance: {
    autoStartWatcher: getBooleanEnv('ATTENDANCE_AUTO_START', appEnv === 'production')
  },
  
  // Пути
  paths: {
    data: './bot_data',
    logs: './bot_logs',
    backups: './backups',
    exports: './exports'
  },
  
  // Окружение
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  timezone: process.env.TZ || 'Europe/Moscow'
};

module.exports = config;
