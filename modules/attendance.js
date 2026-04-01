/**
 * Модуль мониторинга посещаемости
 * Отслеживает приход/уход детей и уведомляет родителей
 */

const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const { execFile } = require('child_process');
const config = require('../config/config');
const createNotificationRouter = require('../utils/notificationRouter');
const logger = require('../utils/logger');

// Глобальные переменные модуля
let bot = null;
let getUserDataFunc = null;
let users = null;
let moduleData = {};
let saveDataFunc = null;
let getModuleFunc = null; // Для доступа к другим модулям
let notificationRouter = null;

// Настройки
let excelPath = '';
const sheets = {
  children: 'Children',
  attendanceLog: 'Attendance_Log',
  currentSession: 'Current_Session'
};

// Состояние
let lastLogSize = 0;
let lastCurrentSession = new Map();
let isMonitoring = false;
let watcher = null;
let isCheckingChanges = false;
let hasPendingCheck = false;
let sqlitePollTimer = null;
let sqlitePollInProgress = false;

let sqliteLastProcessedId = 0;
let sqliteCursorInitialized = false;

const attendanceSource = String(config.attendance?.source || 'excel').toLowerCase();
const sqliteDbPath = config.attendance?.sqliteDbPath || '/opt/kvantik-rfid/data/kvantik.db';
const sqlitePollMs = Number(config.attendance?.sqlitePollMs) || 3000;

// ============= ОСНОВНЫЕ ФУНКЦИИ =============

function normalizePhone(phone) {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '');
}

function findParentByPhone(phone) {
  if (!phone) return null;
  
  const normalizedPhone = normalizePhone(phone);
  
  for (const [chatId, user] of Object.entries(users)) {
    const userPhone = normalizePhone(user.phone);
    
    if (userPhone === normalizedPhone) {
      return {
        chatId,
        parentName: user.parentFullName || user.parentName,
        phone: user.phone
      };
    }
  }
  
  return null;
}

function getAdminTargets() {
  // Получаем модуль управления администраторами
  const adminModule = getModuleFunc ? getModuleFunc('adminNotifications') : null;
  
  let adminIds = [];
  
  if (adminModule && typeof adminModule.getAllAdminIds === 'function') {
    // Используем список из модуля (главный + дополнительные)
    adminIds = adminModule.getAllAdminIds();
  } else {
    // Fallback: только главный админ
    if (process.env.MAIN_ADMIN_ID) {
      adminIds = [process.env.MAIN_ADMIN_ID];
    }
  }
  
  // Список админов после маршрутизации и дедупликации
  return new Set(
    adminIds
      .filter(Boolean)
      .map(id => notificationRouter ? notificationRouter.resolveAdminChatId(id) : String(id))
      .filter(Boolean)
  );
}

function buildNotificationTargets(parentChatId) {
  const targets = new Map();

  if (parentChatId) {
    const normalizedParentChatId = String(parentChatId);
    targets.set(normalizedParentChatId, new Set(['parent']));
  }

  for (const adminId of getAdminTargets()) {
    const existingRoles = targets.get(adminId);
    if (existingRoles) {
      existingRoles.add('admin');
    } else {
      targets.set(adminId, new Set(['admin']));
    }
  }

  const overlapTargets = Array.from(targets.entries())
    .filter(([, roles]) => roles.has('parent') && roles.has('admin'))
    .map(([chatId]) => chatId);

  return { targets, overlapTargets };
}

async function sendAttendanceMessageToTargets(message, targets, overlapTargets) {
  console.log(`  📨 Получателей уведомления: ${targets.size}`);
  if (overlapTargets.length > 0) {
    console.log(`  🔁 Пересечение parent/admin: ${overlapTargets.join(', ')}`);
  }

  for (const [chatId, roles] of targets.entries()) {
    try {
      if (!notificationRouter) {
        await bot.sendMessage(chatId, message);
        continue;
      }

      if (roles.has('admin')) {
        await notificationRouter.sendAdminMessage(message, { chatId });
      } else {
        await notificationRouter.sendParentMessage(chatId, message);
      }
    } catch (error) {
      // Не прерываем процесс если получатель заблокировал бота
      console.log(`  ⚠️  Не удалось отправить в ${chatId}: ${error.message}`);
    }
  }
}

