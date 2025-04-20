import * as sceneModule from './scene.js';
import { CONFIG, debugLog } from './config.js';
import { updateCarPhysics, updatePhysicsObjects } from './physics.js';
import { controls, setupInput } from './controls.js';
import { createScene } from './scene.js';
import { 
  createDebugVisualization, 
  updateDebugVisualization, 
  clearDebugMeshes, 
  shouldUseGameCamera,
  initDebugPanel
} from './debug.js';
let scene, camera, renderer, world, eventQueue, physicsObjects=[], coins=[], obstacleBoxes=[];
let restartKeyListener, RAPIER, carMesh, carCollider, carBody, coinSpawnTimer, points=0, level=1;
let tireTracksSystem; // Add this variable to store the tire tracks system

export function initGame(rapier) {
    scene = new THREE.Scene();
    RAPIER = rapier; // Store RAPIER globally for use in other modules
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);
     // Physics
     world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
     eventQueue = new RAPIER.EventQueue(true);

     resetGame();
     ({ 
        scene, 
        carMesh, 
        carBody, 
        carCollider,
        physicsObjects,
        level,
        tireTracksSystem, // Make sure we capture tireTracksSystem here
     } = sceneModule.createScene(world, scene, physicsObjects, carMesh, carBody, carCollider, level, obstacleBoxes, RAPIER));

     camera.position.set(0, 5, -10);
     camera.lookAt(carMesh.position);
     if (CONFIG.debug.showDebugPanel) {
         initDebugPanel();
     }
     // Initialize debug visualization if enabled
     if (CONFIG.debug.physics.enabled) {
       debugLog("Initializing debug visualization");
       // Delay debug creation slightly to ensure all physics objects are ready
       setTimeout(() => createDebugVisualization(
         scene, 
         physicsObjects, 
         RAPIER, 
         camera, 
         updateCamera
       ), 100);
     }

     window.addEventListener("resize", onWindowResize);
     document.querySelector('#restart-button').addEventListener('click', restartGame);

     setupInput();
     startCoinSpawning();
     animate(); // Don't pass tireTracksSystem as an argument

}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

function animate() {
  requestAnimationFrame(animate);
  if (!CONFIG.game.isOver || (CONFIG.game.isOver && CONFIG.game.isFalling)) {
    world.step(eventQueue);
    updateCarPhysics(carBody, carMesh, level, controls, tireTracksSystem);
    
    
    // 👉 BOUNDARY CHECK 👈
    const pos = carBody.translation(); // [x, y, z]
    const half = CONFIG.environment.groundSize / 2;
    if (Math.abs(pos.x) > half || Math.abs(pos.z) > half) {
        // it’s off the bleedin’ map
        gameOver({falling: true});
    }

    eventQueue.drainCollisionEvents((handle1, handle2) => {
        
        // Find objects that own these colliders
        const obj1 = physicsObjects.find(o => o.collider && o.collider.handle === handle1);
        const obj2 = physicsObjects.find(o => o.collider && o.collider.handle === handle2);

        console.log(`Collision detected: ${obj1.type} with ${obj2.type}`);
        
        if (!obj1 || !obj2) return;
        // Handle car collisions
        if (obj1.type === 'car' || obj2.type === 'car') {
          const otherObj = obj1.type === 'car' ? obj2 : obj1;
          // Handle based on type
          if (otherObj.type === 'coin' && !otherObj.collected) {
            collectCoin(otherObj);
          } else if (otherObj.type === 'obstacle') {
            gameOver({falling: false});
          }
        }
      });
  }
  // Update physics objects first
  updatePhysicsObjects(world, physicsObjects);
  
  // Then update debug visualization
  if (CONFIG.debug.physics.enabled) {
    updateDebugVisualization();
  }
  
  coins.forEach(c => {
    // rotate 0.1 radians per frame (tweak speed as you like)
    c.mesh.rotation.z += 0.1;
  });
  updateCamera();
  renderer.render(scene, camera);
}

export function startCoinSpawning() {
    coinSpawnTimer = setInterval(spawnCoin, CONFIG.coins.spawnInterval);
    Array.from({length: 5}).forEach(() => {
        spawnCoin();
    });
}
export function updateCamera() {
  // If we're using debug orbit controls, skip the game camera update
  if (!shouldUseGameCamera()) return;
  
  const offset = CONFIG.camera.offset.clone().applyQuaternion(carMesh.quaternion);
  camera.position.copy(carMesh.position).add(offset);
  camera.lookAt(carMesh.position);
}

export function gameOver({ falling = false }) {
  if (CONFIG.game.isOver) return;
  CONFIG.game.isOver = true;
  CONFIG.game.isFalling = falling;
  console.log("GAME OVER!");
  document.getElementById('game-over').style.display = 'block';
  document.getElementById('restart-button').style.display = 'block';
  clearInterval(coinSpawnTimer);

  restartKeyListener = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
          restartGame();
      }
  };
  window.addEventListener('keydown', restartKeyListener);
}
export function restartGame() {
  if (restartKeyListener) {
      window.removeEventListener('keydown', restartKeyListener);
      restartKeyListener = null;
  }

  clearInterval(coinSpawnTimer);
  resetGame();
  ({
      scene,
      carMesh,
      carBody,
      carCollider,
      physicsObjects,
      level,
      tireTracksSystem, // Make sure we capture tireTracksSystem here too
  } = createScene(world, scene, physicsObjects, carMesh, carBody, carCollider, level, obstacleBoxes, RAPIER));
  startCoinSpawning();

  if (CONFIG.debug.physics.enabled) {
      createDebugVisualization(scene, physicsObjects, RAPIER);
  }
}

