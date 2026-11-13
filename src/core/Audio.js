const Audio = {
  init() {},
  stopAll() { try { if (window.Howler) Howler.stop(); } catch(e) {} }
};
export default Audio;
