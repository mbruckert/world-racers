import { getAuthToken } from "./auth";

class MultiplayerConnection {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.partyMembers = new Map();
    this.userPositions = new Map();
    this.userId = null;
    this.partyId = null;
    this.onNewPartyMember = null;
    this.onDisconnect = null;
    this.onPositionUpdate = null;
    this.onRaceStart = null;
    this.heartbeatInterval = null;

    // API URLs
    this.API_BASE_URL = import.meta.env.VITE_API_URL;
    // Use explicit WebSocket URL construction to avoid Vite development server issues
    const wsProtocol = this.API_BASE_URL.startsWith("https") ? "wss" : "ws";
    const apiHost = this.API_BASE_URL.replace(/^https?:\/\//, "");
    this.WS_URL = `${wsProtocol}://${apiHost}/api/ws`;
    console.log("WebSocket URL:", this.WS_URL);
  }

  connect(userId, partyId) {
    // If already connected to this exact party, don't reconnect
    if (
      this.isConnected &&
      this.userId === userId &&
      this.partyId === partyId
    ) {
      console.log(
        `Already connected to party ${partyId} as user ${userId}, skipping reconnection`
      );
      return;
    }

    // If connected to a different party, disconnect first
    if (
      this.isConnected &&
      (this.userId !== userId || this.partyId !== partyId)
    ) {
      console.log(
        `Disconnecting from party ${this.partyId} to join party ${partyId}`
      );
      this.disconnect();
    }

    this.userId = parseInt(userId);
    this.partyId = parseInt(partyId);

    console.log(
      `Setting up connection for user ${this.userId} to party ${this.partyId}`
    );

    const token = getAuthToken();
    if (!token) {
      console.error("Authentication token required for WebSocket connection");
      return;
    }

    console.log(
      `Connecting to WebSocket at ${this.WS_URL} for party ${partyId}`
    );

    // Connect to WebSocket with authentication token
    this.ws = new WebSocket(`${this.WS_URL}?token=${token}`);

    this.ws.onopen = this.handleOpen.bind(this);
    this.ws.onmessage = this.handleMessage.bind(this);
    this.ws.onerror = this.handleError.bind(this);
    this.ws.onclose = this.handleClose.bind(this);
  }

  handleOpen() {
    console.log("WebSocket connection established");
    this.isConnected = true;

    // Parse IDs to ensure they're integers for the server
    const userId = parseInt(this.userId);
    const partyId = parseInt(this.partyId);

    if (isNaN(userId) || isNaN(partyId)) {
      console.error("Invalid user ID or party ID", { userId, partyId });
      return;
    }

    // Send Connect message
    const connectMessage = {
      type: "Connect",
      user_id: userId,
      party_id: partyId,
    };

    console.log("Sending Connect message:", connectMessage);
    this.sendMessage(connectMessage);
    console.log(`Connected to party ${partyId} as user ${userId}`);
  }

