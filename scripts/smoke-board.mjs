import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distRoot = path.join(projectRoot, 'dist');
const gameDataPath = path.join(projectRoot, 'src', 'game-data.json');
const chromeBin = process.env.CHROME_BIN || '/usr/bin/google-chrome';
const storageKey = 'zathura-game-state-v2';
const allowedTeamEmojis = new Set(['😍', '💀', '🙈', '👾', '🧠', '💃🏻', '👑', '🌻', '🐉', '🍄', '🐥', '🦆']);

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
]);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const readGameData = async () => JSON.parse(await readFile(gameDataPath, 'utf8'));

const startStaticServer = async (seedState, harnessScript = '') => {
  assert(existsSync(path.join(distRoot, 'index.html')), 'dist/index.html is missing. Run npm run build first.');

  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
    const requestPath = decodeURIComponent(requestUrl.pathname);
    const relativePath = requestPath === '/' ? 'index.html' : requestPath.slice(1);
    const filePath = path.resolve(distRoot, relativePath);

    if (!filePath.startsWith(distRoot)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }

    try {
      let body = await readFile(filePath);
      if (relativePath === 'index.html') {
        const seedScript = `<script>localStorage.setItem(${JSON.stringify(storageKey)}, ${JSON.stringify(JSON.stringify(seedState))});</script>`;
        const smokeScript = harnessScript ? `<script>${harnessScript}</script>` : '';
        body = Buffer.from(body.toString('utf8').replace('</head>', `${seedScript}${smokeScript}</head>`));
      }
      response.writeHead(200, {
        'content-type': mimeTypes.get(path.extname(filePath)) || 'application/octet-stream',
        'cache-control': 'no-store',
      });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end('Not found');
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  return {
    server,
    origin: `http://127.0.0.1:${address.port}`,
  };
};

class CdpSocket {
  constructor(wsUrl) {
    this.url = new URL(wsUrl);
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.connected = false;
  }

  async connect() {
    this.socket = net.createConnection({
      host: this.url.hostname,
      port: Number(this.url.port),
    });

    await new Promise((resolve, reject) => {
      this.socket.once('connect', resolve);
      this.socket.once('error', reject);
    });

    const key = randomBytes(16).toString('base64');
    const request = [
      `GET ${this.url.pathname}${this.url.search} HTTP/1.1`,
      `Host: ${this.url.host}`,
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Key: ${key}`,
      'Sec-WebSocket-Version: 13',
      '',
      '',
    ].join('\r\n');

    this.socket.write(request);

    await new Promise((resolve, reject) => {
      const onData = data => {
        this.buffer = Buffer.concat([this.buffer, data]);
        const headerEnd = this.buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) return;

        const header = this.buffer.slice(0, headerEnd).toString('utf8');
        this.buffer = this.buffer.slice(headerEnd + 4);
        this.socket.off('data', onData);

        const accept = createHash('sha1')
          .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
          .digest('base64');

        if (!header.includes('101') || !header.includes(accept)) {
          reject(new Error(`Chrome DevTools websocket handshake failed:\n${header}`));
          return;
        }

        this.connected = true;
        this.socket.on('data', chunk => this.handleData(chunk));
        this.flushFrames();
        resolve();
      };

      this.socket.on('data', onData);
      this.socket.once('error', reject);
    });
  }

  close() {
    if (this.socket) {
      this.socket.destroy();
    }
  }

  send(method, params = {}) {
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for CDP response to ${method}`));
      }, 10000);

      this.pending.set(id, { resolve, reject, timeout, method });
      this.writeFrame(0x1, Buffer.from(payload));
    });
  }

  handleData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    this.flushFrames();
  }

  flushFrames() {
    while (this.buffer.length >= 2) {
      const first = this.buffer[0];
      const second = this.buffer[1];
      const opcode = first & 0x0f;
      const masked = Boolean(second & 0x80);
      let length = second & 0x7f;
      let offset = 2;

      if (length === 126) {
        if (this.buffer.length < offset + 2) return;
        length = this.buffer.readUInt16BE(offset);
        offset += 2;
      } else if (length === 127) {
        if (this.buffer.length < offset + 8) return;
        length = Number(this.buffer.readBigUInt64BE(offset));
        offset += 8;
      }

      let mask;
      if (masked) {
        if (this.buffer.length < offset + 4) return;
        mask = this.buffer.slice(offset, offset + 4);
        offset += 4;
      }

      if (this.buffer.length < offset + length) return;

      let payload = this.buffer.slice(offset, offset + length);
      this.buffer = this.buffer.slice(offset + length);

      if (masked) {
        payload = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
      }

      if (opcode === 0x8) {
        this.close();
        return;
      }

      if (opcode === 0x9) {
        this.writeFrame(0xA, payload);
        continue;
      }

      if (opcode !== 0x1) continue;

      const message = JSON.parse(payload.toString('utf8'));
      if (!message.id) {
        this.events.push(message);
        continue;
      }

      const pending = this.pending.get(message.id);
      if (!pending) continue;

      clearTimeout(pending.timeout);
      this.pending.delete(message.id);

      if (message.error) {
        pending.reject(new Error(`${pending.method} failed: ${message.error.message}`));
      } else {
        pending.resolve(message.result);
      }
    }
  }

  writeFrame(opcode, payload) {
    assert(this.connected, 'CDP websocket is not connected.');

    const mask = randomBytes(4);
    let header;

    if (payload.length < 126) {
      header = Buffer.alloc(2);
      header[1] = 0x80 | payload.length;
    } else if (payload.length < 65536) {
      header = Buffer.alloc(4);
      header[1] = 0x80 | 126;
      header.writeUInt16BE(payload.length, 2);
    } else {
      header = Buffer.alloc(10);
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(payload.length), 2);
    }

    header[0] = 0x80 | opcode;
    const maskedPayload = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
    this.socket.write(Buffer.concat([header, mask, maskedPayload]));
  }
}

