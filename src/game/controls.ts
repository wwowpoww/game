/**
 * Gameplay actions that need the live magnifier (its canvas and position). The gameplay view
 * installs real implementations while it is mounted; voice, keys and Little tools call these.
 */
export interface LockInResult {
  ok: boolean;
  reason?: string;
}

export const controls = {
  lockIn: (): LockInResult => ({ ok: false, reason: "The magnifier isn't available right now." }),
  /** Turn the magnifier on, placing it at the centre if it has never been positioned. */
  activateLens: (): boolean => false,
  moveLens: (_dx: number, _dy: number): void => undefined,
};