  handleMessage(event) {
    try {
      const message = JSON.parse(event.data);

      // Don't log ping/pong messages to avoid console spam
      if (message.type !== "Ping" && message.type !== "Pong") {
        console.log("Received WebSocket message:", message);
      }

      switch (message.type) {
        case "NewPartyMember":
          this.partyMembers.set(message.user_id, message.name);
          console.log(
            `New user joined party: ${message.name} (ID: ${message.user_id})`
          );

          if (this.onNewPartyMember) {
            this.onNewPartyMember(message);
          }
          break;

        case "Update":
          const { user_id, position, rotation } = message.state;

          // Skip own updates
          if (user_id === this.userId) return;

          // Debug position updates coming in
          console.log(`Position update from user ${user_id}:`, {
            position,
            rotation,
            timestamp: new Date().toISOString(),
          });

          // Update user position
          this.userPositions.set(user_id, { position, rotation });

          if (this.onPositionUpdate) {
            console.log(`Calling onPositionUpdate handler for user ${user_id}`);
            this.onPositionUpdate(user_id, position, rotation);
          } else {
            console.warn("No onPositionUpdate handler registered");
          }
          break;

        case "Ping":
          // Respond to ping with a pong
          this.sendMessage({ type: "Pong", timestamp: Date.now() });
          break;

        case "Pong":
          // Just log connection is alive
          if (Date.now() % 60000 < 100) {
            // Log roughly once per minute
            console.log("WebSocket connection is alive (pong received)");
          }
          break;

        case "Disconnect":
          const userName =
            this.partyMembers.get(message.user_id) || `User ${message.user_id}`;
          console.log(`${userName} has disconnected from the party`);

          // Remove from tracking
          this.partyMembers.delete(message.user_id);
          this.userPositions.delete(message.user_id);

          if (this.onDisconnect) {
            this.onDisconnect(message.user_id);
          }
          break;

        case "RaceStarted":
          console.log("Race start message received!");
          // Add additional logging to help debug
          console.log("onRaceStart handler exists:", !!this.onRaceStart);

          if (this.onRaceStart) {
            console.log("Calling onRaceStart handler");

            // Use setTimeout to ensure this runs after current execution context
            setTimeout(() => {
              try {
                this.onRaceStart();
                console.log("onRaceStart handler executed successfully");
              } catch (error) {
                console.error("Error in onRaceStart handler:", error);
              }
            }, 10);
          } else {
            console.warn("No onRaceStart handler registered");

            // Try to trigger a custom event as a fallback mechanism
            try {
              window.dispatchEvent(
                new CustomEvent("race_started", {
                  detail: { timestamp: new Date().toISOString() },
                })
              );
              console.log("Dispatched race_started custom event");
            } catch (error) {
              console.error("Error dispatching custom event:", error);
            }
          }
          break;

        default:
          console.log("Received unhandled message type:", message.type);
      }
    } catch (error) {
      console.error("Error processing WebSocket message:", error);
    }
  }

  handleError(error) {
    console.error("WebSocket error:", error);
  }

  handleClose(event) {
    // The event object contains closure information
    const closeCode = event?.code || "unknown";
    const closeReason = event?.reason || "No reason provided";
    const wasClean = event?.wasClean ? "clean" : "unclean";

    console.log(
      `WebSocket connection closed with ${wasClean} close, code: ${closeCode}, reason: ${closeReason}`
    );
    console.log(`WebSocket state at close: ${this.ws?.readyState}`);
    console.trace("WebSocket close stacktrace");

    this.isConnected = false;

    // Keep party members and positions in case we reconnect
    const partyMembers = new Map(this.partyMembers);
    const userPositions = new Map(this.userPositions);

    // Only clear these if it was an intentional disconnect
    if (closeCode === 1000) {
      this.partyMembers.clear();
      this.userPositions.clear();
    }

    // Attempt to reconnect if this wasn't a normal closure and we have user/party IDs
    if (closeCode !== 1000 && this.userId && this.partyId) {
      console.log(`Attempting to reconnect to party ${this.partyId}...`);

      // Wait a moment before reconnecting
      setTimeout(() => {
        if (!this.isConnected) {
          console.log(
            `Reconnecting user ${this.userId} to party ${this.partyId}...`
          );

          // Store the current user and party ID
          const userId = this.userId;
          const partyId = this.partyId;

          // Connect with the same parameters
          this.connect(userId, partyId);

          // Restore the party members and positions after reconnecting
          setTimeout(() => {
            if (this.isConnected) {
              if (partyMembers.size > 0) {
                this.partyMembers = new Map([
                  ...partyMembers,
                  ...this.partyMembers,
                ]);
                console.log(
                  "Restored party members after reconnection:",
                  Array.from(this.partyMembers.entries())
                );
              }
            }
          }, 1000);
        }
      }, 2000);
    }
  }

  sendPosition(position, rotation) {
    if (!this.isConnected) {
      console.warn("Cannot send position - WebSocket not connected");
      return;
    }

    if (!this.userId) {
      console.warn("Cannot send position - No user ID");
      return;
    }

    const userId = parseInt(this.userId);
    if (isNaN(userId)) {
      console.error("Invalid user ID for position update", this.userId);
      return;
    }

    // Add debug logging for outgoing position updates
    if (Date.now() % 5000 < 100) {
      // Throttle logging to every ~5 seconds
      console.log(`Sending position update for user ${userId}:`, {
        position,
        rotation,
        timestamp: new Date().toISOString(),
      });
    }

    const updateMessage = {
      type: "Update",
      state: {
        user_id: userId,
        position: {
          x: position.x,
          y: position.y,
          z: position.z,
        },
        rotation: {
          yaw: rotation.yaw || 0,
          pitch: rotation.pitch || 0,
          roll: rotation.roll || 0,
        },
      },
    };

    this.sendMessage(updateMessage);
  }

