#!/usr/bin/env node
/**
 * Скрипт проверки системы модулей
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Проверка системы модулей...\n');

// Проверка структуры
const checks = [
  { path: './core/moduleLoader.js', name: 'Module Loader' },
  { path: './modules/promoSystem.js', name: 'Promo System Module' },
  { path: './modules/statistics.js', name: 'Statistics Module' },
  { path: './utils/logger.js', name: 'Logger' },
  { path: './utils/storage.js', name: 'Storage' },
  { path: './config/config.js', name: 'Config' },
  { path: './bot.js', name: 'Main Bot File' },
  { path: './README.md', name: 'README' },
  { path: './MODULES_GUIDE.md', name: 'Modules Guide' }
];

let allOk = true;

checks.forEach(check => {
  const exists = fs.existsSync(check.path);
  const status = exists ? '✅' : '❌';
  console.log(`${status} ${check.name}`);
  
  if (!exists) {
    allOk = false;
  }
});

console.log('');

// Проверка модулей
console.log('📦 Проверка модулей...\n');

const modulesDir = './modules';
const moduleFiles = fs.readdirSync(modulesDir)
  .filter(f => f.endsWith('.js') && !f.startsWith('_'));

console.log(`Найдено модулей: ${moduleFiles.length}\n`);

moduleFiles.forEach(file => {
  try {
    const module = require(path.join(__dirname, modulesDir, file));
    
    const hasName = !!module.name;
    const hasVersion = !!module.version;
    const hasDescription = !!module.description;
    const hasEnabled = module.hasOwnProperty('enabled');
    
    console.log(`📄 ${file}`);
    console.log(`   ${hasName ? '✅' : '❌'} name: ${module.name || 'отсутствует'}`);
    console.log(`   ${hasVersion ? '✅' : '❌'} version: ${module.version || 'отсутствует'}`);
    console.log(`   ${hasDescription ? '✅' : '❌'} description: ${module.description || 'отсутствует'}`);
    console.log(`   ${hasEnabled ? '✅' : '❌'} enabled: ${module.enabled}`);
    
    if (module.commands) {
      const cmdCount = Object.keys(module.commands).length;
      console.log(`   📝 Команды: ${cmdCount}`);
    }
    
    console.log('');
    
  } catch (error) {
    console.log(`❌ ${file}: Ошибка загрузки - ${error.message}\n`);
    allOk = false;
  }
});

// Итоговый результат
console.log('='.repeat(50));
if (allOk) {
  console.log('✅ ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ');
  console.log('Система модулей готова к использованию!');
} else {
  console.log('❌ ОБНАРУЖЕНЫ ПРОБЛЕМЫ');
  console.log('Проверьте файлы и модули выше');
}
console.log('='.repeat(50));

process.exit(allOk ? 0 : 1);