export function resetGame() {
    points = 0;
    level = 1;
    CONFIG.game.isOver = false;
    document.getElementById('points').textContent = `${points}`;
    document.getElementById('level').textContent = `Level ${level}`;
    document.getElementById('game-over').style.display = 'none';
    document.getElementById('restart-button').style.display = 'none';

    physicsObjects.length = 0;
    coins.length = 0;
    obstacleBoxes.length = 0;

    if (scene) {
      // Clear debug meshes when resetting the game
      if (CONFIG.debug.physics.enabled) {
        clearDebugMeshes(scene);
      }
      while (scene.children.length > 0) scene.remove(scene.children[0]);
    }
  }

export function spawnCoin() {
    const coinLimit = CONFIG.level.coinBaseCount * level;
    if (CONFIG.game.isOver || coins.length > coinLimit) return;
    const coinGeo = new THREE.CylinderGeometry(
      CONFIG.coins.radius,
      CONFIG.coins.radius,
      CONFIG.coins.height,
      CONFIG.coins.segments
    );
    coinGeo.rotateX(Math.PI/2);

    const coinMat = new THREE.MeshStandardMaterial({
      color: 0xFFD700, metalness: 0.8, roughness: 0.2,
      emissive: 0xAA8800, emissiveIntensity: 0.5
    });
    const coinMesh = new THREE.Mesh(coinGeo, coinMat);

    let posX, posZ, dist;
    do {
      posX = (Math.random()-0.5)*80;
      posZ = (Math.random()-0.5)*80;
      dist = Math.sqrt(posX*posX + posZ*posZ);
    } while (dist < 10);
    coinMesh.position.set(posX,0.5,posZ);


    
    scene.add(coinMesh);
    
    const coinBodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(posX, 0.5, posZ)
        .setGravityScale(0)
        .setCanSleep(false)         // keep it awake so it keeps spin’n
        // .setAngularDamping(0)       // zero damping so it won’t slow down
        .setAngvel({ x: 0, y: 1.5, z: 0 });  

    const coinBody = world.createRigidBody(coinBodyDesc);

    // 2) Physics collider (non-sensor) so coin rests on the ground
    world.createCollider(
        RAPIER.ColliderDesc.cylinder(
        CONFIG.coins.height/2,
        CONFIG.coins.radius
        )
        .setFriction(CONFIG.physics.friction)
        .setRestitution(CONFIG.physics.restitution),
        coinBody
    );


    // sensor COLLIDER for pickups:
    const sensorDesc = RAPIER.ColliderDesc.cylinder(CONFIG.coins.height/2, CONFIG.coins.radius)
    .setSensor(true)
    .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);

    const sensorCollider = world.createCollider(sensorDesc, coinBody); 

    scene.add(coinMesh);

    coins.push({ mesh: coinMesh, body: coinBody, sensor: sensorCollider, collected: false });

    // Add to physics objects
    physicsObjects.push({
        mesh: coinMesh,
        body: coinBody,
        collider: sensorCollider,
        type: 'coin'
    });
    const coinsUntilNextLevel = ((CONFIG.level.pointsToAdvance * level ) - points) / 10;
    document.getElementById('coins-remaining').textContent = `Coins until level-up: ${coinsUntilNextLevel}`;

    // Update debug visualization when adding new physics objects
    if (CONFIG.debug.physics.enabled) {
      setTimeout(() => createDebugVisualization(scene, physicsObjects, RAPIER), 50);
    }
  }

export  function renderPlusTen() {
    const plusTen = document.getElementById('plus-ten');
    plusTen.style.display = 'block';
    setTimeout(() => {
      plusTen.style.display = 'none';
    }, 1000);
}

export function collectCoin(
coin,
) {
    coin.collected = true;
    scene.remove(coin.mesh);
    points += CONFIG.coins.value;
    document.getElementById('points').textContent = `${points}`;
    renderPlusTen();
    if (points >= level * CONFIG.level.pointsToAdvance && level < CONFIG.level.maxLevel) levelUp();

    setTimeout(() => {
      const ci = coins.indexOf(coin);
      if (ci !== -1) coins.splice(ci,1);
      const pi = physicsObjects.indexOf(coin);
      if (pi !== -1) physicsObjects.splice(pi,1);
      world.removeRigidBody(coin.body);
      
      // Refresh debug visualization after removing a physics object
      if (CONFIG.debug.physics.enabled) {
        createDebugVisualization(scene, physicsObjects, RAPIER);
      }
    }, 0);

    const coinsUntilNextLevel = ((CONFIG.level.pointsToAdvance * level) - points)  / 10;
    document.getElementById('coins-remaining').textContent = `Coins until level-up: ${coinsUntilNextLevel}`;
  }

export function levelUp() {
    level++;
 
    document.getElementById('level').textContent = `Level ${level}`;
    ({ world, scene, physicsObjects,
    } = sceneModule.createObstacles(
        RAPIER, 
        world, 
        scene, 
        physicsObjects, 
        obstacleBoxes,
        level, 
    ));
    
    // Refresh debug visualization after level up
    if (CONFIG.debug.physics.enabled) {
      setTimeout(() => createDebugVisualization(scene, physicsObjects, RAPIER), 50);
    }
  }

