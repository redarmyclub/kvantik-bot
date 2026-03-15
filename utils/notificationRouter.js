const config = require('../config/config');

function createNotificationRouter(bot, logger = null) {
  function logInfo(message, meta = {}) {
    if (logger && typeof logger.info === 'function') {
      logger.info('NOTIFY', message, meta);
      return;
    }
    console.log('[NOTIFY]', message, meta);
  }

  function logWarn(message, meta = {}) {
    if (logger && typeof logger.warn === 'function') {
      logger.warn('NOTIFY', message, meta);
      return;
    }
    console.warn('[NOTIFY]', message, meta);
  }

  function resolveAdminChatId(chatId) {
    if (config.notifications?.routeAdminToTestChatInDev && config.notifications?.adminTestChatId) {
      return String(config.notifications.adminTestChatId);
    }

    return chatId ? String(chatId) : null;
  }

  async function sendAdminMessage(message, options = {}) {
    const requestedChatId = options.chatId || config.notifications?.adminNotificationChatId || config.admin?.mainAdminId;
    const chatId = resolveAdminChatId(requestedChatId);

    if (!chatId) {
      logWarn('Admin notification skipped: no chat id', { requestedChatId });
      return { sent: false, skipped: 'no-chat-id' };
    }

    if (config.notifications?.dryRun) {
      logInfo('DRY RUN admin notification', { chatId, messagePreview: String(message).slice(0, 120) });
      return { sent: false, dryRun: true, chatId };
    }

    await bot.sendMessage(chatId, message, options.sendOptions || undefined);
    return { sent: true, chatId };
  }

  async function sendParentMessage(chatId, message, options = {}) {
    if (!chatId) {
      logWarn('Parent notification skipped: no chat id');
      return { sent: false, skipped: 'no-chat-id' };
    }

    if (!config.notifications?.allowParentNotifications) {
      logInfo('Parent notification skipped by policy', { chatId });
      return { sent: false, skipped: 'parent-notifications-disabled', chatId };
    }

    if (config.notifications?.dryRun) {
      logInfo('DRY RUN parent notification', { chatId, messagePreview: String(message).slice(0, 120) });
      return { sent: false, dryRun: true, chatId };
    }

    await bot.sendMessage(chatId, message, options.sendOptions || undefined);
    return { sent: true, chatId: String(chatId) };
  }

  return {
    sendAdminMessage,
    sendParentMessage,
    resolveAdminChatId
  };
}

module.exports = createNotificationRouter;
