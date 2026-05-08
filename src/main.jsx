import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import gameData from './game-data.json';
import './index.css';

const { gridMatrix, tileDefinitions, pathOrder, gameSettings, teamEmojis } = gameData;

const TILE_WIDTH = gameSettings.tileWidth;
const TILE_HEIGHT = gameSettings.tileHeight;
const COLUMN_GAP = gameSettings.columnGap;
const ROW_GAP = gameSettings.rowGap;
const BOARD_LEFT = gameSettings.boardLeft;
const BOARD_TOP = gameSettings.boardTop;
const BOARD_COLUMNS = gridMatrix[0]?.length ?? 0;
const BOARD_ROWS = gridMatrix.length;
const BOARD_WIDTH =
  BOARD_LEFT * 2 + BOARD_COLUMNS * TILE_WIDTH + Math.max(0, BOARD_COLUMNS - 1) * COLUMN_GAP;
const BOARD_HEIGHT =
  BOARD_TOP * 2 + BOARD_ROWS * TILE_HEIGHT + Math.max(0, BOARD_ROWS - 1) * ROW_GAP;
const TILE_BORDER_WIDTH = 2;
const TILE_RADIUS = 14;
const MIN_TEAMS = 1;
const MAX_TEAMS = Math.min(8, teamEmojis.length);
const DEFAULT_TEAM_COUNT = Math.min(4, MAX_TEAMS);
const STORAGE_KEY = 'zathura-game-state-v2';
const CONFETTI_VISIBLE_MS = 5000;

const TILE_TYPE_EMOJIS = {
  act: '🎬',
  draw: '🎨',
  yesno: '⁉️',
};

const TILE_THEMES = {
  start: {
    border: '#4e6d7e',
    background: 'linear-gradient(135deg, #182231 0%, #223848 100%)',
    shadow: '0 18px 34px rgba(0, 0, 0, 0.28)',
  },
  act: {
    border: '#5d5370',
    background: 'linear-gradient(135deg, #211d2d 0%, #32283f 100%)',
    shadow: '0 18px 34px rgba(0, 0, 0, 0.3)',
  },
  draw: {
    border: '#456277',
    background: 'linear-gradient(135deg, #172433 0%, #223649 100%)',
    shadow: '0 18px 34px rgba(0, 0, 0, 0.28)',
  },
  yesno: {
    border: '#756344',
    background: 'linear-gradient(135deg, #2a241c 0%, #403420 100%)',
    shadow: '0 18px 34px rgba(0, 0, 0, 0.3)',
  },
  defense: {
    border: '#68775a',
    background: 'linear-gradient(135deg, #18251d 0%, #2f3d2a 60%, #4b3b25 100%)',
    shadow: '0 20px 42px rgba(0, 0, 0, 0.34)',
  },
};

const CONFETTI_COLORS = ['#facc15', '#38bdf8', '#fb7185', '#34d399', '#a78bfa', '#f97316'];

const tileMap = new Map(tileDefinitions.map(tile => [tile.id, tile]));

const PATH_TILES = pathOrder
  .map(pathTile => {
    const tile = tileMap.get(pathTile.id);
    if (!tile) return null;

    return {
      ...tile,
      col: pathTile.col,
      row: pathTile.row,
    };
  })
  .filter(Boolean);

const FINAL_POSITION = PATH_TILES.length - 1;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const getTilePosition = (col, row) => ({
  x: BOARD_LEFT + col * (TILE_WIDTH + COLUMN_GAP),
  y: BOARD_TOP + row * (TILE_HEIGHT + ROW_GAP),
});

const getTileEmoji = tile => tile.emoji ?? TILE_TYPE_EMOJIS[tile.type];

const getTileLabel = tile => {
  if (!tile) return '';
  if (tile.type === 'yesno') return 'Yes/No';
  if (tile.name) return tile.name;
  if (tile.type === 'draw') return 'Draw';
  return tile.type;
};

const getTileTheme = tile => {
  if (tile.name === 'START') return TILE_THEMES.start;
  if (tile.name === 'Defense') return TILE_THEMES.defense;
  return TILE_THEMES[tile.type] ?? TILE_THEMES.act;
};

