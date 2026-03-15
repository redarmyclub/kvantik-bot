/**
 * v1.8 FINAL — правильная обработка эмодзи
 */

const fs = require('fs');

module.exports = {
  name: 'scheduleManager',
  version: '1.8.0',
  description: 'Управление расписанием',
  author: 'Kvantik Team',

  async init(context) {
    this.bot = context.bot;
    this.data = context.data;
    this.saveData = context.saveData;
    if (!this.data.configPath) this.data.configPath = '';
    const self = this;

    this.bot.onText(/\/set_schedule_path (.+)/, async (msg, match) => {
      if (msg.chat.id != process.env.MAIN_ADMIN_ID) return;
      const newPath = match[1].trim();
      if (!fs.existsSync(newPath)) return self.bot.sendMessage(msg.chat.id, '❌ Файл не найден');
      self.data.configPath = newPath;
      self.saveData();
      self.bot.sendMessage(msg.chat.id, `✅ Путь установлен\n/update_schedule`);
    });

    this.bot.onText(/\/show_schedule/, async (msg) => {
      if (msg.chat.id != process.env.MAIN_ADMIN_ID) return;
      if (!self.data.configPath) return self.bot.sendMessage(msg.chat.id, '❌ Путь не установлен');
      try {
        const schedule = self.readSchedule();
        const message = self.formatScheduleForDisplay(schedule);
        self.bot.sendMessage(msg.chat.id, message, { parse_mode: 'HTML' });
      } catch (error) {
        self.bot.sendMessage(msg.chat.id, `❌ ${error.message}`);
      }
    });

    this.bot.onText(/\/update_schedule/, async (msg) => {
      if (msg.chat.id != process.env.MAIN_ADMIN_ID) return;
      if (!self.data.configPath) return self.bot.sendMessage(msg.chat.id, '❌ Путь не установлен');
      self.data.editMode = 'waiting_for_schedule';
      self.saveData();
      self.bot.sendMessage(msg.chat.id, '📝 Отправьте расписание');
    });

    this.bot.on('message', async (msg) => {
      if (msg.chat.id != process.env.MAIN_ADMIN_ID) return;
      if (!self.data.editMode) return;
      if (msg.text && msg.text.startsWith('/')) return;
      await self.handleEditMode(msg);
    });

    console.log('  📅 Модуль расписания v1.8');
  },

  readSchedule() {
    delete require.cache[require.resolve(this.data.configPath)];
    return require(this.data.configPath);
  },

  formatScheduleForDisplay(schedule) {
    const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    let msg = '📅 <b>РАСПИСАНИЕ</b>\n\n';
    for (let d = 1; d <= 6; d++) {
      const ds = schedule.weekly[d];
      if (!ds || !ds.name || ds.events.length === 0) continue;
      msg += `<b>${days[d]}</b> — ${ds.name}\n`;
      ds.events.forEach(e => {
        msg += `⏰ ${e.time} — ${e.title}\n`;
        if (e.description) msg += `   ${e.description}\n`;
      });
      msg += '\n';
    }
    return msg;
  },

  async handleEditMode(msg) {
    const chatId = msg.chat.id;
    if (this.data.editMode === 'waiting_for_schedule') {
      try {
        await this.bot.sendMessage(chatId, '⏳ Обрабатываю...');
        const text = msg.text;
        const newSchedule = this.parseScheduleFromText(text);
        const eventCount = this.countEvents(newSchedule);
        console.log(`✅ Событий: ${eventCount}`);
        const success = await this.saveScheduleToFile(newSchedule);
        if (success) {
          this.bot.sendMessage(chatId, `✅ ГОТОВО!\nСобытий: ${eventCount}\n\n/show_schedule`);
        } else {
          this.bot.sendMessage(chatId, '❌ Ошибка сохранения');
        }
        delete this.data.editMode;
        this.saveData();
      } catch (error) {
        console.error('❌ Ошибка:', error);
        this.bot.sendMessage(chatId, `❌ ${error.message}`);
      }
    }
  },

  countEvents(schedule) {
    let total = 0;
    for (let day = 1; day <= 6; day++) total += schedule.weekly[day].events.length;
    return total;
  },

  parseScheduleFromText(text) {
    const schedule = {
      daily: [],
      weekly: {
        0: { name: 'ВЫХОДНОЙ', events: [] },
        1: { name: '', events: [] },
        2: { name: '', events: [] },
        3: { name: '', events: [] },
        4: { name: '', events: [] },
        5: { name: '', events: [] },
        6: { name: '', events: [] }
      },
      timeline: { startHour: 0, endHour: 23, showMinutes: 30 }
    };

    const dayMap = {
      '🔵': 1, '🟢': 2, '🟣': 3, '🟡': 4, '🔴': 5, '🟠': 6
    };
    
    const colors = {
      1: '#3b82f6', 2: '#10b981', 3: '#8b5cf6',
      4: '#f59e0b', 5: '#ec4899', 6: '#f97316'
    };

    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    let currentDay = null;

    for (const line of lines) {
      // Проверяем начало строки на эмодзи используя includes
      let foundDay = null;
      for (const [emoji, dayNum] of Object.entries(dayMap)) {
        if (line.startsWith(emoji)) {
          foundDay = dayNum;
          
          // Ищем тире — (код 8212)
          const dashPos = line.indexOf('—');
          if (dashPos > 0) {
            const dayName = line.substring(dashPos + 1).trim();
            // Убираем возможные события из названия дня
            const nameEnd = dayName.search(/\d{2}:\d{2}/);
            const cleanName = nameEnd > 0 ? dayName.substring(0, nameEnd).trim() : dayName;
            
            schedule.weekly[foundDay].name = cleanName;
            currentDay = foundDay;
            console.log(`День ${foundDay}: ${cleanName}`);
          }
          break;
        }
      }
      
      if (foundDay) continue;

      // Парсим события
      if (currentDay && /\d{2}:\d{2}/.test(line)) {
        // Ищем паттерн: ЧЧ:ММ[тире]ЧЧ:ММ — Название
        const match = line.match(/(\d{2}):(\d{2})[–—\-](\d{2}):(\d{2})\s*—\s*(.+)/);
        if (match) {
          const startTime = `${match[1]}:${match[2]}`;
          const endTime = `${match[3]}:${match[4]}`;
          let fullText = match[5].trim();
          
          // Разделяем title : description
          let title = fullText;
          let description = '';
          const colonPos = fullText.indexOf(':');
          if (colonPos > 0) {
            title = fullText.substring(0, colonPos).trim();
            description = fullText.substring(colonPos + 1).trim();
          }

          schedule.weekly[currentDay].events.push({
            time: `${startTime}-${endTime}`,
            title: title,
            description: description,
            color: colors[currentDay]
          });
          
          console.log(`  Событие: ${startTime}-${endTime} ${title}`);
        }
      }
    }

    return schedule;
  },

  async saveScheduleToFile(schedule) {
    try {
      const content = `// РАСПИСАНИЕ ДЕТСКОГО КЛУБА
// ${new Date().toLocaleString('ru-RU')}

const scheduleConfig = ${JSON.stringify(schedule, null, 4)};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = scheduleConfig;
}`;

      fs.writeFileSync(this.data.configPath, content, 'utf8');
      return true;
    } catch (error) {
      console.error('❌ Ошибка:', error);
      return false;
    }
  }
};
