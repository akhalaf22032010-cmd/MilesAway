const dnrByGuild = new Map();

function getGuildDnrMap(guildId) {
  if (!dnrByGuild.has(guildId)) dnrByGuild.set(guildId, new Map());
  return dnrByGuild.get(guildId);
}

export function addDnr(guildId, dnrerId, targetId) {
  const guildMap = getGuildDnrMap(guildId);
  if (!guildMap.has(dnrerId)) guildMap.set(dnrerId, new Set());
  guildMap.get(dnrerId).add(targetId);
}

export function removeDnr(guildId, dnrerId, targetId) {
  const guildMap = getGuildDnrMap(guildId);
  const targets = guildMap.get(dnrerId);
  if (!targets) return false;

  const removed = targets.delete(targetId);
  if (targets.size === 0) guildMap.delete(dnrerId);
  return removed;
}

export function clearDnr(guildId, dnrerId) {
  const guildMap = getGuildDnrMap(guildId);
  const targets = guildMap.get(dnrerId);
  const count = targets?.size || 0;
  guildMap.delete(dnrerId);
  return count;
}

export function getDnrList(guildId, dnrerId) {
  const guildMap = getGuildDnrMap(guildId);
  return [...(guildMap.get(dnrerId) || new Set())];
}

export function isDnrredBy(guildId, dnrerId, targetId) {
  const guildMap = dnrByGuild.get(guildId);
  return guildMap?.get(dnrerId)?.has(targetId) || false;
}

export function getDnrerIdsForTarget(guildId, targetId) {
  const guildMap = dnrByGuild.get(guildId);
  if (!guildMap) return [];

  const dnrerIds = [];
  for (const [dnrerId, targets] of guildMap) {
    if (targets.has(targetId)) dnrerIds.push(dnrerId);
  }
  return dnrerIds;
}
