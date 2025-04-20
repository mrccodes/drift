export const controls = { forward: false, reverse: false, left: false, right: false, handbrake: false };

export function setupInput() {
  window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (k==='w') controls.forward = true;
    if (k==='s') controls.reverse = true;
    if (k==='a') controls.left = true;
    if (k==='d') controls.right = true;
    if (k===' ') controls.handbrake = true;
  });
  window.addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    if (k==='w') controls.forward = false;
    if (k==='s') controls.reverse = false;
    if (k==='a') controls.left = false;
    if (k==='d') controls.right = false;
    if (k===' ') controls.handbrake = false;
  });

}