async function readExcelFile() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(excelPath);
  
  // Читаем Children
  const childrenSheet = workbook.getWorksheet(sheets.children);
  const children = [];
  
  childrenSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    
    const card_id = row.getCell(1).value;
    if (!card_id) return;
    
    // Читаем дату окончания из колонки J (10)
    let expirationDate = null;
    const expirationValue = row.getCell(10).value;
    if (expirationValue) {
      const val = String(expirationValue).trim();
      
      // Парсим русский формат ДД.ММ.ГГГГ
      const match = val.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
      if (match) {
        const [_, day, month, year] = match;
        expirationDate = new Date(year, month - 1, day);
        if (isNaN(expirationDate.getTime())) expirationDate = null;
      } else {
        // Пробуем стандартный парсинг (для ISO дат)
        expirationDate = new Date(expirationValue);
        if (isNaN(expirationDate.getTime())) expirationDate = null;
      }
    }

    children.push({
      card_id: String(card_id),
      first_name: String(row.getCell(2).value || '').trim(),
      last_name: String(row.getCell(3).value || '').trim(),
      remaining_hours: Number(row.getCell(6).value) || 0,
      parent_phone: normalizePhone(row.getCell(7).value),
      expiration_date: expirationDate
    });
  });
  
  // Читаем Attendance_Log
  const logSheet = workbook.getWorksheet(sheets.attendanceLog);
  const attendanceLog = [];
  
  logSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    
    const card_id = row.getCell(3).value;
    if (!card_id) return;
    
    attendanceLog.push({
      card_id: String(card_id),
      child_name: String(row.getCell(4).value || '').trim(),
      action: String(row.getCell(5).value || '').trim(),
      time_in: String(row.getCell(6).value || '').trim()
    });
  });
  
  // Читаем Current_Session
  const sessionSheet = workbook.getWorksheet(sheets.currentSession);
  const currentSession = [];
  
  sessionSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    
    const card_id = row.getCell(1).value;
    if (!card_id) return;
    
    currentSession.push({
      card_id: String(card_id),
      child_name: String(row.getCell(2).value || '').trim(),
      check_in_time: String(row.getCell(3).value || '').trim()
    });
  });
  
  return { children, attendanceLog, currentSession };
}

async function sendCheckinNotification(entry, children) {
  try {
    const child = children.find(c => c.card_id === entry.card_id);
    if (!child || !child.parent_phone) {
      console.log(`  ⚠️  Нет телефона для карты: ${entry.card_id}`);
      return true;
    }
    
    const parent = findParentByPhone(child.parent_phone);
    if (!parent) {
      console.log(`  ⚠️  Родитель не найден для телефона: ${child.parent_phone}`);
      return true;
    }
    
    const childFullName = `${child.first_name} ${child.last_name}`.trim();
    const message = `✅ РЕБЁНОК ПРИШЁЛ В КЛУБ\n\n` +
      `👶 ${childFullName}\n` +
      `⏰ Время прихода: ${entry.time_in}\n` +
      `📅 ${new Date().toLocaleDateString('ru-RU')}\n\n` +
      `Детский клуб "Квантик"`;

    const { targets, overlapTargets } = buildNotificationTargets(parent.chatId);
    await sendAttendanceMessageToTargets(message, targets, overlapTargets);

    console.log(`  ✅ Уведомление о приходе: ${childFullName} → ${parent.chatId}`);
    return true;
    
  } catch (error) {
    console.error('  ❌ Ошибка отправки уведомления о приходе:', error.message);
    return false;
  }
}

