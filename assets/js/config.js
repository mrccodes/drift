export const DEBUG = true;
export function debugLog(...args) {
  if (DEBUG) console.log(...args);
}
export const CONFIG = {
  physics: { 
    friction: .75, 
    rollingResistance: 0.015, 
    restitution: 0.2,
    cleanupDelay: 100         // Milliseconds to wait before cleaning up physics bodies
  },
  car: {
    mass: 1000, linearDamping: .2, angularDamping: .1,
    maxSpeed: 25, engineForceMagnitude: 6, reverseForceMagnitude: -4,
    steeringFactor: 0.2, handbrakeDamping: .5, minDampening: 0.5, maxDampening: 1.5, 
  },
  camera: { offset: new THREE.Vector3(0, 5, 10) },
  coins: { 
    spawnInterval: 3000, 
    value: 10, 
    radius: 0.5, 
    height: 0.1, 
    segments: 32,
    forceCleanup: true,       // Force cleanup of coin physics bodies
    keepPhysicsBodyOnGround: false  // Don't keep physics body for ground collision
  },
  level: { 
    pointsToAdvance: 100, 
    boxIncreasePerLevel: 10, 
    maxLevel: 10,
    coinBaseCount: 10,
  },
  environment: { 
    groundSize: 100,
    boundaryCheck: true,      // Enable boundary checking
    boundaryMargin: 5         // Margin from the edge to trigger boundary check
  },
  game: { 
    isOver: false, 
    isFalling: false,
    removeInvisibleObjects: true  // Flag to ensure cleanup of invisible objects
  },
  debug: {
    useGameCamera: true,     // Whether to use the game camera instead of orbit controls
    showDebugPanel: false, // Show debug panel with game stats
    physics: {
      enabled: false,          // Enable physics debug visualization
      showColliders: false,    // Show collider shapes
      showWireframes: false,   // Show wireframes for physics objects
      colliderColors: {
        active: 0x00ff00,     // Green for active colliders
        sleeping: 0x0000ff,   // Blue for sleeping colliders
        sensor: 0xff0000      // Red for sensor colliders
      },
      cameraControls: {
        enabled: true,         // Enable orbit camera controls in debug mode
        zoomSpeed: 1.0,        // Speed of camera zoom
        rotateSpeed: 1.0,      // Speed of camera rotation
        panSpeed: 0.5          // Speed of camera panning
      }
    }
  }
};
