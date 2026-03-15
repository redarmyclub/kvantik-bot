const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs').promises;
const config = require('../config/config');
const logger = require('./logger');

const exportsDir = config.paths.exports;

async function ensureExportsDir() {
  try {
    await fs.mkdir(exportsDir, { recursive: true });
  } catch (error) {
    logger.error('Ошибка создания директории экспорта', error);
  }
}

const exporter = {
  // Экспорт пользователей в Excel
  exportUsers: async (userData) => {
    await ensureExportsDir();
    
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Пользователи');
    
    // Заголовки
    sheet.columns = [
      { header: 'Telegram ID', key: 'chatId', width: 15 },
      { header: 'Имя', key: 'name', width: 20 },
      { header: 'ФИО', key: 'fullName', width: 30 },
      { header: 'Телефон', key: 'phone', width: 18 },
      { header: 'Зарегистрирован', key: 'registered', width: 15 },
      { header: 'Кол-во детей', key: 'childrenCount', width: 12 },
      { header: 'Дети', key: 'children', width: 50 }
    ];
    
    // Данные
    Object.entries(userData).forEach(([chatId, user]) => {
      const childrenNames = user.children?.map(c => c.fullName).join(', ') || '';
      
      sheet.addRow({
        chatId,
        name: user.parentName || '',
        fullName: user.parentFullName || '',
        phone: user.phone || '',
        registered: user.isRegistered ? 'Да' : 'Нет',
        childrenCount: user.children?.length || 0,
        children: childrenNames
      });
    });
    
    // Стили
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };
    
    // Сохранение
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `users_${timestamp}.xlsx`;
    const filepath = path.join(exportsDir, filename);
    
    await workbook.xlsx.writeFile(filepath);
    logger.export('Users', Object.keys(userData).length, filename);
    
    return { success: true, filepath, filename, count: Object.keys(userData).length };
  },
  
  // Экспорт отзывов в Excel
  exportReviews: async (reviews) => {
    await ensureExportsDir();
    
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Отзывы');
    
    // Заголовки
    sheet.columns = [
      { header: 'Дата', key: 'date', width: 20 },
      { header: 'Пользователь', key: 'user', width: 30 },
      { header: 'Telegram ID', key: 'chatId', width: 15 },
      { header: 'Рейтинг', key: 'rating', width: 10 },
      { header: 'Текст', key: 'text', width: 50 }
    ];
    
    // Данные
    let totalReviews = 0;
    Object.entries(reviews).forEach(([chatId, userReviews]) => {
      if (Array.isArray(userReviews)) {
        userReviews.forEach(review => {
          sheet.addRow({
            date: new Date(review.timestamp).toLocaleString('ru-RU'),
            user: review.userFullName || review.userName || 'Гость',
            chatId,
            rating: review.rating,
            text: review.text || '(без комментария)'
          });
          totalReviews++;
        });
      }
    });
    
    // Стили
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };
    
    // Сохранение
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `reviews_${timestamp}.xlsx`;
    const filepath = path.join(exportsDir, filename);
    
    await workbook.xlsx.writeFile(filepath);
    logger.export('Reviews', totalReviews, filename);
    
    return { success: true, filepath, filename, count: totalReviews };
  },
  
  // Экспорт статистики
  exportStatistics: async (userData, reviews, promoCodes = {}) => {
    await ensureExportsDir();
    
    const workbook = new ExcelJS.Workbook();
    
    // Лист 1: Общая статистика
    const statsSheet = workbook.addWorksheet('Общая статистика');
    statsSheet.columns = [
      { header: 'Метрика', key: 'metric', width: 30 },
      { header: 'Значение', key: 'value', width: 20 }
    ];
    
    const totalUsers = Object.keys(userData).length;
    const registered = Object.values(userData).filter(u => u.isRegistered).length;
    const totalChildren = Object.values(userData).reduce((sum, u) => sum + (u.children?.length || 0), 0);
    const totalReviews = Object.values(reviews).reduce((sum, r) => sum + (Array.isArray(r) ? r.length : 0), 0);
    const avgRating = calculateAverageRating(reviews);
    
    statsSheet.addRow({ metric: 'Всего пользователей', value: totalUsers });
    statsSheet.addRow({ metric: 'Зарегистрировано', value: registered });
    statsSheet.addRow({ metric: 'Конверсия регистрации', value: `${((registered / totalUsers) * 100).toFixed(1)}%` });
    statsSheet.addRow({ metric: 'Всего детей', value: totalChildren });
    statsSheet.addRow({ metric: 'Средняя детей на родителя', value: (totalChildren / registered).toFixed(1) });
    statsSheet.addRow({ metric: 'Всего отзывов', value: totalReviews });
    statsSheet.addRow({ metric: 'Средний рейтинг', value: avgRating.toFixed(1) });
    
    statsSheet.getRow(1).font = { bold: true };
    
    // Лист 2: По датам
    const dailySheet = workbook.addWorksheet('По датам');
    // ... (можно добавить разбивку по датам)
    
    // Сохранение
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `statistics_${timestamp}.xlsx`;
    const filepath = path.join(exportsDir, filename);
    
    await workbook.xlsx.writeFile(filepath);
    logger.export('Statistics', 1, filename);
    
    return { success: true, filepath, filename };
  },
  
  // Экспорт детей отдельно
  exportChildren: async (userData) => {
    await ensureExportsDir();
    
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Дети');
    
    sheet.columns = [
      { header: 'ФИО ребёнка', key: 'childName', width: 30 },
      { header: 'Дата рождения', key: 'birthDate', width: 15 },
      { header: 'Возраст', key: 'age', width: 10 },
      { header: 'Пол', key: 'gender', width: 10 },
      { header: 'Родитель', key: 'parent', width: 30 },
      { header: 'Телефон', key: 'phone', width: 18 },
      { header: 'Примечание', key: 'note', width: 30 },
      { header: 'Дата добавления', key: 'registeredAt', width: 20 }
    ];
    
    let count = 0;
    Object.values(userData).forEach(user => {
      if (user.children && user.children.length > 0) {
        user.children.forEach(child => {
          sheet.addRow({
            childName: child.fullName,
            birthDate: child.birthDate,
            age: calculateAge(child.birthDate),
            gender: child.gender,
            parent: user.parentFullName || user.parentName,
            phone: user.phone,
            note: child.note || '',
            registeredAt: new Date(child.registeredAt).toLocaleDateString('ru-RU')
          });
          count++;
        });
      }
    });
    
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };
    
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `children_${timestamp}.xlsx`;
    const filepath = path.join(exportsDir, filename);
    
    await workbook.xlsx.writeFile(filepath);
    logger.export('Children', count, filename);
    
    return { success: true, filepath, filename, count };
  },
  
  // Список всех экспортов
  listExports: async () => {
    await ensureExportsDir();
    
    try {
      const files = await fs.readdir(exportsDir);
      const exports = [];
      
      for (const file of files) {
        if (file.endsWith('.xlsx')) {
          const filepath = path.join(exportsDir, file);
          const stats = await fs.stat(filepath);
          
          exports.push({
            name: file,
            date: stats.mtime,
            size: stats.size,
            sizeFormatted: formatBytes(stats.size)
          });
        }
      }
      
      exports.sort((a, b) => b.date - a.date);
      return exports;
    } catch (error) {
      logger.error('Ошибка получения списка экспортов', error);
      return [];
    }
  }
};

// Вспомогательные функции
function calculateAverageRating(reviews) {
  let total = 0;
  let count = 0;
  
  Object.values(reviews).forEach(userReviews => {
    if (Array.isArray(userReviews)) {
      userReviews.forEach(review => {
        total += review.rating;
        count++;
      });
    }
  });
  
  return count > 0 ? total / count : 0;
}

function calculateAge(birthDate) {
  const [day, month, year] = birthDate.split('.').map(Number);
  const birth = new Date(year, month - 1, day);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = exporter;