async function sendCheckoutNotification(session, children) {
  try {
    const child = children.find(c => c.card_id === session.card_id);
    if (!child || !child.parent_phone) {
      console.log(`  ⚠️  Нет телефона для карты: ${session.card_id}`);
      return true;
    }
    
    const parent = findParentByPhone(child.parent_phone);
    if (!parent) {
      console.log(`  ⚠️  Родитель не найден для телефона: ${child.parent_phone}`);
      return true;
    }
    
    const childFullName = session.child_name || `${child.first_name} ${child.last_name}`.trim();

    const now          = new Date();
    const currentTime  = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const today        = now.toLocaleDateString('ru-RU');

    // Остаток часов (красиво: 1 час / 2 часа / 5 часов)
    const h = Math.round((child.remaining_hours || 0) * 10) / 10;
    const abs = Math.floor(Math.abs(h));
    let hoursWord;
    if (abs % 100 >= 11 && abs % 100 <= 14)   hoursWord = 'часов';
    else if (abs % 10 === 1)                    hoursWord = 'час';
    else if (abs % 10 >= 2 && abs % 10 <= 4)   hoursWord = 'часа';
    else                                        hoursWord = 'часов';

    // Дата окончания абонемента
    let expirationLine = '';
    if (child.expiration_date && !isNaN(child.expiration_date.getTime())) {
      expirationLine = `Абонемент заканчивается ${child.expiration_date.toLocaleDateString('ru-RU')}.\n`;
    }

    const message =
      `👋 РЕБЁНОК УШЁЛ ИЗ КЛУБА\n` +
      `👶 ${childFullName}\n` +
      `⏰ Время ухода: ${currentTime}\n` +
      `📅 ${today}\n` +
      `В абонементе осталось:\n` +
      `${h} ${hoursWord}.\n` +
      expirationLine +
      `Детский клуб "Квантик"`;

    const { targets, overlapTargets } = buildNotificationTargets(parent.chatId);
    await sendAttendanceMessageToTargets(message, targets, overlapTargets);

    console.log(`  👋 Уведомление об уходе: ${childFullName} → ${parent.chatId}`);
    return true;
    
  } catch (error) {
    console.error('  ❌ Ошибка отправки уведомления об уходе:', error.message);
    return false;
  }
}

function formatEventTimeToHHMM(value) {
  if (!value) return '';
  const text = String(value).trim();

  // Full datetime stored as UTC (YYYY-MM-DD HH:MM:SS or ISO) — append Z and convert to local
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(text)) {
    const normalized = text.replace(' ', 'T');
    const utcStr = normalized.endsWith('Z') ? normalized : normalized + 'Z';
    const dateObj = new Date(utcStr);
    if (!Number.isNaN(dateObj.getTime())) {
      return dateObj.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }
  }

  // Plain time string (HH:MM or HH:MM:SS) — extract HH:MM directly
  const direct = text.match(/\b(\d{2}:\d{2})/);
  if (direct) return direct[1];

  return '';
}

async function handleAttendanceEvent(event, children) {
  const eventType = String(event.event_type || '').toLowerCase();
  const cardId = String(event.card_id || '').trim();
  if (!cardId) return true;

  if (eventType === 'check_in') {
    return sendCheckinNotification(
      {
        card_id: cardId,
        child_name: event.child_name || '',
        time_in: formatEventTimeToHHMM(event.event_time || event.time_in)
      },
      children
    );
  }

  if (eventType === 'check_out') {
    return sendCheckoutNotification(
      {
        card_id: cardId,
        child_name: event.child_name || ''
      },
      children
    );
  }

  return true;
}

function runSqliteQuery(sql) {
  return new Promise((resolve, reject) => {
    execFile(
      'sqlite3',
      ['-noheader', '-separator', '\t', sqliteDbPath, sql],
      { maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error((stderr || error.message || '').trim() || 'sqlite query failed'));
          return;
        }
        resolve((stdout || '').trim());
      }
    );
  });
}

async function ensureSqliteSourceReady() {
  const tableCheck = await runSqliteQuery(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='attendance_events';"
  );

  if (tableCheck !== 'attendance_events') {
    throw new Error(`Таблица attendance_events не найдена: ${sqliteDbPath}`);
  }
}

async function initializeSqliteCursor() {
  if (sqliteCursorInitialized) return;

  if (Number.isInteger(moduleData.sqliteLastProcessedId)) {
    sqliteLastProcessedId = moduleData.sqliteLastProcessedId;
    sqliteCursorInitialized = true;
    console.log(`  🧭 SQLite курсор восстановлен: last_processed_id=${sqliteLastProcessedId}`);
    return;
  }

  const maxIdRaw = await runSqliteQuery('SELECT COALESCE(MAX(id), 0) FROM attendance_events;');
  sqliteLastProcessedId = Number(maxIdRaw || 0);
  sqliteCursorInitialized = true;
  moduleData.sqliteLastProcessedId = sqliteLastProcessedId;
  if (saveDataFunc) saveDataFunc();
  console.log(`  🧭 Первый запуск SQLite: курсор инициализирован на MAX(id)=${sqliteLastProcessedId}`);
}

