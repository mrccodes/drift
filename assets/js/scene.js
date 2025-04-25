import { CONFIG, debugLog } from './config.js';
import { createDebugVisualization } from './debug.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.114/examples/jsm/loaders/GLTFLoader.js';

export function createScene(
    world, 
    scene, 
    physicsObjects,
    carMesh, 
    carBody, 
    carCollider,
    level,
    obstacleBoxes,
    isLoading,
    RAPIER) {
  // Ground
  isLoading.level = true;
  const groundGeo = new THREE.PlaneGeometry(CONFIG.environment.groundSize, CONFIG.environment.groundSize);
  const groundMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
  const groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.rotation.x = -Math.PI/2; // Note this rotation - ground is rotated to be horizontal
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);

  const halfSize = CONFIG.environment.groundSize / 2;
  const thickness = 0.1;  // how "thick" the ground box is

  // Visual ground is PlaneGeometry(GROUND, GROUND), y=0
  const groundColliderDesc = RAPIER.ColliderDesc
    .cuboid(halfSize, thickness, halfSize)     // X half‑extent, Y half‑extent, Z half‑extent
    .setTranslation(0, -thickness, 0)          // sink it so its top face is at y=0
    .setFriction(CONFIG.physics.friction);

  // Create a fixed rigid body for the ground
  const groundBodyDesc = RAPIER.RigidBodyDesc.fixed()
    .setTranslation(0, -thickness, 0);
  const groundBody = world.createRigidBody(groundBodyDesc);

  // Create the ground collider and attach it to the fixed body
  const groundCollider = world.createCollider(groundColliderDesc, groundBody);

  // Add ground to physics objects for debugging
  physicsObjects.push({ 
    mesh: groundMesh, 
    body: groundBody, 
    collider: groundCollider, 
    type: 'ground' 
  });

  // Skybox 
  const skyGeo = new THREE.BoxGeometry(1000, 1000, 1000);
  const skyMat = new THREE.MeshBasicMaterial({ color: 0x87CEEB, side: THREE.BackSide });
  const skyMesh = new THREE.Mesh(skyGeo, skyMat);
  scene.add(skyMesh);

  // Tire tracks system
  const tireTracksSystem = createTireTracksSystem(scene);

  // Car - using GLTF model instead of a box
  isLoading.car = true; 
  const carSize = { width: 2, height: 1, length: 4 }; // Default size for physics
  const carGroup = new THREE.Group(); // Group to hold the car model
  carGroup.position.set(0, 1.0, 0); // Slightly lower than the box was
  carGroup.rotation.y = Math.PI/2;
  scene.add(carGroup);
  
  // Create temporary mesh for physics until model loads
  const tempCarGeo = new THREE.BoxGeometry(carSize.width, carSize.height, carSize.length);
  const tempCarMat = new THREE.MeshPhongMaterial({ 
    color: 0xff0000,
    transparent: true,
    opacity: CONFIG.debug.physics.enabled ? 0.3 : 0 // Only show if debug is on
  });
  carMesh = new THREE.Mesh(tempCarGeo, tempCarMat);
  carMesh.position.copy(carGroup.position);
  carMesh.rotation.copy(carGroup.rotation);
  carMesh.castShadow = true;
  carMesh.receiveShadow = true;
  carGroup.add(carMesh); // Add to group for easier management
  
  // Load GLTF model
  const loader = new GLTFLoader();
  loader.load('./assets/car/scene.gltf', function(gltf) {
    debugLog("Car model loaded successfully");
    isLoading.car = false;
    // Prepare the model
    const model = gltf.scene;
    
    // Scale and position the model to fit our physics
    model.scale.set(0.75, 0.75, 0.75); // Adjust scale as needed
    model.position.set(0, -0.5, 0); // Adjust position inside group
    model.rotation.y = Math.PI; // Adjust rotation if needed
    
    // Apply shadows to all meshes in the model
    model.traverse(function(node) {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
    
    // Add the model to our car group
    carGroup.add(model);
    
    // Hide the temporary mesh if debug is off
    if (!CONFIG.debug.physics.enabled) {
      tempCarMat.opacity = 0;
    }
    
    isLoading.car = false;
    isLoading.level = false;
  }, 
  // Progress callback
  function(xhr) {
    debugLog("Car model loading: " + (xhr.loaded / xhr.total * 100) + "%");
  },
  // Error callback
  function(error) {
    console.error("Error loading car model:", error);
    // Keep using the box mesh if model fails to load
    tempCarMat.opacity = 1;
  });
  
  // Setup physics for the car
  const carBodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(carGroup.position.x, carGroup.position.y, carGroup.position.z)
    .setLinearDamping(CONFIG.car.linearDamping)
    .setAngularDamping(CONFIG.car.angularDamping);
  carBody = world.createRigidBody(carBodyDesc);

  const carColliderDesc = RAPIER.ColliderDesc.cuboid(
    carSize.width/2, carSize.height/2, carSize.length/2
  )
    .setFriction(CONFIG.physics.friction)
    .setRestitution(CONFIG.physics.restitution)
    .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Average);
  carCollider = world.createCollider(carColliderDesc, carBody);
  carCollider.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);

  physicsObjects.push({ 
    mesh: carGroup, // Use the group for physics updates
    body: carBody, 
    collider: carCollider, 
    type: 'car' 
  });

  groundCollider.setFriction(3.0);

  ({
    world, scene, physicsObjects,
} = createObstacles(
    RAPIER, 
    world, 
    scene, 
    physicsObjects,
    obstacleBoxes,
    isLoading,
    level
  ));

  // Boundary Box
  ({ 
    scene
  } = createBoundaryBox(scene));


  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.3));
  const dirLight = new THREE.DirectionalLight(0xffffff,1);
  dirLight.position.set(5,10,7.5);
  scene.add(dirLight);



  return { 
    scene, 
    carMesh: carGroup, // Return the group instead of just the mesh
    carBody, 
    carCollider,
    groundMesh,
    groundCollider,
    physicsObjects,
    level,
    tireTracksSystem
 };


}