const getStandingTileLabel = tile => {
  if (!tile) return '';
  if (tile.name === 'Defense') return 'Winner 🏆';
  return tile.type === 'yesno' ? 'Yes/No' : tile.type === 'draw' ? 'Draw' : tile.type === 'act' ? 'Act' : tile.name ?? tile.type;
};

const createSetupTeams = count =>
  Array.from({ length: count }, (_, id) => ({
    id,
    name: `Team ${id + 1}`,
    emoji: teamEmojis[id % teamEmojis.length],
  }));

const normalizeTeam = (team, index) => {
  const fallbackPosition = Number.isFinite(team?.position) ? team.position : 0;
  const position = clamp(Number(fallbackPosition), 0, FINAL_POSITION);
  const history = Array.isArray(team?.history)
    ? team.history.map(entry => clamp(Number(entry), 0, FINAL_POSITION)).filter(Number.isFinite)
    : [];

  if (history.length === 0 || history[history.length - 1] !== position) {
    history.push(position);
  }

  return {
    id: index,
    name: typeof team?.name === 'string' && team.name.trim() ? team.name.trim() : `Team ${index + 1}`,
    emoji:
      typeof team?.emoji === 'string' && team.emoji.trim()
        ? team.emoji
        : teamEmojis[index % teamEmojis.length],
    position,
    history,
  };
};

const readStoredGame = () => {
  if (typeof window === 'undefined') return null;

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed?.teams) || parsed.teams.length === 0) return null;

    const teams = parsed.teams.slice(0, MAX_TEAMS).map(normalizeTeam);
    const activeTeamId = teams.some(team => team.id === parsed.activeTeamId) ? parsed.activeTeamId : 0;

    return { teams, activeTeamId };
  } catch {
    return null;
  }
};

const createGameTeams = setupTeams =>
  setupTeams.map((team, index) => ({
    id: index,
    name: team.name.trim() || `Team ${index + 1}`,
    emoji: team.emoji,
    position: 0,
    history: [0],
  }));

const calculateTokenPositions = teamsOnTile => {
  const count = teamsOnTile.length;
  if (count === 0) return [];

  const tokenSize = count > 4 ? 18 : 22;
  const gap = count > 4 ? 3 : 4;
  const perRow = count > 4 ? Math.ceil(count / 2) : count;
  const rows = Math.ceil(count / perRow);
  const totalHeight = rows * tokenSize + (rows - 1) * gap;
  const firstTop = TILE_HEIGHT - totalHeight - 8;

  return teamsOnTile.map((team, index) => {
    const row = Math.floor(index / perRow);
    const col = index % perRow;
    const rowCount = Math.min(perRow, count - row * perRow);
    const rowWidth = rowCount * tokenSize + Math.max(0, rowCount - 1) * gap;
    const rowLeft = (TILE_WIDTH - rowWidth) / 2;

    return {
      team,
      size: tokenSize,
      left: rowLeft + col * (tokenSize + gap),
      top: firstTop + row * (tokenSize + gap),
    };
  });
};

const Connector = ({ fromCol, fromRow, toCol, toRow }) => {
  const fromPos = getTilePosition(fromCol, fromRow);
  const toPos = getTilePosition(toCol, toRow);
  const fromX = fromPos.x + TILE_WIDTH / 2;
  const fromY = fromPos.y + TILE_HEIGHT / 2;
  const toX = toPos.x + TILE_WIDTH / 2;
  const toY = toPos.y + TILE_HEIGHT / 2;
  const length = Math.hypot(toX - fromX, toY - fromY);
  const angle = Math.atan2(toY - fromY, toX - fromX) * (180 / Math.PI);

  return (
    <div
      className="absolute rounded-full"
      data-testid="connector"
      data-from-col={fromCol}
      data-from-row={fromRow}
      data-to-col={toCol}
      data-to-row={toRow}
      style={{
        left: fromX,
        top: fromY,
        width: length,
        height: 6,
        transform: `translateY(-50%) rotate(${angle}deg)`,
        transformOrigin: '0 50%',
        zIndex: 1,
        background: 'linear-gradient(90deg, rgba(86, 97, 116, 0.7), rgba(119, 110, 86, 0.66), rgba(82, 105, 95, 0.7))',
        boxShadow: '0 12px 22px rgba(0, 0, 0, 0.24)',
      }}
    />
  );
};

