import { getFromDb, setInDb } from '../../utils/database.js';

function getDnrKey(guildId) {
  return `guild:${guildId}:dnr`;
}

async function getGuildData(guildId) {
  const data = await getFromDb(getDnrKey(guildId), {});
  return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
}

class DnrService {
  static async addDnr(guildId, dnrerId, targetUserId) {
    const data = await getGuildData(guildId);
    const current = Array.isArray(data[dnrerId]) ? data[dnrerId] : [];

    if (!current.includes(targetUserId)) current.push(targetUserId);
    data[dnrerId] = current;

    await setInDb(getDnrKey(guildId), data);
    return current;
  }

  static async removeDnr(guildId, dnrerId, targetUserId) {
    const data = await getGuildData(guildId);
    const current = Array.isArray(data[dnrerId]) ? data[dnrerId] : [];
    const updated = current.filter(id => id !== targetUserId);

    if (updated.length) data[dnrerId] = updated;
    else delete data[dnrerId];

    await setInDb(getDnrKey(guildId), data);
    return current.length !== updated.length;
  }

  static async getDnredUsers(guildId, dnrerId) {
    const data = await getGuildData(guildId);
    return Array.isArray(data[dnrerId]) ? data[dnrerId] : [];
  }

  static async getDnrerForUser(guildId, targetUserId) {
    const data = await getGuildData(guildId);
    return Object.entries(data)
      .filter(([dnrerId, targets]) => Array.isArray(targets) && targets.includes(targetUserId))
      .map(([dnrerId]) => dnrerId);
  }
}

export { DnrService };