function createBoundaryBox(scene) {
    const B = 100, H = 10;
    const boxGeo = new THREE.BoxGeometry(B, H, B);
    // grab just the edges
    const edges = new THREE.EdgesGeometry(boxGeo);
    const lineMat = new THREE.LineBasicMaterial({ linewidth: 1 });
    const fence = new THREE.LineSegments(edges, lineMat);
    // lift it so the bottom sits on the ground
    fence.position.set(0, H/2, 0);
    scene.add(fence);

    return { scene };
}




export function createObstacles(RAPIER, world, scene, physicsObjects, obstacleBoxes, isLoading, level=1) {
    isLoading.obstacles = true;
    const count = level * CONFIG.level.boxIncreasePerLevel;
    for (let i=0; i<count; i++) {
        const boxGeo = new THREE.BoxGeometry(1,1,1);
        const boxMat = new THREE.MeshPhongMaterial({ color: Math.random()*0xffffff });
        const boxMesh = new THREE.Mesh(boxGeo, boxMat);
        const posX = (Math.random()-0.5)*100;
        const posZ = (Math.random()-0.5)*100;
        boxMesh.position.set(posX,0.5,posZ);
        scene.add(boxMesh);
        
        const boxBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(posX,0.5,posZ);
        const boxBody = world.createRigidBody(boxBodyDesc);
        const boxColliderDesc = RAPIER.ColliderDesc.cuboid(0.5,0.5,0.5)
        .setFriction(CONFIG.physics.friction)
        .setRestitution(CONFIG.physics.restitution);
        const boxCollider = world.createCollider(boxColliderDesc, boxBody);
        boxCollider.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
        
        const obs = { mesh: boxMesh, body: boxBody, collider: boxCollider, type: 'obstacle' };
        physicsObjects.push(obs);
        obstacleBoxes.push(obs);
        
    }
    
    // Refresh debug visualization after creating obstacles
    // Use setTimeout to ensure all physics objects are properly initialized
    if (CONFIG.debug.physics.enabled) {
        debugLog("Updating debug visualization after creating obstacles");
        setTimeout(() => createDebugVisualization(scene, physicsObjects, RAPIER), 50);
    }
    
    document.getElementById('obstacles').textContent = `Number of obstacles: ${obstacleBoxes.length}`;
    isLoading.obstacles = false;
    return {
        world, scene, physicsObjects,
    };
}

