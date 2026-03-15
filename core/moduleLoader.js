const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

/**
 * Система автоматической загрузки модулей
 * Позволяет добавлять новые модули просто добавив файл в папку modules/
 */
class ModuleLoader {
  constructor(bot, modulesDir = path.join(__dirname, '../modules')) {
    this.bot = bot;
    this.modulesDir = modulesDir;
    this.modules = new Map();
    this.moduleData = new Map();
    this.getUserData = null;  // Будет передано позже
    this.users = null;        // Будет передано позже
  }
  
  /**
   * Установка глобального контекста
   */
  setGlobalContext(getUserData, users) {
    this.getUserData = getUserData;
    this.users = users;
  }

  /**
   * Загрузка всех модулей из директории
   */
  async loadAll() {
    console.log('🔄 Загрузка модулей...');
    
    if (!fs.existsSync(this.modulesDir)) {
      fs.mkdirSync(this.modulesDir, { recursive: true });
      console.log('📁 Создана директория модулей:', this.modulesDir);
      return;
    }

    const files = fs.readdirSync(this.modulesDir)
      .filter(file => file.endsWith('.js') && !file.startsWith('_'));

    for (const file of files) {
      try {
        await this.loadModule(file);
      } catch (error) {
        console.error(`❌ Ошибка загрузки модуля ${file}:`, error.message);
        logger.error('MODULE_LOADER', `Failed to load ${file}`, error.message);
      }
    }

    console.log(`✅ Загружено модулей: ${this.modules.size}`);
  }

  /**
   * Загрузка отдельного модуля
   */
  async loadModule(filename) {
    const modulePath = path.join(this.modulesDir, filename);
    const moduleName = path.basename(filename, '.js');

    // Очистка кэша для перезагрузки
    delete require.cache[require.resolve(modulePath)];

    const module = require(modulePath);

    // Проверка структуры модуля
    if (!this.validateModule(module, moduleName)) {
      throw new Error(`Модуль ${moduleName} имеет неверную структуру`);
    }

    // Инициализация модуля
    if (module.init) {
      const moduleContext = {
        bot: this.bot,
        data: this.getModuleData(moduleName),
        saveData: () => this.saveModuleData(moduleName),
        getUserData: this.getUserData,  // Функция получения данных пользователя
        users: this.users                // Объект всех пользователей
      };
      
      await module.init(moduleContext);
    }

    this.modules.set(moduleName, module);
    
    console.log(`  ✓ ${moduleName} ${module.version || '1.0.0'} - ${module.description || 'без описания'}`);
    logger.info('MODULE_LOADER', `Loaded ${moduleName}`, module.version || '1.0.0');
  }

  /**
   * Валидация структуры модуля
   */
  validateModule(module, name) {
    if (typeof module !== 'object') {
      console.error(`❌ Модуль ${name}: должен экспортировать объект`);
      return false;
    }

    if (!module.name) {
      console.warn(`⚠️  Модуль ${name}: отсутствует поле 'name'`);
    }

    return true;
  }

  /**
   * Перезагрузка модуля
   */
  async reloadModule(moduleName) {
    const filename = `${moduleName}.js`;
    console.log(`🔄 Перезагрузка модуля: ${moduleName}`);
    
    // Деинициализация старого модуля
    const oldModule = this.modules.get(moduleName);
    if (oldModule && oldModule.destroy) {
      await oldModule.destroy();
    }

    // Загрузка нового
    await this.loadModule(filename);
    console.log(`✅ Модуль ${moduleName} перезагружен`);
  }

  /**
   * Выгрузка модуля
   */
  async unloadModule(moduleName) {
    const module = this.modules.get(moduleName);
    
    if (!module) {
      throw new Error(`Модуль ${moduleName} не найден`);
    }

    if (module.destroy) {
      await module.destroy();
    }

    this.modules.delete(moduleName);
    console.log(`✅ Модуль ${moduleName} выгружен`);
  }

  /**
   * Получить данные модуля
   */
  getModuleData(moduleName) {
    if (!this.moduleData.has(moduleName)) {
      // Попытка загрузить из файла
      const dataPath = path.join(__dirname, '../bot_data', `${moduleName}.json`);
      if (fs.existsSync(dataPath)) {
        try {
          const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
          this.moduleData.set(moduleName, data);
        } catch (error) {
          console.error(`❌ Ошибка загрузки данных модуля ${moduleName}:`, error.message);
          this.moduleData.set(moduleName, {});
        }
      } else {
        this.moduleData.set(moduleName, {});
      }
    }
    return this.moduleData.get(moduleName);
  }

  /**
   * Сохранить данные модуля
   */
  saveModuleData(moduleName) {
    const data = this.moduleData.get(moduleName);
    if (!data) return;

    const dataPath = path.join(__dirname, '../bot_data', `${moduleName}.json`);
    
    try {
      fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error(`❌ Ошибка сохранения данных модуля ${moduleName}:`, error.message);
    }
  }

  /**
   * Сохранить все данные модулей
   */
  saveAllModuleData() {
    for (const [moduleName] of this.modules) {
      this.saveModuleData(moduleName);
    }
  }

  /**
   * Получить модуль по имени
   */
  getModule(name) {
    return this.modules.get(name);
  }

  /**
   * Получить все модули
   */
  getAllModules() {
    return Array.from(this.modules.entries()).map(([name, module]) => ({
      name,
      version: module.version || '1.0.0',
      description: module.description || '',
      enabled: module.enabled !== false
    }));
  }

  /**
   * Вызвать метод во всех модулях
   */
  async callModuleMethod(methodName, ...args) {
    const results = [];
    
    for (const [name, module] of this.modules) {
      if (typeof module[methodName] === 'function') {
        try {
          const result = await module[methodName](...args);
          results.push({ module: name, result });
        } catch (error) {
          console.error(`❌ Ошибка в модуле ${name}.${methodName}:`, error.message);
          results.push({ module: name, error: error.message });
        }
      }
    }
    
    return results;
  }

  /**
   * Обработка команды модулем
   */
  async handleCommand(command, msg, ...args) {
    for (const [name, module] of this.modules) {
      if (module.commands && module.commands[command]) {
        try {
          return await module.commands[command](msg, ...args);
        } catch (error) {
          console.error(`❌ Ошибка обработки команды ${command} в модуле ${name}:`, error.message);
          throw error;
        }
      }
    }
    return null;
  }

  /**
   * Получить список команд всех модулей
   */
  getAllCommands() {
    const commands = {};
    
    for (const [name, module] of this.modules) {
      if (module.commands) {
        for (const [cmd, handler] of Object.entries(module.commands)) {
          commands[cmd] = {
            module: name,
            description: module.commandDescriptions?.[cmd] || '',
            handler
          };
        }
      }
    }
    
    return commands;
  }

  /**
   * Получить статистику модулей
   */
  getStats() {
    return {
      total: this.modules.size,
      loaded: Array.from(this.modules.keys()),
      commands: Object.keys(this.getAllCommands()).length
    };
  }
}

module.exports = ModuleLoader;
