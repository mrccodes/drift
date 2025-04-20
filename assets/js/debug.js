import { CONFIG, debugLog } from './config.js';
import { gui, toggleGUI } from './gui.js';

// Container for debug meshes
let debugMeshes = [];
let orbitControls = null;
let originalCameraUpdate = null;
// Track if we're using the car camera or free camera
let useCarCamera = true;

/**
 * Creates debug visualization for physics objects
 * @param {THREE.Scene} scene - The Three.js scene
 * @param {Array} physicsObjects - Array of physics objects
 * @param {RAPIER} RAPIER - The RAPIER physics engine
 */
export function createDebugVisualization(scene, physicsObjects, RAPIER, camera, updateCameraFunction) {
  if (!CONFIG.debug.physics.enabled) return;
  // Remove any existing debug meshes
  clearDebugMeshes(scene);
  
  // Set up camera controls if enabled and not already set up
  if (!orbitControls && camera) {
    setupCameraControls(camera, updateCameraFunction);
  }
  
  debugLog("Creating debug visualization for", physicsObjects.length, "objects");
  
  // Create new debug meshes for each physics object
  physicsObjects.forEach(obj => {
    if (!obj.collider) {
      debugLog("Object has no collider:", obj.type);
      return;
    }
    
    const colliderType = getColliderType(obj.collider);
    debugLog("Collider type:", colliderType, "for object type:", obj.type);
    
    const isSensor = obj.collider.isSensor();
    
    // Choose color based on object type
    let color;
    if (isSensor) {
      color = CONFIG.debug.physics.colliderColors.sensor;
    } else if (obj.body && obj.body.isSleeping()) {
      color = CONFIG.debug.physics.colliderColors.sleeping;
    } else {
      color = CONFIG.debug.physics.colliderColors.active;
    }
    
    // Create appropriate debug mesh based on collider type
    let debugMesh;
    switch (colliderType) {
      case 'cuboid':
        const halfExtents = obj.collider.halfExtents();
        debugMesh = createCuboidDebugMesh(halfExtents, color);
        break;
      case 'cylinder':
        const halfHeight = obj.collider.halfHeight();
        const radius = obj.collider.radius();
        debugMesh = createCylinderDebugMesh(halfHeight, radius, color);
        break;
      default:
        debugLog('Unsupported collider type for debug visualization:', colliderType);
        return;
    }
    
    if (debugMesh) {
      // Set the initial position and rotation to match the physics object
      if (obj.body) {
        const pos = obj.body.translation();
        debugMesh.position.set(pos.x, pos.y, pos.z);
        
        const rot = obj.body.rotation();
        debugMesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
      } else if (obj.mesh) {
        // For static objects without bodies (like ground)
        debugMesh.position.copy(obj.mesh.position);
        debugMesh.quaternion.copy(obj.mesh.quaternion);
      }
      
      scene.add(debugMesh);
      debugMeshes.push({ mesh: debugMesh, physicsObj: obj });
      debugLog("Added debug mesh for", obj.type);
    }
  });
  
  // Add ground collider visualization if it's not included in physicsObjects
  const groundObj = physicsObjects.find(o => o.type === 'ground');
  if (!groundObj) {
    addGroundDebugMesh(scene);
  }
}

/**
 * Updates the position and rotation of debug meshes
 */
export function updateDebugVisualization() {
  if (!CONFIG.debug.physics.enabled) return;
  
  // Update orbit controls if they exist
  if (orbitControls) {
    orbitControls.update();
  }
  
  debugMeshes.forEach(debugObj => {
    const physObj = debugObj.physicsObj;
    if (physObj.body) {
      const pos = physObj.body.translation();
      debugObj.mesh.position.set(pos.x, pos.y, pos.z);
      
      const rot = physObj.body.rotation();
      debugObj.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
    }
  });
}

/**
 * Removes all debug meshes from the scene
 * @param {THREE.Scene} scene - The Three.js scene
 */
export function clearDebugMeshes(scene) {
  debugLog("Clearing", debugMeshes.length, "debug meshes");
  debugMeshes.forEach(debugObj => {
    scene.remove(debugObj.mesh);
  });
  debugMeshes = [];
}

/**
 * Adds a debug visualization for the ground
 * @param {THREE.Scene} scene - The Three.js scene
 */
function addGroundDebugMesh(scene) {
  const groundSize = CONFIG.environment.groundSize;
  const halfSize = groundSize / 2;
  const thickness = 0.1;
  
  const geometry = new THREE.BoxGeometry(groundSize, thickness * 2, groundSize);
  const material = createDebugMaterial(0x00ffff); // Cyan for ground
  
  const groundDebugMesh = new THREE.Mesh(geometry, material);
  groundDebugMesh.position.set(0, -thickness, 0);
  
  // The ground plane should be horizontal (x-z plane), not vertical
  // Fix by rotating the mesh to match the actual ground orientation
  groundDebugMesh.rotation.x = -Math.PI/2;
  
  scene.add(groundDebugMesh);
  debugMeshes.push({ 
    mesh: groundDebugMesh, 
    physicsObj: { type: 'ground', body: null } 
  });
  
  debugLog("Added ground debug mesh");
}

/**
 * Determines the type of collider
 * @param {RAPIER.Collider} collider - The RAPIER collider
 * @returns {string} The collider type
 */
