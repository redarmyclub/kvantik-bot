/**
 * Модуль управления администраторами для уведомлений
 * 
 * Позволяет главному администратору добавлять других администраторов,
 * которые будут получать копии всех уведомлений о посещаемости.
 * 
 * Версия: 1.0.1 (совместимая с bot.onText)
 */

// Глобальные переменные модуля
let bot = null;
let moduleData = {};
let saveDataFunc = null;

module.exports = {
  name: 'adminNotifications',
  version: '1.0.1',
  description: 'Управление списком администраторов для уведомлений',
  author: 'Kvantik Team',

  // Инициализация модуля
  async init(context) {
    bot = context.bot;
    moduleData = context.data;
    saveDataFunc = context.saveData;

    // Инициализируем пустой список если его нет
    if (!moduleData.adminIds) {
      moduleData.adminIds = [];
      saveDataFunc();
    }

    console.log(`  👥 Модуль администраторов загружен (${moduleData.adminIds.length} доп. админов)`);

    // ═══════════════════════════════════════════════
    //  РЕГИСТРАЦИЯ КОМАНД ЧЕРЕЗ bot.onText
    // ═══════════════════════════════════════════════

    // 1. /myid - узнать свой ID
    bot.onText(/\/myid/, async (msg) => {
      bot.sendMessage(msg.chat.id,
        `🆔 ВАШ ID\n\n` +
        `${msg.chat.id}\n\n` +
        `💡 Отправьте этот ID главному администратору для получения доступа к уведомлениям.`
      );
    });

    // 2. /add_admin - добавить администратора
    bot.onText(/\/add_admin(.*)/, async (msg, match) => {
      // Только главный админ
      if (msg.chat.id != process.env.MAIN_ADMIN_ID) {
        return bot.sendMessage(msg.chat.id, '❌ Эта команда доступна только главному администратору');
      }

      const text = match[1].trim();
      
      if (!text) {
        return bot.sendMessage(msg.chat.id,
          '📝 Использование:\n' +
          '/add_admin <ID>\n\n' +
          'Пример:\n' +
          '/add_admin 123456789\n\n' +
          '💡 Чтобы узнать ID, попросите администратора отправить боту /myid'
        );
      }

      // Парсим ID
      const adminId = text.trim();
      
      // Проверяем что это число
      if (!/^\d+$/.test(adminId)) {
        return bot.sendMessage(msg.chat.id, '❌ ID должен быть числом. Используйте команду /myid чтобы узнать ID.');
      }

      // Проверяем, не добавлен ли уже
      if (moduleData.adminIds && moduleData.adminIds.includes(adminId)) {
        return bot.sendMessage(msg.chat.id, '⚠️ Этот администратор уже добавлен');
      }

      // Добавляем
      if (!moduleData.adminIds) {
        moduleData.adminIds = [];
      }
      moduleData.adminIds.push(adminId);
      saveDataFunc();

      bot.sendMessage(msg.chat.id,
        `✅ Администратор добавлен!\n\n` +
        `ID: ${adminId}\n\n` +
        `Теперь он будет получать копии всех уведомлений о посещаемости.\n\n` +
        `📋 Список всех админов: /list_admins`
      );
    });

    // 3. /remove_admin - удалить администратора
    bot.onText(/\/remove_admin(.*)/, async (msg, match) => {
      if (msg.chat.id != process.env.MAIN_ADMIN_ID) {
        return bot.sendMessage(msg.chat.id, '❌ Эта команда доступна только главному администратору');
      }

      const text = match[1].trim();
      
      if (!text) {
        return bot.sendMessage(msg.chat.id,
          '📝 Использование:\n' +
          '/remove_admin <ID>\n\n' +
          'Пример:\n' +
          '/remove_admin 123456789\n\n' +
          '📋 Список админов: /list_admins'
        );
      }

      if (!moduleData.adminIds || moduleData.adminIds.length === 0) {
        return bot.sendMessage(msg.chat.id, '⚠️ Список дополнительных администраторов пуст');
      }

      const adminId = text.trim();
      const index = moduleData.adminIds.indexOf(adminId);
      
      if (index === -1) {
        return bot.sendMessage(msg.chat.id, '❌ Администратор с таким ID не найден в списке');
      }

      moduleData.adminIds.splice(index, 1);
      saveDataFunc();

      bot.sendMessage(msg.chat.id,
        `✅ Администратор удалён!\n\n` +
        `ID: ${adminId}\n\n` +
        `📋 Текущий список: /list_admins`
      );
    });

    // 4. /list_admins - показать список
    bot.onText(/\/list_admins/, async (msg) => {
      if (msg.chat.id != process.env.MAIN_ADMIN_ID) {
        return bot.sendMessage(msg.chat.id, '❌ Эта команда доступна только главному администратору');
      }

      let message = '👥 СПИСОК АДМИНИСТРАТОРОВ\n\n';
      
      message += `🔹 Главный администратор:\nID: ${process.env.MAIN_ADMIN_ID}\n\n`;
      
      if (!moduleData.adminIds || moduleData.adminIds.length === 0) {
        message += '📋 Дополнительные администраторы:\nСписок пуст\n\n';
        message += '💡 Добавить: /add_admin <ID>';
      } else {
        message += '📋 Дополнительные администраторы:\n';
        moduleData.adminIds.forEach((id, index) => {
          message += `${index + 1}. ID: ${id}\n`;
        });
        message += `\n📊 Всего: ${moduleData.adminIds.length}`;
      }

      bot.sendMessage(msg.chat.id, message);
    });

    console.log('  ✅ Команды администраторов зарегистрированы');
  },

  async destroy() {
    // Cleanup если нужен
  },

  // ═══════════════════════════════════════════════
  //  API ДЛЯ ДРУГИХ МОДУЛЕЙ
  // ═══════════════════════════════════════════════
  
  /**
   * Получить список всех ID администраторов (главный + дополнительные)
   * @returns {Array<string>}
   */
  getAllAdminIds() {
    const ids = [process.env.MAIN_ADMIN_ID];
    
    if (moduleData.adminIds && moduleData.adminIds.length > 0) {
      ids.push(...moduleData.adminIds);
    }
    
    return ids;
  },

  /**
   * Получить только дополнительных администраторов (без главного)
   * @returns {Array<string>}
   */
  getAdditionalAdminIds() {
    return moduleData.adminIds || [];
  }
};
