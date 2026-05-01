const socket = io();
const statusLog = document.getElementById('statusLog');
const connectForm = document.getElementById('connectForm');
const disconnectButton = document.getElementById('disconnectButton');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const botSelect = document.getElementById('botSelect');
const inventoryTableBody = document.querySelector('#inventoryTable tbody');
const inventoryHint = document.getElementById('inventoryHint');
const botInfo = document.getElementById('botInfo');
const botStatus = document.getElementById('botStatus');
const botPosition = document.getElementById('botPosition');
const botOnGround = document.getElementById('botOnGround');
const botHealth = document.getElementById('botHealth');

function logStatus(message) {
  const entry = document.createElement('div');
  entry.textContent = message;
  statusLog.prepend(entry);
}

function updateBotSelect(bots) {
  const currentValue = botSelect.value;
  botSelect.innerHTML = '<option value="">Tidak ada bot aktif</option>';
  bots.forEach((bot) => {
    const option = document.createElement('option');
    option.value = bot.id;

    let statusEmoji = '❓';
    let statusText = bot.status;
    switch (bot.status) {
      case 'connected':
        statusEmoji = '🟢';
        statusText = 'Online';
        break;
      case 'connecting':
        statusEmoji = '🟡';
        statusText = 'Connecting';
        break;
      case 'error':
        statusEmoji = '🔴';
        statusText = 'Error';
        break;
    }

    option.textContent = `${statusEmoji} ${bot.username} (${bot.host}:${bot.port}) - ${statusText}`;
    botSelect.appendChild(option);
  });

  if (bots.length === 0) {
    selectedBotId = '';
    inventoryTableBody.innerHTML = '';
    inventoryHint.textContent = '📋 Pilih bot untuk melihat inventory';
    botInfo.style.display = 'none';
    return;
  }

  if (bots.find((bot) => bot.id === currentValue)) {
    botSelect.value = currentValue;
    selectedBotId = currentValue;
  } else {
    botSelect.value = bots[0].id;
    selectedBotId = bots[0].id;
  }

  // Show bot info if bot is selected
  updateBotInfo();
}

function updateBotInfo() {
  if (!selectedBotId) {
    botInfo.style.display = 'none';
    return;
  }

  botInfo.style.display = 'block';
  // Request bot status update from server
  socket.emit('getBotStatus', selectedBotId);
}

// Auto refresh bot status every 2 seconds
setInterval(() => {
  if (selectedBotId) {
    socket.emit('getBotStatus', selectedBotId);
  }
}, 2000);

socket.on('status', (data) => {
  logStatus(data.text);
});

socket.on('botList', (bots) => {
  updateBotSelect(bots);
});

socket.on('inventory', ({ botId, inventory }) => {
  renderInventory(botId, inventory);
});

socket.on('botConnected', (data) => {
  logStatus(`Bot tersambung sebagai ${data.username}`);
});

socket.on('botStatus', (data) => {
  if (data.botId !== selectedBotId) return;

  botStatus.textContent = data.status;
  botPosition.textContent = `${data.position.x.toFixed(1)}, ${data.position.y.toFixed(1)}, ${data.position.z.toFixed(1)}`;
  botOnGround.textContent = data.onGround ? 'Ya' : 'Tidak';
  botHealth.textContent = `${data.health.toFixed(1)}/${data.maxHealth}`;
});

connectForm.addEventListener('submit', (event) => {
  event.preventDefault();

  socket.emit('connectBot', {
    host: document.getElementById('host').value,
    port: document.getElementById('port').value,
    username: document.getElementById('username').value,
    password: document.getElementById('password').value,
    registerPassword: document.getElementById('registerPassword').value,
    loginPassword: document.getElementById('loginPassword').value,
    version: document.getElementById('version').value || false,
  });
});

disconnectButton.addEventListener('click', () => {
  if (!selectedBotId) {
    logStatus('Tidak ada bot terpilih untuk disconnect.');
    return;
  }
  socket.emit('disconnectBot', selectedBotId);
});

botSelect.addEventListener('change', () => {
  selectedBotId = botSelect.value;
  inventoryTableBody.innerHTML = '';
  inventoryHint.textContent = selectedBotId ? 'Memuat inventory...' : 'Pilih bot untuk melihat inventory.';
  updateBotInfo();
});

chatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  if (!selectedBotId) {
    logStatus('Pilih bot terlebih dahulu sebelum mengirim chat.');
    return;
  }
  socket.emit('chat', { message: text, botId: selectedBotId });
  chatInput.value = '';
});

controlButtons.forEach((button) => {
  const command = button.dataset.command;
  const emitCommand = () => {
    if (!selectedBotId) {
      logStatus('❌ Pilih bot terlebih dahulu sebelum mengontrol.');
      return;
    }
    console.log(`Emitting control: ${command} for bot ${selectedBotId}`);
    socket.emit('control', { command, botId: selectedBotId });

    // Visual feedback
    button.classList.add('active');
    setTimeout(() => button.classList.remove('active'), 150);
  };

  if (command.endsWith('_on')) {
    button.addEventListener('mousedown', emitCommand);
    button.addEventListener('touchstart', emitCommand);
    const offCommand = command.replace('_on', '_off');
    button.addEventListener('mouseup', () => {
      console.log(`Emitting control: ${offCommand} for bot ${selectedBotId}`);
      socket.emit('control', { command: offCommand, botId: selectedBotId });
    });
    button.addEventListener('mouseleave', () => {
      console.log(`Emitting control: ${offCommand} for bot ${selectedBotId}`);
      socket.emit('control', { command: offCommand, botId: selectedBotId });
    });
    button.addEventListener('touchend', () => {
      console.log(`Emitting control: ${offCommand} for bot ${selectedBotId}`);
      socket.emit('control', { command: offCommand, botId: selectedBotId });
    });
  } else {
    button.addEventListener('click', emitCommand);
  }
});
