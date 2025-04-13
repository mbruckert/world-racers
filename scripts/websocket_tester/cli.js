#!/usr/bin/env node
import WebSocket from 'ws';
import axios from 'axios';
import readline from 'readline';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { program } from 'commander';

// Default configuration
const DEFAULT_API_URL = 'http://localhost:8080/api';
const DEFAULT_WS_URL = 'ws://localhost:8080/ws';

program
    .name('ws-tester')
    .description('CLI tool to test WebSocket functionality')
    .version('1.0.0')
    .option('-a, --api-url <url>', 'API URL', DEFAULT_API_URL)
    .option('-w, --ws-url <url>', 'WebSocket URL', DEFAULT_WS_URL)
    .parse(process.argv);

const options = program.opts();
const API_URL = options.apiUrl;
const WS_URL = options.wsUrl;

// Initialize readline interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Global variables
let ws = null;
let userId = null;
let partyId = null;
let token = null;
let partyCode = null;
let partyMembers = new Map();

// Replace the ask function with inquirer
async function ask(question) {
    const response = await inquirer.prompt([{
        type: 'input',
        name: 'answer',
        message: question
    }]);
    return response.answer;
}

// Register a new user
async function registerUser() {
    try {
        console.log(chalk.blue('Registering new user...'));
        const name = await ask('Enter username: ');
        console.log(chalk.green(`Registering user with name: ${name}`));

        const response = await axios.post(`${API_URL}/auth/register`, { name });
        token = response.data.access_token;

        // Extract user ID from JWT token
        const tokenParts = token.split('.');
        const tokenPayload = Buffer.from(tokenParts[1], 'base64').toString();
        userId = JSON.parse(tokenPayload).sub;

        console.log(chalk.green(`User registered successfully! User ID: ${userId}`));
        return { userId, token };
    } catch (error) {
        console.error(chalk.red('Error registering user:'),
            error.response?.data || error.message);
        process.exit(1);
    }
}

// Create a new party
async function createParty() {
    try {
        console.log(chalk.blue('Creating a new party...'));
        const name = await ask('Enter party name: ');
        console.log(chalk.green(`Creating party with name: ${name}`));

        console.log(`Sending request to ${API_URL}/parties`);
        const response = await axios.post(
            `${API_URL}/parties`,
            { name },
            { headers: { Authorization: `Bearer ${token}` } }
        );

        partyId = response.data.id;
        partyCode = response.data.code;

        console.log(chalk.green(`Party created! ID: ${partyId}, Code: ${partyCode}`));
        return { partyId, partyCode };
    } catch (error) {
        console.error(chalk.red('Error creating party:'));
        if (error.response) {
            console.error(chalk.red(`Status: ${error.response.status}`));
            console.error(chalk.red('Response data:'), error.response.data);
        } else if (error.request) {
            console.error(chalk.red('No response received:'), error.request);
        } else {
            console.error(chalk.red('Error:'), error.message);
        }
        return null;
    }
}

// Join an existing party
async function joinParty() {
    try {
        console.log(chalk.blue('Joining an existing party...'));
        const code = await ask('Enter party code: ');

        const response = await axios.post(
            `${API_URL}/parties/join`,
            { code, user_id: userId },
            { headers: { Authorization: `Bearer ${token}` } }
        );

        partyId = response.data.id;
        partyCode = code;

        console.log(chalk.green(`Joined party! ID: ${partyId}`));
        return { partyId };
    } catch (error) {
        console.error(chalk.red('Error joining party:'),
            error.response?.data || error.message);
        return null;
    }
}

// Connect to WebSocket
function connectWebSocket() {
    try {
        console.log(chalk.blue('Connecting to WebSocket...'));
        ws = new WebSocket(`${WS_URL}?token=${token}`);

        ws.on('open', () => {
            console.log(chalk.green('WebSocket connection established!'));
            showMainMenu();
        });

        ws.on('message', (data) => {
            const message = JSON.parse(data.toString());
            console.log(chalk.yellow('Received message:'), JSON.stringify(message, null, 2));

            // Handle special message types
            if (message.type === 'NewPartyMember') {
                partyMembers.set(message.user_id, message.name);
                console.log(chalk.green(`User ${message.name} (ID: ${message.user_id}) joined the party!`));
            } else if (message.type === 'Disconnect') {
                const name = partyMembers.get(message.user_id) || 'Unknown';
                partyMembers.delete(message.user_id);
                console.log(chalk.yellow(`User ${name} (ID: ${message.user_id}) left the party.`));
            } else if (message.type === 'RaceStarted') {
                console.log(chalk.green('Race started!'));
            }
        });

        ws.on('close', () => {
            console.log(chalk.red('WebSocket connection closed'));
        });

        ws.on('error', (error) => {
            console.error(chalk.red('WebSocket error:'), error.message);
        });
    } catch (error) {
        console.error(chalk.red('Error connecting to WebSocket:'), error.message);
    }
}