function parseAttendanceEventRows(rawOutput) {
  if (!rawOutput) return [];

  return rawOutput
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const parts = line.split('\t');
      return {
        id: Number(parts[0]),
        child_id: parts[1] ? Number(parts[1]) : null,
        card_id: parts[2] || '',
        child_name: parts[3] || '',
        event_type: parts[4] || '',
        event_time: parts[5] || '',
        note: parts[6] || ''
      };
    })
    .filter(row => Number.isFinite(row.id));
}

/**
 * Parse a date string from SQLite (DD.MM.YYYY or ISO) into a Date object.
 * Returns null if the value is absent or unparseable.
 */
function parseSqliteDate(value) {
  if (!value) return null;
  const str = String(value).trim();
  // Russian DD.MM.YYYY format (stored by the RFID app)
  const ruMatch = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (ruMatch) {
    const d = new Date(Number(ruMatch[3]), Number(ruMatch[2]) - 1, Number(ruMatch[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  // ISO or other standard format
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Fetch child profile data from SQLite for one card_id.
 * Returns { first_name, last_name, parent_phone, remaining_hours, valid_until }
 * or null if the child is not found.
 *
 * The card_id value is embedded via SQL single-quote escaping (doubling every
 * quote). RFID card IDs do not contain quotes in practice, but the escaping is
 * applied unconditionally for correctness.
 */
async function enrichEventFromSqlite(cardId) {
  return new Promise((resolve) => {
    const safeId = String(cardId).replace(/'/g, "''");
    const query =
      'SELECT c.first_name, c.last_name, c.parent_phone, ' +
      '       s.remaining_hours, s.valid_until ' +
      'FROM children c ' +
      'LEFT JOIN subscriptions s ON s.child_id = c.id AND s.is_active = 1 ' +
      `WHERE c.card_id = '${safeId}' LIMIT 1;`;
    execFile('sqlite3', ['-json', sqliteDbPath, query], { maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err || !stdout) return resolve(null);
      try { resolve(JSON.parse(stdout)[0] || null); }
      catch { resolve(null); }
    });
  });
}

async function pollSqliteAttendanceEvents() {
  if (!isMonitoring || attendanceSource !== 'sqlite') return;
  if (sqlitePollInProgress) return;

  sqlitePollInProgress = true;

  try {
    await initializeSqliteCursor();

    const query = [
      'SELECT',
      'id,',
      "COALESCE(child_id, ''),",
      'card_id,',
      "COALESCE(child_name, ''),",
      'event_type,',
      'event_time,',
      "REPLACE(REPLACE(COALESCE(note, ''), char(10), ' '), char(9), ' ')",
      'FROM attendance_events',
      `WHERE id > ${sqliteLastProcessedId}`,
      'ORDER BY id ASC;'
    ].join(' ');

    const rowsRaw = await runSqliteQuery(query);
    const rows = parseAttendanceEventRows(rowsRaw);
    if (rows.length === 0) return;

    for (const row of rows) {
      // Enrich from SQLite — no workbook needed in sqlite mode.
      const enriched = await enrichEventFromSqlite(row.card_id);
      if (!enriched) {
        logger.warn(
          `enrichEventFromSqlite: no SQLite record for card_id=${row.card_id}; ` +
          'skipping notification, advancing cursor'
        );
        sqliteLastProcessedId = row.id;
        moduleData.sqliteLastProcessedId = sqliteLastProcessedId;
        if (saveDataFunc) saveDataFunc();
        continue;
      }

      // Build a child-profile object compatible with the send-notification helpers.
      const childProfile = {
        card_id:          row.card_id,
        first_name:       enriched.first_name  || '',
        last_name:        enriched.last_name   || '',
        parent_phone:     enriched.parent_phone || '',
        remaining_hours:  Number(enriched.remaining_hours) || 0,
        expiration_date:  parseSqliteDate(enriched.valid_until)
      };

      const processed = await handleAttendanceEvent(row, [childProfile]);
      if (!processed) {
        console.log(`  ⚠️  SQLite событие id=${row.id} не обработано, курсор не сдвинут`);
        break;
      }

      sqliteLastProcessedId = row.id;
      moduleData.sqliteLastProcessedId = sqliteLastProcessedId;
      if (saveDataFunc) saveDataFunc();

      console.log(
        `  ✅ SQLite событие обработано: id=${row.id}, type=${row.event_type}, card=${row.card_id}; курсор=${sqliteLastProcessedId}`
      );
    }
  } catch (error) {
    console.error('  ❌ Ошибка SQLite poller:', error.message);
  } finally {
    sqlitePollInProgress = false;
  }
}

async function startSqlitePolling() {
  if (isMonitoring) {
    return { success: false, message: '⚠️ Мониторинг уже запущен' };
  }

  try {
    await ensureSqliteSourceReady();
    await initializeSqliteCursor();
  } catch (error) {
    return { success: false, message: `❌ SQLite источник недоступен: ${error.message}` };
  }

  isMonitoring = true;
  sqlitePollTimer = setInterval(() => {
    pollSqliteAttendanceEvents();
  }, Math.max(1000, sqlitePollMs));

  console.log(`  🗄️  SQLite poller started: db=${sqliteDbPath}, interval=${Math.max(1000, sqlitePollMs)}ms`);

  // Первый опрос сразу, без ожидания интервала
  pollSqliteAttendanceEvents();

  return {
    success: true,
    message: '✅ SQLite мониторинг посещаемости запущен!\n\nСобытия будут читаться из attendance_events.'
  };
}

async function checkChanges() {
  if (isCheckingChanges) {
    hasPendingCheck = true;
    console.log('  ⏳ Проверка уже выполняется, ставим повторную проверку в очередь');
    return;
  }

  isCheckingChanges = true;

  try {
    const data = await readExcelFile();
    
    // Проверяем новые записи в логе (ребёнок пришёл)
    if (data.attendanceLog.length > lastLogSize) {
      const newEntries = data.attendanceLog.slice(lastLogSize);
      
      for (const entry of newEntries) {
        if (entry.action === 'CHECK_IN') {
          await handleAttendanceEvent(
            {
              event_type: 'check_in',
              card_id: entry.card_id,
              child_name: entry.child_name,
              time_in: entry.time_in
            },
            data.children
          );
        }
      }
      
      lastLogSize = data.attendanceLog.length;
    }
    
    // Проверяем изменения в Current_Session (ребёнок ушёл)
    const currentSessionMap = new Map();
    data.currentSession.forEach(session => {
      if (session.card_id) {
        currentSessionMap.set(session.card_id, session);
      }
    });
    
    // Ищем детей, которые ушли
    for (const [card_id, lastSession] of lastCurrentSession) {
      if (!currentSessionMap.has(card_id)) {
        await handleAttendanceEvent(
          {
            event_type: 'check_out',
            card_id,
            child_name: lastSession.child_name
          },
          data.children
        );
      }
    }
    
    lastCurrentSession = currentSessionMap;
    
  } catch (error) {
    console.error('  ❌ Ошибка проверки изменений:', error.message);
  } finally {
    isCheckingChanges = false;

    if (hasPendingCheck) {
      hasPendingCheck = false;
      checkChanges();
    }
  }
}

async function loadInitialState() {
  try {
    const data = await readExcelFile();
    
    lastLogSize = data.attendanceLog.length;
    
    data.currentSession.forEach(session => {
      if (session.card_id) {
        lastCurrentSession.set(session.card_id, session);
      }
    });
    
    console.log(`  📋 Загружено записей в логе: ${lastLogSize}`);
    console.log(`  👥 Детей в клубе сейчас: ${lastCurrentSession.size}`);
    
  } catch (error) {
    console.error('  ❌ Ошибка загрузки состояния:', error.message);
  }
}

function startExcelMonitoring() {
  if (isMonitoring) {
    return { success: false, message: '⚠️ Мониторинг уже запущен' };
  }
  
  if (!excelPath) {
    return { 
      success: false, 
      message: '❌ Путь к файлу не установлен.\nИспользуйте команду:\n/attendance_path <путь_к_файлу>' 
    };
  }
  
  if (!fs.existsSync(excelPath)) {
    return { 
      success: false, 
      message: `❌ Файл не найден:\n${excelPath}` 
    };
  }
  
  console.log(`  📂 Начинаем мониторинг файла: ${excelPath}`);
  
  // Загружаем начальное состояние
  loadInitialState();
  
  // Запускаем наблюдение
  watcher = chokidar.watch(excelPath, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 200
    }
  });
  
  watcher.on('change', () => {
    console.log('  📝 Обнаружено изменение в файле посещаемости');
    checkChanges();
  });
  
  isMonitoring = true;
  
  return {
    success: true, 
    message: '✅ Мониторинг посещаемости запущен!\n\nТеперь родители будут получать уведомления о приходе и уходе детей.' 
  };
}

function stopMonitoring() {
  if (watcher) {
    watcher.close();
    watcher = null;
  }

  if (sqlitePollTimer) {
    clearInterval(sqlitePollTimer);
    sqlitePollTimer = null;
  }

  isMonitoring = false;
  
  return { success: true, message: '⏹️ Мониторинг остановлен' };
}

async function startMonitoring() {
  if (attendanceSource === 'excel') {
    console.log('  📡 Attendance source selected: excel');
    return startExcelMonitoring();
  }

  if (attendanceSource === 'sqlite') {
    console.log('  📡 Attendance source selected: sqlite');
    return startSqlitePolling();
  }

  const message = `❌ Неверное значение ATTENDANCE_SOURCE: ${attendanceSource}. Допустимо: excel или sqlite.`;
  console.error(`  ${message}`);
  return { success: false, message };
}

function setExcelPath(newPath) {
  if (!fs.existsSync(newPath)) {
    return { success: false, message: '❌ Файл не найден по указанному пути' };
  }
  
  excelPath = newPath;
  moduleData.excelPath = newPath;
  if (saveDataFunc) saveDataFunc();
  
  return { 
    success: true, 
    message: `✅ Путь установлен:\n${newPath}\n\n📌 Теперь используйте:\n/attendance_start - для запуска мониторинга`
  };
}

async function getStats() {
  const stats = {
    isMonitoring: isMonitoring,
    source: attendanceSource,
    excelPath: excelPath,
    fileExists: excelPath ? fs.existsSync(excelPath) : false,
    lastCheck: new Date().toLocaleString('ru-RU'),
    currentInClub: lastCurrentSession.size,
    totalLogRecords: lastLogSize,
    sqliteDbPath,
    sqlitePollMs,
    sqliteLastProcessedId
  };
  
  if (stats.fileExists) {
    try {
      const data = await readExcelFile();
      stats.totalChildren = data.children.length;
      stats.childrenWithPhone = data.children.filter(c => c.parent_phone).length;
    } catch (error) {
      stats.error = error.message;
    }
  }
  
  return stats;
}

async function testNotification(chatId) {
  const now          = new Date();
  const timeStr      = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const today        = now.toLocaleDateString('ru-RU');

  const checkinMsg =
    `✅ РЕБЁНОК ПРИШЁЛ В КЛУБ\n` +
    `👶 Маша Петрова\n` +
    `⏰ Время прихода: ${timeStr}\n` +
    `📅 ${today}\n\n` +
    `Детский клуб "Квантик"`;

  const checkoutMsg =
    `👋 РЕБЁНОК УШЁЛ ИЗ КЛУБА\n` +
    `👶 Маша Петрова\n` +
    `⏰ Время ухода: ${timeStr}\n` +
    `📅 ${today}\n` +
    `В абонементе осталось:\n` +
    `39.5 часов.\n` +
    `Абонемент заканчивается 28.02.2026.\n` +
    `Детский клуб "Квантик"`;

  try {
    await bot.sendMessage(chatId, '🧪 ТЕСТ — ПРИХОД:\n\n' + checkinMsg);
    await new Promise(r => setTimeout(r, 500));
    await bot.sendMessage(chatId, '🧪 ТЕСТ — УХОД:\n\n'   + checkoutMsg);
    return { success: true, message: '✅ Два тестовых уведомления отправлены!' };
  } catch (error) {
    return { success: false, message: '❌ Ошибка: ' + error.message };
  }
}

// ============= ЭКСПОРТ МОДУЛЯ =============

module.exports = {
  name: 'attendance',
  version: '2.3.0',
  description: 'Мониторинг посещаемости с уведомлениями родителям и нескольким администраторам',
  author: 'Kvantik Team',
  
  // Инициализация модуля
  async init(context) {
    bot = context.bot;
    getUserDataFunc = context.getUserData;
    users = context.users;
    moduleData = context.data;
    saveDataFunc = context.saveData;
    getModuleFunc = context.getModule; // Для доступа к модулю админов
    notificationRouter = createNotificationRouter(bot, logger);
    
    // Загружаем сохранённый путь
    excelPath = moduleData.excelPath || '';
    
    console.log('  📊 Модуль посещаемости инициализирован');
    console.log(`  📡 Источник посещаемости: ${attendanceSource}`);
    
    // Регистрируем команды НАПРЯМУЮ через bot.onText
    
    // 1. Установка пути
    bot.onText(/\/attendance_path (.+)/, async (msg, match) => {
      if (String(msg.chat.id) !== String(config.admin?.mainAdminId)) return;
      
      const newPath = match[1].trim();
      const result = setExcelPath(newPath);
      bot.sendMessage(msg.chat.id, result.message);
    });
    
    // 2. Запуск мониторинга
    bot.onText(/\/attendance_start/, async (msg) => {
      if (String(msg.chat.id) !== String(config.admin?.mainAdminId)) return;
      
      const result = await startMonitoring();
      bot.sendMessage(msg.chat.id, result.message);
    });
    
    // 3. Остановка
    bot.onText(/\/attendance_stop/, async (msg) => {
      if (String(msg.chat.id) !== String(config.admin?.mainAdminId)) return;
      
      const result = stopMonitoring();
      bot.sendMessage(msg.chat.id, result.message);
    });
    
    // 4. Статус
    bot.onText(/\/attendance_status/, async (msg) => {
      if (String(msg.chat.id) !== String(config.admin?.mainAdminId)) return;
      
      const stats = await getStats();
      
      let message = '📊 СТАТУС МОНИТОРИНГА ПОСЕЩАЕМОСТИ\n\n';
      message += `🔹 Мониторинг: ${stats.isMonitoring ? '✅ Работает' : '❌ Остановлен'}\n`;
      message += `🧭 Источник: ${stats.source}\n`;
      message += `📂 Файл найден: ${stats.fileExists ? '✅ Да' : '❌ Нет'}\n\n`;

      if (stats.source === 'sqlite') {
        message += `🗄️ БД: ${stats.sqliteDbPath}\n`;
        message += `⏱️ Интервал опроса: ${stats.sqlitePollMs} ms\n`;
        message += `🔢 last_processed_id: ${stats.sqliteLastProcessedId}\n\n`;
      }
      
      if (stats.excelPath) {
        message += `📁 Путь:\n${stats.excelPath}\n\n`;
      }
      
      if (stats.fileExists) {
        message += `📊 ДАННЫЕ:\n`;
        message += `• Всего детей: ${stats.totalChildren || 0}\n`;
        message += `• С телефоном: ${stats.childrenWithPhone || 0}\n`;
        message += `• В клубе сейчас: ${stats.currentInClub}\n`;
        message += `• Всего записей: ${stats.totalLogRecords}\n\n`;
      }
      
      message += `⏰ Последняя проверка:\n${stats.lastCheck}`;
      
      bot.sendMessage(msg.chat.id, message);
    });
    
    // 5. Тест
    bot.onText(/\/attendance_test/, async (msg) => {
      if (String(msg.chat.id) !== String(config.admin?.mainAdminId)) return;
      
      const result = await testNotification(msg.chat.id);
      bot.sendMessage(msg.chat.id, result.message);
    });
    
    console.log('  ✅ Команды посещаемости зарегистрированы');
    
    // Автозапуск если путь установлен
    if (config.attendance?.autoStartWatcher) {
      setTimeout(() => {
        const canAutoStartExcel = attendanceSource === 'excel' && excelPath && fs.existsSync(excelPath);
        const canAutoStartSqlite = attendanceSource === 'sqlite';

        if (!canAutoStartExcel && !canAutoStartSqlite) {
          console.log('  ⚠️  Автозапуск не выполнен: для excel источника не задан корректный excelPath');
          return;
        }

        startMonitoring().then(result => {
          console.log('  📊', result.message);
        });
      }, 3000);
    } else if (!config.attendance?.autoStartWatcher) {
      console.log('  ⚠️  Автозапуск мониторинга отключен (ATTENDANCE_AUTO_START=false)');
    }
  },
  
  // Уничтожение модуля
  async destroy() {
    stopMonitoring();
  }
};
