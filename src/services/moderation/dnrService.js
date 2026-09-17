import { getFromDb, setInDb } from '../../utils/database.js';

function getDnrKey(guildId) {
  return `guild:${guildId}:dnr`;
}

async function getGuildData(guildId) {
  const data = await getFromDb(getDnrKey(guildId), {});
  return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
}

class DnrService {
  static async addDnr(guildId, targetUserId, protectedUserId) {
    const data = await getGuildData(guildId);
    const current = Array.isArray(data[targetUserId]) ? data[targetUserId] : [];

    if (!current.includes(protectedUserId)) {
      current.push(protectedUserId);
    }

    data[targetUserId] = current;
    await setInDb(getDnrKey(guildId), data);
    return current;
  }

  static async removeDnr(guildId, targetUserId, protectedUserId) {
    const data = await getGuildData(guildId);
    const current = Array.isArray(data[targetUserId]) ? data[targetUserId] : [];
    const updated = current.filter(userId => userId !== protectedUserId);

    if (updated.length > 0) {
      data[targetUserId] = updated;
    } else {
      delete data[targetUserId];
    }

    await setInDb(getDnrKey(guildId), data);
    return current.length !== updated.length;
  }

  static async getProtectedUsers(guildId, targetUserId) {
    const data = await getGuildData(guildId);
    return Array.isArray(data[targetUserId]) ? data[targetUserId] : [];
  }

  static async getWarnings(guildId, targetUserId) {
    const data = await getGuildData(guildId);
    const warnings = data[`warnings:${targetUserId}`];
    return Number.isInteger(warnings) && warnings >= 0 ? warnings : 0;
  }

  static async addWarning(guildId, targetUserId) {
    const data = await getGuildData(guildId);
    const key = `warnings:${targetUserId}`;
    const warnings = await this.getWarnings(guildId, targetUserId);
    const next = warnings + 1;
    data[key] = next;
    await setInDb(getDnrKey(guildId), data);
    return next;
  }

  static async resetWarnings(guildId, targetUserId) {
    const data = await getGuildData(guildId);
    delete data[`warnings:${targetUserId}`];
    await setInDb(getDnrKey(guildId), data);
  }
}

export { DnrService };