// Connect to a party
function connectToParty() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.log(chalk.red('WebSocket not connected'));
        return;
    }

    const connectMessage = {
        type: 'Connect',
        user_id: userId,
        party_id: partyId
    };

    ws.send(JSON.stringify(connectMessage));
    console.log(chalk.green(`Connected to party ID: ${partyId}`));
}

// Send position update
function sendPositionUpdate() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.log(chalk.red('WebSocket not connected'));
        return;
    }

    // Generate random position
    const x = Math.random() * 20 - 10;
    const y = Math.random() * 5;
    const z = Math.random() * 20 - 10;

    // Generate random rotation
    const yaw = Math.random() * 360;
    const pitch = Math.random() * 90 - 45;
    const roll = Math.random() * 30 - 15;

    const updateMessage = {
        type: 'Update',
        state: {
            user_id: userId,
            position: { x, y, z },
            rotation: { yaw, pitch, roll }
        }
    };

    ws.send(JSON.stringify(updateMessage));
    console.log(chalk.green('Sent position update'));
}

// Start a race
function startRace() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.log(chalk.red('WebSocket not connected'));
        return;
    }

    const startRaceMessage = {
        type: 'StartRace'
    };

    ws.send(JSON.stringify(startRaceMessage));
    console.log(chalk.green('Sent race start command'));
}

// Disconnect
function disconnect() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.log(chalk.red('WebSocket not connected'));
        return;
    }

    const disconnectMessage = {
        type: 'Disconnect',
        user_id: userId
    };

    ws.send(JSON.stringify(disconnectMessage));
    console.log(chalk.yellow('Sent disconnect message'));

    ws.close();
    console.log(chalk.yellow('WebSocket connection closed'));
}

// Display main menu
function showMainMenu() {
    inquirer
        .prompt([
            {
                type: 'list',
                name: 'action',
                message: 'Choose an action:',
                choices: [
                    { name: 'Connect to party', value: 'connect' },
                    { name: 'Send position update', value: 'update' },
                    { name: 'Start race', value: 'race' },
                    { name: 'Disconnect', value: 'disconnect' },
                    { name: 'Exit', value: 'exit' }
                ]
            }
        ])
        .then((answers) => {
            switch (answers.action) {
                case 'connect':
                    connectToParty();
                    showMainMenu();
                    break;
                case 'update':
                    sendPositionUpdate();
                    showMainMenu();
                    break;
                case 'race':
                    startRace();
                    showMainMenu();
                    break;
                case 'disconnect':
                    disconnect();
                    setTimeout(() => process.exit(0), 1000);
                    break;
                case 'exit':
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        disconnect();
                    }
                    setTimeout(() => process.exit(0), 1000);
                    break;
            }
        });
}

// Setup party options
async function setupParty() {
    const response = await inquirer.prompt([
        {
            type: 'list',
            name: 'partyAction',
            message: 'What would you like to do?',
            choices: [
                { name: 'Create a new party', value: 'create' },
                { name: 'Join an existing party', value: 'join' }
            ]
        }
    ]);

    if (response.partyAction === 'create') {
        console.log(chalk.green('Creating a new party...'));
        const result = await createParty();
        if (!result) {
            return null; // Return null to indicate failure
        }
        console.log(chalk.green('Party created!'));
        return result;
    } else {
        return await joinParty();
    }
}

// Main function
async function main() {
    console.log(chalk.blue('WebSocket Tester'));
    console.log(chalk.gray(`API URL: ${API_URL}`));
    console.log(chalk.gray(`WebSocket URL: ${WS_URL}`));

    try {
        await registerUser();
        const partyResult = await setupParty();

        if (!partyId) {
            console.log(chalk.red('Failed to set up party. Exiting.'));
            process.exit(1);
        }

        connectWebSocket();
    } catch (error) {
        console.error(chalk.red('Error in main process:'), error.message);
        process.exit(1);
    }

    // Handle exit
    process.on('SIGINT', () => {
        console.log(chalk.yellow('\nExiting...'));
        if (ws && ws.readyState === WebSocket.OPEN) {
            disconnect();
        }
        setTimeout(() => process.exit(0), 1000);
    });
}

main();