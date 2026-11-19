// The controls as data: what each gamepad button stands for, and what to call each action on screen for the device
// in use (engine/Input.js `device`: 'kbm' | 'pad'). Keys are physical positions (e.code): ZQSD on AZERTY.

// gamepad (standard mapping, Xbox names) -> the key or mouse button it plays. The rest is read by name ('PadB',
// 'NavUp'...) where it means something: B goes back in the menus, the sticks move and aim (Game.padAim).
// The fire is on the bumpers (the user's call: a bumper is a plain switch, on the frame it goes down, where a trigger
// has a travel and a threshold to cross); RT still attacks so that nobody used to it is lost, LT looks further.
export const PAD_BINDINGS = {
  A: 'Space',      // slide, vault, climb, dive; a menu's ENTER
  X: 'KeyE',       // pick up / swap / open a trunk
  Y: 'KeyR',       // reload; restart once dead; retry on the results
  Start: 'Escape', // pause (and back out of it)
  RB: 'Mouse0',    // attack / shoot / take down / finish (held: an automatic keeps firing, as the mouse button)
  LB: 'Mouse2',    // throw: held, aimed and let go (pick up when the hands are empty)
  RT: 'Mouse0',    // attack too (an alias of RB)
  LT: 'ShiftLeft', // look further
};

// the virtual cursor of the right stick: world px from the player, close at a light push, far at a full one
export const PAD_AIM = { near: 70, far: 150, follow: 0.35 }; // follow: s without the right stick before the aim turns to where he walks

// action -> its name on a key cap ('kbm') or a pad's button ('pad'). ui/Glyphs.js draws them.
export const ACTIONS = {
  move: { kbm: 'ZQSD', pad: 'LS' },
  aim: { kbm: 'MOUSE', pad: 'RS' },
  look: { kbm: 'SHIFT', pad: 'LT' },
  attack: { kbm: 'LMB', pad: 'RB' },
  throw: { kbm: 'RMB', pad: 'LB' },
  use: { kbm: 'E', pad: 'X' },
  action: { kbm: 'SPACE', pad: 'A' },
  reload: { kbm: 'R', pad: 'Y' },
  pause: { kbm: 'ESC', pad: 'START' },
  confirm: { kbm: 'ENTER', pad: 'A' },
  restart: { kbm: 'R', pad: 'A' },
  retry: { kbm: 'R', pad: 'Y' },
};

const isPad = (device) => device === 'pad';

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
  [['L STICK', 'MOVE'], ['R STICK', 'AIM'], ['RB / RT', 'ATTACK / TAKE DOWN'], ['LB', 'THROW / PICK UP'],
    ['LT', 'LOOK FURTHER'], ['X', 'PICK UP / SWAP / TRUNK'], ['START', 'PAUSE']],
  [['Y', 'RELOAD'], ['A', 'VAULT / CLIMB / DIVE'], ['', 'SLIDE WHEN RUNNING'], ['RB', 'FINISH A MAN DOWN'],
    ['A / Y', 'RESTART WHEN DEAD'], ['D-PAD', 'MENUS'], ['B', 'BACK']],
];