const waitForDevToolsPort = async userDataDir => {
  const activePortPath = path.join(userDataDir, 'DevToolsActivePort');
  const start = Date.now();

  while (Date.now() - start < 10000) {
    if (existsSync(activePortPath)) {
      const [port] = (await readFile(activePortPath, 'utf8')).trim().split('\n');
      if (port) return Number(port);
    }
    await sleep(100);
  }

  throw new Error('Chrome did not expose a DevTools port.');
};

const getPageTarget = async (devToolsPort, pageUrl) => {
  const start = Date.now();

  while (Date.now() - start < 10000) {
    const response = await fetch(`http://127.0.0.1:${devToolsPort}/json/list`);
    const targets = await response.json();
    const pageTarget = targets.find(target => target.type === 'page' && target.url === pageUrl);
    if (pageTarget?.webSocketDebuggerUrl) return pageTarget;
    await sleep(100);
  }

  throw new Error('Unable to find Chrome page target for the smoke test URL.');
};

const createPageTarget = async (devToolsPort, pageUrl) => {
  const endpoints = [
    `http://127.0.0.1:${devToolsPort}/json/new?${encodeURIComponent(pageUrl)}`,
    `http://127.0.0.1:${devToolsPort}/json/new?url=${encodeURIComponent(pageUrl)}`,
  ];

  for (const endpoint of endpoints) {
    let response = await fetch(endpoint, { method: 'PUT' });

    if (!response.ok) {
      response = await fetch(endpoint);
    }

    if (!response.ok) continue;

    const target = await response.json();
    if (process.env.SMOKE_DEBUG) {
      console.error(JSON.stringify({ endpoint, target }, null, 2));
    }
    assert(target.webSocketDebuggerUrl, 'Chrome did not return a page websocket URL.');

    if (!target.url || target.url === 'about:blank') {
      await sleep(500);
      const targetsResponse = await fetch(`http://127.0.0.1:${devToolsPort}/json/list`);
      const targets = await targetsResponse.json();
      if (process.env.SMOKE_DEBUG) {
        console.error(JSON.stringify({ targets }, null, 2));
      }
      const matchingTarget = targets.find(candidate => candidate.id === target.id && candidate.url === pageUrl);
      if (matchingTarget?.webSocketDebuggerUrl) return matchingTarget;
    }

    if (target.url === pageUrl) return target;
  }

  throw new Error('Unable to create Chrome page target for the app URL.');
};

