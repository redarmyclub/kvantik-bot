const fs = require('fs').promises;
const path = require('path');
const config = require('../config/config');
const logger = require('./logger');

const backupDir = config.paths.backups;

async function ensureBackupDir() {
  try {
    await fs.mkdir(backupDir, { recursive: true });
  } catch (error) {
    logger.error('Ошибка создания директории бэкапов', error);
  }
}

const backup = {
  // Инициализация системы бэкапов
  init: async () => {
    await ensureBackupDir();
    logger.info('BACKUP', 'Backup system initialized');
    
    // Создаём начальный бэкап
    if (config.backup?.createOnStart) {
      try {
        await backup.createBackup();
        logger.info('BACKUP', 'Initial backup created');
      } catch (error) {
        logger.error('BACKUP', 'Failed to create initial backup', error.message);
      }
    }
  },
  
  // Создание бэкапа
  createBackup: async () => {
    await ensureBackupDir();
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const backupName = `backup_${timestamp}`;
    const backupPath = path.join(backupDir, backupName);
    
    try {
      await fs.mkdir(backupPath, { recursive: true });
      
      // Копируем все файлы из bot_data
      const dataFiles = await fs.readdir(config.paths.data);
      
      for (const file of dataFiles) {
        if (file.endsWith('.json')) {
          const sourcePath = path.join(config.paths.data, file);
          const destPath = path.join(backupPath, file);
          await fs.copyFile(sourcePath, destPath);
        }
      }
      
      // Копируем логи
      try {
        const logFiles = await fs.readdir(config.paths.logs);
        const logsBackupPath = path.join(backupPath, 'logs');
        await fs.mkdir(logsBackupPath, { recursive: true });
        
        for (const file of logFiles) {
          if (file.endsWith('.log')) {
            const sourcePath = path.join(config.paths.logs, file);
            const destPath = path.join(logsBackupPath, file);
            await fs.copyFile(sourcePath, destPath);
          }
        }
      } catch (error) {
        logger.warn('Не удалось скопировать логи в бэкап', error);
      }
      
      logger.info(`Бэкап создан: ${backupName}`);
      
      // Удаляем старые бэкапы
      await backup.cleanOldBackups();
      
      return { success: true, path: backupPath };
    } catch (error) {
      logger.error('Ошибка создания бэкапа', error);
      return { success: false, error: error.message };
    }
  },
  
  // Восстановление из бэкапа
  restoreBackup: async (backupName) => {
    const backupPath = path.join(backupDir, backupName);
    
    try {
      const files = await fs.readdir(backupPath);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const sourcePath = path.join(backupPath, file);
          const destPath = path.join(config.paths.data, file);
          await fs.copyFile(sourcePath, destPath);
        }
      }
      
      logger.info(`Бэкап восстановлен: ${backupName}`);
      return { success: true };
    } catch (error) {
      logger.error('Ошибка восстановления бэкапа', error);
      return { success: false, error: error.message };
    }
  },
  
  // Список всех бэкапов
  listBackups: async () => {
    await ensureBackupDir();
    
    try {
      const items = await fs.readdir(backupDir);
      const backups = [];
      
      for (const item of items) {
        const itemPath = path.join(backupDir, item);
        const stats = await fs.stat(itemPath);
        
        if (stats.isDirectory() && item.startsWith('backup_')) {
          backups.push({
            name: item,
            date: stats.mtime,
            size: await getDirectorySize(itemPath),
            formatted: formatBackupDate(item)
          });
        }
      }
      
      // Сортировка по дате (новые первыми)
      backups.sort((a, b) => b.date - a.date);
      
      return backups;
    } catch (error) {
      logger.error('Ошибка получения списка бэкапов', error);
      return [];
    }
  },
  
  // Удаление старых бэкапов
  cleanOldBackups: async () => {
    const backups = await backup.listBackups();
    const maxAge = config.backup.keepDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    
    for (const bkp of backups) {
      if (now - bkp.date.getTime() > maxAge) {
        try {
          const backupPath = path.join(backupDir, bkp.name);
          await deleteDirectory(backupPath);
          logger.info(`Удалён старый бэкап: ${bkp.name}`);
        } catch (error) {
          logger.warn(`Не удалось удалить старый бэкап ${bkp.name}`, error);
        }
      }
    }
  },
  
  // Удаление конкретного бэкапа
  deleteBackup: async (backupName) => {
    const backupPath = path.join(backupDir, backupName);
    
    try {
      await deleteDirectory(backupPath);
      logger.info(`Бэкап удалён: ${backupName}`);
      return { success: true };
    } catch (error) {
      logger.error('Ошибка удаления бэкапа', error);
      return { success: false, error: error.message };
    }
  }
};

// Вспомогательные функции
async function getDirectorySize(dirPath) {
  let size = 0;
  
  try {
    const items = await fs.readdir(dirPath);
    
    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      const stats = await fs.stat(itemPath);
      
      if (stats.isDirectory()) {
        size += await getDirectorySize(itemPath);
      } else {
        size += stats.size;
      }
    }
  } catch (error) {
    // Игнорируем ошибки
  }
  
  return size;
}

async function deleteDirectory(dirPath) {
  const items = await fs.readdir(dirPath);
  
  for (const item of items) {
    const itemPath = path.join(dirPath, item);
    const stats = await fs.stat(itemPath);
    
    if (stats.isDirectory()) {
      await deleteDirectory(itemPath);
    } else {
      await fs.unlink(itemPath);
    }
  }
  
  await fs.rmdir(dirPath);
}

function formatBackupDate(backupName) {
  const match = backupName.match(/backup_(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, year, month, day] = match;
    return `${day}.${month}.${year}`;
  }
  return backupName;
}

module.exports = backup;
