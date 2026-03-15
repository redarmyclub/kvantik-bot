const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const config = require('../config/config');
const logger = require('./logger');

// Создание директории для данных
const dataDir = config.paths?.data || './bot_data';

async function ensureDataDir() {
  try {
    await fs.mkdir(dataDir, { recursive: true });
  } catch (error) {
    logger.error('STORAGE', 'Error creating data directory', error.message);
  }
}

function ensureDataDirSync() {
  try {
    if (!fsSync.existsSync(dataDir)) {
      fsSync.mkdirSync(dataDir, { recursive: true });
    }
  } catch (error) {
    console.error('Error creating data directory:', error.message);
  }
}

const storage = {
  // Загрузка данных из файла (ASYNC)
  load: async (name) => {
    await ensureDataDir();
    const filePath = path.join(dataDir, `${name}.json`);
    
    try {
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.info('STORAGE', `File ${name}.json not found, creating empty`);
        return {};
      }
      logger.error('STORAGE', `Error loading ${name}.json`, error.message);
      return {};
    }
  },
  
  // Загрузка данных из файла (SYNC)
  loadSync: (name) => {
    ensureDataDirSync();
    const filePath = path.join(dataDir, `${name}.json`);
    
    try {
      const data = fsSync.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {};
      }
      console.error(`Error loading ${name}.json:`, error.message);
      return {};
    }
  },
  
  // Сохранение данных в файл (ASYNC)
  save: async (name, data) => {
    await ensureDataDir();
    const filePath = path.join(dataDir, `${name}.json`);
    const tempPath = filePath + '.tmp';
    
    try {
      // Записываем во временный файл
      await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf8');
      
      // Атомарно перемещаем временный файл в основной
      await fs.rename(tempPath, filePath);
      
      return true;
    } catch (error) {
      logger.error('STORAGE', `Error saving ${name}.json`, error.message);
      
      // Удаляем временный файл в случае ошибки
      try {
        await fs.unlink(tempPath);
      } catch (e) {
        // Игнорируем ошибку удаления
      }
      
      return false;
    }
  },
  
  // Сохранение данных в файл (SYNC)
  saveSync: (name, data) => {
    ensureDataDirSync();
    const filePath = path.join(dataDir, `${name}.json`);
    
    try {
      fsSync.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
      return true;
    } catch (error) {
      console.error(`Error saving ${name}.json:`, error.message);
      return false;
    }
  },
  
  // Получение размера файла
  getFileSize: async (name) => {
    const filePath = path.join(dataDir, `${name}.json`);
    
    try {
      const stats = await fs.stat(filePath);
      return stats.size;
    } catch (error) {
      return 0;
    }
  },
  
  // Получение информации о всех файлах
  getInfo: async () => {
    await ensureDataDir();
    
    try {
      const files = await fs.readdir(dataDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      
      const info = [];
      for (const file of jsonFiles) {
        const filePath = path.join(dataDir, file);
        const stats = await fs.stat(filePath);
        
        info.push({
          name: file,
          size: stats.size,
          modified: stats.mtime,
          sizeFormatted: formatBytes(stats.size)
        });
      }
      
      return info;
    } catch (error) {
      logger.error('Ошибка получения информации о файлах', error);
      return [];
    }
  },
  
  // Проверка целостности данных
  checkIntegrity: async (name) => {
    const filePath = path.join(dataDir, `${name}.json`);
    
    try {
      const data = await fs.readFile(filePath, 'utf8');
      JSON.parse(data); // Попытка распарсить
      return { valid: true, message: 'OK' };
    } catch (error) {
      return { valid: false, message: error.message };
    }
  }
};

// Вспомогательная функция форматирования размера
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

module.exports = storage;
