/**
 * CarPhysics class handles the physics simulation for car movement in the racing game.
 * Combines realistic physics with arcade-style handling for better gameplay.
 */
class CarPhysics {
  constructor(initialPosition, options = {}) {
      // Position & motion (array format for compatibility)
      this.carPosition = initialPosition;
      this.carHeading = 0; // radians, 0 is north

      // Arcade physics properties
      this.a_forward = options.a_forward || 20.0;    // Acceleration rate
      this.a_brake = options.a_brake || 15.0;         // Braking/reverse rate
      this.v_max = options.v_max || 0.000048;         // Maximum velocity (using existing scale)
      this.mu = options.mu || 0.007;                  // Global friction coefficient
      this.lambda = options.lambda || 0.7;            // Lateral friction coefficient
      this.omega = options.omega || 0.3;              // Turn rate (radians per second)

      // Velocity components (x,y format for arcade physics)
      this.velocity = { vx: 0, vy: 0 };

      // Controls state
      this.controls = {
          forward: false,
          backward: false,
          left: false,
          right: false,
      };

      // Control duration tracking
      this.keyHoldDuration = {
          forward: 0,
          backward: 0,
      };

      // Keep previous controls for comparison
      this.prevControls = { ...this.controls };

      // Race progress tracking (keeping from original)
      this.checkpointsPassed = [];
      this.raceComplete = false;
      this.raceStartTime = 0;
      this.raceFinishTime = 0;
      this.actualFinishPosition = null;
      this.modelLoaded = false;
  }

  /**
   * Reset the car state to initial values
   */
  reset(initialPosition, initialHeading, checkpointStatus) {
      this.carPosition = initialPosition;
      this.carHeading = initialHeading;
      this.velocity = { vx: 0, vy: 0 };
      this.checkpointsPassed = checkpointStatus || [];
      this.raceComplete = false;
      this.raceStartTime = 0;
      this.raceFinishTime = 0;

      // Reset controls
      this.controls = {
          forward: false,
          backward: false,
          left: false,
          right: false,
      };
      this.prevControls = { ...this.controls };

      // Reset key hold duration
      this.keyHoldDuration = {
          forward: 0,
          backward: 0,
      };
  }

  /**
   * Set a control input state (forward, backward, left, right)
   */
  setControl(control, isActive) {
      if (control in this.controls) {
          this.controls[control] = isActive;
      }
  }

  /**
   * Start the race timer
   */
  startRaceTimer() {
      this.raceStartTime = performance.now();
  }

  /**
   * Mark the race as complete and return the elapsed time
   */
  completeRace() {
      this.raceFinishTime = performance.now();
      this.raceComplete = true;
      return (this.raceFinishTime - this.raceStartTime) / 1000;
  }

