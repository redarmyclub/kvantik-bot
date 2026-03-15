const Joi = require('joi');

const schemas = {
  // Валидация телефона
  phone: Joi.string()
    .pattern(/^(\+7|8)?[\s-]?\(?[0-9]{3}\)?[\s-]?[0-9]{3}[\s-]?[0-9]{2}[\s-]?[0-9]{2}$/)
    .message('Неверный формат телефона. Используйте: +7 (999) 123-45-67 или 89991234567'),
  
  // Валидация даты рождения
  birthDate: Joi.string()
    .pattern(/^\d{2}\.\d{2}\.\d{4}$/)
    .message('Неверный формат даты. Используйте: ДД.ММ.ГГГГ (например, 15.03.2015)')
    .custom((value, helpers) => {
      const [day, month, year] = value.split('.').map(Number);
      const date = new Date(year, month - 1, day);
      
      // Проверка корректности даты
      if (date.getDate() !== day || date.getMonth() !== month - 1 || date.getFullYear() !== year) {
        return helpers.error('any.invalid');
      }
      
      // Проверка что дата в прошлом
      if (date > new Date()) {
        return helpers.error('date.future');
      }
      
      // Проверка что возраст разумный (от 0 до 18 лет)
      const age = (new Date() - date) / (365.25 * 24 * 60 * 60 * 1000);
      if (age < 0 || age > 18) {
        return helpers.error('date.age');
      }
      
      return value;
    }, 'custom validation')
    .messages({
      'any.invalid': 'Несуществующая дата',
      'date.future': 'Дата рождения не может быть в будущем',
      'date.age': 'Возраст должен быть от 0 до 18 лет'
    }),
  
  // Валидация ФИО
  fullName: Joi.string()
    .min(3)
    .max(100)
    .pattern(/^[А-ЯЁа-яё\s-]+$/)
    .message('ФИО должно содержать только русские буквы, пробелы и дефисы'),
  
  // Валидация имени
  name: Joi.string()
    .min(2)
    .max(50)
    .pattern(/^[А-ЯЁа-яё]+$/)
    .message('Имя должно содержать только русские буквы'),
  
  // Валидация промокода
  promoCode: Joi.string()
    .min(4)
    .max(20)
    .pattern(/^[A-Z0-9]+$/)
    .message('Промокод должен содержать только заглавные латинские буквы и цифры'),
  
  // Валидация скидки
  discount: Joi.number()
    .min(1)
    .max(100)
    .integer()
    .message('Скидка должна быть от 1 до 100 процентов'),
  
  // Валидация email
  email: Joi.string()
    .email()
    .message('Неверный формат email'),
  
  // Валидация текста отзыва
  reviewText: Joi.string()
    .max(1000)
    .allow('')
    .message('Текст отзыва не должен превышать 1000 символов')
};

const validator = {
  // Валидация телефона
  validatePhone: (phone) => {
    const { error, value } = schemas.phone.validate(phone);
    if (error) {
      return { valid: false, message: error.message };
    }
    
    // Нормализация телефона
    const normalized = value.replace(/[\s-()]/g, '');
    const formatted = normalized.startsWith('8') 
      ? '+7' + normalized.slice(1)
      : normalized.startsWith('+7')
        ? normalized
        : '+7' + normalized;
    
    return { valid: true, value: formatted };
  },
  
  // Валидация даты рождения
  validateBirthDate: (date) => {
    const { error, value } = schemas.birthDate.validate(date);
    if (error) {
      return { valid: false, message: error.message };
    }
    return { valid: true, value };
  },
  
  // Валидация ФИО
  validateFullName: (name) => {
    const { error, value } = schemas.fullName.validate(name);
    if (error) {
      return { valid: false, message: error.message };
    }
    return { valid: true, value: value.trim() };
  },
  
  // Валидация имени
  validateName: (name) => {
    const { error, value } = schemas.name.validate(name);
    if (error) {
      return { valid: false, message: error.message };
    }
    return { valid: true, value: value.trim() };
  },
  
  // Валидация промокода
  validatePromoCode: (code) => {
    const { error, value } = schemas.promoCode.validate(code.toUpperCase());
    if (error) {
      return { valid: false, message: error.message };
    }
    return { valid: true, value };
  },
  
  // Валидация скидки
  validateDiscount: (discount) => {
    const { error, value } = schemas.discount.validate(discount);
    if (error) {
      return { valid: false, message: error.message };
    }
    return { valid: true, value };
  },
  
  // Валидация email
  validateEmail: (email) => {
    const { error, value } = schemas.email.validate(email);
    if (error) {
      return { valid: false, message: error.message };
    }
    return { valid: true, value: value.toLowerCase() };
  },
  
  // Валидация текста отзыва
  validateReviewText: (text) => {
    const { error, value } = schemas.reviewText.validate(text);
    if (error) {
      return { valid: false, message: error.message };
    }
    return { valid: true, value: value.trim() };
  },
  
  // Санитизация HTML (защита от XSS)
  sanitize: (text) => {
    return text
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }
};

module.exports = validator;