const evaluate = async (client, expression) => {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });

  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Runtime evaluation failed.');
  }

  return result.result.value;
};

const waitFor = async (client, expression, message) => {
  const start = Date.now();

  while (Date.now() - start < 10000) {
    if (await evaluate(client, expression)) return;
    await sleep(100);
  }

  throw new Error(message);
};

const stopChrome = async chrome => {
  if (!chrome || chrome.exitCode !== null) return;

  const exited = new Promise(resolve => chrome.once('exit', resolve));
  chrome.kill('SIGTERM');

  const didExit = await Promise.race([
    exited.then(() => true),
    sleep(2000).then(() => false),
  ]);

  if (!didExit && chrome.exitCode === null) {
    chrome.kill('SIGKILL');
    await Promise.race([
      new Promise(resolve => chrome.once('exit', resolve)),
      sleep(1000),
    ]);
  }
};

const snapshotExpression = `
(() => {
  const board = document.querySelector('[data-testid="board"]');
  const boardRect = board?.getBoundingClientRect();
  const tiles = [...document.querySelectorAll('[data-testid="tile"]')];
  const connectors = [...document.querySelectorAll('[data-testid="connector"]')];
  const tokens = [...document.querySelectorAll('[data-testid="team-token"]')];
  const startTile = document.querySelector('[data-testid="tile"][data-tile-id="0"]');
  const activeToken = document.querySelector('[data-testid="team-token"][data-team-id="0"]');
  const confettiLayer = document.querySelector('.confetti-piece')?.parentElement ?? null;
  const modalLayer = [...document.querySelectorAll('.fixed.inset-0')]
    .find(element => getComputedStyle(element).zIndex === '100') ?? null;

  return {
    boardExists: Boolean(board),
    tileCount: tiles.length,
    connectorCount: connectors.length,
    startTokenCount: startTile?.querySelectorAll('[data-testid="team-token"]').length ?? 0,
    activeTeamTileIndex: Number(activeToken?.closest('[data-testid="tile"]')?.dataset.pathIndex),
    activePositionText: document.querySelector('[data-testid="active-position"]')?.textContent.trim(),
    defenseText: document.querySelector('[data-testid="tile"][data-tile-id="15"]')?.textContent.trim(),
    tokenTexts: tokens.map(token => token.textContent.trim()),
    tokenBackgrounds: tokens.map(token => getComputedStyle(token).backgroundColor),
    connectorZ: connectors.map(connector => Number(getComputedStyle(connector).zIndex)),
    confettiCount: document.querySelectorAll('.confetti-piece').length,
    confettiZ: confettiLayer ? Number(getComputedStyle(confettiLayer).zIndex) : null,
    modalZ: modalLayer ? Number(getComputedStyle(modalLayer).zIndex) : null,
    bodyText: document.body.innerText,
    tileRects: tiles.map(tile => {
      const rect = tile.getBoundingClientRect();
      return {
        id: Number(tile.dataset.tileId),
        pathIndex: Number(tile.dataset.pathIndex),
        col: Number(tile.dataset.col),
        row: Number(tile.dataset.row),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        left: Math.round(rect.left - boardRect.left),
        top: Math.round(rect.top - boardRect.top),
        styleWidth: Math.round(parseFloat(tile.style.width)),
        styleHeight: Math.round(parseFloat(tile.style.height)),
        styleLeft: Math.round(parseFloat(tile.style.left)),
        styleTop: Math.round(parseFloat(tile.style.top)),
        z: Number(getComputedStyle(tile).zIndex),
        text: tile.textContent.trim(),
      };
    }),
  };
})()
`;

const diagnosticsExpression = `
(() => ({
  url: location.href,
  readyState: document.readyState,
  title: document.title,
  bodyText: document.body?.innerText?.slice(0, 1000) ?? '',
  html: document.documentElement?.outerHTML?.slice(0, 1000) ?? '',
  resources: performance.getEntriesByType('resource').map(entry => ({
    name: entry.name,
    initiatorType: entry.initiatorType,
    transferSize: entry.transferSize,
    decodedBodySize: entry.decodedBodySize,
  })),
}))()
`;