  sendMessage(message) {
    if (!this.ws) {
      console.warn("Cannot send message - WebSocket object is null");
      return;
    }

    if (!this.isConnected) {
      console.warn("Cannot send message - WebSocket not connected");
      return;
    }

    try {
      const messageStr = JSON.stringify(message);
      this.ws.send(messageStr);
    } catch (error) {
      console.error("Error sending WebSocket message:", error);
    }
  }

  disconnect(force = false) {
    // Stop the heartbeat if it's running
    this.stopHeartbeat();

    if (!this.isConnected && !force) {
      console.log("Already disconnected, ignoring disconnect call");
      return;
    }

    console.log(
      `Manual disconnect requested for user ${this.userId} from party ${this.partyId}`
    );
    console.trace("Disconnect stacktrace");

    try {
      // Mark our state as disconnected immediately to prevent race conditions
      const wasConnected = this.isConnected;
      this.isConnected = false;

      // Check the connection state
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        console.log(
          `WebSocket not open (state: ${this.ws?.readyState}), skipping disconnect message`
        );
        return;
      }

      if (wasConnected) {
        // Send disconnect message
        const disconnectMessage = {
          type: "Disconnect",
          user_id: this.userId,
        };

        try {
          const messageStr = JSON.stringify(disconnectMessage);
          this.ws.send(messageStr);
          console.log("Sent disconnect message");
        } catch (error) {
          console.error("Error sending disconnect message:", error);
        }

        // Give time for the disconnect message to be sent
        setTimeout(() => {
          if (
            this.ws &&
            (this.ws.readyState === WebSocket.OPEN ||
              this.ws.readyState === WebSocket.CONNECTING)
          ) {
            console.log("Closing WebSocket connection");
            this.ws.close(1000, "User manually disconnected");
          }

          // Clear our state
          this.partyMembers.clear();
          this.userPositions.clear();
        }, 500);
      }
    } catch (error) {
      console.error("Error in disconnect process:", error);
    }
  }

  // Get all party members
  getPartyMembers() {
    return this.partyMembers;
  }

  // Get positions of all other players
  getPlayerPositions() {
    return this.userPositions;
  }

  startRace() {
    if (!this.isConnected) return;

    const startMessage = {
      type: "StartRace",
    };

    this.sendMessage(startMessage);
    console.log("Sent race start message");
  }

  // Start a heartbeat to keep the connection alive
  startHeartbeat(positionProvider) {
    // Clear any existing heartbeat
    this.stopHeartbeat();

    console.log("Starting WebSocket heartbeat");

    this.heartbeatInterval = setInterval(() => {
      // Check if we're connected, if not try to reconnect
      if (!this.isConnected) {
        console.log("WebSocket disconnected, attempting to reconnect");
        if (this.userId && this.partyId) {
          this.connect(this.userId, this.partyId);
        }
        return;
      }

      // Send a ping/heartbeat to keep the connection alive
      if (positionProvider && typeof positionProvider === "function") {
        // If a position provider function was given, use it to get current position
        try {
          const positionData = positionProvider();
          if (positionData && positionData.position && positionData.rotation) {
            console.log("Sending heartbeat position update");
            this.sendPosition(positionData.position, positionData.rotation);
          } else {
            // Send a simple ping if no position is available
            this.sendMessage({ type: "Ping", timestamp: Date.now() });
          }
        } catch (error) {
          console.error("Error getting position for heartbeat:", error);
          // Fallback to simple ping
          this.sendMessage({ type: "Ping", timestamp: Date.now() });
        }
      } else {
        // Send a simple ping if no position provider function
        this.sendMessage({ type: "Ping", timestamp: Date.now() });
      }
    }, 15000); // Every 15 seconds

    return this.heartbeatInterval;
  }

  // Stop the heartbeat
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      console.log("Stopping WebSocket heartbeat");
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}

// Singleton instance
const multiplayerConnection = new MultiplayerConnection();
export default multiplayerConnection;
