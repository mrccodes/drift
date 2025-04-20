// install dat.gui via npm/yarn
import { CONFIG } from './config.js';
export let gui;
export const initGUI = async () => {

  // Get or create a container for the GUI
  let container = document.getElementById('gui-container');

  // create the panel with container as parent
  const newGui = new dat.GUI({ width: 300, autoPlace: false });
  container.appendChild(newGui.domElement);
  newGui.hide(); // start hidden until debug panel toggled

  // physics folder
const physF = newGui.addFolder('Physics');
physF.add(CONFIG.physics, 'friction', 0, 2).step(0.01).name('Friction')
     .onChange(val => console.log(`New friction: ${val}`));
physF.add(CONFIG.physics, 'rollingResistance', 0, 0.1).step(0.001).name('Roll Resist');
physF.add(CONFIG.physics, 'restitution', 0, 1).step(0.01);

// car folder
const carF = newGui.addFolder('Car');
carF.add(CONFIG.car, 'maxSpeed', 0, 50).name('Max Speed');
carF.add(CONFIG.car, 'engineForceMagnitude', -10, 20).name('Engine Force');

// debug options
const debugF = newGui.addFolder('Debug');
debugF.add(CONFIG.debug, 'showDebugPanel').name('Show Panel')
      .onChange(show => show ? newGui.show() : newGui.hide());
debugF.add(CONFIG.debug.physics, 'enabled').name('Phys Debug');
// etc…

// don’t forget to open sub‑folders if you wanna see ’em by default
physF.open();
carF.open();
debugF.open();

gui = newGui; // assign the GUI instance to the variable

// export the GUI instance for use in other modules
return gui;
}

export const toggleGUI = (val = null) => {
      if (gui) {
            if (val !== null) {
                  // if a value is passed, set the visibility based on it
                  if (val) {
                        gui.show();
                  } else {
                        gui.hide();
                  }
                  return;
            }
            // Check if GUI is hidden based on its display style
            const isHidden = gui.domElement.style.display === 'none';
            if (isHidden) {
                  gui.show();
            } else {
                  gui.hide();
            }
      } else {
            console.warn('GUI instance not found');
      }
}

