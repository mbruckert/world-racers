const WebSocket = require('ws');
const axios = require('axios');
const readline = require('readline');

// Configuration
const API_URL = 'http://localhost:8080/api';
const WS_URL = 'ws://localhost:8080/api/ws';
const USER_NAME = 'ListenerUser';

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Keep track of other party members
const partyMembers = new Map();

// Register a user and join a party
async function setupUser() {
  try {
    // Register user
    const registerResponse = await axios.post(`${API_URL}/auth/register`, {
      name: USER_NAME
    });
    
    const token = registerResponse.data.access_token;
    const userId = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()).sub;
    
    console.log(`Registered user: ${USER_NAME} with ID: ${userId}`);
    
    // Ask for party code
    const partyCode = await new Promise((resolve) => {
      rl.question('Enter the party code to join: ', (code) => {
        resolve(code);
      });
    });
    
    // Join the party
    const joinResponse = await axios.post(
      `${API_URL}/parties/join`,
      { code: partyCode, user_id: userId },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    
    const partyId = joinResponse.data.id;
    
    console.log(`Joined party with ID: ${partyId}`);
    
    return { userId, token, partyId };
  } catch (error) {
    console.error('Error setting up user:', error.response?.data || error.message);
    throw error;
  }
}

// Listen for position updates
async function startListeningPositions(userId, token, partyId) {
  // Connect to WebSocket
  const ws = new WebSocket(`${WS_URL}?token=${token}`);
  
  // Store other users' positions
  const userPositions = new Map();
  
  ws.on('open', () => {
    console.log('WebSocket connection established');
    
    // Send Connect message
    const connectMessage = {
      type: 'Connect',
      user_id: userId,
      party_id: partyId
    };
    
    ws.send(JSON.stringify(connectMessage));
    console.log('Connected to party, listening for position updates...');
  });
  
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'NewPartyMember') {
        partyMembers.set(message.user_id, message.name);
        console.log(`New user joined party: ${message.name} (ID: ${message.user_id})`);
        console.log(`Current party members: ${Array.from(partyMembers.values()).join(', ')}`);
      } 
      else if (message.type === 'Update') {
        const { user_id, position, rotation } = message.state;
        
        // Skip own updates
        if (user_id === userId) return;
        
        // Get user name
        const userName = partyMembers.get(user_id) || `User ${user_id}`;
        
        // Update user position
        userPositions.set(user_id, { position, rotation });
        
        // Display position
        console.log(`${userName} position: (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)}) | ` +
                    `rotation: (yaw: ${rotation.yaw.toFixed(2)}, pitch: ${rotation.pitch.toFixed(2)}, roll: ${rotation.roll.toFixed(2)})`);
      }
      else if (message.type === 'Disconnect') {
        const userName = partyMembers.get(message.user_id) || `User ${message.user_id}`;
        
        console.log(`${userName} has disconnected from the party`);
        
        // Remove from our tracking
        partyMembers.delete(message.user_id);
        userPositions.delete(message.user_id);
        
        console.log(`Remaining party members: ${Array.from(partyMembers.values()).join(', ') || 'None'}`);
      }
    } catch (e) {
      console.error('Error parsing message:', e);
    }
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
  
  ws.on('close', () => {
    console.log('WebSocket connection closed');
    rl.close();
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
      rl.close();
      process.exit(0);
    }, 500);
  });
}

// Main function
async function main() {
  try {
    const { userId, token, partyId } = await setupUser();
    await startListeningPositions(userId, token, partyId);
  } catch (error) {
    console.error('Error in main:', error);
    rl.close();
  }
}

main(); 