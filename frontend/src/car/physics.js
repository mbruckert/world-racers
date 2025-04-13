/**
 * CarPhysics class handles the physics simulation for car movement in the racing game.
 * It manages position, velocity, acceleration, steering, and collision detection.
 */
class CarPhysics {
    constructor(initialPosition) {
        // Position & motion
        this.carPosition = initialPosition;
        this.carHeading = 0; // radians, 0 is north
        this.carSpeed = 0;
        this.carVelocity = [0, 0];

        // Key-based impulses
        this.forwardImpulse = 0;
        this.backwardImpulse = 0;

        // Movement controls
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
        this.prevControls = {
            forward: false,
            backward: false,
            left: false,
            right: false,
        };

        // Physics constants
        this.physics = {
            baseDragFactor: 0.988,
            baseAcceleration: 0.0003,  // reduced by 70% from 0.002
            maxAccelerationBonus: 0.0003,  // reduced by 70% from 0.003
            initialMaxSpeed: 0.0000032,
            maxPossibleSpeed: 0.0000064,
            maxReverseSpeed: 0.0000016,
            steeringFactorBase: 0.0015,  // reduced from 0.003
            maxSteeringForceBase: 0.05,  // reduced from 0.08
            turnSpeedThreshold: 0.0000007  // increased from 0.0000005
        };

        // Acceleration boost mechanic
        this.accelerationTime = 0;
        this.maxSpeed = this.physics.initialMaxSpeed;

        // Steering & timing
        this.steeringAngle = 0;
        this.rotationSpeed = 0;
        this.carRoll = 0;
        this.lastFrame = 0;

        // Model info
        this.modelLoaded = false;

        // Race progress tracking
        this.checkpointsPassed = [];
        this.raceComplete = false;
        this.raceStartTime = 0;
        this.raceFinishTime = 0;

        // Store the finish position to use consistently throughout the app
        this.actualFinishPosition = null;
    }

