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

        // Car properties
        this.mass = 1800;
        this.wheelbase = 2.78;
        this.enginePower = 100;
        this.brakingForce = 6000;
        this.dragCoefficient = 0.35;
        this.rollingResistance = 8;
        this.frictionCoefficient = 20;

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

        // Slower top speed
        this.maxSpeed = 0.000024;

        // Steering & timing
        this.steeringAngle = 0;
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

        // Forward impulse
        if (this.controls.forward) {
            if (!this.prevControls.forward) {
                this.forwardImpulse = 0.3;
            } else if (this.keyHoldDuration.forward > 0.1) {
                this.forwardImpulse = Math.min(
                    1.0,
                    this.forwardImpulse + dt * 1.5
                );
            }
        } else {
            this.forwardImpulse *= 0.7;
        }

        // Backward impulse
        if (this.controls.backward) {
            if (!this.prevControls.backward) {
                this.backwardImpulse = 0.3;
            } else if (this.keyHoldDuration.backward > 0.1) {
                this.backwardImpulse = Math.min(
                    1.0,
                    this.backwardImpulse + dt * 1.5
                );
            }
        } else {
            this.backwardImpulse *= 0.7;
        }

        if (this.forwardImpulse < 0.01) this.forwardImpulse = 0;
        if (this.backwardImpulse < 0.01) this.backwardImpulse = 0;

        // Make a copy of the controls to compare in next frame
        this.prevControls = { ...this.controls };

        // Steering
        const maxSteeringAngle = 1.2; // ~69 degrees
        const steeringSpeed = 3.0 * dt;
        const returnSpeed = 2.0 * dt;

        if (this.controls.left) {
            this.steeringAngle = Math.max(
                this.steeringAngle - steeringSpeed,
                -maxSteeringAngle
            );
        } else if (this.controls.right) {
            this.steeringAngle = Math.min(
                this.steeringAngle + steeringSpeed,
                maxSteeringAngle
            );
        } else {
            if (this.steeringAngle > 0) {
                this.steeringAngle = Math.max(0, this.steeringAngle - returnSpeed);
            } else if (this.steeringAngle < 0) {
                this.steeringAngle = Math.min(0, this.steeringAngle + returnSpeed);
            }
        }

        // Physics
        const mapUnitToMeter = 111000;
        const meterToMapUnit = 1 / mapUnitToMeter;
        const speedMS = this.carSpeed * mapUnitToMeter;

        let tractionForce = 0;
        if (this.forwardImpulse > 0) {
            const maxForce = (this.enginePower * 746) / Math.max(1, speedMS * 3.6);
            tractionForce = maxForce * this.forwardImpulse;
        }

        let brakeForce = 0;
        if (this.backwardImpulse > 0) {
            if (speedMS > 0.2) {
                brakeForce = this.brakingForce * this.backwardImpulse;
            } else if (speedMS > -0.5) {
                // Reverse
                tractionForce = -this.enginePower * 200 * this.backwardImpulse;
            }
        }

        const dragForce =
            this.dragCoefficient * speedMS * speedMS * Math.sign(speedMS);
        const rollingForce =
            this.rollingResistance * speedMS * Math.sign(speedMS);
        const naturalBrakingForce =
            this.frictionCoefficient * 12 * Math.sign(speedMS);

        const inputActive = this.forwardImpulse > 0 || this.backwardImpulse > 0;
        const decelMultiplier = inputActive ? 1.0 : 2.5;
        const decelForce =
            (dragForce + rollingForce + naturalBrakingForce) * decelMultiplier;

        const totalForce = tractionForce - brakeForce - decelForce;
        const accel = totalForce / this.mass;

        let newSpeedMS = speedMS + accel * dt;
        if (Math.abs(newSpeedMS) < 0.3) {
            newSpeedMS = 0;
        }

        this.carSpeed = newSpeedMS * meterToMapUnit;
        if (this.carSpeed > this.maxSpeed) {
            this.carSpeed = this.maxSpeed;
        } else if (this.carSpeed < -this.maxSpeed / 2) {
            this.carSpeed = -this.maxSpeed / 2;
        }

        // Turning
        if (
            Math.abs(this.carSpeed) > 1e-9 &&
            Math.abs(this.steeringAngle) > 1e-5
        ) {
            const turnRadius =
                this.wheelbase / Math.sin(Math.abs(this.steeringAngle));
            const angularVelocity = (this.carSpeed * mapUnitToMeter) / turnRadius;
            this.carHeading +=
                angularVelocity *
                dt *
                Math.sign(this.steeringAngle) *
                Math.sign(this.carSpeed);

            this.carHeading %= 2 * Math.PI;
            if (this.carHeading < 0) this.carHeading += 2 * Math.PI;
        }

        // Update position
        if (Math.abs(this.carSpeed) > 1e-9) {
            const vx = this.carSpeed * Math.sin(this.carHeading);
            const vy = this.carSpeed * Math.cos(this.carHeading);

            const inertiaFactor = 0.85;
            if (!this.carVelocity[0] && !this.carVelocity[1]) {
                this.carVelocity = [vx, vy];
            } else {
                this.carVelocity = [
                    vx * (1 - inertiaFactor) + this.carVelocity[0] * inertiaFactor,
                    vy * (1 - inertiaFactor) + this.carVelocity[1] * inertiaFactor,
                ];
            }

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

        // Return current state for rendering
        return {
            position: this.carPosition,
            heading: this.carHeading,
            speed: this.carSpeed,
            raceComplete: this.raceComplete,
        };
    }
}

export default CarPhysics;