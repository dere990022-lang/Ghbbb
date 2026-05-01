const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mineflayer = require('mineflayer');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const bots = {};

app.use(express.static('public'));

function sendStatus(socket, message) {
  if (socket) socket.emit('status', { text: message });
}

function broadcastStatus(message) {
  io.emit('status', { text: message });
}

function emitBotList() {
  const list = Object.entries(bots).map(([id, info]) => ({
    id,
    username: info.username,
    host: info.host,
    port: info.port,
    status: info.status,
  }));
  io.emit('botList', list);
}

function sendInventory(botId) {
  const info = bots[botId];
  if (!info || !info.bot || !info.bot.inventory) return;

  const inventory = info.bot.inventory.items().map((item) => ({
    slot: item.slot,
    name: item.name,
    displayName: item.displayName || item.name,
    count: item.count,
  }));

  io.emit('inventory', { botId, inventory });
}

function createBot(options, socket) {
  const botId = crypto.randomUUID();
  const botOptions = {
    host: options.host || 'localhost',
    port: Number(options.port) || 25565,
    username: options.username || `web-bot-${botId.slice(0, 6)}`,
    password: options.password || undefined,
    version: options.version || false,
  };

  const bot = mineflayer.createBot(botOptions);
  bots[botId] = {
    bot,
    username: botOptions.username,
    host: botOptions.host,
    port: botOptions.port,
    status: 'connecting',
    registerPassword: options.registerPassword || undefined,
    loginPassword: options.loginPassword || undefined,
  };

  emitBotList();

  function updateBotStatus(status) {
    if (bots[botId]) {
      bots[botId].status = status;
      emitBotList();
    }
  }

  bot.once('spawn', () => {
    updateBotStatus('connected');
    broadcastStatus(`Bot ${bot.username} berhasil terkoneksi ke ${botOptions.host}:${botOptions.port}`);
    if (socket) socket.emit('botConnected', { id: botId, username: bot.username });
    sendInventory(botId);

    // Set bot to look forward and enable physics
    bot.look(0, 0);
    bot.physicsEnabled = true;

    const registerPassword = bots[botId].registerPassword;
    const loginPassword = bots[botId].loginPassword;

    if (registerPassword) {
      setTimeout(() => {
        if (bots[botId] && bots[botId].bot) {
          bots[botId].bot.chat(`/register ${registerPassword} ${registerPassword}`);
          broadcastStatus(`Bot ${bot.username} mengetik /register setelah 3 detik`);

          // Login setelah register
          if (loginPassword) {
            setTimeout(() => {
              if (bots[botId] && bots[botId].bot) {
                bots[botId].bot.chat(`/login ${loginPassword}`);
                broadcastStatus(`Bot ${bot.username} mengetik /login setelah register`);
              }
            }, 2000);
          }
        }
      }, 3000);
    } else if (loginPassword) {
      setTimeout(() => {
        if (bots[botId] && bots[botId].bot) {
          bots[botId].bot.chat(`/login ${loginPassword}`);
          broadcastStatus(`Bot ${bot.username} mengetik /login setelah 5 detik`);
        }
      }, 5000);
    }
  });

  bot.on('end', (reason) => {
    broadcastStatus(`Bot ${bot.username} terputus: ${reason || 'tidak diketahui'}`);
    delete bots[botId];
    emitBotList();
    io.emit('inventory', { botId, inventory: [] });
  });

  bot.on('error', (err) => {
    broadcastStatus(`Bot ${bot.username} error: ${err.message}`);
    if (socket) socket.emit('botError', { id: botId, error: err.message });
    updateBotStatus('error');
  });

  bot.on('kicked', (reason) => {
    broadcastStatus(`Bot ${bot.username} dikick: ${reason}`);
  });

  bot.on('chat', (username, message) => {
    if (username === bot.username) return;
    broadcastStatus(`[${bot.username}] <${username}> ${message}`);
  });

  bot.on('windowUpdate', () => sendInventory(botId));
  bot.on('windowOpen', () => sendInventory(botId));
  bot.inventory.on('updateSlot', () => sendInventory(botId));
}

function getBotById(botId) {
  const info = bots[botId];
  return info ? info.bot : null;
}

function handleControl(command, botId) {
  const bot = getBotById(botId);
  if (!bot) {
    console.log(`Bot ${botId} not found for command ${command}`);
    return;
  }

  console.log(`Handling control: ${command} for bot ${botId}, spawned: ${bot.spawned}, onGround: ${bot.onGround}`);

  switch (command) {
    case 'forward_on':
      bot.setControlState('forward', true);
      break;
    case 'forward_off':
      bot.setControlState('forward', false);
      break;
    case 'back_on':
      bot.setControlState('back', true);
      break;
    case 'back_off':
      bot.setControlState('back', false);
      break;
    case 'left_on':
      bot.setControlState('left', true);
      break;
    case 'left_off':
      bot.setControlState('left', false);
      break;
    case 'right_on':
      bot.setControlState('right', true);
      break;
    case 'right_off':
      bot.setControlState('right', false);
      break;
    case 'jump':
      console.log(`Jump attempt - onGround: ${bot.onGround}, position: ${bot.position.x.toFixed(2)},${bot.position.y.toFixed(2)},${bot.position.z.toFixed(2)}, velocity: ${bot.velocity.y.toFixed(2)}`);
      // Allow jump even if not on ground, but log the state
      bot.setControlState('jump', true);
      setTimeout(() => bot.setControlState('jump', false), 150);
      break;
    case 'force_jump':
      console.log(`Force jump - ignoring ground check`);
      bot.setControlState('jump', true);
      setTimeout(() => bot.setControlState('jump', false), 200);
      // Try again after a short delay for double jump effect
      setTimeout(() => {
        if (bots[botId] && bots[botId].bot) {
          bots[botId].bot.setControlState('jump', true);
          setTimeout(() => bots[botId].bot.setControlState('jump', false), 200);
        }
      }, 100);
      break;
    case 'sprint_on':
      bot.setControlState('sprint', true);
      break;
    case 'sprint_off':
      bot.setControlState('sprint', false);
      break;
    case 'swing':
      bot.swingArm();
      break;
    default:
      break;
  }
}

io.on('connection', (socket) => {
  console.log('Client connected');
  sendStatus(socket, 'Web client tersambung. Isi pengaturan server untuk mulai.');
  socket.emit('botList', []);

  socket.on('connectBot', (data) => {
    try {
      createBot(data, socket);
    } catch (err) {
      sendStatus(socket, `Gagal membuat bot: ${err.message}`);
    }
  });

  socket.on('control', ({ command, botId }) => {
    handleControl(command, botId);
  });

  socket.on('chat', ({ message, botId }) => {
    const bot = getBotById(botId);
    if (!bot) {
      sendStatus(socket, 'Bot belum terkoneksi.');
      return;
    }
    bot.chat(message);
  });

  socket.on('disconnectBot', (botId) => {
    const bot = getBotById(botId);
    if (bot) {
      const name = bot.username;
      bot.end();
      broadcastStatus(`Bot ${name} dimatikan oleh pengguna.`);
    }
  });

  socket.on('getBotStatus', (botId) => {
    const bot = getBotById(botId);
    if (bot) {
      socket.emit('botStatus', {
        botId,
        status: 'connected',
        position: bot.position,
        onGround: bot.onGround,
        health: bot.health,
        maxHealth: 20 // Default max health
      });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server kontrol bot berjalan pada http://localhost:${PORT}`);
});
