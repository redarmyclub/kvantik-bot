/**
 * Модуль управления администраторами
 * Позволяет главному админу добавлять/удалять дополнительных администраторов
 */

const logger = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');

// Путь к файлу с дополнительными админами
const ADMINS_FILE = path.join(__dirname, '../bot_data/additional_admins.json');

const adminManagement = {
  name: 'adminManagement',
  version: '1.0.0',
  description: 'Управление администраторами бота',
  enabled: true,
  
  async init(context) {
    this.bot = context.bot;
    this.data = context.data;
    this.saveData = context.saveData;
    this.users = context.users;
    this.getUserData = context.getUserData;
    
    // Загружаем список дополнительных админов
    await this.loadAdmins();
    
    console.log(`  👥 Управление админами: ${this.data.additionalAdmins?.length || 0} доп. админов`);
  },
  
  // Загрузка списка админов из файла
  async loadAdmins() {
    try {
      const data = await fs.readFile(ADMINS_FILE, 'utf8');
      this.data.additionalAdmins = JSON.parse(data);
    } catch (error) {
      // Файл не существует - создаём пустой список
      this.data.additionalAdmins = [];
      await this.saveAdmins();
    }
  },
  
  // Сохранение списка админов в файл
  async saveAdmins() {
    try {
      await fs.writeFile(
        ADMINS_FILE,
        JSON.stringify(this.data.additionalAdmins, null, 2)
      );
    } catch (error) {
      logger.error('ADMIN_MGMT', 'Failed to save admins', error.message);
    }
  },
  
  // Проверка является ли пользователь главным админом
  isMainAdmin(chatId) {
    const mainAdminId = process.env.MAIN_ADMIN_ID;
    return String(chatId) === String(mainAdminId);
  },
  
  // Проверка является ли пользователь администратором (любым)
  isAdmin(chatId) {
    const mainAdminId = process.env.MAIN_ADMIN_ID;
    const id = String(chatId);
    
    if (id === String(mainAdminId)) return true;
    
    const additionalAdmins = this.data.additionalAdmins || [];
    return additionalAdmins.includes(id);
  },
  
  // Добавить администратора
  async addAdmin(newAdminId) {
    const id = String(newAdminId);
    const mainAdminId = String(process.env.MAIN_ADMIN_ID);
    
    // Нельзя добавить главного админа
    if (id === mainAdminId) {
      return { success: false, message: 'Этот пользователь уже является главным администратором' };
    }
    
    // Проверяем что еще не админ
    if (this.data.additionalAdmins.includes(id)) {
      return { success: false, message: 'Этот пользователь уже является администратором' };
    }
    
    // Добавляем
    this.data.additionalAdmins.push(id);
    await this.saveAdmins();
    
    logger.info('ADMIN_MGMT', `Admin added: ${id}`);
    
    return { success: true, message: 'Администратор успешно добавлен' };
  },
  
  // Удалить администратора
  async removeAdmin(adminId) {
    const id = String(adminId);
    const mainAdminId = String(process.env.MAIN_ADMIN_ID);
    
    // Нельзя удалить главного админа
    if (id === mainAdminId) {
      return { success: false, message: 'Нельзя удалить главного администратора' };
    }
    
    // Проверяем что админ существует
    if (!this.data.additionalAdmins.includes(id)) {
      return { success: false, message: 'Этот пользователь не является дополнительным администратором' };
    }
    
    // Удаляем
    this.data.additionalAdmins = this.data.additionalAdmins.filter(a => a !== id);
    await this.saveAdmins();
    
    logger.info('ADMIN_MGMT', `Admin removed: ${id}`);
    
    return { success: true, message: 'Администратор успешно удалён' };
  },
  
  // Получить список всех админов
  getAdminsList() {
    const mainAdminId = process.env.MAIN_ADMIN_ID;
    
    return {
      main: mainAdminId,
      additional: this.data.additionalAdmins || [],
      total: 1 + (this.data.additionalAdmins?.length || 0)
    };
  },
  
  // Обработка сообщений
  async handleMessage(msg, user) {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    // Проверяем состояния админа
    if (user.adminAction === 'add_admin') {
      const newAdminId = text.trim();
      
      // Проверка формата ID
      if (!/^\d+$/.test(newAdminId)) {
        await this.bot.sendMessage(chatId, '❌ Неверный формат ID. Введите числовой ID');
        return { handled: false };
      }
      
      const result = await this.addAdmin(newAdminId);
      
      if (result.success) {
        await this.bot.sendMessage(
          chatId,
          `✅ ${result.message}\n\nID: ${newAdminId}`
        );
        
        // Уведомляем нового админа
        try {
          await this.bot.sendMessage(
            newAdminId,
            '👑 Вам предоставлены права администратора!\n\n' +
            'Используйте /start для доступа к админ-панели'
          );
        } catch (error) {
          await this.bot.sendMessage(
            chatId,
            '⚠️ Не удалось уведомить пользователя. ' +
            'Возможно, он еще не писал боту'
          );
        }
      } else {
        await this.bot.sendMessage(chatId, `❌ ${result.message}`);
      }
      
      delete user.adminAction;
      return { handled: true };
    }
    
    if (user.adminAction === 'remove_admin') {
      const adminId = text.trim();
      
      const result = await this.removeAdmin(adminId);
      
      if (result.success) {
        await this.bot.sendMessage(
          chatId,
          `✅ ${result.message}\n\nID: ${adminId}`
        );
        
        // Уведомляем бывшего админа
        try {
          await this.bot.sendMessage(
            adminId,
            '👋 Ваши права администратора были отозваны\n\n' +
            'Теперь у вас обычный доступ к боту'
          );
        } catch (error) {
          // Игнорируем ошибку
        }
      } else {
        await this.bot.sendMessage(chatId, `❌ ${result.message}`);
      }
      
      delete user.adminAction;
      return { handled: true };
    }
    
    return { handled: false };
  },
  
  commands: {
    admins: async function(msg) {
      const chatId = msg.chat.id;
      
      if (!adminManagement.isMainAdmin(chatId)) {
        await adminManagement.bot.sendMessage(
          chatId,
          '❌ Эта команда доступна только главному администратору'
        );
        return { handled: true };
      }
      
      const list = adminManagement.getAdminsList();
      
      let message = '👥 СПИСОК АДМИНИСТРАТОРОВ:\n\n';
      message += `👑 Главный администратор:\n${list.main}\n\n`;
      
      if (list.additional.length > 0) {
        message += `👤 Дополнительные администраторы (${list.additional.length}):\n`;
        list.additional.forEach((adminId, index) => {
          message += `${index + 1}. ${adminId}\n`;
        });
      } else {
        message += `👤 Дополнительных администраторов нет`;
      }
      
      await adminManagement.bot.sendMessage(chatId, message);
      return { handled: true };
    }
  },
  
  commandDescriptions: {
    admins: '[Главный админ] Список администраторов'
  }
};

module.exports = adminManagement;
