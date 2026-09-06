import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Cloud,
  Footprints,
  Gamepad2,
  HeartPulse,
  Keyboard,
  Pause,
  Play,
  Rocket,
  RotateCcw,
  ShieldAlert,
  Timer,
  Trophy,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import './index.css';

const queryClient = new QueryClient();

type GameStatus = 'idle' | 'playing' | 'paused' | 'gameover';
type FeedbackKind = 'hit' | 'miss' | 'info';
type GameMode = 'rapid-roll' | 'snake' | 'space' | 'dino';

const lanes = [
  { id: 'rose', name: 'Rose', key: 'A', color: '#ff3c87', ink: '#210b1b' },
  { id: 'violet', name: 'Violet', key: 'S', color: '#c77dff', ink: '#241033' },
  { id: 'aqua', name: 'Aqua', key: 'D', color: '#61f4de', ink: '#062725' },
  { id: 'lemon', name: 'Lemon', key: 'F', color: '#ffe14d', ink: '#302607' },
];

function GameSwitcher({ mode, onChange }: { mode: GameMode; onChange: (mode: GameMode) => void }) {
  return (
    <div className="game-switcher" aria-label="Choose a game">
      <button className={mode === 'rapid-roll' ? 'is-selected' : ''} onClick={() => onChange('rapid-roll')} aria-pressed={mode === 'rapid-roll'}>
        ROLL
      </button>
      <button className={mode === 'snake' ? 'is-selected' : ''} onClick={() => onChange('snake')} aria-pressed={mode === 'snake'}>
        SNAKE
      </button>
      <button className={mode === 'space' ? 'is-selected' : ''} onClick={() => onChange('space')} aria-pressed={mode === 'space'}>
        ALIENS
      </button>
      <button className={mode === 'dino' ? 'is-selected' : ''} onClick={() => onChange('dino')} aria-pressed={mode === 'dino'}>
        DINO
      </button>
    </div>
  );
}

