const WebSocket = require('ws');
const axios = require('axios');

// Configuration
const API_URL = 'http://localhost:8080/api';
const WS_URL = 'ws://localhost:8080/api/ws';
const USER_NAME = 'SenderUser';
const PARTY_NAME = 'TestParty';

// Keep track of other party members
const partyMembers = new Map();

// Register a user and create a party
async function setupUser() {
  try {
    // Register user
    const registerResponse = await axios.post(`${API_URL}/auth/register`, {
      name: USER_NAME
    });
    
    const token = registerResponse.data.access_token;
    const userId = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()).sub;
    
    console.log(`Registered user: ${USER_NAME} with ID: ${userId}`);
    
    // Create a party
    const partyResponse = await axios.post(
      `${API_URL}/parties`, 
      { name: PARTY_NAME, owner_id: userId },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    
    const partyId = partyResponse.data.id;
    const partyCode = partyResponse.data.code;
    
    console.log(`Created party: ${PARTY_NAME} with ID: ${partyId} and code: ${partyCode}`);
    
    return { userId, token, partyId, partyCode };
  } catch (error) {
    console.error('Error setting up user:', error.response?.data || error.message);
    throw error;
  }
}

// Send position updates
async function startSendingPositions(userId, token, partyId) {
  // Connect to WebSocket
  const ws = new WebSocket(`${WS_URL}?token=${token}`);
  
  ws.on('open', () => {
    console.log('WebSocket connection established');
    
    // Send Connect message
    const connectMessage = {
      type: 'Connect',
      user_id: userId,
      party_id: partyId
    };
    
    ws.send(JSON.stringify(connectMessage));
    console.log('Connected to party');
    
    // Start sending position updates every second
    let x = 0;
    let z = 0;
    
    setInterval(() => {
      // Generate movement (simple circle pattern)
      x = 10 * Math.cos(Date.now() / 1000);
      z = 10 * Math.sin(Date.now() / 1000);
      
      const updateMessage = {
        type: 'Update',
        state: {
          user_id: userId,
          position: {
            x: x,
            y: 1.0, // Constant height
            z: z
          },
          rotation: {
            yaw: Math.atan2(z, x) * (180 / Math.PI),
            pitch: 0.0,
            roll: 0.0
          }
        }
      };
      
      ws.send(JSON.stringify(updateMessage));
      console.log(`Sent position update: (${x.toFixed(2)}, 1.0, ${z.toFixed(2)})`);
    }, 10);
  });
  
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      // Handle different message types
      if (message.type === 'NewPartyMember') {
        partyMembers.set(message.user_id, message.name);
        console.log(`New user joined party: ${message.name} (ID: ${message.user_id})`);
        console.log(`Current party members: ${Array.from(partyMembers.values()).join(', ')}`);
      } 
      else if (message.type === 'Disconnect') {
        const userName = partyMembers.get(message.user_id) || `User ${message.user_id}`;
        partyMembers.delete(message.user_id);
        console.log(`${userName} has disconnected from the party`);
        console.log(`Remaining party members: ${Array.from(partyMembers.values()).join(', ') || 'None'}`);
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
  
  ws.on('close', () => {
    console.log('WebSocket connection closed');
  });
  
  // Handle program termination
  process.on('SIGINT', () => {
    console.log('Disconnecting...');
    
    // Send a proper disconnect message before closing
    const disconnectMessage = {
      type: 'Disconnect',
      user_id: userId
    };
    
    ws.send(JSON.stringify(disconnectMessage));
    
    // Wait a moment for the message to be sent before closing
    setTimeout(() => {
      ws.close();
      process.exit(0);
    }, 500);
  });
}

// Main function
async function main() {
  try {
    const { userId, token, partyId, partyCode } = await setupUser();
    console.log(`Share this party code with other users: ${partyCode}`);
    // Wait for 5 seconds before starting to send positions
    await new Promise(resolve => setTimeout(resolve, 5000));
    await startSendingPositions(userId, token, partyId);
  } catch (error) {
    console.error('Error in main:', error);
  }
}

main(); 