const Tile = ({ tile, teamsOnTile }) => {
  const { x, y } = getTilePosition(tile.col, tile.row);
  const tokens = calculateTokenPositions(teamsOnTile);
  const hasTokens = tokens.length > 0;
  const nameFontSize = hasTokens ? 11 : tile.name?.length > 14 ? 12 : 13;
  const theme = getTileTheme(tile);

  return (
    <div
      className="absolute"
      data-testid="tile"
      data-tile-id={tile.id}
      data-col={tile.col}
      data-row={tile.row}
      data-path-index={tile.pathIndex}
      style={{
        left: x,
        top: y,
        width: TILE_WIDTH,
        height: TILE_HEIGHT,
        zIndex: 2,
      }}
    >
      <div
        className="relative flex h-full w-full items-center justify-center overflow-hidden shadow-lg transition-all duration-300"
        style={{
          border: `${TILE_BORDER_WIDTH}px solid ${theme.border}`,
          borderRadius: TILE_RADIUS,
          background: theme.background,
          boxShadow: theme.shadow,
        }}
      >
        <div className="absolute inset-x-0 top-0 h-1 bg-white/18" />
        <div
          className="flex h-full w-full flex-col items-center justify-center text-center"
          style={{ padding: hasTokens ? '8px 8px 36px' : '10px 8px' }}
        >
          <div className="leading-none drop-shadow" style={{ fontSize: hasTokens ? 28 : 36 }}>
            {getTileEmoji(tile)}
          </div>
          {tile.name && (
            <div
              className="mt-2 max-w-full break-words font-semibold leading-tight text-white"
              style={{ fontSize: nameFontSize }}
            >
              {tile.name}
            </div>
          )}
        </div>

        {tokens.map(({ team, size, top, left }) => (
          <div
            key={team.id}
            className="absolute flex items-center justify-center font-bold"
            data-testid="team-token"
            data-team-id={team.id}
            data-team-position={team.position}
            style={{
              top,
              left,
              width: size,
              height: size,
              fontSize: size + 3,
              filter: 'drop-shadow(0 2px 3px rgba(0, 0, 0, 0.75))',
            }}
            title={team.name}
          >
            {team.emoji}
          </div>
        ))}
      </div>
    </div>
  );
};

const Modal = ({
  title,
  children,
  footer,
  panelClassName = 'max-w-lg border border-cyan-300/20 bg-[#101326] p-6 shadow-cyan-950/40',
  titleClassName = 'text-xl font-bold text-white',
  bodyClassName = 'mt-4 text-sm text-slate-300',
  footerClassName = 'mt-6 flex flex-wrap justify-end gap-3',
}) => (
  <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
    <div className={`w-full rounded-lg text-white shadow-2xl ${panelClassName}`}>
      <h2 className={titleClassName}>{title}</h2>
      <div className={bodyClassName}>{children}</div>
      {footer && <div className={footerClassName}>{footer}</div>}
    </div>
  </div>
);

const Confetti = ({ burstKey }) => {
  const pieces = useMemo(
    () =>
      Array.from({ length: 160 }, (_, index) => ({
        id: `${burstKey}-${index}`,
        left: `${(index * 37) % 100}%`,
        width: `${6 + (index % 4) * 2}px`,
        height: `${10 + (index % 3) * 4}px`,
        color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
        delay: `${(index % 30) * 0.1}s`,
        duration: `${2.1 + (index % 8) * 0.1}s`,
        rotation: `${(index * 29) % 360}deg`,
        drift: `${((index % 13) - 6) * 18}px`,
      })),
    [burstKey],
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-[140] overflow-hidden" aria-hidden="true">
      {pieces.map(piece => (
        <span
          key={piece.id}
          className="confetti-piece"
          style={{
            left: piece.left,
            width: piece.width,
            height: piece.height,
            backgroundColor: piece.color,
            '--delay': piece.delay,
            '--duration': piece.duration,
            '--rotation': piece.rotation,
            '--drift': piece.drift,
          }}
        />
      ))}
    </div>
  );
};

