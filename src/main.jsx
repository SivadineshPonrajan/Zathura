import React, { useState, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

// =============================================================================
// Game Constants
// ===========================================================================

const BOARD_SIZE = 15;
const DEFENSE_POSITION = 14;

const PHD_MILESTONES = [
  { position: 2, title: 'Find Supervisor', subtitle: 'Advisor match', caption: 'Your research journey begins with the right mentor.' },
  { position: 5, title: 'First Publication', subtitle: 'Paper accepted', caption: 'Your work reaches the academic community.' },
  { position: 8, title: 'Conference Trip', subtitle: 'Networking', caption: 'Present your research and connect with peers.' },
  { position: 11, title: 'Dissertation Draft', subtitle: 'Complete manuscript', caption: 'All chapters come together.' },
];

const TILE_TYPES = {
  ACT: 'act',
  DRAW: 'draw', 
  BUILD: 'build',
  MILESTONE: 'milestone',
  START: 'start',
  DEFENSE: 'defense'
};

const REGULAR_TILES = [
  // ACT tiles (purple) - positions 1, 4, 6, 9, 12, 13
  { type: TILE_TYPES.ACT, label: 'Research', icon: 'bi-search' },
  { type: TILE_TYPES.ACT, label: 'Writing', icon: 'bi-file-text' },
  { type: TILE_TYPES.ACT, label: 'Revisions', icon: 'bi-pencil' },
  { type: TILE_TYPES.ACT, label: 'Conference', icon: 'bi-people' },
  { type: TILE_TYPES.ACT, label: 'Data', icon: 'bi-graph-up' },
  { type: TILE_TYPES.ACT, label: 'Teaching', icon: 'bi-mortarboard' },
  
  // DRAW tiles (blue) - positions 3, 7, 10
  { type: TILE_TYPES.DRAW, label: 'Sketch', icon: 'bi-pen' },
  { type: TILE_TYPES.DRAW, label: 'Diagrams', icon: 'bi-diagram-3' },
  { type: TILE_TYPES.DRAW, label: 'Figures', icon: 'bi-app' },
  
  // BUILD tiles (orange) - positions 14 is defense
  { type: TILE_TYPES.BUILD, label: 'Prototype', icon: 'bi wrench' },
  { type: TILE_TYPES.BUILD, label: 'Coding', icon: 'bi-code' },
  { type: TILE_TYPES.BUILD, label: 'Testing', icon: 'bi-activity' },
];

const TEAM_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#f39c12', '#1abc9c'];

// =============================================================================
// Helper Functions
// ===========================================================================

const getTilePosition = (index) => {
  // S-shaped path: rows of 4 tiles, odd rows reversed
  const row = Math.floor(index / 4);
  const col = index % 4;
  const isOddRow = row % 2 === 1;
  
  return {
    x: isOddRow ? (3 - col) * 20 + 10 : col * 20 + 10,
    y: row * 20 + 10,
    row,
    col: isOddRow ? 3 - col : col
  };
};

const getIconForType = (type) => {
  const icons = {
    [TILE_TYPES.ACT]: 'bi-mic-fill',
    [TILE_TYPES.DRAW]: 'bi-pen-fill',
    [TILE_TYPES.BUILD]: 'bi-brick-fill',
    [TILE_TYPES.MILESTONE]: 'bi-star-fill',
    [TILE_TYPES.START]: 'bi-flag-fill',
    [TILE_TYPES.DEFENSE]: 'bi-mortarboard-fill'
  };
  return icons[type] || 'bi-circle-fill';
};

// =============================================================================
// Components
// ===========================================================================

const Tile = ({ index, data, isMilestone, isSelected, onClick, teamCount }) => {
  const position = getTilePosition(index);
  const icon = getIconForType(data.type);
  
  let bgClass, borderClass, hoverClass;
  
  if (data.type === TILE_TYPES.START) {
    bgClass = 'bg-gradient-to-br from-cyan-400 to-cyan-500';
    borderClass = 'border-cyan-600';
    hoverClass = 'hover:ring-4 hover:ring-cyan-300';
  } else if (data.type === TILE_TYPES.DEFENSE) {
    bgClass = 'bg-gradient-to-br from-emerald-400 to-emerald-500';
    borderClass = 'border-emerald-600';
    hoverClass = 'hover:ring-4 hover:ring-emerald-300';
  } else if (isMilestone) {
    bgClass = 'bg-gradient-to-br from-amber-200 to-amber-300';
    borderClass = 'border-amber-500';
    hoverClass = 'hover:ring-4 hover:ring-amber-300';
  } else if (data.type === TILE_TYPES.ACT) {
    bgClass = 'bg-gradient-to-br from-purple-300 to-purple-400';
    borderClass = 'border-purple-500';
    hoverClass = 'hover:ring-4 hover:ring-purple-300';
  } else if (data.type === TILE_TYPES.DRAW) {
    bgClass = 'bg-gradient-to-br from-blue-300 to-blue-400';
    borderClass = 'border-blue-500';
    hoverClass = 'hover:ring-4 hover:ring-blue-300';
  } else if (data.type === TILE_TYPES.BUILD) {
    bgClass = 'bg-gradient-to-br from-orange-300 to-orange-400';
    borderClass = 'border-orange-500';
    hoverClass = 'hover:ring-4 hover:ring-orange-300';
  }

  return (
    <div
      onClick={onClick}
      className={`
        absolute w-20 h-20 md:w-24 md:h-24 rounded-2xl shadow-lg border-4 transition-all duration-300 cursor-pointer
        ${bgClass} ${borderClass} ${hoverClass}
        ${isSelected ? 'ring-4 ring-offset-4 ring-offset-white ring-blue-400 z-20 scale-105' : ''}
      `}
      style={{
        left: `${position.x}%`,
        top: `${position.y}%`,
        transform: 'translate(-50%, -50%)',
        width: '140px',
        height: '120px',
      }}
    >
      <div className="flex flex-col items-center justify-center h-full w-full text-white p-2">
        <i className={`${icon} text-3xl md:text-4xl mb-2`}></i>
        <span className="font-bold text-lg md:text-xl">{data.label}</span>
        {isMilestone && (
          <span className="text-xs font-semibold bg-white/30 px-2 py-1 rounded-full mt-2">
            Milestone
          </span>
        )}
        {teamCount > 0 && (
          <div className="absolute -bottom-2 flex gap-1">
            {Array(Math.min(teamCount, 4)).map((_, i) => (
              <div key={i} className="w-3 h-3 rounded-full bg-white border-2 border-black" />
            ))}
            {teamCount > 4 && (
              <div className="w-3 h-3 rounded-full bg-black/50 border-2 border-white flex items-center justify-center text-[8px]">
                +{teamCount - 4}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const TeamToken = ({ team, isSelected, currentTileData, isMilestone, onClick }) => {
  const position = getTilePosition(team.position);
  
  return (
    <div
      onClick={onClick}
      className={`
        absolute transition-all duration-300 ease-out cursor-pointer z-30
        ${isSelected ? 'scale-110 ring-4 ring-white ring-offset-2 ring-offset-blue-400' : ''}
      `}
      style={{
        left: `${position.x}%`,
        top: `${position.y}%`,
        transform: 'translate(-50%, -50%) translateX(25px)',
        width: '40px',
        height: '40px',
      }}
    >
      <div className={`
        w-full h-full rounded-full flex items-center justify-center text-white font-bold shadow-lg
        ${isSelected ? 'animate-pop' : ''}
      `}
      style={{ background: team.color }}
      >
        T{team.id}
      </div>
    </div>
  );
};

const ControlPanel = ({ 
  teams, 
  activeTeamId, 
  onSelectTeam, 
  onMove, 
  onUndo,
  onReset,
  currentTileData,
  isMilestone
}) => {
  const activeTeam = teams.find(t => t.id === activeTeamId);
  
  return (
    <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 h-full">
      <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
        <i className="bi bi-gear-fill"></i>
        Team Controls
      </h2>
      
      {/* Team Selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-600 mb-3">Select Team</label>
        <div className="grid grid-cols-3 gap-3">
          {teams.map(team => (
            <button
              key={team.id}
              onClick={() => onSelectTeam(team.id)}
              className={`
                p-3 rounded-xl font-semibold transition-all duration-200 flex items-center gap-2
                ${activeTeamId === team.id 
                  ? `ring-2 ring-offset-2 ${team.color} text-white` 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}
              `}
              style={activeTeamId === team.id ? {} : {}}
            >
              <span className="w-3 h-3 rounded-full" style={{ background: team.color }}></span>
              Team {team.id}
            </button>
          ))}
        </div>
      </div>
      
      {/* Current Position Display */}
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-4 mb-6 text-white">
        <div className="text-sm text-gray-400 mb-2">Current Position</div>
        <div className="flex items-end gap-2">
          <span className="text-4xl font-bold">{activeTeam.position} / {DEFENSE_POSITION}</span>
        </div>
        <div className="mt-2 h-2 bg-gray-700 rounded-full overflow-hidden">
          <div 
            className="h-full bg-blue-500 transition-all duration-500"
            style={{ width: `${(activeTeam.position / DEFENSE_POSITION) * 100}%` }}
          ></div>
        </div>
      </div>
      
      {/* Move Controls */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-600 mb-3">Move</label>
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => onMove(-1)}
            disabled={activeTeam.position === 0}
            className="p-3 rounded-xl font-bold transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed
              bg-red-100 text-red-700 hover:bg-red-200 active:scale-95"
          >
            -1
          </button>
          <button
            onClick={() => onMove(1)}
            disabled={activeTeam.position >= DEFENSE_POSITION}
            className="p-3 rounded-xl font-bold transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed
              bg-blue-500 text-white hover:bg-blue-600 active:scale-95"
          >
            +1
          </button>
          <button
            onClick={() => onMove(2)}
            disabled={activeTeam.position >= DEFENSE_POSITION - 1}
            className="p-3 rounded-xl font-bold transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed
              bg-purple-500 text-white hover:bg-purple-600 active:scale-95"
          >
            +2
          </button>
        </div>
      </div>
      
      {/* Action Buttons */}
      <div className="space-y-3">
        <button
          onClick={onUndo}
          disabled={teams.find(t => t.id === activeTeamId).history.length <= 1}
          className="w-full p-3 rounded-xl font-semibold transition-colors
            bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 justify-center"
        >
          <i className="bi bi-undo"></i>
          Undo Move
        </button>
        <button
          onClick={onReset}
          className="w-full p-3 rounded-xl font-semibold transition-colors
            bg-red-100 text-red-700 hover:bg-red-200 flex items-center gap-2 justify-center"
        >
          <i className="bi bi-arrow-counterclockwise"></i>
          Reset Board
        </button>
      </div>
      
      {/* Tile Info */}
      {currentTileData && (
        <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
          <h3 className="font-bold text-gray-800 mb-2">{currentTileData.label}</h3>
          <p className="text-sm text-gray-600">
            {isMilestone ? ' 🔶 ' + currentTileData.caption : 'A step in your academic journey.'}
          </p>
        </div>
      )}
    </div>
  );
};

const Header = ({ teams, activeTeamId }) => {
  const leader = teams.reduce((max, t) => t.position > max.position ? t : max);
  const activeTeam = teams.find(t => t.id === activeTeamId);
  
  return (
    <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-4 mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white shadow-lg">
            <i className="bi bi-mortarboard-fill text-2xl"></i>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Zathura</h1>
            <p className="text-sm text-gray-500">A PhD Journey</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-sm text-gray-500">Current Leader</div>
            <div className="flex items-center gap-2 font-semibold text-xl">
              <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-lg">
                <i className="bi bi-trophy-fill mr-1"></i>
                Team {leader.id}
              </span>
            </div>
          </div>
          
          <div className="w-48">
            <div className="flex justify-between text-xs font-semibold text-gray-500 mb-1">
              <span>Board Progress</span>
              <span>{Math.round(teams.reduce((sum, t) => sum + t.position, 0) / teams.length / DEFENSE_POSITION * 100)}%</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-green-400 to-emerald-500 transition-all duration-500"
                style={{ width: `${teams.reduce((sum, t) => sum + t.position, 0) / teams.length / DEFENSE_POSITION * 100}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="mt-4 text-sm text-gray-500">
        Move teams along the S-shaped path. Reach position {DEFENSE_POSITION} to complete the PhD journey!
      </div>
    </header>
  );
};

// =============================================================================
// Main Game Component
// ===========================================================================

const Game = () => {
  const [teams, setTeams] = useState(() => {
    const initialTeams = [];
    const colors = ['#e74c3c', '#3498db', '#2ecc71', '#9b59b6'];
    for (let i = 1; i <= 4; i++) {
      initialTeams.push({
        id: i,
        position: 0,
        history: [0],
        color: colors[(i - 1) % colors.length]
      });
    }
    return initialTeams;
  });
  
  const [activeTeamId, setActiveTeamId] = useState(1);
  const [selectedTileIndex, setSelectedTileIndex] = useState(0);
  
  const currentTeam = teams.find(t => t.id === activeTeamId);
  
  const getTileData = (index) => {
    if (index === 0) return { type: TILE_TYPES.START, label: 'Start', icon: 'bi-flag-fill' };
    if (index === DEFENSE_POSITION) return { type: TILE_TYPES.DEFENSE, label: 'Defense', icon: 'bi-mortarboard-fill' };
    
    // Map tile indices to regular tiles
    const tileIndex = index - 1;
    const tile = REGULAR_TILES[tileIndex % REGULAR_TILES.length];
    return { type: tile.type, label: tile.label, icon: tile.icon };
  };
  
  const getIsMilestone = (index) => {
    if (index === 0 || index === DEFENSE_POSITION) return false;
    return PHD_MILESTONES.some(m => m.position === index);
  };
  
  const handleMove = (delta) => {
    if (delta > 0 && currentTeam.position >= DEFENSE_POSITION) return;
    if (delta < 0 && currentTeam.position <= 0) return;
    
    const newTeam = { ...currentTeam };
    newTeam.position = Math.max(0, Math.min(DEFENSE_POSITION, currentTeam.position + delta));
    newTeam.history.push(currentTeam.position);
    
    setTeams(teams.map(t => t.id === activeTeamId ? newTeam : t));
    setSelectedTileIndex(newTeam.position);
    
    // Check for milestones
    const milestone = PHD_MILESTONES.find(m => m.position === newTeam.position);
    if (milestone) {
      setTeams(teams.map(t => t.id === activeTeamId ? { ...t, position: t.position + 1 } : t));
    }
    
    // Check for win
    if (newTeam.position === DEFENSE_POSITION) {
      setTimeout(() => alert(`Team ${activeTeamId} has completed their PhD Journey! 🎓`), 100);
    }
  };
  
  const handleUndo = () => {
    const history = currentTeam.history;
    if (history.length <= 1) return;
    
    const previousPosition = history[history.length - 1];
    const newHistory = history.slice(0, -1);
    
    const newTeam = { ...currentTeam, position: previousPosition, history: newHistory };
    setTeams(teams.map(t => t.id === activeTeamId ? newTeam : t));
    setSelectedTileIndex(previousPosition);
  };
  
  const handleReset = () => {
    if (confirm('Reset all teams to the start position?')) {
      setTeams(teams.map(t => ({ ...t, position: 0, history: [0] })));
      setSelectedTileIndex(0);
    }
  };
  
  const currentTileData = getTileData(currentTeam.position);
  const isMilestone = getIsMilestone(currentTeam.position);
  const milestoneData = PHD_MILESTONES.find(m => m.position === currentTeam.position);
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4 md:p-8">
      <Header 
        teams={teams} 
        activeTeamId={activeTeamId} 
      />
      
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Board Area */}
        <div className="lg:col-span-9">
          <div className="bg-white rounded-3xl shadow-2xl border border-gray-200 p-6 md:p-12 relative overflow-hidden min-h-[600px]">
            {/* Background path decoration */}
            <div className="absolute inset-0 pointer-events-none opacity-5">
              {/* Simple path line from start to defense */}
              <svg className="w-full h-full" preserveAspectRatio="none">
                <path 
                  d="M50,25 L50,100 L25,100 L25,175 L75,175 L75,250 L25,250 L25,325 L75,325 L75,400 L25,400 L25,475 L50,475"
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2"
                  className="text-gray-900"
                />
              </svg>
            </div>
            
            {/* Game Board */}
            <div className="relative" style={{ height: '500px' }}>
              {/* Milestone Markers (visual only) */}
              {PHD_MILESTONES.map((milestone, i) => {
                const pos = getTilePosition(milestone.position);
                return (
                  <div
                    key={milestone.position}
                    className="absolute flex items-center justify-center w-8 h-8 rounded-full bg-amber-400 border-4 border-amber-200 text-white z-10"
                    style={{
                      left: `${pos.x}%`,
                      top: `${pos.y}%`,
                      transform: 'translate(-50%, -50%)',
                    }}
                  >
                    <i className="bi bi-star-fill text-xs"></i>
                  </div>
                );
              })}
              
              {/* Render tiles */}
              {[0, ...REGULAR_TILES.map((_, i) => i + 1)].slice(0, 16).map((index) => {
                if (index === 0) {
                  return (
                    <Tile
                      key={index}
                      index={index}
                      data={getTileData(index)}
                      isMilestone={false}
                      isSelected={selectedTileIndex === index}
                      onClick={() => setSelectedTileIndex(index)}
                      teamCount={teams.filter(t => t.position === index).length}
                    />
                  );
                }
                return (
                  <Tile
                    key={index}
                    index={index}
                    data={getTileData(index)}
                    isMilestone={getIsMilestone(index)}
                    isSelected={selectedTileIndex === index}
                    onClick={() => setSelectedTileIndex(index)}
                    teamCount={teams.filter(t => t.position === index).length}
                  />
                );
              })}
              
              {/* Render team tokens */}
              {teams.map(team => (
                <TeamToken
                  key={team.id}
                  team={team}
                  isSelected={activeTeamId === team.id}
                  currentTileData={currentTileData}
                  isMilestone={isMilestone}
                  onClick={() => setActiveTeamId(team.id)}
                />
              ))}
            </div>
          </div>
          
          {/* Info Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <div className="bg-white rounded-2xl shadow-md p-5 border-l-4 border-purple-500">
              <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
                <i className="bi bi-mic-fill text-purple-600"></i>
                Research Stage
              </h3>
              <p className="text-gray-600 text-sm">
                Focus on core research activities. Perfect for deep work and data gathering.
              </p>
            </div>
            <div className="bg-white rounded-2xl shadow-md p-5 border-l-4 border-blue-500">
              <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
                <i className="bi bi-pen-fill text-blue-600"></i>
                Writing Phase
              </h3>
              <p className="text-gray-600 text-sm">
                Draft your papers and document your findings. Clear communication is key.
              </p>
            </div>
            <div className="bg-white rounded-2xl shadow-md p-5 border-l-4 border-orange-500">
              <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
                <i className="bi bi-brick-fill text-orange-600"></i>
                Defense Prep
              </h3>
              <p className="text-gray-600 text-sm">
                Final polishing and preparation. You're nearly there!
              </p>
            </div>
          </div>
        </div>
        
        {/* Control Panel */}
        <div className="lg:col-span-3">
          <ControlPanel 
            teams={teams}
            activeTeamId={activeTeamId}
            onSelectTeam={setActiveTeamId}
            onMove={handleMove}
            onUndo={handleUndo}
            onReset={handleReset}
            currentTileData={currentTileData}
            isMilestone={isMilestone}
          />
        </div>
      </div>
      
      {/* Milestone Modal */}
      {isMilestone && milestoneData && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden animate-pop">
            <div className={`h-32 bg-gradient-to-r ${milestoneData.position === DEFENSE_POSITION ? 'from-emerald-400 to-emerald-600' : 'from-amber-400 to-amber-500'}`}></div>
            <div className="px-8 py-6">
              <div className="flex items-center justify-center mb-4">
                <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-lg text-3xl">
                  <i className="bi bi-star-fill text-amber-500"></i>
                </div>
              </div>
              <h2 className="text-3xl font-bold text-center mb-2">{milestoneData.title}</h2>
              <p className="text-amber-600 font-semibold text-center mb-4">{milestoneData.subtitle}</p>
              <p className="text-gray-600 text-center leading-relaxed">
                {milestoneData.caption}
              </p>
              <button
                onClick={() => {}}
                className="mt-6 w-full py-3 rounded-xl font-bold text-white bg-gray-900 hover:bg-gray-800 transition-colors"
              >
                Continue Journey
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// =============================================================================
// Render
// ===========================================================================

const root = createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <Game />
  </React.StrictMode>
);