    /**
     * Reset the car state to initial values
     */
    reset(initialPosition, initialHeading, checkpointStatus) {
        this.carPosition = initialPosition;
        this.carHeading = initialHeading;
        this.carSpeed = 0;
        this.carVelocity = [0, 0];
        this.forwardImpulse = 0;
        this.backwardImpulse = 0;
        this.steeringAngle = 0;
        this.rotationSpeed = 0;
        this.carRoll = 0;
        this.accelerationTime = 0;
        this.maxSpeed = this.physics.initialMaxSpeed;
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
     */
    update(dt, routeCoordinates, offTrackCallback) {
        // Frame-based timing (matching exp_2.html)
        const frameIncrement = 1; // Each frame in the demo increments by 1

        this.handleAcceleration(dt, frameIncrement);
        this.handleSteering(dt);
        this.applyPhysics(dt);
        this.applyRoll(dt);
        this.updatePosition(dt, routeCoordinates, offTrackCallback);

        // Return current state for rendering
        return {
            position: this.carPosition,
            heading: this.carHeading,
            roll: this.carRoll,
            speed: this.carSpeed,
            raceComplete: this.raceComplete,
        };
    }

    handleAcceleration(dt, frameIncrement) {
        const { baseAcceleration, maxAccelerationBonus, initialMaxSpeed,
            maxPossibleSpeed, maxReverseSpeed } = this.physics;

        // Update control timing
        if (this.controls.forward) {
            this.keyHoldDuration.forward += dt;
            // Increase acceleration time while key is pressed (matching exp_2.html)
            this.accelerationTime += frameIncrement;

            // Calculate dynamic acceleration and max speed (exactly like exp_2.html)
            const accelerationBonus = Math.min(maxAccelerationBonus,
                (this.accelerationTime / 180) * maxAccelerationBonus);
            const currentAcceleration = baseAcceleration + accelerationBonus;

            const currentMaxSpeed = Math.min(maxPossibleSpeed,
                initialMaxSpeed + (this.accelerationTime / 300) *
                (maxPossibleSpeed - initialMaxSpeed));

            // Apply acceleration with dynamic max speed
            this.carSpeed += currentAcceleration;
            if (this.carSpeed > currentMaxSpeed) this.carSpeed = currentMaxSpeed;
        } else if (this.controls.backward) {
            this.keyHoldDuration.backward += dt;
            this.carSpeed -= baseAcceleration;
            if (this.carSpeed < -maxReverseSpeed) this.carSpeed = -maxReverseSpeed;
            // Reset acceleration boost when reversing
            this.accelerationTime = 0;
        } else {
            this.keyHoldDuration.forward = 0;
            this.keyHoldDuration.backward = 0;
            // Gradual slowdown when no key is pressed
            this.carSpeed *= 0.992;
            // Gradually reset acceleration time when not accelerating (matching exp_2.html)
            this.accelerationTime = Math.max(0, this.accelerationTime - 5);
        }

        // Update previous controls state
        this.prevControls = { ...this.controls };
    }

    handleSteering() {
        const { steeringFactorBase, maxSteeringForceBase, maxPossibleSpeed, turnSpeedThreshold } = this.physics;

        // Improved steering with tighter turning radius at low speeds (matching exp_2.html)
        const steeringFactor = steeringFactorBase *
            (1.0 - Math.min(0.7, (Math.abs(this.carSpeed) / maxPossibleSpeed) * 0.8));
        const maxSteeringForce = maxSteeringForceBase *
            (1.0 - Math.min(0.6, (Math.abs(this.carSpeed) / maxPossibleSpeed) * 0.7));

        // Only allow turning when the car is actually moving
        if (Math.abs(this.carSpeed) > turnSpeedThreshold) {
            if (this.controls.left) {
                // Reduced steering while reversing (realistic behavior)
                if (this.carSpeed < 0) {
                    this.rotationSpeed += steeringFactor * 0.7;
                } else {
                    this.rotationSpeed -= steeringFactor;
                }
            }

            if (this.controls.right) {
                // Reduced steering while reversing (realistic behavior)
                if (this.carSpeed < 0) {
                    this.rotationSpeed -= steeringFactor * 0.7;
                } else {
                    this.rotationSpeed += steeringFactor;
                }
            }
        } else {
            // Car isn't moving enough to turn
            this.rotationSpeed *= 0.5; // Quickly reduce any rotation when stopped
        }

        // Clamp rotation speed
        this.rotationSpeed = Math.max(-maxSteeringForce,
            Math.min(maxSteeringForce, this.rotationSpeed));

        // Apply speed reduction when turning
        const turningSeverity = Math.abs(this.rotationSpeed) / maxSteeringForce;
        const maxSpeedReduction = 0.02;
        this.carSpeed *= (1 - (turningSeverity * maxSpeedReduction));

        // Less reduction of steering for better responsiveness when moving
        this.rotationSpeed *= 0.95;
    }

    applyPhysics() {
        // Calculate heading based on rotation speed
        const speedFactor = Math.abs(this.carSpeed) / (this.physics.maxPossibleSpeed / 2);
        this.carHeading += this.rotationSpeed * speedFactor;

        // Normalize heading to 0-2π
        this.carHeading %= 2 * Math.PI;
        if (this.carHeading < 0) this.carHeading += 2 * Math.PI;

        // Apply drag exactly as in exp_2.html
        const { baseDragFactor, maxPossibleSpeed } = this.physics;
        const speedRatio = Math.abs(this.carSpeed) / maxPossibleSpeed;
        const highSpeedDragEffect = Math.pow(speedRatio, 2) * 0.15;
        const dragFactor = baseDragFactor - Math.abs(this.carSpeed) * 0.03 - highSpeedDragEffect;
        this.carSpeed *= dragFactor;
    }

    applyRoll() {
        // Apply car roll when turning, matching exp_2.html implementation
        const rollAmount = -this.rotationSpeed * 8;
        const targetRoll = rollAmount * Math.abs(this.carSpeed / 0.000008);
        this.carRoll = targetRoll; // Direct assignment as in the demo
    }

    updatePosition(dt, routeCoordinates, offTrackCallback) {
        // Update velocity based on heading and speed
        if (Math.abs(this.carSpeed) > 1e-9) {
            const vx = this.carSpeed * Math.sin(this.carHeading);
            const vy = this.carSpeed * Math.cos(this.carHeading);

            this.carVelocity = [vx, vy];

            const tentativeNewPos = [
                this.carPosition[0] + this.carVelocity[0],
                this.carPosition[1] + this.carVelocity[1],
            ];

            // Check if car is going off-route
            if (
                routeCoordinates &&
                routeCoordinates.length > 0 &&
                !this.isCarOnRoute(routeCoordinates)
            ) {
                // Car is trying to go off-route - prevent it
                // Reduce speed significantly
                this.carSpeed *= 0.2;

                // Call the off-track callback function if provided
                if (offTrackCallback) {
                    offTrackCallback();
                }

                // Keep car at current position with minimal movement
                // This creates a "sliding along wall" effect
                const bounceBackFactor = 0.02;
                this.carPosition = [
                    this.carPosition[0] + this.carVelocity[0] * bounceBackFactor,
                    this.carPosition[1] + this.carVelocity[1] * bounceBackFactor,
                ];
            } else {
                // Car is on route or no route loaded yet, proceed with normal movement
                this.carPosition = tentativeNewPos;
            }
        }
    }
}

export default CarPhysics;