const SetupScreen = ({ setupCount, setupTeams, onCountChange, onTeamChange, onStart }) => {
  const canStart = setupTeams.every(team => team.name.trim() && team.emoji);

  return (
    <div className="min-h-screen bg-[#080914] px-4 py-8 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center justify-center">
        <form
          onSubmit={event => {
            event.preventDefault();
            if (canStart) onStart();
          }}
          className="w-full rounded-lg border border-cyan-300/20 bg-[#101326] p-6 shadow-2xl shadow-cyan-950/30"
        >
          <div className="mb-6">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-200/70">
              Zathura - A PhD Journey Board Game
            </p>
            <h1 className="mt-2 text-3xl font-bold">Set up the teams</h1>
            <p className="mt-2 text-sm text-slate-400">
              Choose how many teams are playing, then name each team and select a token emoji.
            </p>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-slate-300">Number of teams</span>
            <input
              min={MIN_TEAMS}
              max={MAX_TEAMS}
              value={setupCount}
              onChange={event => onCountChange(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-600 bg-[#0b1020] px-4 py-3 text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
              type="number"
            />
          </label>

          <div className="mt-6 space-y-3">
            {setupTeams.map(team => (
              <div
                key={team.id}
                className="grid grid-cols-[92px_1fr] gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-3"
              >
                <label>
                  <span className="sr-only">Emoji for {team.name}</span>
                  <select
                    value={team.emoji}
                    onChange={event => onTeamChange(team.id, 'emoji', event.target.value)}
                    className="h-full min-h-12 w-full rounded-lg border border-slate-600 bg-[#0b1020] px-3 text-2xl outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
                  >
                    {teamEmojis.map(emoji => {
                      const selectedByOtherTeam = setupTeams.some(
                        otherTeam => otherTeam.id !== team.id && otherTeam.emoji === emoji,
                      );

                      return (
                        <option key={emoji} value={emoji} disabled={selectedByOtherTeam}>
                          {emoji}
                        </option>
                      );
                    })}
                  </select>
                </label>
                <label>
                  <span className="sr-only">Team name</span>
                  <input
                    value={team.name}
                    onChange={event => onTeamChange(team.id, 'name', event.target.value)}
                    className="h-full min-h-12 w-full rounded-lg border border-slate-600 bg-[#0b1020] px-4 font-medium text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
                    placeholder={`Team ${team.id + 1}`}
                    type="text"
                  />
                </label>
              </div>
            ))}
          </div>

          <button
            disabled={!canStart}
            className="mt-6 w-full rounded-lg bg-cyan-400 px-4 py-3 font-bold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
            type="submit"
          >
            Start Game
          </button>
        </form>
      </div>
    </div>
  );
};

const App = () => {
  const boardViewportRef = useRef(null);
  const storedGame = useMemo(readStoredGame, []);
  const [teams, setTeams] = useState(() => storedGame?.teams ?? []);
  const [activeTeamId, setActiveTeamId] = useState(() => storedGame?.activeTeamId ?? 0);
  const [isSetupOpen, setIsSetupOpen] = useState(() => !storedGame);
  const [setupCount, setSetupCount] = useState(() => storedGame?.teams.length ?? DEFAULT_TEAM_COUNT);
  const [setupTeams, setSetupTeams] = useState(() =>
    createSetupTeams(storedGame?.teams.length ?? DEFAULT_TEAM_COUNT),
  );
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);
  const [standingsOpen, setStandingsOpen] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [confettiKey, setConfettiKey] = useState(0);
  const [boardScale, setBoardScale] = useState(1);

  useEffect(() => {
    if (isSetupOpen || teams.length === 0) return;

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        teams,
        activeTeamId,
        updatedAt: Date.now(),
      }),
    );
  }, [activeTeamId, isSetupOpen, teams]);

  useEffect(() => {
    if (!showConfetti) return undefined;

    const timeout = window.setTimeout(() => setShowConfetti(false), CONFETTI_VISIBLE_MS);
    return () => window.clearTimeout(timeout);
  }, [confettiKey, showConfetti]);

  useEffect(() => {
    if (isSetupOpen) return undefined;

    const element = boardViewportRef.current;
    if (!element) return undefined;

    const updateBoardScale = () => {
      const { width, height } = element.getBoundingClientRect();
      const availableWidth = Math.max(0, width - 24);
      const availableHeight = Math.max(0, height - 24);
      const nextScale = Math.max(
        0.62,
        Math.min(availableWidth / BOARD_WIDTH, availableHeight / BOARD_HEIGHT),
      );

      if (Number.isFinite(nextScale)) {
        setBoardScale(nextScale);
      }
    };

    updateBoardScale();

    const observer =
      typeof window.ResizeObserver === 'function' ? new window.ResizeObserver(updateBoardScale) : null;
    observer?.observe(element);
    window.addEventListener('resize', updateBoardScale);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateBoardScale);
    };
  }, [isSetupOpen]);

  useEffect(() => {
    if (isSetupOpen || teams.length === 0) return;
    if (!teams.some(team => team.id === activeTeamId)) {
      setActiveTeamId(teams[0].id);
    }
  }, [activeTeamId, isSetupOpen, teams]);

  const teamsOnTile = useMemo(() => {
    const positions = Array.from({ length: PATH_TILES.length }, () => []);
    teams.forEach(team => {
      positions[team.position]?.push(team);
    });
    return positions;
  }, [teams]);

  const connectors = useMemo(
    () =>
      PATH_TILES.slice(0, -1).map((fromTile, index) => {
        const toTile = PATH_TILES[index + 1];
        return {
          key: `${fromTile.id}-${toTile.id}`,
          fromCol: fromTile.col,
          fromRow: fromTile.row,
          toCol: toTile.col,
          toRow: toTile.row,
        };
      }),
    [],
  );

  const standings = useMemo(
    () => [...teams].sort((a, b) => b.position - a.position || a.name.localeCompare(b.name)),
    [teams],
  );
  const winningPosition = standings[0]?.position ?? 0;
  const winners = standings.filter(team => team.position === winningPosition);
  const activeTeam = teams.find(team => team.id === activeTeamId) ?? teams[0];
  const activePosition = activeTeam?.position ?? 0;

  const triggerConfetti = () => {
    setShowConfetti(true);
    setConfettiKey(key => key + 1);
  };

  const moveTeam = steps => {
    if (!activeTeam) return;

    const newPos = clamp(activeTeam.position + steps, 0, FINAL_POSITION);
    if (newPos === activeTeam.position) return;

    if (activeTeam.position !== FINAL_POSITION && newPos === FINAL_POSITION) {
      triggerConfetti();
    }

    setTeams(currentTeams =>
      currentTeams.map(team =>
        team.id === activeTeam.id
          ? { ...team, position: newPos, history: [...team.history, newPos] }
          : team,
      ),
    );
  };

  const updateSetupCount = value => {
    const nextCount = clamp(Number(value) || MIN_TEAMS, MIN_TEAMS, MAX_TEAMS);
    setSetupCount(nextCount);
    setSetupTeams(currentTeams =>
      Array.from({ length: nextCount }, (_, index) => {
        if (currentTeams[index]) {
          return { ...currentTeams[index], id: index };
        }

        return {
          id: index,
          name: `Team ${index + 1}`,
          emoji: teamEmojis.find(emoji => !currentTeams.some(team => team.emoji === emoji)) ?? teamEmojis[index],
        };
      }),
    );
  };

  const updateSetupTeam = (teamId, field, value) => {
    setSetupTeams(currentTeams =>
      currentTeams.map(team => (team.id === teamId ? { ...team, [field]: value } : team)),
    );
  };

  const startGame = () => {
    const newTeams = createGameTeams(setupTeams);
    setTeams(newTeams);
    setActiveTeamId(0);
    setIsSetupOpen(false);
  };

  const resetGame = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setTeams([]);
    setActiveTeamId(0);
    setSetupCount(DEFAULT_TEAM_COUNT);
    setSetupTeams(createSetupTeams(DEFAULT_TEAM_COUNT));
    setStandingsOpen(false);
    setConfirmResetOpen(false);
    setConfirmEndOpen(false);
    setIsSetupOpen(true);
  };

  if (isSetupOpen) {
    return (
      <SetupScreen
        setupCount={setupCount}
        setupTeams={setupTeams}
        onCountChange={updateSetupCount}
        onTeamChange={updateSetupTeam}
        onStart={startGame}
      />
    );
  }

  return (
    <div className="min-h-screen overflow-hidden bg-[#080914] font-sans text-white">
      {showConfetti && <Confetti burstKey={confettiKey} />}

      <header className="h-16 border-b border-white/10 bg-[#10131f] px-5 py-3 shadow-lg shadow-black/20">
        <div className="flex h-full items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Zathura 🎓</h1>
            <p className="text-sm text-slate-400">PhD Journey Board Game</p>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider text-slate-500">Active Team</div>
            <div className="flex items-center gap-2 font-semibold">
              <span className="text-xl">{activeTeam?.emoji}</span>
              {activeTeam?.name}
            </div>
          </div>
        </div>
      </header>

      <main className="grid min-h-[calc(100vh-4rem)] gap-4 overflow-y-auto p-4 lg:h-[calc(100vh-4rem)] lg:grid-cols-[minmax(0,1fr)_370px] lg:overflow-hidden">
        <section
          ref={boardViewportRef}
          className="flex min-h-[50vh] items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-[#10131f] p-3 shadow-2xl shadow-black/30 lg:min-h-0"
        >
          <div
            className="relative shrink-0"
            style={{
              width: BOARD_WIDTH * boardScale,
              height: BOARD_HEIGHT * boardScale,
            }}
          >
            <div
              className="relative"
              data-testid="board"
              style={{
                width: BOARD_WIDTH,
                height: BOARD_HEIGHT,
                transform: `scale(${boardScale})`,
                transformOrigin: 'top left',
              }}
            >
              {connectors.map(connector => (
                <Connector
                  key={connector.key}
                  fromCol={connector.fromCol}
                  fromRow={connector.fromRow}
                  toCol={connector.toCol}
                  toRow={connector.toRow}
                />
              ))}

              {PATH_TILES.map((tile, index) => (
                <Tile
                  key={tile.id}
                  tile={{ ...tile, pathIndex: index }}
                  teamsOnTile={teamsOnTile[index]}
                />
              ))}
            </div>
          </div>
        </section>

        <aside className="grid gap-4 lg:h-full lg:grid-rows-[auto_auto_minmax(0,1fr)] lg:overflow-hidden">
          <div className="rounded-lg border border-white/10 bg-[#10131f] p-4 shadow-xl shadow-black/20">
            <h2 className="mb-3 text-base font-semibold text-slate-200">Select Team</h2>
            <div className="grid grid-cols-2 gap-2">
              {teams.map(team => (
                <button
                  key={team.id}
                  onClick={() => setActiveTeamId(team.id)}
                  className={`flex min-h-20 flex-col items-center justify-center gap-1 rounded-lg p-2 text-center transition-all ${
                    activeTeamId === team.id
                      ? 'bg-blue-500/18 ring-2 ring-blue-400'
                      : 'bg-white/[0.05] hover:bg-white/[0.09]'
                  }`}
                  type="button"
                >
                  <span className="text-2xl">{team.emoji}</span>
                  <span className="max-w-full break-words text-sm font-medium leading-tight">
                    {team.name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-[#10131f] p-4 shadow-xl shadow-black/20">
            <h2 className="mb-3 text-base font-semibold text-slate-200">Movement Controls</h2>
            <div className="mb-4 flex items-center gap-4">
              <div className="flex-1 text-center">
                <div className="mb-1 text-xs uppercase tracking-wider text-slate-500">Position</div>
                <div className="text-3xl font-bold text-blue-300" data-testid="active-position">
                  {activePosition} / {FINAL_POSITION}
                </div>
                <div className="mt-1 text-sm text-slate-400">
                  {getTileLabel(PATH_TILES[activePosition])}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => moveTeam(-1)}
                disabled={activeTeam?.position === 0}
                className="rounded-lg bg-rose-500/90 py-3 font-semibold transition-colors hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="back-button"
                type="button"
              >
                Back
              </button>
              <button
                onClick={() => moveTeam(1)}
                disabled={activeTeam?.position === FINAL_POSITION}
                className="rounded-lg bg-blue-600 py-3 text-lg font-bold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="forward-button"
                type="button"
                title="Move forward 1 step"
              >
                &gt;
              </button>
              <button
                onClick={() => moveTeam(2)}
                disabled={activeTeam?.position === FINAL_POSITION}
                className="rounded-lg bg-blue-600 py-3 text-lg font-bold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="double-forward-button"
                type="button"
                title="Move forward 2 steps"
              >
                &gt;&gt;
              </button>
            </div>
            <div className="mt-3 flex gap-3">
              <button
                onClick={() => setConfirmEndOpen(true)}
                className="flex-1 rounded-lg bg-amber-400 py-2 font-bold text-slate-950 transition-colors hover:bg-amber-300"
                type="button"
              >
                End Game
              </button>
              <button
                onClick={() => setConfirmResetOpen(true)}
                className="flex-1 rounded-lg bg-white/[0.07] py-2 font-medium transition-colors hover:bg-white/[0.12]"
                type="button"
              >
                Reset
              </button>
            </div>
          </div>

          <div className="flex min-h-0 flex-col rounded-lg border border-white/10 bg-[#10131f] p-4 shadow-xl shadow-black/20">
            <h2 className="mb-3 text-base font-semibold text-slate-200">Team Standings</h2>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {standings.map(team => (
                <div
                  key={team.id}
                  className={`flex items-center justify-between gap-3 rounded-lg p-2.5 ${
                    activeTeamId === team.id ? 'bg-blue-500/14' : 'bg-white/[0.04]'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="text-2xl">{team.emoji}</span>
                    <div className="min-w-0">
                      <div className="break-words font-medium leading-tight">{team.name}</div>
                      <div className="text-xs text-slate-500">{team.position} points</div>
                    </div>
                  </div>
                  <div className="max-w-28 text-right text-sm font-semibold text-blue-300">
                    {/* {getTileLabel(PATH_TILES[team.position])} */}
                    {getStandingTileLabel(PATH_TILES[team.position])}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </main>

      {confirmResetOpen && (
        <Modal
          title="Reset game?"
          footer={
            <>
              <button
                onClick={() => setConfirmResetOpen(false)}
                className="rounded-lg bg-white/[0.07] px-4 py-2 font-medium transition-colors hover:bg-white/[0.12]"
                type="button"
              >
                Cancel
              </button>
              <button
                onClick={resetGame}
                className="rounded-lg bg-rose-500 px-4 py-2 font-bold text-white transition-colors hover:bg-rose-400"
                type="button"
              >
                Reset Everything
              </button>
            </>
          }
        >
          This clears the saved teams, emojis, positions, and game state from local storage. You will
          return to the setup screen.
        </Modal>
      )}

      {confirmEndOpen && (
        <Modal
          title="End game?"
          footer={
            <>
              <button
                onClick={() => setConfirmEndOpen(false)}
                className="rounded-lg bg-white/[0.07] px-4 py-2 font-medium transition-colors hover:bg-white/[0.12]"
                type="button"
              >
                Keep Playing
              </button>
              <button
                onClick={() => {
                  setConfirmEndOpen(false);
                  setStandingsOpen(true);
                  triggerConfetti();
                }}
                className="rounded-lg bg-amber-400 px-4 py-2 font-bold text-slate-950 transition-colors hover:bg-amber-300"
                type="button"
              >
                Show Winners
              </button>
            </>
          }
        >
          This will show the current standings and declare the team or teams with the most points as
          winners.
        </Modal>
      )}

      {standingsOpen && (
        <Modal
          title="Final standings"
          panelClassName="max-w-2xl overflow-hidden border border-amber-300/30 bg-[#11131f] p-0 shadow-amber-950/30"
          titleClassName="sr-only"
          bodyClassName="mt-0 text-sm text-slate-300"
          footerClassName="flex flex-wrap justify-end gap-3 bg-[#11131f] px-6 pb-6"
          footer={
            <>
              <button
                onClick={() => setStandingsOpen(false)}
                className="rounded-lg bg-amber-400 px-5 py-2 font-bold text-slate-950 transition-colors hover:bg-amber-300"
                type="button"
              >
                Back to Game
              </button>
            </>
          }
        >
          <div>
            <div className="relative overflow-hidden bg-[linear-gradient(135deg,#2a2118_0%,#161a29_55%,#11131f_100%)] px-6 py-7 text-center">
              <div className="absolute left-6 top-6 h-16 w-16 rounded-full bg-amber-300/10 blur-xl" />
              <div className="absolute bottom-2 right-8 h-20 w-20 rounded-full bg-white/5 blur-2xl" />
              <div className="relative">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-amber-200/30 bg-amber-300/12 text-5xl shadow-xl shadow-black/30">
                  🏆
                </div>
                <div className="mt-4 text-xs font-semibold uppercase tracking-[0.24em] text-amber-200/75">
                  Defense complete
                </div>
                <h2 className="mt-2 text-3xl font-black leading-tight text-white">
                  {winners.length === 1 ? `${winners[0].name} wins` : 'Shared victory'}
                </h2>
                <p className="mt-2 text-sm text-amber-100/75">
                  {winningPosition} point{winningPosition === 1 ? '' : 's'} on the PhD journey
                </p>
              </div>
            </div>

            <div className="bg-[#11131f] px-6 py-5">
              <div className="mb-5 grid gap-3 sm:grid-cols-2">
                {winners.map(team => (
                  <div
                    key={team.id}
                    className={`rounded-lg border border-amber-300/25 bg-amber-300/10 p-4 text-center shadow-lg shadow-black/20 ${
                      winners.length === 1 ? 'sm:col-span-2 justify-self-center w-full max-w-[280px]' : ''
                    }`}
                  >
                    <div className="text-5xl">{team.emoji}</div>
                    <div className="mt-2 break-words text-xl font-extrabold text-white">
                      {team.name}
                    </div>
                    <div className="mt-1 text-xs font-semibold uppercase tracking-wider text-amber-200/80">
                      {winners.length > 1 ? 'Co-winner' : 'Winner'}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-slate-400">
                  Final table
                </h3>
                <span className="rounded-full bg-white/[0.06] px-3 py-1 text-xs font-semibold text-slate-300">
                  {teams.length} teams
                </span>
              </div>

              <div className="max-h-[34vh] space-y-2 overflow-y-auto pr-1">
                {standings.map((team, index) => {
                  const isWinner = team.position === winningPosition;

                  return (
                    <div
                      key={team.id}
                      className={`grid grid-cols-[52px_minmax(0,1fr)_84px] items-center gap-3 rounded-lg px-3 py-3 ${
                        isWinner
                          ? 'border border-amber-300/25 bg-amber-300/10'
                          : 'border border-white/10 bg-white/[0.04]'
                      }`}
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/20 text-lg font-black text-slate-200">
                        {isWinner ? '🏆' : `#${index + 1}`}
                      </div>
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="text-2xl">{team.emoji}</span>
                        <div className="min-w-0">
                          <div className="break-words font-bold text-white">{team.name}</div>
                          <div className="text-xs text-slate-500">
                            {getTileLabel(PATH_TILES[team.position])}
                          </div>
                        </div>
                      </div>
                      <div className="text-right text-sm font-extrabold text-amber-200">
                        {team.position}
                        <span className="ml-1 text-xs font-semibold text-slate-500">pts</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

const root = createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