function RapidRollGame({ onSwitch }: { onSwitch: (mode: GameMode) => void }) {
  const [status, setStatus] = useState<GameStatus>('idle');
  const [round, setRound] = useState(0);
  const [activeLane, setActiveLane] = useState(0);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [strikes, setStrikes] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [roundDuration, setRoundDuration] = useState(1900);
  const [feedback, setFeedback] = useState('Ready when you are.');
  const [feedbackKind, setFeedbackKind] = useState<FeedbackKind>('info');
  const [muted, setMuted] = useState(false);
  const [lastHit, setLastHit] = useState<number | null>(null);
  const [bestScore, setBestScore] = useState(() => Number(localStorage.getItem('rapid-roll-best') ?? 0));

  const deadlineRef = useRef(0);
  const nextRoundRef = useRef<number | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const statusRef = useRef(status);
  const activeLaneRef = useRef(activeLane);
  const mutedRef = useRef(muted);
  const strikesRef = useRef(strikes);
  const comboRef = useRef(combo);
  const scoreRef = useRef(score);
  const resolvedRoundRef = useRef(false);

  useEffect(() => {
    statusRef.current = status;
    activeLaneRef.current = activeLane;
    mutedRef.current = muted;
    strikesRef.current = strikes;
    comboRef.current = combo;
    scoreRef.current = score;
  }, [status, activeLane, muted, strikes, combo, score]);

  const playTone = useCallback((kind: 'hit' | 'miss' | 'start' | 'pause', lane = 0) => {
    if (mutedRef.current) return;
    const audioWindow = window as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const AudioCtor = audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
    if (!AudioCtor) return;
    let ctx = audioRef.current;
    if (!ctx) {
      ctx = new AudioCtor();
      audioRef.current = ctx;
    }
    if (ctx.state === 'suspended') void ctx.resume();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const base = [220, 277, 330, 415][lane];
    oscillator.type = kind === 'miss' ? 'sawtooth' : 'square';
    oscillator.frequency.setValueAtTime(kind === 'start' ? 180 : base, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(
      kind === 'miss' ? 80 : base * (kind === 'pause' ? 0.75 : 1.5),
      ctx.currentTime + (kind === 'miss' ? 0.22 : 0.12),
    );
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(kind === 'miss' ? 0.08 : 0.045, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (kind === 'miss' ? 0.24 : 0.15));
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.26);
  }, []);

  const chooseLane = useCallback((previous: number) => {
    const choices = lanes.map((_, index) => index).filter((index) => index !== previous);
    return choices[Math.floor(Math.random() * choices.length)];
  }, []);

  const beginRound = useCallback((nextRound: number, nextStrikes = strikesRef.current) => {
    const nextLevel = Math.floor((nextRound - 1) / 5) + 1;
    const duration = Math.max(720, 1900 - (nextLevel - 1) * 150);
    resolvedRoundRef.current = false;
    setRound(nextRound);
    setRoundDuration(duration);
    setActiveLane((previous) => {
      const next = chooseLane(previous);
      activeLaneRef.current = next;
      return next;
    });
    setStrikes(nextStrikes);
    setTimeLeft(duration);
    deadlineRef.current = Date.now() + duration;
    setFeedback(nextLevel > 1 ? `Level ${nextLevel}. Keep your nerve.` : 'Find the live lane.');
    setFeedbackKind('info');
  }, [chooseLane]);

  const startGame = useCallback(() => {
    if (nextRoundRef.current) window.clearTimeout(nextRoundRef.current);
    setStatus('playing');
    setScore(0);
    setCombo(0);
    setMaxCombo(0);
    setStrikes(0);
    setLastHit(null);
    playTone('start');
    beginRound(1, 0);
  }, [beginRound, playTone]);

  const finishRound = useCallback((success: boolean, pressedLane?: number) => {
    if (statusRef.current !== 'playing' || resolvedRoundRef.current) return;
    resolvedRoundRef.current = true;
    if (success) {
      const nextCombo = comboRef.current + 1;
      const level = Math.floor((round - 1) / 5) + 1;
      const earned = 100 * level + nextCombo * 15;
      setScore((current) => current + earned);
      setCombo(nextCombo);
      setMaxCombo((current) => Math.max(current, nextCombo));
      setLastHit(pressedLane ?? activeLaneRef.current);
      setFeedback(nextCombo > 2 ? `${nextCombo}x combo — keep rolling.` : 'Clean hit.');
      setFeedbackKind('hit');
      playTone('hit', pressedLane ?? activeLaneRef.current);
    } else {
      const nextStrikes = strikesRef.current + 1;
      setStrikes(nextStrikes);
      setCombo(0);
      setLastHit(null);
      setFeedback(nextStrikes >= 3 ? 'Three strikes. Run over.' : 'Missed the window.');
      setFeedbackKind('miss');
      playTone('miss', activeLaneRef.current);
      if (nextStrikes >= 3) {
        const finalScore = scoreRef.current;
        if (finalScore > bestScore) {
          setBestScore(finalScore);
          localStorage.setItem('rapid-roll-best', String(finalScore));
        }
        setStatus('gameover');
        setTimeLeft(0);
        return;
      }
    }

    setTimeLeft(0);
    if (nextRoundRef.current) window.clearTimeout(nextRoundRef.current);
    nextRoundRef.current = window.setTimeout(() => {
      if (statusRef.current === 'playing') beginRound(round + 1);
    }, 430);
  }, [beginRound, bestScore, playTone, round]);

  const pressLane = useCallback((laneIndex: number) => {
    if (statusRef.current !== 'playing') return;
    if (laneIndex === activeLaneRef.current) finishRound(true, laneIndex);
    else finishRound(false, laneIndex);
  }, [finishRound]);

  useEffect(() => {
    if (status !== 'playing') return;
    const interval = window.setInterval(() => {
      const remaining = Math.max(0, deadlineRef.current - Date.now());
      setTimeLeft(remaining);
      if (remaining === 0) finishRound(false);
    }, 35);
    return () => window.clearInterval(interval);
  }, [finishRound, status, round]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const index = lanes.findIndex((lane) => lane.key.toLowerCase() === event.key.toLowerCase());
      if (index !== -1) {
        event.preventDefault();
        pressLane(index);
      }
      if (event.key === ' ' && statusRef.current === 'idle') {
        event.preventDefault();
        startGame();
      }
      if (event.key.toLowerCase() === 'p' && statusRef.current === 'playing') {
        setStatus('paused');
        setFeedback('Game paused.');
        playTone('pause');
      } else if (event.key.toLowerCase() === 'p' && statusRef.current === 'paused') {
        setStatus('playing');
        deadlineRef.current = Date.now() + timeLeft;
        setFeedback('Back in the roll.');
        playTone('start');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playTone, pressLane, startGame, timeLeft]);

  useEffect(() => () => {
    if (nextRoundRef.current) window.clearTimeout(nextRoundRef.current);
    if (audioRef.current) void audioRef.current.close();
  }, []);

  const level = round ? Math.floor((round - 1) / 5) + 1 : 1;
  const progress = roundDuration ? Math.min(100, Math.max(0, (timeLeft / roundDuration) * 100)) : 0;
  const isPlaying = status === 'playing';
  const statusLabel = status === 'idle' ? 'STANDBY' : status === 'playing' ? 'LIVE' : status === 'paused' ? 'PAUSED' : 'GAME OVER';

  return (
    <main className={`arcade-shell state-${status}`} data-testid="page-rapid-roll">
      <div className="ambient-grid" aria-hidden="true" />
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><Gamepad2 size={22} strokeWidth={3} /></div>
          <div>
            <div className="brand-name">GAME<span>/</span>ARCADE</div>
            <div className="brand-sub">ARCADE REACTION UNIT 01</div>
          </div>
        </div>
          <div className="top-actions">
            <GameSwitcher mode="rapid-roll" onChange={onSwitch} />
          <div className="audio-badge" data-testid="status-audio">
            <span className={`audio-dot ${muted ? 'is-muted' : ''}`} />
            {muted ? 'QUIET MODE' : 'SOUND ON'}
          </div>
          <button className="icon-button" onClick={() => setMuted((value) => !value)} aria-label={muted ? 'Turn sound on' : 'Mute sound'} data-testid="button-mute">
            {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>
        </div>
      </header>

      <section className="hud">
        <div className="hud-block score-block">
          <span className="hud-label"><Trophy size={14} /> SCORE</span>
          <strong data-testid="text-score">{String(score).padStart(5, '0')}</strong>
        </div>
        <div className="hud-block combo-block">
          <span className="hud-label"><Zap size={14} /> COMBO</span>
          <strong data-testid="text-combo">{combo}<small>x</small></strong>
        </div>
        <div className="hud-block level-block">
          <span className="hud-label">LEVEL</span>
          <strong data-testid="text-level">{String(level).padStart(2, '0')}</strong>
        </div>
        <div className="hud-block best-block">
          <span className="hud-label">BEST RUN</span>
          <strong data-testid="text-best">{String(bestScore).padStart(5, '0')}</strong>
        </div>
      </section>

      <section className="game-area">
        <div className="round-heading">
          <div>
            <p className="eyebrow"><span className={`live-pip ${isPlaying ? 'pulsing' : ''}`} />{statusLabel}</p>
            <h1>Catch the <em>roll.</em></h1>
          </div>
          <div className="round-readout" data-testid="text-round">
            ROUND <strong>{String(round).padStart(2, '0')}</strong>
          </div>
        </div>

        <div className="track-frame" data-testid="playfield">
          <div className="track-head">
            <span><Timer size={16} /> TIME WINDOW</span>
            <span className={progress < 32 && isPlaying ? 'danger-text' : ''} data-testid="text-timer">{isPlaying ? `${(timeLeft / 1000).toFixed(2)}s` : status === 'paused' ? 'HOLD' : '--.--'}</span>
          </div>
          <div className="timer-track"><div className="timer-fill" style={{ width: `${progress}%` }} /></div>
          <div className="roll-track">
            {lanes.map((lane, index) => (
              <div className={`track-lane ${index === activeLane && isPlaying ? 'active' : ''}`} key={lane.id} style={{ '--lane-color': lane.color } as React.CSSProperties}>
                <div className="lane-noise" />
                <div className="lane-mark top-mark" />
                <div className="lane-mark target-mark" />
                <span className="lane-index">0{index + 1}</span>
              </div>
            ))}
            {isPlaying && (
              <div
                className="falling-roll"
                style={{ left: `${12.5 + activeLane * 25}%`, top: `${11 + (1 - progress / 100) * 58}%`, '--roll-color': lanes[activeLane].color } as React.CSSProperties}
                data-testid="active-roll"
              >
                <span />
              </div>
            )}
            <div className="target-line" />
            {!isPlaying && status !== 'gameover' && (
              <div className="track-prompt">
                {status === 'paused' ? <Pause size={30} /> : <Gamepad2 size={30} />}
                <strong>{status === 'paused' ? 'ROLL ON PAUSE' : 'READY TO ROLL?'}</strong>
                <span>{status === 'paused' ? 'Press P or resume below' : 'Hit start, then match the live lane'}</span>
              </div>
            )}
            {status === 'gameover' && (
              <div className="track-prompt gameover-prompt">
                <ShieldAlert size={30} />
                <strong>RUN TERMINATED</strong>
                <span>{score > bestScore ? 'New best run locked in.' : 'The machine is hungry for a rematch.'}</span>
              </div>
            )}
          </div>
          <div className={`feedback feedback-${feedbackKind}`} data-testid="status-feedback">
            <span>{feedback}</span>
            {feedbackKind === 'hit' && <strong>+{100 * level + Math.max(1, combo) * 15}</strong>}
          </div>
        </div>

        <div className="strike-row" data-testid="status-strikes">
          <span className="strike-label"><HeartPulse size={16} /> STRIKE METER</span>
          <div className="strike-lights">
            {[0, 1, 2].map((index) => <span className={`strike-light ${index < strikes ? 'spent' : ''}`} key={index} />)}
          </div>
          <span className="strike-copy">{strikes}/3</span>
        </div>
      </section>

      <section className="control-zone">
        <div className="control-guide">
          <span><Keyboard size={15} /> KEYBOARD READY</span>
          <span>PRESS <b>A</b><b>S</b><b>D</b><b>F</b> OR TAP</span>
        </div>
        <div className="control-rail" data-testid="control-rail">
          {lanes.map((lane, index) => (
            <button
              className={`lane-button lane-${lane.id} ${lastHit === index ? 'recent-hit' : ''}`}
              key={lane.id}
              onClick={() => pressLane(index)}
              style={{ '--button-color': lane.color, '--button-ink': lane.ink } as React.CSSProperties}
              data-testid={`button-lane-${lane.id}`}
              aria-label={`Press ${lane.name} lane, key ${lane.key}`}
            >
              <span className="button-sheen" />
              <span className="button-number">0{index + 1}</span>
              <strong>{lane.name}</strong>
              <kbd>{lane.key}</kbd>
            </button>
          ))}
        </div>
        <div className="action-row">
          {(status === 'idle' || status === 'gameover') && (
            <button className="primary-action" onClick={startGame} data-testid="button-start">
              {status === 'gameover' ? <RotateCcw size={19} /> : <Play size={19} />}
              {status === 'gameover' ? 'PLAY AGAIN' : 'START RUN'}
            </button>
          )}
          {status === 'playing' && (
            <button className="secondary-action" onClick={() => { setStatus('paused'); setFeedback('Game paused.'); playTone('pause'); }} data-testid="button-pause">
              <Pause size={18} /> PAUSE
            </button>
          )}
          {status === 'paused' && (
            <button className="primary-action" onClick={() => { setStatus('playing'); deadlineRef.current = Date.now() + timeLeft; setFeedback('Back in the roll.'); playTone('start'); }} data-testid="button-resume">
              <Play size={18} /> RESUME
            </button>
          )}
          {status !== 'idle' && <button className="ghost-action" onClick={startGame} data-testid="button-restart"><RotateCcw size={16} /> RESTART</button>}
        </div>
      </section>
      <footer className="footer-note">SHORT RUNS. LOUD HITS. NO REFUNDS.</footer>
    </main>
  );
}

type Point = { x: number; y: number };
type Direction = Point;

const SNAKE_GRID = 18;
const snakeDirections: Record<string, Direction> = {
  up: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

const getFood = (body: Point[]): Point => {
  const openCells: Point[] = [];
  for (let y = 0; y < SNAKE_GRID; y += 1) {
    for (let x = 0; x < SNAKE_GRID; x += 1) {
      if (!body.some((cell) => cell.x === x && cell.y === y)) openCells.push({ x, y });
    }
  }
  return openCells[Math.floor(Math.random() * openCells.length)] ?? { x: 9, y: 9 };
};

function SnakeGame({ onSwitch }: { onSwitch: (mode: GameMode) => void }) {
  const [status, setStatus] = useState<GameStatus>('idle');
  const [snake, setSnake] = useState<Point[]>([
    { x: 7, y: 9 },
    { x: 6, y: 9 },
    { x: 5, y: 9 },
  ]);
  const [food, setFood] = useState<Point>({ x: 12, y: 9 });
  const [direction, setDirection] = useState<Direction>(snakeDirections.right);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [bestScore, setBestScore] = useState(() => Number(localStorage.getItem('snake-best') ?? 0));
  const [feedback, setFeedback] = useState('Guide the snake to the food.');
  const [feedbackKind, setFeedbackKind] = useState<FeedbackKind>('info');
  const [muted, setMuted] = useState(false);

  const snakeRef = useRef(snake);
  const foodRef = useRef(food);
  const directionRef = useRef(direction);
  const queuedDirectionRef = useRef(direction);
  const statusRef = useRef(status);
  const scoreRef = useRef(score);
  const levelRef = useRef(level);
  const mutedRef = useRef(muted);
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    snakeRef.current = snake;
    foodRef.current = food;
    directionRef.current = direction;
    statusRef.current = status;
    scoreRef.current = score;
    levelRef.current = level;
    mutedRef.current = muted;
  }, [snake, food, direction, status, score, level, muted]);

  const playSnakeTone = useCallback((kind: 'hit' | 'miss' | 'start' | 'pause') => {
    if (mutedRef.current) return;
    const audioWindow = window as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const AudioCtor = audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
    if (!AudioCtor) return;
    let ctx = audioRef.current;
    if (!ctx) {
      ctx = new AudioCtor();
      audioRef.current = ctx;
    }
    if (ctx.state === 'suspended') void ctx.resume();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const base = kind === 'hit' ? 440 : kind === 'start' ? 220 : kind === 'pause' ? 280 : 120;
    oscillator.type = kind === 'miss' ? 'sawtooth' : 'square';
    oscillator.frequency.setValueAtTime(base, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(kind === 'miss' ? 70 : base * 1.5, ctx.currentTime + 0.13);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(kind === 'miss' ? 0.08 : 0.045, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.17);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.2);
  }, []);

  const startSnake = useCallback(() => {
    const initialSnake = [
      { x: 7, y: 9 },
      { x: 6, y: 9 },
      { x: 5, y: 9 },
    ];
    const initialDirection = snakeDirections.right;
    setSnake(initialSnake);
    setFood(getFood(initialSnake));
    setDirection(initialDirection);
    directionRef.current = initialDirection;
    queuedDirectionRef.current = initialDirection;
    setScore(0);
    setLevel(1);
    setFeedback('Find the first bite.');
    setFeedbackKind('info');
    setStatus('playing');
    playSnakeTone('start');
  }, [playSnakeTone]);

  const changeDirection = useCallback((next: Direction) => {
    const current = directionRef.current;
    if (next.x === -current.x && next.y === -current.y) return;
    queuedDirectionRef.current = next;
    setDirection(next);
  }, []);

  const stepSnake = useCallback(() => {
    if (statusRef.current !== 'playing') return;
    const currentSnake = snakeRef.current;
    const nextDirection = queuedDirectionRef.current;
    const head = currentSnake[0];
    const nextHead = { x: head.x + nextDirection.x, y: head.y + nextDirection.y };
    const hitWall = nextHead.x < 0 || nextHead.x >= SNAKE_GRID || nextHead.y < 0 || nextHead.y >= SNAKE_GRID;
    const hitSelf = currentSnake.some((cell, index) => index > 0 && samePoint(cell, nextHead));

    if (hitWall || hitSelf) {
      setStatus('gameover');
      setFeedback(hitWall ? 'Wall contact. Run over.' : 'Tail caught. Run over.');
      setFeedbackKind('miss');
      playSnakeTone('miss');
      const finalScore = scoreRef.current;
      if (finalScore > Number(localStorage.getItem('snake-best') ?? 0)) {
        setBestScore(finalScore);
        localStorage.setItem('snake-best', String(finalScore));
      }
      return;
    }

    const ateFood = samePoint(nextHead, foodRef.current);
    const nextSnake = [nextHead, ...(ateFood ? currentSnake : currentSnake.slice(0, -1))];
    setSnake(nextSnake);
    directionRef.current = nextDirection;

    if (ateFood) {
      const nextScore = scoreRef.current + 100 * levelRef.current;
      const nextLevel = Math.floor(nextScore / 500) + 1;
      setScore(nextScore);
      setLevel(nextLevel);
      setFood(getFood(nextSnake));
      setFeedback(`Bite secured. Level ${nextLevel}.`);
      setFeedbackKind('hit');
      playSnakeTone('hit');
    }
  }, [playSnakeTone]);

  useEffect(() => {
    if (status !== 'playing') return undefined;
    const interval = window.setInterval(stepSnake, Math.max(72, 170 - (level - 1) * 16));
    return () => window.clearInterval(interval);
  }, [level, status, stepSnake]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const directionForKey: Record<string, Direction | undefined> = {
        arrowup: snakeDirections.up,
        w: snakeDirections.up,
        arrowright: snakeDirections.right,
        d: snakeDirections.right,
        arrowdown: snakeDirections.down,
        s: snakeDirections.down,
        arrowleft: snakeDirections.left,
        a: snakeDirections.left,
      };
      const next = directionForKey[key];
      if (next) {
        event.preventDefault();
        changeDirection(next);
      }
      if (key === ' ' && (statusRef.current === 'idle' || statusRef.current === 'gameover')) {
        event.preventDefault();
        startSnake();
      }
      if (key === 'p' && statusRef.current === 'playing') {
        setStatus('paused');
        setFeedback('Snake paused.');
        playSnakeTone('pause');
      } else if (key === 'p' && statusRef.current === 'paused') {
        setStatus('playing');
        setFeedback('Back on the grid.');
        playSnakeTone('start');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [changeDirection, playSnakeTone, startSnake]);

  useEffect(() => () => {
    if (audioRef.current) void audioRef.current.close();
  }, []);

  const statusLabel = status === 'idle' ? 'STANDBY' : status === 'playing' ? 'LIVE' : status === 'paused' ? 'PAUSED' : 'GAME OVER';
  const isSnakeCell = (cell: Point) => snake.some((part) => samePoint(part, cell));
  const isHead = (cell: Point) => samePoint(snake[0], cell);
  const controls = [
    { label: 'UP', icon: <ArrowUp size={19} />, direction: snakeDirections.up },
    { label: 'LEFT', icon: <ArrowLeft size={19} />, direction: snakeDirections.left },
    { label: 'DOWN', icon: <ArrowDown size={19} />, direction: snakeDirections.down },
    { label: 'RIGHT', icon: <ArrowRight size={19} />, direction: snakeDirections.right },
  ];

  return (
    <main className={`arcade-shell state-${status} snake-shell`} data-testid="page-snake">
      <div className="ambient-grid" aria-hidden="true" />
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><Gamepad2 size={22} strokeWidth={3} /></div>
          <div>
            <div className="brand-name">GAME<span>/</span>ARCADE</div>
            <div className="brand-sub">ARCADE REACTION UNIT 02</div>
          </div>
        </div>
        <div className="top-actions">
          <GameSwitcher mode="snake" onChange={onSwitch} />
          <div className="audio-badge" data-testid="status-audio">
            <span className={`audio-dot ${muted ? 'is-muted' : ''}`} />
            {muted ? 'QUIET MODE' : 'SOUND ON'}
          </div>
          <button className="icon-button" onClick={() => setMuted((value) => !value)} aria-label={muted ? 'Turn sound on' : 'Mute sound'} data-testid="button-mute">
            {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>
        </div>
      </header>

      <section className="hud">
        <div className="hud-block score-block">
          <span className="hud-label"><Trophy size={14} /> SCORE</span>
          <strong data-testid="text-score">{String(score).padStart(5, '0')}</strong>
        </div>
        <div className="hud-block combo-block">
          <span className="hud-label"><Zap size={14} /> LENGTH</span>
          <strong data-testid="text-length">{String(snake.length).padStart(2, '0')}</strong>
        </div>
        <div className="hud-block level-block">
          <span className="hud-label">LEVEL</span>
          <strong data-testid="text-level">{String(level).padStart(2, '0')}</strong>
        </div>
        <div className="hud-block best-block">
          <span className="hud-label">BEST RUN</span>
          <strong data-testid="text-best">{String(bestScore).padStart(5, '0')}</strong>
        </div>
      </section>

      <section className="game-area snake-area">
        <div className="round-heading">
          <div>
            <p className="eyebrow"><span className={`live-pip ${status === 'playing' ? 'pulsing' : ''}`} />{statusLabel}</p>
            <h1>Feed the <em>snake.</em></h1>
          </div>
          <div className="round-readout">GRID <strong>{SNAKE_GRID}×{SNAKE_GRID}</strong></div>
        </div>

        <div className="snake-frame" data-testid="playfield">
          <div className="track-head">
            <span><Gamepad2 size={16} /> HUNGRY GRID</span>
            <span>LEVEL {String(level).padStart(2, '0')}</span>
          </div>
          <div className="snake-board">
            {Array.from({ length: SNAKE_GRID * SNAKE_GRID }, (_, index) => {
              const cell = { x: index % SNAKE_GRID, y: Math.floor(index / SNAKE_GRID) };
              const foodCell = samePoint(food, cell);
              return (
                <div
                  className={`snake-cell ${isSnakeCell(cell) ? 'snake-body' : ''} ${isHead(cell) ? 'snake-head' : ''} ${foodCell ? 'snake-food' : ''}`}
                  key={`${cell.x}-${cell.y}`}
                >
                  {foodCell && <span />}
                </div>
              );
            })}
            {status !== 'playing' && (
              <div className="snake-prompt">
                {status === 'gameover' ? <ShieldAlert size={30} /> : <Gamepad2 size={30} />}
                <strong>{status === 'gameover' ? 'GRID CLEARED' : status === 'paused' ? 'SNAKE ON PAUSE' : 'READY TO FEED?'}</strong>
                <span>{status === 'gameover' ? 'Turn corners sharper on the rematch.' : status === 'paused' ? 'Press P or resume below' : 'Collect pink bites. Avoid walls and tail.'}</span>
              </div>
            )}
          </div>
          <div className={`feedback feedback-${feedbackKind}`} data-testid="status-feedback">
            <span>{feedback}</span>
            {feedbackKind === 'hit' && <strong>+{100 * level}</strong>}
          </div>
        </div>

        <div className="snake-meta">
          <span className="strike-label"><Zap size={16} /> SPEED RAMP</span>
          <div className="speed-bars">
            {[1, 2, 3, 4].map((bar) => <span className={bar <= Math.min(4, level) ? 'is-lit' : ''} key={bar} />)}
          </div>
          <span className="strike-copy">WALLS = OUT</span>
        </div>
      </section>

      <section className="control-zone snake-controls">
        <div className="control-guide">
          <span><Keyboard size={15} /> KEYBOARD READY</span>
          <span>USE <b>WASD</b> OR ARROWS</span>
        </div>
        <div className="snake-control-rail" data-testid="snake-controls">
          {controls.map((control) => (
            <button
              className="snake-control"
              key={control.label}
              onClick={() => changeDirection(control.direction)}
              aria-label={`Move snake ${control.label.toLowerCase()}`}
            >
              {control.icon}
              <strong>{control.label}</strong>
            </button>
          ))}
        </div>
        <div className="action-row">
          {(status === 'idle' || status === 'gameover') && (
            <button className="primary-action" onClick={startSnake} data-testid="button-start">
              {status === 'gameover' ? <RotateCcw size={19} /> : <Play size={19} />}
              {status === 'gameover' ? 'PLAY AGAIN' : 'START SNAKE'}
            </button>
          )}
          {status === 'playing' && (
            <button className="secondary-action" onClick={() => { setStatus('paused'); setFeedback('Snake paused.'); playSnakeTone('pause'); }} data-testid="button-pause">
              <Pause size={18} /> PAUSE
            </button>
          )}
          {status === 'paused' && (
            <button className="primary-action" onClick={() => { setStatus('playing'); setFeedback('Back on the grid.'); playSnakeTone('start'); }} data-testid="button-resume">
              <Play size={18} /> RESUME
            </button>
          )}
          {status !== 'idle' && <button className="ghost-action" onClick={startSnake} data-testid="button-restart"><RotateCcw size={16} /> RESTART</button>}
        </div>
      </section>
      <footer className="footer-note">SHORT RUNS. LOUD HITS. NO REFUNDS.</footer>
    </main>
  );
}

type Alien = { id: string; x: number; y: number };
type Bullet = { id: number; x: number; y: number };

const makeAlienWave = (wave: number): Alien[] => {
  const count = Math.min(11, 3 + wave);
  return Array.from({ length: count }, (_, index) => ({
    id: `${wave}-${index}-${Math.random()}`,
    x: 10 + ((index * 23 + wave * 11) % 80),
    y: -7 - Math.floor(index / 4) * 13 - (index % 3) * 4,
  }));
};

function SpaceGame({ onSwitch }: { onSwitch: (mode: GameMode) => void }) {
  const [status, setStatus] = useState<GameStatus>('idle');
  const [shipX, setShipX] = useState(50);
  const [aliens, setAliens] = useState<Alien[]>(makeAlienWave(1));
  const [bullets, setBullets] = useState<Bullet[]>([]);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [bombs, setBombs] = useState(3);
  const [bestScore, setBestScore] = useState(() => Number(localStorage.getItem('alien-best') ?? 0));
  const [feedback, setFeedback] = useState('Clear the sky before they reach you.');
  const [feedbackKind, setFeedbackKind] = useState<FeedbackKind>('info');
  const [muted, setMuted] = useState(false);

  const statusRef = useRef(status);
  const shipXRef = useRef(shipX);
  const aliensRef = useRef(aliens);
  const bulletsRef = useRef(bullets);
  const scoreRef = useRef(score);
  const levelRef = useRef(level);
  const bombsRef = useRef(bombs);
  const mutedRef = useRef(muted);
  const audioRef = useRef<AudioContext | null>(null);
  const bulletIdRef = useRef(0);

  useEffect(() => {
    statusRef.current = status;
    shipXRef.current = shipX;
    aliensRef.current = aliens;
    bulletsRef.current = bullets;
    scoreRef.current = score;
    levelRef.current = level;
    bombsRef.current = bombs;
    mutedRef.current = muted;
  }, [status, shipX, aliens, bullets, score, level, bombs, muted]);

  const playSpaceTone = useCallback((kind: 'hit' | 'miss' | 'start' | 'pause' | 'fire') => {
    if (mutedRef.current) return;
    const audioWindow = window as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const AudioCtor = audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
    if (!AudioCtor) return;
    let ctx = audioRef.current;
    if (!ctx) {
      ctx = new AudioCtor();
      audioRef.current = ctx;
    }
    if (ctx.state === 'suspended') void ctx.resume();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const base = kind === 'fire' ? 680 : kind === 'hit' ? 380 : kind === 'start' ? 210 : kind === 'pause' ? 260 : 100;
    oscillator.type = kind === 'miss' ? 'sawtooth' : 'square';
    oscillator.frequency.setValueAtTime(base, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(kind === 'miss' ? 65 : base * 1.55, ctx.currentTime + (kind === 'fire' ? 0.06 : 0.14));
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(kind === 'miss' ? 0.08 : 0.04, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (kind === 'fire' ? 0.08 : 0.18));
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.22);
  }, []);

  const startSpace = useCallback(() => {
    const wave = makeAlienWave(1);
    setShipX(50);
    shipXRef.current = 50;
    setAliens(wave);
    setBullets([]);
    setScore(0);
    setLevel(1);
    setBombs(3);
    setFeedback('Lock on. The sky is hostile.');
    setFeedbackKind('info');
    setStatus('playing');
    statusRef.current = 'playing';
    playSpaceTone('start');
  }, [playSpaceTone]);

  const moveShip = useCallback((amount: number) => {
    if (statusRef.current !== 'playing') return;
    const next = Math.max(8, Math.min(92, shipXRef.current + amount));
    shipXRef.current = next;
    setShipX(next);
  }, []);

  const fire = useCallback(() => {
    if (statusRef.current !== 'playing') return;
    const bullet = { id: bulletIdRef.current++, x: shipXRef.current, y: 87 };
    bulletsRef.current = [...bulletsRef.current, bullet];
    setBullets(bulletsRef.current);
    playSpaceTone('fire');
  }, [playSpaceTone]);

  const blast = useCallback(() => {
    if (statusRef.current !== 'playing' || bombsRef.current <= 0) return;
    const cleared = aliensRef.current.length;
    const nextScore = scoreRef.current + cleared * 40;
    const nextLevel = Math.floor(nextScore / 500) + 1;
    bombsRef.current -= 1;
    setBombs(bombsRef.current);
    setScore(nextScore);
    setLevel(nextLevel);
    setAliens(makeAlienWave(nextLevel));
    setFeedback(`Blast cleared ${cleared} targets.`);
    setFeedbackKind('hit');
    playSpaceTone('hit');
  }, [playSpaceTone]);

  const tick = useCallback(() => {
    if (statusRef.current !== 'playing') return;
    const speed = 0.24 + levelRef.current * 0.035;
    const movingBullets = bulletsRef.current
      .map((bullet) => ({ ...bullet, y: bullet.y - 4.6 }))
      .filter((bullet) => bullet.y > -8);
    const movingAliens = aliensRef.current.map((alien) => ({ ...alien, y: alien.y + speed }));
    const hitAlienIds = new Set<string>();
    const hitBulletIds = new Set<number>();

    movingBullets.forEach((bullet) => {
      const target = movingAliens.find((alien) => !hitAlienIds.has(alien.id) && Math.abs(alien.x - bullet.x) < 6 && Math.abs(alien.y - bullet.y) < 7);
      if (target) {
        hitAlienIds.add(target.id);
        hitBulletIds.add(bullet.id);
      }
    });

    const remainingAliens = movingAliens.filter((alien) => !hitAlienIds.has(alien.id));
    const remainingBullets = movingBullets.filter((bullet) => !hitBulletIds.has(bullet.id));
    if (hitAlienIds.size > 0) {
      const nextScore = scoreRef.current + hitAlienIds.size * 100 * levelRef.current;
      const nextLevel = Math.floor(nextScore / 500) + 1;
      setScore(nextScore);
      setLevel(nextLevel);
      setFeedback(hitAlienIds.size > 1 ? `${hitAlienIds.size} targets erased.` : 'Direct hit.');
      setFeedbackKind('hit');
      playSpaceTone('hit');
    }

    if (remainingAliens.some((alien) => alien.y > 91)) {
      statusRef.current = 'gameover';
      setStatus('gameover');
      setFeedback('The sky broke through. Run over.');
      setFeedbackKind('miss');
      playSpaceTone('miss');
      const finalScore = scoreRef.current + hitAlienIds.size * 100 * levelRef.current;
      if (finalScore > Number(localStorage.getItem('alien-best') ?? 0)) {
        setBestScore(finalScore);
        localStorage.setItem('alien-best', String(finalScore));
      }
      return;
    }

    if (remainingAliens.length === 0) {
      const nextWave = levelRef.current + 1;
      levelRef.current = nextWave;
      setLevel(nextWave);
      setAliens(makeAlienWave(nextWave));
      setFeedback(`Wave ${nextWave}. More are coming.`);
    } else {
      setAliens(remainingAliens);
    }
    setBullets(remainingBullets);
  }, [playSpaceTone]);

  useEffect(() => {
    if (status !== 'playing') return undefined;
    const interval = window.setInterval(tick, 48);
    return () => window.clearInterval(interval);
  }, [status, tick]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === 'arrowleft' || key === 'a') {
        event.preventDefault();
        moveShip(-6);
      } else if (key === 'arrowright' || key === 'd') {
        event.preventDefault();
        moveShip(6);
      } else if (key === ' ' || key === 'z') {
        event.preventDefault();
        if (statusRef.current === 'idle' || statusRef.current === 'gameover') startSpace();
        else fire();
      } else if (key === 'x') {
        event.preventDefault();
        blast();
      } else if (key === 'p' && statusRef.current === 'playing') {
        setStatus('paused');
        statusRef.current = 'paused';
        setFeedback('Attack paused.');
        playSpaceTone('pause');
      } else if (key === 'p' && statusRef.current === 'paused') {
        setStatus('playing');
        statusRef.current = 'playing';
        setFeedback('Back to the fight.');
        playSpaceTone('start');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [blast, fire, moveShip, playSpaceTone, startSpace]);

  useEffect(() => () => {
    if (audioRef.current) void audioRef.current.close();
  }, []);

  const statusLabel = status === 'idle' ? 'STANDBY' : status === 'playing' ? 'LIVE' : status === 'paused' ? 'PAUSED' : 'GAME OVER';
  const controls = [
    { label: 'LEFT', icon: <ArrowLeft size={19} />, action: () => moveShip(-8) },
    { label: 'FIRE', icon: <Rocket size={19} />, action: fire },
    { label: 'RIGHT', icon: <ArrowRight size={19} />, action: () => moveShip(8) },
    { label: `BLAST ${String(bombs).padStart(2, '0')}`, icon: <Zap size={19} />, action: blast },
  ];

  return (
    <main className={`arcade-shell state-${status} space-shell`} data-testid="page-space">
      <div className="ambient-grid" aria-hidden="true" />
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><Gamepad2 size={22} strokeWidth={3} /></div>
          <div>
            <div className="brand-name">GAME<span>/</span>ARCADE</div>
            <div className="brand-sub">ARCADE REACTION UNIT 03</div>
          </div>
        </div>
        <div className="top-actions">
          <GameSwitcher mode="space" onChange={onSwitch} />
          <div className="audio-badge" data-testid="status-audio">
            <span className={`audio-dot ${muted ? 'is-muted' : ''}`} />
            {muted ? 'QUIET MODE' : 'SOUND ON'}
          </div>
          <button className="icon-button" onClick={() => setMuted((value) => !value)} aria-label={muted ? 'Turn sound on' : 'Mute sound'} data-testid="button-mute">
            {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>
        </div>
      </header>

      <section className="hud">
        <div className="hud-block score-block">
          <span className="hud-label"><Trophy size={14} /> SCORE</span>
          <strong data-testid="text-score">{String(score).padStart(5, '0')}</strong>
        </div>
        <div className="hud-block combo-block">
          <span className="hud-label"><Rocket size={14} /> WAVE</span>
          <strong data-testid="text-wave">{String(level).padStart(2, '0')}</strong>
        </div>
        <div className="hud-block level-block">
          <span className="hud-label">BOMBS</span>
          <strong data-testid="text-bombs">{String(bombs).padStart(2, '0')}</strong>
        </div>
        <div className="hud-block best-block">
          <span className="hud-label">BEST RUN</span>
          <strong data-testid="text-best">{String(bestScore).padStart(5, '0')}</strong>
        </div>
      </section>

      <section className="game-area space-area">
        <div className="round-heading">
          <div>
            <p className="eyebrow"><span className={`live-pip ${status === 'playing' ? 'pulsing' : ''}`} />{statusLabel}</p>
            <h1>Defend the <em>sky.</em></h1>
          </div>
          <div className="round-readout">WAVE <strong>{String(level).padStart(2, '0')}</strong></div>
        </div>

        <div className="space-frame" data-testid="playfield">
          <div className="track-head">
            <span><Rocket size={16} /> INCOMING SIGNAL</span>
            <span>{aliens.length} TARGETS</span>
          </div>
          <div className="spacefield">
            <div className="starfield" aria-hidden="true" />
            {aliens.map((alien) => (
              <div className="alien" key={alien.id} style={{ left: `${alien.x}%`, top: `${alien.y}%` }}>
                <span />
              </div>
            ))}
            {bullets.map((bullet) => (
              <div className="laser" key={bullet.id} style={{ left: `${bullet.x}%`, top: `${bullet.y}%` }} />
            ))}
            <div className="player-ship" style={{ left: `${shipX}%` }}><Rocket size={31} strokeWidth={2.5} /></div>
            {status !== 'playing' && (
              <div className="space-prompt">
                {status === 'gameover' ? <ShieldAlert size={30} /> : <Rocket size={30} />}
                <strong>{status === 'gameover' ? 'SHIP LOST' : status === 'paused' ? 'ATTACK ON PAUSE' : 'READY TO LAUNCH?'}</strong>
                <span>{status === 'gameover' ? 'They got through. Fire back.' : status === 'paused' ? 'Press P or resume below' : 'Move, fire, and blast the incoming wave.'}</span>
              </div>
            )}
          </div>
          <div className={`feedback feedback-${feedbackKind}`} data-testid="status-feedback">
            <span>{feedback}</span>
            {feedbackKind === 'hit' && <strong>LOCKED</strong>}
          </div>
        </div>

        <div className="space-meta">
          <span className="strike-label"><Zap size={16} /> THREAT LEVEL</span>
          <div className="speed-bars">
            {[1, 2, 3, 4].map((bar) => <span className={bar <= Math.min(4, level) ? 'is-lit' : ''} key={bar} />)}
          </div>
          <span className="strike-copy">A / D MOVE · Z FIRE · X BLAST</span>
        </div>
      </section>

      <section className="control-zone space-controls">
        <div className="control-guide">
          <span><Keyboard size={15} /> KEYBOARD READY</span>
          <span>MOVE · FIRE · CLEAR</span>
        </div>
        <div className="space-control-rail" data-testid="space-controls">
          {controls.map((control) => (
            <button className="space-control" key={control.label} onClick={control.action} aria-label={control.label}>
              {control.icon}
              <strong>{control.label}</strong>
            </button>
          ))}
        </div>
        <div className="action-row">
          {(status === 'idle' || status === 'gameover') && (
            <button className="primary-action" onClick={startSpace} data-testid="button-start">
              {status === 'gameover' ? <RotateCcw size={19} /> : <Play size={19} />}
              {status === 'gameover' ? 'PLAY AGAIN' : 'LAUNCH'}
            </button>
          )}
          {status === 'playing' && (
            <button className="secondary-action" onClick={() => { setStatus('paused'); statusRef.current = 'paused'; setFeedback('Attack paused.'); playSpaceTone('pause'); }} data-testid="button-pause">
              <Pause size={18} /> PAUSE
            </button>
          )}
          {status === 'paused' && (
            <button className="primary-action" onClick={() => { setStatus('playing'); statusRef.current = 'playing'; setFeedback('Back to the fight.'); playSpaceTone('start'); }} data-testid="button-resume">
              <Play size={18} /> RESUME
            </button>
          )}
          {status !== 'idle' && <button className="ghost-action" onClick={startSpace} data-testid="button-restart"><RotateCcw size={16} /> RESTART</button>}
        </div>
      </section>
      <footer className="footer-note">SHORT RUNS. LOUD HITS. NO REFUNDS.</footer>
    </main>
  );
}

type DinoObstacle = {
  id: number;
  x: number;
  width: number;
  height: number;
  kind: 'cactus' | 'cluster';
};

function DinoGame({ onSwitch }: { onSwitch: (mode: GameMode) => void }) {
  const [status, setStatus] = useState<GameStatus>('idle');
  const [score, setScore] = useState(0);
  const [jumpHeight, setJumpHeight] = useState(0);
  const [obstacles, setObstacles] = useState<DinoObstacle[]>([]);
  const [muted, setMuted] = useState(false);
  const [bestScore, setBestScore] = useState(() => Number(localStorage.getItem('dino-best') ?? 0));

  const statusRef = useRef(status);
  const mutedRef = useRef(muted);
  const scoreRef = useRef(0);
  const jumpHeightRef = useRef(0);
  const velocityRef = useRef(0);
  const obstaclesRef = useRef<DinoObstacle[]>([]);
  const obstacleIdRef = useRef(1);
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    statusRef.current = status;
    mutedRef.current = muted;
    scoreRef.current = score;
    jumpHeightRef.current = jumpHeight;
    obstaclesRef.current = obstacles;
  }, [status, muted, score, jumpHeight, obstacles]);

  const playDinoTone = (frequency: number, duration = 0.06, type: OscillatorType = 'square') => {
    if (mutedRef.current) return;
    const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    audioRef.current ??= new AudioContextClass();
    const context = audioRef.current;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.045, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
  };

  const createObstacle = (id: number): DinoObstacle => ({
    id,
    x: 106,
    width: Math.random() > 0.7 ? 5.4 : 3.1,
    height: Math.random() > 0.76 ? 52 : 40,
    kind: Math.random() > 0.72 ? 'cluster' : 'cactus',
  });

  const startDino = useCallback(() => {
    const firstObstacle = createObstacle(0);
    const initialObstacles = [firstObstacle];
    setStatus('playing');
    statusRef.current = 'playing';
    setScore(0);
    scoreRef.current = 0;
    setJumpHeight(0);
    jumpHeightRef.current = 0;
    velocityRef.current = 11.5;
    setObstacles(initialObstacles);
    obstaclesRef.current = initialObstacles;
    obstacleIdRef.current = 1;
    playDinoTone(520, 0.08);
  }, []);

  const handleDinoTap = useCallback(() => {
    if (statusRef.current === 'idle' || statusRef.current === 'gameover') {
      startDino();
      return;
    }
    if (statusRef.current === 'paused') {
      setStatus('playing');
      statusRef.current = 'playing';
      playDinoTone(440, 0.06);
      return;
    }
    if (jumpHeightRef.current <= 1) {
      velocityRef.current = 11.5;
      playDinoTone(680, 0.045);
    }
  }, [startDino]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (statusRef.current !== 'playing') return;

      const nextJumpHeight = Math.max(0, jumpHeightRef.current + velocityRef.current);
      velocityRef.current = nextJumpHeight > 0 ? velocityRef.current - 0.78 : 0;
      jumpHeightRef.current = nextJumpHeight;
      setJumpHeight(nextJumpHeight);

      const nextScore = scoreRef.current + 1;
      scoreRef.current = nextScore;
      setScore(nextScore);

      const speed = Math.min(2.35, 1.15 + nextScore / 1450);
      let nextObstacles = obstaclesRef.current
        .map((obstacle) => ({ ...obstacle, x: obstacle.x - speed }))
        .filter((obstacle) => obstacle.x + obstacle.width > -4);

      const lastObstacle = nextObstacles[nextObstacles.length - 1];
      if (!lastObstacle || lastObstacle.x < 63) {
        const nextObstacle = createObstacle(obstacleIdRef.current);
        obstacleIdRef.current += 1;
        nextObstacles = [...nextObstacles, nextObstacle];
      }

      const collision = nextObstacles.some((obstacle) => {
        const overlapsPlayer = obstacle.x < 18.5 && obstacle.x + obstacle.width > 10.5;
        return overlapsPlayer && nextJumpHeight < obstacle.height + 12;
      });

      if (collision) {
        const finalScore = Math.floor(nextScore / 10);
        const nextBest = Math.max(bestScore, finalScore);
        setBestScore(nextBest);
        localStorage.setItem('dino-best', String(nextBest));
        setStatus('gameover');
        statusRef.current = 'gameover';
        setObstacles(nextObstacles);
        obstaclesRef.current = nextObstacles;
        playDinoTone(130, 0.18, 'sawtooth');
      } else {
        setObstacles(nextObstacles);
        obstaclesRef.current = nextObstacles;
      }
    }, 32);

    return () => window.clearInterval(timer);
  }, [bestScore]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' || event.code === 'ArrowUp' || event.code === 'KeyW') {
        event.preventDefault();
        handleDinoTap();
      }
      if (event.code === 'KeyP' && statusRef.current === 'playing') {
        setStatus('paused');
        statusRef.current = 'paused';
        playDinoTone(280, 0.08);
      }
      if (event.code === 'KeyP' && statusRef.current === 'paused') {
        setStatus('playing');
        statusRef.current = 'playing';
        playDinoTone(440, 0.06);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleDinoTap]);

  const displayedScore = Math.floor(score / 10);
  const speedLevel = Math.min(9, 1 + Math.floor(score / 650));
  const statusMessage = status === 'idle'
    ? 'TAP TO START'
    : status === 'playing'
      ? 'TAP TO JUMP'
      : status === 'paused'
        ? 'PAUSED · TAP TO RESUME'
        : 'GAME OVER · TAP TO RUN AGAIN';

  return (
    <main className="arcade-shell dino-shell">
      <header className="arcade-header">
        <div className="brand-lockup">
          <div className="brand-mark dino-mark"><Footprints size={21} strokeWidth={2.6} /></div>
          <div>
            <div className="brand-title">GAME<span>/</span>ARCADE</div>
            <div className="brand-subtitle">DINO RUN · NO BUTTONS. JUST RUN.</div>
          </div>
        </div>
        <GameSwitcher mode="dino" onChange={onSwitch} />
        <button className="sound-toggle" onClick={() => setMuted((value) => !value)} aria-label={muted ? 'Unmute sound' : 'Mute sound'}>
          {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
        </button>
      </header>

      <section className="stats-grid dino-stats">
        <div className="stat-card stat-pink">
          <span className="stat-label">SCORE</span>
          <strong>{String(displayedScore).padStart(5, '0')}</strong>
        </div>
        <div className="stat-card stat-yellow">
          <span className="stat-label">SPEED</span>
          <strong>LVL {speedLevel}</strong>
        </div>
        <div className="stat-card stat-aqua">
          <span className="stat-label">BEST RUN</span>
          <strong>{String(bestScore).padStart(5, '0')}</strong>
        </div>
      </section>

      <section
        className={`game-area dino-area ${status === 'gameover' ? 'is-crashed' : ''}`}
        onPointerDown={handleDinoTap}
        role="button"
        tabIndex={0}
        aria-label="Dino Run playfield. Tap to jump."
      >
        <div className="dino-skyline">
          <Cloud className="dino-cloud cloud-one" size={34} strokeWidth={1.6} />
          <Cloud className="dino-cloud cloud-two" size={26} strokeWidth={1.6} />
          <Cloud className="dino-cloud cloud-three" size={20} strokeWidth={1.6} />
        </div>
        <div className="dino-status">{statusMessage}</div>
        <div className="dino-track">
          <div className="dino-ground-markings" />
          <div className="dino-player" style={{ transform: `translateY(-${jumpHeight}px)` }}>
            <span className="dino-head" />
            <span className="dino-body" />
            <span className="dino-leg dino-leg-one" />
            <span className="dino-leg dino-leg-two" />
            <span className="dino-arm" />
          </div>
          {obstacles.map((obstacle) => (
            <div
              className={`dino-obstacle ${obstacle.kind}`}
              key={obstacle.id}
              style={{ left: `${obstacle.x}%`, width: `${obstacle.width}%`, height: `${obstacle.height}px` }}
            >
              <span className="cactus-arm cactus-arm-left" />
              <span className="cactus-arm cactus-arm-right" />
            </div>
          ))}
        </div>
        <div className="dino-tap-hint">{status === 'playing' ? 'SPACE / ↑ TO JUMP · P TO PAUSE' : 'TOUCH ANYWHERE TO PLAY'}</div>
      </section>

      <footer className="footer-note">KEEP RUNNING. THE DESERT DOESN’T CARE.</footer>
    </main>
  );
}

function Home() {
  const [mode, setMode] = useState<GameMode>('rapid-roll');
  if (mode === 'space') return <SpaceGame onSwitch={setMode} />;
  if (mode === 'dino') return <DinoGame onSwitch={setMode} />;
  return mode === 'rapid-roll' ? <RapidRollGame onSwitch={setMode} /> : <SnakeGame onSwitch={setMode} />;
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Router />
      </WouterRouter>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;