const validateBoard = (snapshot, gameData) => {
  const occupiedCells = gameData.gridMatrix.flat().filter(Boolean).length;

  assert(snapshot.boardExists, 'Board did not render.');
  assert(snapshot.tileCount === 16, `Expected 16 tiles, found ${snapshot.tileCount}.`);
  assert(snapshot.tileCount === occupiedCells, `Expected tile count to match occupied matrix cells (${occupiedCells}).`);
  assert(snapshot.connectorCount === 15, `Expected 15 connectors, found ${snapshot.connectorCount}.`);
  assert(snapshot.startTokenCount === 4, `Expected all 4 team icons in Start, found ${snapshot.startTokenCount}.`);
  assert(snapshot.defenseText.includes('🏆'), 'Defense tile does not contain the trophy emoji.');
  assert(snapshot.tokenTexts.length === 4, `Expected 4 team icons, found ${snapshot.tokenTexts.length}.`);
  assert(snapshot.tokenTexts.every(emoji => allowedTeamEmojis.has(emoji)), 'A team token used an emoji outside the allowed set.');
  assert(
    snapshot.tokenBackgrounds.every(background => background === 'rgba(0, 0, 0, 0)'),
    `Expected transparent team token backgrounds, found ${snapshot.tokenBackgrounds.join(', ')}.`,
  );

  const expectedById = new Map(gameData.pathOrder.map((tile, pathIndex) => [tile.id, { ...tile, pathIndex }]));
  const seenPositions = new Set();

  snapshot.tileRects.forEach(tile => {
    const expected = expectedById.get(tile.id);
    assert(expected, `Unexpected tile id ${tile.id}.`);

    const expectedLeft =
      gameData.gameSettings.boardLeft +
      expected.col * (gameData.gameSettings.tileWidth + gameData.gameSettings.columnGap);
    const expectedTop =
      gameData.gameSettings.boardTop +
      expected.row * (gameData.gameSettings.tileHeight + gameData.gameSettings.rowGap);

    assert(tile.styleWidth === gameData.gameSettings.tileWidth, `Tile ${tile.id} has wrong style width ${tile.styleWidth}.`);
    assert(tile.styleHeight === gameData.gameSettings.tileHeight, `Tile ${tile.id} has wrong style height ${tile.styleHeight}.`);
    assert(tile.styleLeft === expectedLeft, `Tile ${tile.id} style left=${tile.styleLeft}, expected ${expectedLeft}.`);
    assert(tile.styleTop === expectedTop, `Tile ${tile.id} style top=${tile.styleTop}, expected ${expectedTop}.`);
    assert(tile.width >= gameData.gameSettings.tileWidth, `Tile ${tile.id} did not scale up in the full-screen layout.`);
    assert(tile.col === expected.col && tile.row === expected.row, `Tile ${tile.id} has wrong grid coordinate.`);
    assert(tile.pathIndex === expected.pathIndex, `Tile ${tile.id} has wrong path index.`);
    assert(tile.z > Math.max(...snapshot.connectorZ), `Tile ${tile.id} is not above connectors.`);
    assert(!/\bAct\b|\bDraw\b|Yes\/No/.test(tile.text), `Tile ${tile.id} includes action text: "${tile.text}".`);

    const positionKey = `${tile.styleLeft},${tile.styleTop}`;
    assert(!seenPositions.has(positionKey), `Multiple tiles occupy ${positionKey}.`);
    seenPositions.add(positionKey);
  });
};

const createSeedState = gameData => ({
  teams: gameData.teamEmojis.slice(0, 4).map((emoji, index) => ({
    id: index,
    name: `Team ${index + 1}`,
    emoji,
    position: 0,
    history: [0],
  })),
  activeTeamId: 0,
  updatedAt: Date.now(),
});

