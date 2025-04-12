# WebSocket Position Tracking Demo Scripts

These scripts demonstrate the WebSocket position tracking feature of the World Racers API, including party member disconnect notifications.

## Setup

1. Install dependencies:
```bash
npm install
```

## Usage

### Step 1: Start the Position Sender

This script will register a user, create a party, and start sending position updates in a circular pattern:

```bash
npm run sender
```

The script will output a party code that you can use to join with the listener script. It will also display notifications when users join or leave the party.

### Step 2: Start the Position Listener

In a separate terminal, start the listener script:

```bash
npm run listener
```

When prompted, enter the party code from the sender script. The listener will join the party and start displaying:
- Position updates from the sender
- Notifications when users join the party
- Notifications when users disconnect from the party

## Disconnect Handling

Both scripts now properly:
1. Track and display current party members
2. Show notifications when members join or leave
3. Send a proper disconnect message when terminated (with Ctrl+C)
4. Display a list of remaining party members after someone disconnects

## Important Notes

- Both scripts automatically register new users
- Press Ctrl+C to properly disconnect from the WebSocket
- The sender moves in a circular pattern with a radius of 10 units
- The listener will not print its own position updates, only others' 