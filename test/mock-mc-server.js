const net = require('net');

console.log('\n🎮 Mock Minecraft Server for Testing\n');

const PORT = 25565;
let connected = false;

const server = net.createServer((socket) => {
  console.log('[MC Server] Bot connected');
  connected = true;

  socket.write(Buffer.from([
    0x00, 0x3C, 0x69, 0x64, 0x3E, 0x4D, 0x61, 0x72, 0x6B, 0x3C, 0x2F, 0x69, 0x64, 0x3E,
    0x00, 0x04, 0x31, 0x2E, 0x32, 0x30, 0x2E, 0x34, 0x00, 0x00
  ]));

  socket.on('data', (data) => {
    if (data.length > 5) {
      console.log('[MC Server] Received packet, type:', data[0]);
      
      if (data[0] === 0x03) {
        console.log('[MC Server] Bot joined!');
        socket.write(Buffer.from([0x01, 0x00]));
        
        setTimeout(() => {
          console.log('[MC Server] Sending spawn position');
          const spawnPacket = Buffer.alloc(15);
          spawnPacket.writeUInt8(0x26, 0);
          spawnPacket.writeInt32BE(0, 1);
          spawnPacket.writeInt32BE(64, 5);
          spawnPacket.writeInt32BE(0, 9);
          spawnPacket.writeUInt8(0, 13);
          spawnPacket.writeUInt8(0, 14);
          socket.write(spawnPacket);
        }, 500);
      }
    }
  });

  socket.on('close', () => {
    console.log('[MC Server] Bot disconnected');
    connected = false;
  });
});

server.listen(PORT, () => {
  console.log(`[MC Server] Mock server listening on port ${PORT}`);
  console.log('\n💡 Connect with: node test/game-connect-test.js\n');
});

process.on('SIGINT', () => {
  console.log('\n[MC Server] Shutting down...');
  server.close();
  process.exit();
});