  /**
   * Calculate distance between two points (in longitude/latitude)
   */
  calculateDistance(point1, point2) {
      const dx = point1[0] - point2[0];
      const dy = point1[1] - point2[1];
      return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Calculate distance from a point to a line segment
   */
  distanceToLineSegment(px, py, x1, y1, x2, y2) {
      const A = px - x1;
      const B = py - y1;
      const C = x2 - x1;
      const D = y2 - y1;

      const dot = A * C + B * D;
      const lenSq = C * C + D * D;
      let param = -1;

      if (lenSq !== 0) param = dot / lenSq;

      let xx, yy;

      if (param < 0) {
          xx = x1;
          yy = y1;
      } else if (param > 1) {
          xx = x2;
          yy = y2;
      } else {
          xx = x1 + param * C;
          yy = y1 + param * D;
      }

      const dx = px - xx;
      const dy = py - yy;

      return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Check if car is on the route
   */
  isCarOnRoute(routeCoords) {
      if (!routeCoords || routeCoords.length < 2) return true;

      // For direct line segments, we need to find the closest line segment
      let minDistance = Infinity;

      // Check each segment of the route
      for (let i = 0; i < routeCoords.length - 1; i++) {
          const start = routeCoords[i];
          const end = routeCoords[i + 1];

          // Calculate the distance from the car to this line segment
          const distance = this.distanceToLineSegment(
              this.carPosition[0],
              this.carPosition[1],
              start[0],
              start[1],
              end[0],
              end[1]
          );

          minDistance = Math.min(minDistance, distance);
      }

      // Define max allowed distance from route (adjust as needed)
      // This is the width of the invisible wall corridor
      const maxDistanceFromRoute = 0.0003; // ~30-40 meters depending on latitude

      return minDistance <= maxDistanceFromRoute;
  }

  /**
   * Update car physics state based on controls and delta time
   * @param {number} dt - Time step in seconds
   * @param {Array} routeCoordinates - Array of route coordinates
   * @param {Function} offTrackCallback - Callback for when car goes off track
   */
  update(dt, routeCoordinates, offTrackCallback) {
      // Update control timing
      if (this.controls.forward) {
          this.keyHoldDuration.forward += dt;
      } else {
          this.keyHoldDuration.forward = 0;
      }

      if (this.controls.backward) {
          this.keyHoldDuration.backward += dt;
      } else {
          this.keyHoldDuration.backward = 0;
      }
      
      // Make a copy of the controls to compare in next frame
      this.prevControls = { ...this.controls };
      
      // 1. Calculate forward and right vectors based on orientation
      const forwardVector = {
          x: Math.sin(this.carHeading),
          y: Math.cos(this.carHeading)
      };
      // FIX: Correct the right vector so that when heading = 0, it yields {1, 0} (east)
      const rightVector = {
          x: Math.cos(this.carHeading),
          y: -Math.sin(this.carHeading)
      };

      // 2. Calculate acceleration from inputs
      let acceleration = { x: 0, y: 0 };

      if (this.controls.forward) {
          // Apply forward acceleration
          acceleration.x += forwardVector.x * this.a_forward;
          acceleration.y += forwardVector.y * this.a_forward;
      }

      if (this.controls.backward) {
          // Apply braking/reverse acceleration
          acceleration.x -= forwardVector.x * this.a_brake;
          acceleration.y -= forwardVector.y * this.a_brake;
      }

      // 3. Update velocity with acceleration
      this.velocity.vx += acceleration.x * dt;
      this.velocity.vy += acceleration.y * dt;

      // Apply global friction
      this.velocity.vx *= (1 - this.mu * dt);
      this.velocity.vy *= (1 - this.mu * dt);

      // Get current velocity magnitude
      const velocityMagnitude = Math.sqrt(
          this.velocity.vx * this.velocity.vx +
          this.velocity.vy * this.velocity.vy
      );

      // Clamp velocity to maximum speed
      if (velocityMagnitude > this.v_max) {
          const scale = this.v_max / velocityMagnitude;
          this.velocity.vx *= scale;
          this.velocity.vy *= scale;
      }

      // 4. Lateral dynamics (drift handling)
      // Decompose velocity into forward and lateral components
      const vForward =
          this.velocity.vx * forwardVector.x +
          this.velocity.vy * forwardVector.y;

      const vLateral =
          this.velocity.vx * rightVector.x +
          this.velocity.vy * rightVector.y;

      // Dampen lateral component
      const vLateralNew = vLateral * (1 - this.lambda * dt);

      // Recombine the velocity components
      this.velocity.vx = vForward * forwardVector.x + vLateralNew * rightVector.x;
      this.velocity.vy = vForward * forwardVector.y + vLateralNew * rightVector.y;

      // 5. Handle steering
      // Determine turn direction based on input
      let turnDirection = 0;
      if (this.controls.left) turnDirection -= 1;
      if (this.controls.right) turnDirection += 1;

      // Scale turn rate by current speed relative to max speed
      // This makes steering more responsive at higher speeds
      const speedFactor = Math.max(0.2, 1 - (0.7 * velocityMagnitude / this.v_max));
      const deltaTheta = this.omega * dt * turnDirection * speedFactor;
      
      // Update orientation
      this.carHeading += deltaTheta;
      
      // Normalize heading between 0 and 2π
      this.carHeading %= 2 * Math.PI;
      if (this.carHeading < 0) this.carHeading += 2 * Math.PI;

      // 6. Calculate tentative new position
      const tentativeNewPos = [
          this.carPosition[0] + this.velocity.vx * dt,
          this.carPosition[1] + this.velocity.vy * dt
      ];

      // 7. Check if car is going off-route
      if (
          routeCoordinates &&
          routeCoordinates.length > 0 &&
          !this.isCarOnRoute(routeCoordinates)
      ) {
          // Car is trying to go off-route - prevent it
          // Reduce speed significantly
          this.velocity.vx *= 0.2;
          this.velocity.vy *= 0.2;

          // Call the off-track callback function if provided
          if (offTrackCallback) {
              offTrackCallback();
          }

          // Keep car at current position with minimal movement (creating a "sliding along wall" effect)
          const bounceBackFactor = 0.02;
          this.carPosition = [
              this.carPosition[0] + this.velocity.vx * dt * bounceBackFactor,
              this.carPosition[1] + this.velocity.vy * dt * bounceBackFactor
          ];
      } else {
          // Car is on route or no route loaded yet, proceed with normal movement
          this.carPosition = tentativeNewPos;
      }

      // 8. Calculate current speed for return value
      const currentSpeed = Math.sqrt(
          this.velocity.vx * this.velocity.vx +
          this.velocity.vy * this.velocity.vy
      );

      // Return current state for rendering
      return {
          position: this.carPosition,
          heading: this.carHeading,
          speed: currentSpeed,
          raceComplete: this.raceComplete
      };
  }
}

export default CarPhysics;
