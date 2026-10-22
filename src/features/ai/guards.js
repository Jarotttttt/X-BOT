export function isGroupMessageTargetingBot(unwrapped, credentials, normalizeJid) {
  const contextInfo =
    unwrapped?.extendedTextMessage?.contextInfo ||
    unwrapped?.imageMessage?.contextInfo ||
    unwrapped?.videoMessage?.contextInfo;

  const meJid = credentials?.meJid ? normalizeJid(credentials.meJid) : null;
  const meLid = credentials?.meLid ? normalizeJid(credentials.meLid) : null;
  const mentioned = (contextInfo?.mentionedJid || []).map(normalizeJid);
  const participantQuoted = contextInfo?.participant
    ? normalizeJid(contextInfo.participant)
    : null;

  const matches = (candidate, identity) => {
    if (!candidate || !identity) return false;
    if (candidate === identity) return true;
    const [candidateUser, candidateServer] = candidate.split("@");
    const [identityUser, identityServer] = identity.split("@");
    return candidateServer === identityServer &&
      candidateUser.split(":")[0] === identityUser.split(":")[0];
  };
  const identities = [meJid, meLid].filter(Boolean);

  return [...mentioned, participantQuoted].some((candidate) =>
    identities.some((identity) => matches(candidate, identity)),
  );
}

export function createGenerationTracker() {
  const generations = new Map();
  let sequence = 0;

  return {
    next(key) {
      const generation = ++sequence;
      generations.set(key, generation);
      if (generations.size > 1000) {
        const oldestKey = generations.keys().next().value;
        if (oldestKey !== undefined && oldestKey !== key) generations.delete(oldestKey);
      }
      return generation;
    },
    isCurrent(key, generation) {
      return generations.get(key) === generation;
    },
  };
}