// Function to create the tire tracks system
function createTireTracksSystem(
  scene,
) {
  const tireTracksSystem = {
    tracks: [],
    maxTracks: 1000, // Maximum number of track segments to keep
    material: new THREE.LineBasicMaterial({ 
      color: 0x111111, // Darker color for better visibility
      linewidth: 3, 
      opacity: 0.7, 
      transparent: true 
    }),
    lastLeftPos: null,
    lastRightPos: null,
    
    // Add a new tire track segment
    addTrack: function(position, rotation, width = 1.8) {
      // Calculate wheel positions based on car position and rotation
      const leftWheelOffset = new THREE.Vector3(-width/2, 0.05, -1); // offset for rear wheels
      const rightWheelOffset = new THREE.Vector3(width/2, 0.05, -1);
      
      // Apply car's rotation to wheel offsets
      leftWheelOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation.y);
      rightWheelOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation.y);
      
      // Calculate actual wheel positions
      const leftWheelPos = new THREE.Vector3(
        position.x + leftWheelOffset.x,
        0.05, // Just above ground
        position.z + leftWheelOffset.z
      );
      
      const rightWheelPos = new THREE.Vector3(
        position.x + rightWheelOffset.x,
        0.05, // Just above ground
        position.z + rightWheelOffset.z
      );
      
      // Create left wheel track
      if (this.lastLeftPos) {
        if (this.lastLeftPos.distanceTo(leftWheelPos) > 0.2) { // Only add if moved enough
          this.createTrackSegment(this.lastLeftPos, leftWheelPos, true);
          this.lastLeftPos = leftWheelPos.clone();
        }
      } else {
        // Initialize position
        this.lastLeftPos = leftWheelPos.clone();
      }
      
      // Create right wheel track
      if (this.lastRightPos) {
        if (this.lastRightPos.distanceTo(rightWheelPos) > 0.2) { // Only add if moved enough
          this.createTrackSegment(this.lastRightPos, rightWheelPos, false);
          this.lastRightPos = rightWheelPos.clone();
        }
      } else {
        // Initialize position
        this.lastRightPos = rightWheelPos.clone();
      }
      
      // Remove oldest tracks if we have too many
      while (this.tracks.length > this.maxTracks) {
        const oldestTrack = this.tracks.shift();
        scene.remove(oldestTrack.line);
      }
      
      // Fade out older tracks
      this.fadeOldTracks();
    },
    
    createTrackSegment: function(startPoint, endPoint, isLeftWheel) {
      try {
        // Create a simple line for the track - fixed the geometry creation
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array([
          startPoint.x, startPoint.y, startPoint.z,
          endPoint.x, endPoint.y, endPoint.z
        ]);
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        const material = this.material.clone();
        const line = new THREE.Line(geometry, material);
        
        // Ensure the line is just above the ground to avoid z-fighting
        line.position.y = 0.02;
        scene.add(line);
        
        this.tracks.push({
          line: line,
          points: [startPoint.clone(), endPoint.clone()],
          isLeftWheel: isLeftWheel,
          age: 0
        });
      } catch (error) {
        console.error("Error creating track segment:", error);
      }
    },
    
    fadeOldTracks: function() {
      for (let i = 0; i < this.tracks.length; i++) {
        const track = this.tracks[i];
        track.age++;
        
        // Fade out gradually
        const opacity = Math.max(0, 0.7 - (track.age / this.maxTracks) * 0.7);
        track.line.material.opacity = opacity;
        
        // If almost fully transparent, remove it
        if (opacity < 0.05) {
          scene.remove(track.line);
          this.tracks.splice(i, 1);
          i--;
        }
      }
    },
    
    // Update the tire tracks - call this in the animation loop
    update: function(carMesh, carVelocity) {
      try {
        // Check that we have valid parameters
        if (!carMesh || !carMesh.position || !carMesh.rotation) {
          console.error("Invalid car mesh passed to tire tracks update");
          return;
        }
        
        // Only add tracks if the car is moving at a sufficient velocity
        const speed = Math.sqrt(carVelocity.x * carVelocity.x + carVelocity.z * carVelocity.z);
        
        // Lower threshold for more visible tracks
        if (speed > 1) { // Lower minimum speed threshold
          this.addTrack(carMesh.position, carMesh.rotation);
        }
      } catch (error) {
        console.error("Error updating tire tracks:", error);
      }
    }
  };

  return tireTracksSystem;
}

// Helper function to update buffer attribute in newer Three.js versions
function updateBufferGeometryAttribute(geometry, name, array) {
  if (geometry.setAttribute) {
    geometry.setAttribute(name, new THREE.BufferAttribute(array, 3));
  } else {
    geometry.setAttribute(name, new THREE.BufferAttribute(array, 3));
  }
  return geometry;
}

// Update the createTrackSegment method to handle both old and new Three.js versions
function createTrackSegment(startPoint, endPoint, isLeftWheel, scene, material, tracks) {
  try {
    // Create a simple line for the track - compatible with both old and new Three.js
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array([
      startPoint.x, startPoint.y, startPoint.z,
      endPoint.x, endPoint.y, endPoint.z
    ]);
    
    // Use the helper function to handle version differences
    updateBufferGeometryAttribute(geometry, 'position', positions);
    
    const lineMaterial = material.clone();
    const line = new THREE.Line(geometry, lineMaterial);
    
    // Ensure the line is just above the ground to avoid z-fighting
    line.position.y = 0.02;
    scene.add(line);
    
    tracks.push({
      line: line,
      points: [startPoint.clone(), endPoint.clone()],
      isLeftWheel: isLeftWheel,
      age: 0
    });
  } catch (error) {
    console.error("Error creating track segment:", error);
  }
}