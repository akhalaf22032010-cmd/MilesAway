import { logger } from '../../utils/logger.js';

const dnrByGuild = new Map();
const loadedGuilds = new Set();

function getGuildDnrMap(guildId) {
  if (!dnrByGuild.has(guildId)) dnrByGuild.set(guildId, new Map());
  return dnrByGuild.get(guildId);
}

async function ensureGuildLoaded(client, guildId) {
  if (loadedGuilds.has(guildId)) return;
  const guildMap = getGuildDnrMap(guildId);
  try {
    const stored = await client.db.get(`guild:${guildId}:dnr`, {});
    const data = stored && typeof stored === 'object' ? stored : {};
    for (const [dnrerId, targetIds] of Object.entries(data)) {
      const targetMap = new Map();
      if (Array.isArray(targetIds)) {
        for (const targetId of targetIds) targetMap.set(targetId, 'No reason provided.');
      } else if (targetIds && typeof targetIds === 'object') {
        for (const [targetId, reason] of Object.entries(targetIds)) {
          targetMap.set(targetId, typeof reason === 'string' && reason.trim() ? reason : 'No reason provided.');
        }
      }
      if (targetMap.size > 0) guildMap.set(dnrerId, targetMap);
    }
    loadedGuilds.add(guildId);
  } catch (error) {
    logger.error(`Error loading DNR data for guild ${guildId}:`, error);
    throw error;
  }
}

async function saveGuild(client, guildId) {
  const data = {};
  for (const [dnrerId, targets] of getGuildDnrMap(guildId)) {
    if (targets.size > 0) data[dnrerId] = Object.fromEntries(targets);
  }
  await client.db.set(`guild:${guildId}:dnr`, data);
}

export async function addDnr(client, guildId, dnrerId, targetId, reason = 'No reason provided.') {
  await ensureGuildLoaded(client, guildId);
  const guildMap = getGuildDnrMap(guildId);
  if (!guildMap.has(dnrerId)) guildMap.set(dnrerId, new Map());
  const targets = guildMap.get(dnrerId);
  const alreadyDnr = targets.has(targetId);
  targets.set(targetId, reason.trim() || 'No reason provided.');
  await saveGuild(client, guildId);
  return !alreadyDnr;
}

export async function removeDnr(client, guildId, dnrerId, targetId) {
  await ensureGuildLoaded(client, guildId);
  const guildMap = getGuildDnrMap(guildId);
  const targets = guildMap.get(dnrerId);
  if (!targets) return false;
  const removed = targets.delete(targetId);
  if (targets.size === 0) guildMap.delete(dnrerId);
  if (removed) await saveGuild(client, guildId);
  return removed;
}

export async function clearDnr(client, guildId, dnrerId) {
  await ensureGuildLoaded(client, guildId);
  const guildMap = getGuildDnrMap(guildId);
  const targets = guildMap.get(dnrerId);
  const count = targets?.size || 0;
  if (count > 0) {
    guildMap.delete(dnrerId);
    await saveGuild(client, guildId);
  }
  return count;
}

export async function getDnrList(client, guildId, dnrerId) {
  await ensureGuildLoaded(client, guildId);
  return [...(getGuildDnrMap(guildId).get(dnrerId) || new Map()).keys()];
}

export async function getDnrReason(client, guildId, dnrerId, targetId) {
  await ensureGuildLoaded(client, guildId);
  return getGuildDnrMap(guildId).get(dnrerId)?.get(targetId) || 'No reason provided.';
}

export async function getDnrerIdsForTarget(client, guildId, targetId) {
  await ensureGuildLoaded(client, guildId);
  const dnrerIds = [];
  for (const [dnrerId, targets] of getGuildDnrMap(guildId)) {
    if (targets.has(targetId)) dnrerIds.push(dnrerId);
  }
  return dnrerIds;
}

export async function getLastDnrGif(client, guildId) {
  try { return await client.db.get('guild:' + guildId + ':dnr:lastGif', null); }
  catch (error) { logger.error('Error loading last DNR GIF for guild ' + guildId + ':', error); return null; }
}

export async function setLastDnrGif(client, guildId, gifPage) {
  try { await client.db.set('guild:' + guildId + ':dnr:lastGif', gifPage); }
  catch (error) { logger.error('Error saving last DNR GIF for guild ' + guildId + ':', error); }
}