const smokeHarnessScript = `
(() => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const waitFor = async (predicate, message) => {
    const start = Date.now();
    while (Date.now() - start < 8000) {
      if (predicate()) return;
      await sleep(100);
    }
    throw new Error(message);
  };
  const buttonByText = text => [...document.querySelectorAll('button')]
    .find(button => button.textContent.trim() === text);

  window.addEventListener('load', () => {
    (async () => {
      await waitFor(
        () => document.querySelectorAll('[data-testid="tile"]').length === 16,
        'Board did not render 16 tiles.',
      );

      const tokenBackgrounds = [...document.querySelectorAll('[data-testid="team-token"]')]
        .map(token => getComputedStyle(token).backgroundColor);
      assert(
        tokenBackgrounds.every(background => background === 'rgba(0, 0, 0, 0)'),
        'Team token backgrounds are not transparent.',
      );

      const firstTile = document.querySelector('[data-testid="tile"]');
      assert(firstTile.getBoundingClientRect().width >= 112, 'Board tiles did not scale to available space.');

      for (let index = 0; index < 8; index += 1) {
        document.querySelector('[data-testid="double-forward-button"]').click();
        await sleep(120);
      }

      await waitFor(
        () => document.querySelector('[data-testid="active-position"]')?.textContent.trim() === '15 / 15',
        'Team did not reach Defense.',
      );
      await waitFor(
        () => document.querySelectorAll('.confetti-piece').length === 160,
        'Defense confetti did not render.',
      );

      buttonByText('End Game').click();
      await waitFor(() => document.body.innerText.includes('End game?'), 'End-game confirmation did not open.');
      buttonByText('Show Winners').click();
      await waitFor(
        () => document.body.innerText.includes('Defense complete') && document.body.innerText.includes('Final table'),
        'Winners celebration modal did not render.',
      );
      await waitFor(
        () => document.querySelectorAll('.confetti-piece').length === 160,
        'Winner confetti did not render.',
      );

      const confettiLayer = document.querySelector('.confetti-piece')?.parentElement;
      const modalLayer = [...document.querySelectorAll('.fixed.inset-0')]
        .find(element => getComputedStyle(element).zIndex === '100');
      assert(Number(getComputedStyle(confettiLayer).zIndex) > Number(getComputedStyle(modalLayer).zIndex), 'Confetti is not above modal.');
      assert(document.body.innerText.includes('Team 1 wins'), 'Winner name did not render.');
      assert(document.body.innerText.includes('Back to Game'), 'Back to Game action did not render.');

      const result = document.createElement('pre');
      result.id = 'smoke-result';
      result.textContent = 'SMOKE_OK celebration flow passed';
      document.body.appendChild(result);
    })().catch(error => {
      const result = document.createElement('pre');
      result.id = 'smoke-result';
      result.textContent = 'SMOKE_FAILED ' + error.message;
      document.body.appendChild(result);
    });
  });
})();
`;

const main = async () => {
  const gameData = await readGameData();
  const seedState = createSeedState(gameData);
  const { server, origin } = await startStaticServer(seedState, smokeHarnessScript);
  const pageUrl = `${origin}/`;

  try {
    const chrome = spawn(chromeBin, [
      '--headless=new',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--run-all-compositor-stages-before-draw',
      '--virtual-time-budget=12000',
      '--window-size=1400,900',
      '--dump-dom',
      pageUrl,
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let chromeStdout = '';
    let chromeStderr = '';
    chrome.stdout.on('data', chunk => {
      chromeStdout += chunk.toString();
    });
    chrome.stderr.on('data', chunk => {
      chromeStderr += chunk.toString();
    });

    const exitCode = await new Promise(resolve => {
      chrome.once('exit', resolve);
    });

    if (exitCode !== 0) {
      throw new Error(`Chrome exited with code ${exitCode}: ${chromeStderr}`);
    }

    if (!chromeStdout.includes('SMOKE_OK celebration flow passed')) {
      const failure = chromeStdout.match(/SMOKE_FAILED[^<]*/)?.[0];
      throw new Error(failure || 'Smoke harness did not report success.');
    }

    console.log('Smoke OK: board render, scaling, transparent tokens, movement, defense confetti, and winners modal all passed.');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
};

main().catch(error => {
  console.error(`Smoke FAILED: ${error.message}`);
  process.exitCode = 1;
});
