// The controls as data: what each gamepad button stands for, and what to call each action on screen for the device
// in use (engine/Input.js `device`: 'kbm' | 'pad'). Keys are physical positions (e.code): ZQSD on AZERTY.

// gamepad (standard mapping, Xbox names) -> the key or mouse button it plays. The rest is read by name ('PadB',
// 'NavUp'...) where it means something: B goes back in the menus, the sticks move and aim (Game.padAim).
export const PAD_BINDINGS = {
  A: 'Space',      // slide, vault, climb, dive; a menu's ENTER
  X: 'KeyE',       // pick up / swap / open a trunk
  Y: 'KeyR',       // reload; restart once dead; retry on the results
  Start: 'Escape', // pause (and back out of it)
  RT: 'Mouse0',    // attack / shoot / take down / finish
  LT: 'Mouse2',    // throw (pick up when the hands are empty)
  RB: 'ShiftLeft', // look further
};

// the virtual cursor of the right stick: world px from the player, close at a light push, far at a full one
export const PAD_AIM = { near: 70, far: 150, follow: 0.35 }; // follow: s without the right stick before the aim turns to where he walks

// action -> its name on a key cap ('kbm') or a pad's button ('pad'). ui/Glyphs.js draws them.
export const ACTIONS = {
  move: { kbm: 'ZQSD', pad: 'LS' },
  aim: { kbm: 'MOUSE', pad: 'RS' },
  look: { kbm: 'SHIFT', pad: 'RB' },
  attack: { kbm: 'LMB', pad: 'RT' },
  throw: { kbm: 'RMB', pad: 'LT' },
  use: { kbm: 'E', pad: 'X' },
  action: { kbm: 'SPACE', pad: 'A' },
  reload: { kbm: 'R', pad: 'Y' },
  pause: { kbm: 'ESC', pad: 'START' },
  choose: { kbm: 'ARROWS', pad: 'DPAD' },
  confirm: { kbm: 'ENTER', pad: 'A' },
  back: { kbm: 'ESC', pad: 'B' },
  restart: { kbm: 'R', pad: 'A' },
  retry: { kbm: 'R', pad: 'Y' },
};

export const isPad = (device) => device === 'pad';

// the cap of an action for a device; an unknown action is shown as it is written
export const keyLabel = (action, device) => ACTIONS[action]?.[isPad(device) ? 'pad' : 'kbm'] ?? action;

// what the CONTROLS page lists, two columns; a blank key continues the line above
export const KBM_CONTROLS = [
  [['ZQSD/WASD', 'MOVE'], ['MOUSE', 'AIM'], ['SHIFT', 'LOOK FURTHER'], ['LEFT CLICK', 'ATTACK / TAKE DOWN'],
    ['RIGHT CLICK', 'THROW / PICK UP'], ['E', 'PICK UP / SWAP / TRUNK'], ['ESC', 'PAUSE']],
  [['R', 'RELOAD'], ['SPACE', 'VAULT / CLIMB / DIVE'], ['', 'SLIDE WHEN RUNNING'], ['LEFT CLICK', 'FINISH A MAN DOWN'],
    ['BACKSPACE', 'RESTART'], ['M', 'MUSIC ON / OFF'], ['F1 / F2', 'SANDBOX / VISION']],
];
export const PAD_CONTROLS = [
  [['L STICK', 'MOVE'], ['R STICK', 'AIM'], ['RB', 'LOOK FURTHER'], ['RT', 'ATTACK / TAKE DOWN'],
    ['LT', 'THROW / PICK UP'], ['X', 'PICK UP / SWAP / TRUNK'], ['START', 'PAUSE']],
  [['Y', 'RELOAD'], ['A', 'VAULT / CLIMB / DIVE'], ['', 'SLIDE WHEN RUNNING'], ['RT', 'FINISH A MAN DOWN'],
    ['A / Y', 'RESTART WHEN DEAD'], ['D-PAD', 'MENUS'], ['B', 'BACK']],
];
