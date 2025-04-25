import { CONFIG } from "./config.js";

export function updatePhysicsObjects(world, physicsObjects) {
    physicsObjects.forEach(o => {
      // Skip objects that don't have bodies (like some static elements)
      if (!o.body || !o.mesh) return;
      
      try {
        const pos = o.body.translation();
        o.mesh.position.set(pos.x, pos.y, pos.z);
        
        const r = o.body.rotation();
        o.mesh.quaternion.set(r.x, r.y, r.z, r.w);
        
        // Special case for ground which should maintain its initial rotation
        if (o.type === 'ground') {
          o.mesh.rotation.x = -Math.PI/2;
        }
      } catch (err) {
        console.error("Error updating physics object:", err);
      }
    });
}

function getCarMaxSpeed(level) {
  const base = 1.0; 
  const step = 0.25;      // how much to add per level
  const cap  = 2.0;       // don’t exceed this multiplier

  const multiplier = Math.min(base + (level - 1) * step, cap);
  const maxSpeed = CONFIG.car.maxSpeed * multiplier;
  return maxSpeed;
}

export function updateCarPhysics(carBody, carMesh, level, controls, tireTracksSystem) {
    if (!carBody || (CONFIG.game.isOver && !CONFIG.game.isFalling)) return;
    // Reset tire tracks if handbrake is not engaged
    if (!controls.handbrake) {
      tireTracksSystem.lastLeftPos = null;
      tireTracksSystem.lastRightPos = null;
    }
    const lin = carBody.linvel();    
    const linVel = carBody.linvel();
    const linVelVec = new THREE.Vector3(lin.x, 0, lin.z);
    const absVel = linVelVec.length();  // magnitude of speed
    const rot = carBody.rotation();
    const quat = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
    const forwardDir = new THREE.Vector3(0, 0, -1).applyQuaternion(quat);
    const maxSpeed = getCarMaxSpeed(level);
    const speed = Math.sqrt(linVel.x*linVel.x + linVel.z*linVel.z);
  
    let force = new THREE.Vector3();
    if (controls.handbrake) {
      const handbrakeForce = (-CONFIG.car.handbrakeDamping) * 0.2;
      carBody.addForce({
        x: handbrakeForce * (linVel.x / speed),
        y: 0,
        z: handbrakeForce * (linVel.z / speed)
      }, true);

      if (absVel < 0.2) {
        // Slam the brakes: kill off any lingering velocity
        carBody.setLinvel({ x: 0, y: 0, z: 0 });
      }

    } else
    if (controls.forward && absVel < maxSpeed) {
      force.add(forwardDir.clone().multiplyScalar(CONFIG.car.engineForceMagnitude));
    } else
    if (controls.reverse && absVel < maxSpeed) {
      force.add(forwardDir.clone().multiplyScalar(CONFIG.car.reverseForceMagnitude));
    } 
    if (force.length() > 0) {
      force.multiplyScalar(1 - CONFIG.physics.rollingResistance);
      carBody.addForce({ x: force.x, y: force.y, z: force.z }, true);
    } else {
      carBody.resetForces();
    }

    // Steering & drift damping
    if ((controls.left||controls.right) && speed>0.2) {
      const steer = (controls.left?1:0) - (controls.right?1:0);
      const torque = steer * CONFIG.car.steeringFactor * speed;
      carBody.applyTorqueImpulse({x:0,y:torque,z:0}, true);
    }
    const forwardSpeed = forwardDir.dot(new THREE.Vector3(linVel.x,0,linVel.z));
    let lateral = new THREE.Vector3(linVel.x,0,linVel.z)
      .sub(forwardDir.clone().multiplyScalar(forwardSpeed));
    const damp = controls.handbrake ? CONFIG.car.handbrakeDamping : getDampingFactor(speed);

    lateral.multiplyScalar(-damp);
    carBody.applyImpulse({ x: lateral.x, y: 0, z: lateral.z }, true);

       // Get car velocity for tire tracks
    const carVelocity = carBody.linvel();
    
    // Update tire tracks with proper parameters - passing the mesh object now
    if (tireTracksSystem) {
      tireTracksSystem.update(
        carMesh, // Pass the entire mesh object
        {x: carVelocity.x, z: carVelocity.z}
      );
    }

  }

  function getDampingFactor(speed) {
    const minDamp = CONFIG.car.minDampening, maxDamp = CONFIG.car.maxDampening;
    const t = Math.min(speed / CONFIG.car.maxSpeed, 1);
    return minDamp + (maxDamp - minDamp) * t;
  }

  export function removePhysicsObjects(physicsObjects, world, coins) {
    if (world) {
      physicsObjects.forEach(obj => {
        // Remove colliders first
        if (obj.collider) {
            try {
                world.removeCollider(obj.collider, true); // true to also remove contacts
            } catch (e) {
                console.warn("Could not remove collider:", e);
            }
        }
        
        // Then remove rigid bodies
        if (obj.body) {
              try {
                  world.removeRigidBody(obj.body);
              } catch (e) {
                  console.warn("Could not remove body:", e);
              }
          }
      });
      
      // For coins, handle their additional colliders
      coins.forEach(coin => {
          if (coin.sensor && !coin.collected) {
              try {
                  world.removeCollider(coin.sensor, true);
              } catch (e) {
                  console.warn("Could not remove coin sensor:", e);
              }
          }
      });
  }
}