function getColliderType(collider) {
  // Try the most reliable methods first
  try {
    // Check if the collider has specific shape properties
    if (collider.halfExtents) return 'cuboid';
    if (collider.radius && collider.halfHeight) return 'cylinder';
    if (collider.radius && !collider.halfHeight) return 'ball';
    
    // Fallback - try to detect shape by examining the shape property if it exists
    if (collider.shape) {
      const shapeType = collider.shape.type;
      if (shapeType === 0) return 'ball';
      if (shapeType === 1) return 'cuboid';
      if (shapeType === 2) return 'cylinder';
    }
    
    // Last resort - check method availability
    if (typeof collider.isCuboid === 'function' && collider.isCuboid()) return 'cuboid';
    if (typeof collider.isCylinder === 'function' && collider.isCylinder()) return 'cylinder';
    if (typeof collider.isBall === 'function' && collider.isBall()) return 'ball';
  } catch (e) {
    debugLog("Error determining collider type:", e);
  }
  
  // Default fallback
  return 'unknown';
}

/**
 * Creates a debug mesh for a cuboid collider
 * @param {Object} halfExtents - The half extents of the cuboid
 * @param {number} color - The color of the debug mesh
 * @returns {THREE.Mesh} The debug mesh
 */
function createCuboidDebugMesh(halfExtents, color) {
  // Ensure we have valid dimensions
  const width = halfExtents?.x * 2 || 1;
  const height = halfExtents?.y * 2 || 1;
  const depth = halfExtents?.z * 2 || 1;
  
  debugLog(`Creating cuboid debug mesh with dimensions: ${width}x${height}x${depth}`);
  
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const material = createDebugMaterial(color);
  return new THREE.Mesh(geometry, material);
}

/**
 * Creates a debug mesh for a cylinder collider
 * @param {number} halfHeight - The half height of the cylinder
 * @param {number} radius - The radius of the cylinder
 * @param {number} color - The color of the debug mesh
 * @returns {THREE.Mesh} The debug mesh
 */
function createCylinderDebugMesh(halfHeight, radius, color) {
  // Ensure we have valid dimensions
  const height = halfHeight * 2 || 1;
  const rad = radius || 0.5;
  
  const geometry = new THREE.CylinderGeometry(rad, rad, height, 16);
  // Rotate to match RAPIER's cylinder orientation (y-axis is up)
  geometry.rotateX(Math.PI / 2);
  
  const material = createDebugMaterial(color);
  return new THREE.Mesh(geometry, material);
}

/**
 * Creates a material for debug meshes
 * @param {number} color - The color of the material
 * @returns {THREE.Material} The debug material
 */
function createDebugMaterial(color) {
  if (CONFIG.debug.physics.showWireframes) {
    return new THREE.MeshBasicMaterial({
      color: color,
      wireframe: true,
      transparent: true,
      opacity: 0.7,
      depthTest: true
    });
  } else {
    return new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.3,
      depthTest: true
    });
  }
}

/**
 * Sets up the camera with orbit controls for debugging
 * @param {THREE.Camera} camera - The camera to control
 * @param {Function} originalUpdateFunction - The original camera update function to restore later
 */
function setupCameraControls(camera, originalUpdateFunction) {
  // Only setup if debug is enabled
  if (!CONFIG.debug.physics.enabled) return;
  
  debugLog("Setting up camera controls for debugging");
  
  // Store the original camera update function for later restoration
  originalCameraUpdate = originalUpdateFunction;
  
  // Create orbit controls
  orbitControls = new THREE.OrbitControls(camera, document.body);
  orbitControls.enableDamping = true;
  orbitControls.dampingFactor = 0.25;
  orbitControls.screenSpacePanning = false;
  orbitControls.maxPolarAngle = Math.PI / 1.5;
  orbitControls.enablePan = true;
  orbitControls.enableZoom = true;
  
  // Initially disable orbit controls since we start with car camera
  orbitControls.enabled = !useCarCamera;
  
  // Add key handler for toggling between orbit and game camera
  document.addEventListener('keydown', handleCameraToggle);
  
  debugLog("Camera controls set up");
}

/**
 * Toggles between orbit controls and game camera
 * @param {KeyboardEvent} event - The keyboard event
 */
function handleCameraToggle(event) {
  if (!CONFIG.debug.physics.enabled) return;
  
  // Toggle with spacebar
  if (event.key === 'c') {
    toggleCameraMode();
    // Prevent scrolling or other default spacebar actions
    event.preventDefault();
  }
}

/**
 * Toggles between car camera and free orbit camera
 */
export function toggleCameraMode() {
  if (!CONFIG.debug.physics.enabled) return;
  
  useCarCamera = !useCarCamera;
  
  if (orbitControls) {
    // Update orbit controls state
    orbitControls.enabled = !useCarCamera;
  }
  
  CONFIG.debug = CONFIG.debug || {};
  CONFIG.debug.useGameCamera = useCarCamera;
  
  debugLog(`Switched to ${useCarCamera ? 'car' : 'free orbit'} camera`);
}

/**
 * Cleans up debug controls when exiting debug mode
 */
export function cleanupDebugControls() {
  if (orbitControls) {
    orbitControls.dispose();
    document.removeEventListener('keydown', handleCameraToggle);
    orbitControls = null;
  }
  
  // Reset camera mode to default
  useCarCamera = true;
  
  // If we stored an original update function, it can be restored elsewhere
}

/**
 * Checks if the game camera should be used instead of orbit controls
 * @returns {boolean} True if game camera should be used
 */
export function shouldUseGameCamera() {
  return !CONFIG.debug.physics.enabled || 
         !orbitControls || 
         useCarCamera;
}


export function initDebugPanel () {
  if (!CONFIG.debug.showDebugPanel) return;
  
  const debugPanel = document.getElementById('debug-container');
  if (!debugPanel) {
    console.warn("Debug panel element not found");
    return;
  }
  
  // Show the debug panel
  debugPanel.style.display = 'block';
  toggleGUI();
  
}