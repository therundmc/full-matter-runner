// A guard's states (Enemy.setState) and the sets of his pastimes that more than one of his modules
// (entities/enemy/*) reads. DOM-free.
export const S = {
  IDLE: 'idle', PATROL: 'patrol', RETURN: 'return', SUSPICIOUS: 'suspicious', INVESTIGATE: 'investigate', CHECK: 'check',
  SEARCH: 'search', GUARD: 'guard', DIZZY: 'dizzy', COMBAT: 'combat', HUNT: 'hunt', FETCH: 'fetch', FLEE: 'flee',
  YIELD: 'yield', TRACK: 'track', BACKUP: 'backup', CHALLENGE: 'challenge',
};

// at ease (Calm.pickActivity): what takes his mind off his watch, and what is done in one go
export const ABSORBING = new Set(['smoke', 'phone', 'chat', 'piss']);
export const ONE_GO = new Set(['stretch', 'wrist']);

// jobs that leave his eyes free: the doormen, the bartender, the two men smoking against a wall (lookouts more than
// smokers); the others have their eyes on what they do (the pool, cards, the money, the dope, a magazine, the bowl)
export const WATCHFUL = new Set(['door', 'wipe', 'lean', 'alley']);
