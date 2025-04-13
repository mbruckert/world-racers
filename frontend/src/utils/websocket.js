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

    // API URLs
    this.API_BASE_URL = import.meta.env.VITE_API_URL;
    this.WS_URL = `${this.API_BASE_URL.replace("http", "ws")}/api/ws`;
  }

  connect(userId, partyId) {
    if (this.isConnected) return;

    this.userId = userId;
    this.partyId = partyId;

    const token = getAuthToken();
    if (!token) {
      console.error("Authentication token required for WebSocket connection");
      return;
    }

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

    // Send Connect message
    const connectMessage = {
      type: "Connect",
      user_id: this.userId,
      party_id: this.partyId,
    };

    this.sendMessage(connectMessage);
    console.log("Connected to party");
  }

  handleMessage(event) {
    try {
      const message = JSON.parse(event.data);

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

          // Update user position
          this.userPositions.set(user_id, { position, rotation });

          if (this.onPositionUpdate) {
            this.onPositionUpdate(user_id, position, rotation);
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

  handleClose() {
    console.log("WebSocket connection closed");
    this.isConnected = false;
    this.partyMembers.clear();
    this.userPositions.clear();
  }

  sendPosition(position, rotation) {
    if (!this.isConnected) return;

    const updateMessage = {
      type: "Update",
      state: {
        user_id: this.userId,
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
    if (this.ws && this.isConnected) {
      this.ws.send(JSON.stringify(message));
    }
  }

  disconnect() {
    if (!this.isConnected) return;

    try {
      // Send disconnect message
      const disconnectMessage = {
        type: "Disconnect",
        user_id: this.userId,
      };

      this.sendMessage(disconnectMessage);

      // Give time for the disconnect message to be sent
      setTimeout(() => {
        this.ws.close();
        this.isConnected = false;
        this.partyMembers.clear();
        this.userPositions.clear();
      }, 500);
    } catch (error) {
      console.error("Error disconnecting WebSocket:", error);
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
}

// Singleton instance
const multiplayerConnection = new MultiplayerConnection();
export default multiplayerConnection;
