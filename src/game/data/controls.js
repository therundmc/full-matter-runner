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
  LB: 'Mouse2',    // throw (pick up when the hands are empty)
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

// What the CONTROLS page lists (ui/title/Options.js draws it): two columns of groups, [name, lines], a line
// [caps, action]. caps: the caps drawn, split on spaces ('/' between two of them: either one). A cap is a key's name
// (physical position, AZERTY first), a mouse ('MOUSE', 'LMB', 'RMB') or a pad's button (A B X Y LB RB LT RT LS RS
// DPAD START). Only what the game reads (entities/Player.js, systems/Drive.js and CarGun.js at the wheel, Game.js);
// no debug key.
export const KBM_CONTROLS = [
  [
    ['MOVE', [['ZQSD / WASD', 'MOVE'], ['MOUSE', 'AIM'], ['SHIFT', 'LOOK FURTHER'], ['SPACE', 'VAULT / CLIMB'],
      ['SPACE', 'SLIDE ON THE RUN']]],
    ['FIGHT', [['LMB', 'ATTACK / SHOOT'], ['LMB', 'TAKE DOWN / FINISH'], ['RMB', 'THROW / PICK UP'], ['R', 'RELOAD']]],
    ['WORLD', [['E', 'PICK UP / SWAP'], ['E', 'USE / OPEN TRUNK']]],
  ],
  [
    ['AT THE WHEEL', [['Z/W', 'SPEED UP'], ['S', 'BRAKE'], ['Q/A D', 'STEER'], ['SPACE', 'SHOVE'], ['LMB', 'FIRE THE UZI'],
      ['R', 'RELOAD']]],
    ['GAME', [['ESC', 'PAUSE'], ['BKSP', 'RESTART'], ['R', 'RETRY WHEN DEAD'], ['M', 'MUSIC ON / OFF']]],
  ],
];
// (the pad does not drive yet: Drive.js reads the keys only, so the wheel lists what the pad does there)
export const PAD_CONTROLS = [
  [
    ['MOVE', [['LS', 'MOVE'], ['RS', 'AIM'], ['LT', 'LOOK FURTHER'], ['A', 'VAULT / CLIMB'], ['A', 'SLIDE ON THE RUN']]],
    ['FIGHT', [['RB / RT', 'ATTACK / SHOOT'], ['RB', 'TAKE DOWN / FINISH'], ['LB', 'THROW / PICK UP'], ['Y', 'RELOAD']]],
    ['WORLD', [['X', 'PICK UP / SWAP'], ['X', 'USE / OPEN TRUNK']]],
  ],
  [
    ['AT THE WHEEL', [['A', 'SHOVE'], ['RS', 'AIM THE UZI'], ['RB', 'FIRE THE UZI'], ['Y', 'RELOAD']]],
    ['GAME', [['START', 'PAUSE'], ['A / Y', 'RETRY WHEN DEAD'], ['DPAD', 'MENUS'], ['B', 'BACK']]],
  ],
];
