/**
 * Модуль управления RFID системой и редактирования данных
 * 
 * Позволяет главному администратору:
 * - Останавливать/запускать RFID сервис
 * - Редактировать данные детей в Excel
 * - Просматривать статус системы
 * 
 * Версия: 1.0.0
 */

const ExcelJS = require('exceljs');
const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');

const execPromise = util.promisify(exec);

module.exports = {
  name: 'rfidManager',
  version: '1.0.0',
  description: 'Управление RFID системой и редактирование данных',
  author: 'Kvantik Team',

  // ─────────────────────────────────────────────
  //  КОМАНДЫ МОДУЛЯ
  // ─────────────────────────────────────────────
  commands: {

    '/rfid_stop': async function (msg) {
      if (msg.chat.id != process.env.MAIN_ADMIN_ID) {
        return this.bot.sendMessage(msg.chat.id, '❌ Эта команда доступна только главному администратору');
      }

      await this.bot.sendMessage(msg.chat.id, '⏸️ Останавливаю RFID систему...');

      try {
        const { stdout, stderr } = await execPromise('sudo systemctl stop kvantik-rfid.service');
        
        // Проверяем статус после остановки
        await new Promise(resolve => setTimeout(resolve, 1000));
        const status = await this.getRfidStatus();

        let message = '✅ RFID СИСТЕМА ОСТАНОВЛЕНА\n\n';
        message += status;
        message += '\n\n💡 Теперь можно редактировать данные:\n';
        message += '/edit_child - редактировать ребёнка\n';
        message += '/rfid_start - запустить систему обратно';

        this.bot.sendMessage(msg.chat.id, message);

      } catch (error) {
        this.bot.sendMessage(msg.chat.id, 
          `❌ Ошибка при остановке:\n${error.message}\n\n` +
          `💡 Убедитесь что:\n` +
          `1. Сервис называется kvantik-rfid.service\n` +
          `2. Бот имеет sudo права без пароля`
        );
      }
    },

    '/rfid_start': async function (msg) {
      if (msg.chat.id != process.env.MAIN_ADMIN_ID) {
        return this.bot.sendMessage(msg.chat.id, '❌ Эта команда доступна только главному администратору');
      }

      await this.bot.sendMessage(msg.chat.id, '▶️ Запускаю RFID систему...');

      try {
        const { stdout, stderr } = await execPromise('sudo systemctl start kvantik-rfid.service');
        
        // Проверяем статус после запуска
        await new Promise(resolve => setTimeout(resolve, 2000));
        const status = await this.getRfidStatus();

        let message = '✅ RFID СИСТЕМА ЗАПУЩЕНА\n\n';
        message += status;

        this.bot.sendMessage(msg.chat.id, message);

      } catch (error) {
        this.bot.sendMessage(msg.chat.id, 
          `❌ Ошибка при запуске:\n${error.message}`
        );
      }
    },

    '/rfid_status': async function (msg) {
      if (msg.chat.id != process.env.MAIN_ADMIN_ID) {
        return this.bot.sendMessage(msg.chat.id, '❌ Эта команда доступна только главному администратору');
      }

      await this.bot.sendMessage(msg.chat.id, '🔍 Проверяю статус...');

      try {
        const status = await this.getRfidStatus();
        this.bot.sendMessage(msg.chat.id, '📊 СТАТУС RFID СИСТЕМЫ\n\n' + status);
      } catch (error) {
        this.bot.sendMessage(msg.chat.id, `❌ Ошибка: ${error.message}`);
      }
    },

    '/edit_child': async function (msg) {
      if (msg.chat.id != process.env.MAIN_ADMIN_ID) {
        return this.bot.sendMessage(msg.chat.id, '❌ Эта команда доступна только главному администратору');
      }

      // Получаем путь к Excel из модуля attendance
      const attendanceModule = this.getModule ? this.getModule('attendance') : null;
      const excelPath = attendanceModule?.data?.excelPath || this.data.excelPath;

      if (!excelPath || !fs.existsSync(excelPath)) {
        return this.bot.sendMessage(msg.chat.id, 
          '❌ Путь к Excel не установлен.\n\n' +
          'Используйте /set_excel_path <путь> или установите в модуле attendance'
        );
      }

      this.data.editMode = 'waiting_for_name';
      this.data.excelPath = excelPath;
      this.saveData();

      this.bot.sendMessage(msg.chat.id,
        '✏️ РЕЖИМ РЕДАКТИРОВАНИЯ\n\n' +
        '📝 Отправьте имя и фамилию ребёнка для поиска:\n' +
        'Например: Маша Петрова\n\n' +
        '❌ Отмена: /cancel'
      );
    },

    '/set_excel_path': async function (msg) {
      if (msg.chat.id != process.env.MAIN_ADMIN_ID) {
        return this.bot.sendMessage(msg.chat.id, '❌ Эта команда доступна только главному администратору');
      }

      const newPath = msg.text.replace('/set_excel_path', '').trim();
      
      if (!newPath) {
        return this.bot.sendMessage(msg.chat.id,
          '📝 Использование:\n' +
          '/set_excel_path /путь/к/файлу.xlsx\n\n' +
          'Пример:\n' +
          '/set_excel_path /home/pi/kvantik_data.xlsx'
        );
      }

      if (!fs.existsSync(newPath)) {
        return this.bot.sendMessage(msg.chat.id, '❌ Файл не найден по указанному пути');
      }

      this.data.excelPath = newPath;
      this.saveData();

      this.bot.sendMessage(msg.chat.id, `✅ Путь установлен:\n${newPath}`);
    },

    '/cancel': async function (msg) {
      if (msg.chat.id != process.env.MAIN_ADMIN_ID) return;

      if (this.data.editMode) {
        delete this.data.editMode;
        delete this.data.selectedChild;
        this.saveData();

        this.bot.sendMessage(msg.chat.id, '❌ Редактирование отменено');
      } else {
        this.bot.sendMessage(msg.chat.id, 'Нет активного режима редактирования');
      }
    }
  },

  commandDescriptions: {
    '/rfid_stop':       'Остановить RFID систему',
    '/rfid_start':      'Запустить RFID систему',
    '/rfid_status':     'Статус RFID системы',
    '/edit_child':      'Редактировать данные ребёнка',
    '/set_excel_path':  'Установить путь к Excel файлу',
    '/cancel':          'Отменить редактирование'
  },

  // ─────────────────────────────────────────────
  //  ИНИЦИАЛИЗАЦИЯ
  // ─────────────────────────────────────────────
  async init(context) {
    this.bot       = context.bot;
    this.data      = context.data;
    this.saveData  = context.saveData;
    this.getModule = context.getModule;

    // Инициализируем данные
    if (!this.data.excelPath) {
      this.data.excelPath = '';
    }

    // Привязываем this для команд
    for (const cmd in this.commands) {
      this.commands[cmd] = this.commands[cmd].bind(this);
    }

    // Обработка текстовых сообщений для режима редактирования
    this.bot.on('message', async (msg) => {
      if (msg.chat.id != process.env.MAIN_ADMIN_ID) return;
      if (!this.data.editMode) return;
      if (msg.text && msg.text.startsWith('/')) return; // Пропускаем команды

      await this.handleEditMode(msg);
    });

    console.log('  🔧 Модуль управления RFID загружен');
  },

  async destroy() {
    // Cleanup
  },

  // ─────────────────────────────────────────────
  //  ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
  // ─────────────────────────────────────────────

  async getRfidStatus() {
    try {
      const { stdout } = await execPromise('sudo systemctl status kvantik-rfid.service');
      
      // Парсим статус
      const lines = stdout.split('\n');
      let status = '';
      
      // Ищем строку со статусом
      const activeLine = lines.find(l => l.includes('Active:'));
      if (activeLine) {
        if (activeLine.includes('active (running)')) {
          status += '🟢 Статус: Работает\n';
        } else if (activeLine.includes('inactive')) {
          status += '🔴 Статус: Остановлен\n';
        } else {
          status += '🟡 Статус: ' + activeLine.trim() + '\n';
        }
      }

      // Ищем PID
      const mainLine = lines.find(l => l.includes('Main PID:'));
      if (mainLine) {
        status += mainLine.trim() + '\n';
      }

      // Последние строки лога
      const logLines = lines.slice(-3).filter(l => l.trim());
      if (logLines.length > 0) {
        status += '\n📋 Последние записи:\n';
        logLines.forEach(line => {
          const trimmed = line.trim();
          if (trimmed) status += trimmed.substring(0, 100) + '\n';
        });
      }

      return status || stdout.substring(0, 500);

    } catch (error) {
      // systemctl status возвращает код 3 когда сервис неактивен
      if (error.code === 3) {
        return '🔴 Статус: Остановлен (inactive)';
      }
      throw error;
    }
  },

  async handleEditMode(msg) {
    const chatId = msg.chat.id;

    try {
      // Шаг 1: Ожидаем имя ребёнка
      if (this.data.editMode === 'waiting_for_name') {
        const searchName = msg.text.trim().toLowerCase();
        
        const children = await this.readChildren();
        const found = children.filter(child => {
          const fullName = `${child.first_name} ${child.last_name}`.toLowerCase();
          return fullName.includes(searchName);
        });

        if (found.length === 0) {
          return this.bot.sendMessage(chatId, 
            '❌ Ребёнок не найден\n\n' +
            'Попробуйте ещё раз или /cancel для отмены'
          );
        }

        if (found.length > 1) {
          let message = `🔍 Найдено несколько детей:\n\n`;
          found.forEach((child, i) => {
            message += `${i + 1}. ${child.first_name} ${child.last_name}\n`;
            message += `   Card ID: ${child.card_id}\n`;
            message += `   Часов: ${child.remaining_hours}\n\n`;
          });
          message += 'Уточните имя и фамилию';
          
          return this.bot.sendMessage(chatId, message);
        }

        // Нашли одного ребёнка
        const child = found[0];
        this.data.selectedChild = child;
        this.data.editMode = 'show_child';
        this.saveData();

        let message = '✅ НАЙДЕН РЕБЁНОК\n\n';
        message += `👶 ${child.first_name} ${child.last_name}\n`;
        message += `🆔 Card ID: ${child.card_id}\n`;
        message += `📦 Часов в пакете: ${child.package_hours}\n`;
        message += `✅ Использовано: ${child.used_hours}\n`;
        message += `⏱️ Осталось: ${child.remaining_hours}\n`;
        message += `📞 Телефон: ${child.parent_phone}\n`;
        if (child.expiration_date) {
          message += `📅 Дата окончания: ${child.expiration_date}\n`;
        }
        message += `📊 Статус: ${child.status}\n\n`;
        message += '━━━━━━━━━━━━━━━━━━\n\n';
        message += '✏️ Что вы хотите изменить?\n\n';
        message += '1️⃣ - Имя\n';
        message += '2️⃣ - Фамилию\n';
        message += '3️⃣ - Часы в пакете\n';
        message += '4️⃣ - Использованные часы\n';
        message += '5️⃣ - Оставшиеся часы\n';
        message += '6️⃣ - Телефон родителя\n';
        message += '7️⃣ - Дату окончания\n';
        message += '8️⃣ - Статус\n\n';
        message += 'Отправьте номер (1-8) или /cancel';

        this.bot.sendMessage(chatId, message);
      }

      // Шаг 2: Выбор поля для редактирования
      else if (this.data.editMode === 'show_child') {
        const choice = msg.text.trim();
        
        const fields = {
          '1': { key: 'first_name', name: 'Имя', column: 2 },
          '2': { key: 'last_name', name: 'Фамилию', column: 3 },
          '3': { key: 'package_hours', name: 'Часы в пакете', column: 4 },
          '4': { key: 'used_hours', name: 'Использованные часы', column: 5 },
          '5': { key: 'remaining_hours', name: 'Оставшиеся часы', column: 6 },
          '6': { key: 'parent_phone', name: 'Телефон', column: 7 },
          '7': { key: 'expiration_date', name: 'Дату окончания (ДД.ММ.ГГГГ)', column: 10 },
          '8': { key: 'status', name: 'Статус', column: 9 }
        };

        if (!fields[choice]) {
          return this.bot.sendMessage(chatId, '❌ Неверный выбор. Отправьте номер от 1 до 8 или /cancel');
        }

        this.data.editField = fields[choice];
        this.data.editMode = 'waiting_for_value';
        this.saveData();

        const currentValue = this.data.selectedChild[fields[choice].key];
        this.bot.sendMessage(chatId,
          `✏️ Редактирование: ${fields[choice].name}\n\n` +
          `Текущее значение: ${currentValue || 'не задано'}\n\n` +
          `Отправьте новое значение или /cancel`
        );
      }

      // Шаг 3: Получение нового значения
      else if (this.data.editMode === 'waiting_for_value') {
        const newValue = msg.text.trim();
        const field = this.data.editField;
        const child = this.data.selectedChild;

        await this.bot.sendMessage(chatId, '💾 Сохраняю изменения...');

        // Обновляем в Excel
        const success = await this.updateChildInExcel(child.card_id, field.column, newValue);

        if (success) {
          this.bot.sendMessage(chatId,
            `✅ ИЗМЕНЕНИЯ СОХРАНЕНЫ\n\n` +
            `${field.name}: ${newValue}\n\n` +
            `💡 Запустите RFID систему:\n/rfid_start`
          );
        } else {
          this.bot.sendMessage(chatId,
            `❌ Ошибка при сохранении\n\n` +
            `Попробуйте ещё раз: /edit_child`
          );
        }

        // Сбрасываем режим редактирования
        delete this.data.editMode;
        delete this.data.selectedChild;
        delete this.data.editField;
        this.saveData();
      }

    } catch (error) {
      this.bot.sendMessage(chatId, `❌ Ошибка: ${error.message}`);
      console.error('Ошибка в режиме редактирования:', error);
    }
  },

  async readChildren() {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(this.data.excelPath);
    
    const sheet = workbook.getWorksheet('Children');
    const children = [];
    
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Пропускаем заголовок
      
      const card_id = row.getCell(1).value;
      if (!card_id) return;

      // Читаем дату окончания
      let expirationDate = null;
      const expirationValue = row.getCell(10).value;
      if (expirationValue) {
        const val = String(expirationValue).trim();
        const match = val.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
        if (match) {
          const [_, day, month, year] = match;
          expirationDate = `${day}.${month}.${year}`;
        } else {
          expirationDate = val;
        }
      }
      
      children.push({
        rowNumber: rowNumber,
        card_id: String(card_id),
        first_name: String(row.getCell(2).value || '').trim(),
        last_name: String(row.getCell(3).value || '').trim(),
        package_hours: Number(row.getCell(4).value) || 0,
        used_hours: Number(row.getCell(5).value) || 0,
        remaining_hours: Number(row.getCell(6).value) || 0,
        parent_phone: String(row.getCell(7).value || '').trim(),
        photo_url: String(row.getCell(8).value || '').trim(),
        status: String(row.getCell(9).value || '').trim(),
        expiration_date: expirationDate
      });
    });
    
    return children;
  },

  async updateChildInExcel(cardId, columnNumber, newValue) {
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(this.data.excelPath);
      
      const sheet = workbook.getWorksheet('Children');
      let updated = false;
      
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Пропускаем заголовок
        
        const currentCardId = String(row.getCell(1).value);
        if (currentCardId === cardId) {
          // Преобразуем значение в нужный тип
          let valueToSet = newValue;
          
          // Для числовых колонок преобразуем в число
          if ([4, 5, 6].includes(columnNumber)) {
            valueToSet = Number(newValue) || 0;
          }
          
          row.getCell(columnNumber).value = valueToSet;
          updated = true;
        }
      });
      
      if (updated) {
        await workbook.xlsx.writeFile(this.data.excelPath);
        console.log(`✅ Обновлена запись: Card ID ${cardId}, Колонка ${columnNumber}, Значение: ${newValue}`);
        return true;
      }
      
      return false;
      
    } catch (error) {
      console.error('Ошибка при обновлении Excel:', error);
      return false;
    }
  }
};
