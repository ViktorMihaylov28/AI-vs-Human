import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';

let socket = null;

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || '';

export default function PlayerPage() {
  const [gameState, setGameState] = useState(null);
  const [privateState, setPrivateState] = useState(null);
  const [myToken, setMyToken] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [gameCode, setGameCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joined, setJoined] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [timeLeft, setTimeLeft] = useState(15);
  const [leaderboard, setLeaderboard] = useState([]);
  const [showPodium, setShowPodium] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (code) setGameCode(code);

    if (!socket) {
      socket = io(SOCKET_URL || window.location.origin, {
        path: SOCKET_URL ? '/socket.io' : undefined,
      });
    }

    socket.on('connect', () => {
      console.log('Connected to server');
    });

    socket.on('game:state', (state) => {
      setGameState(state);
      if (state.question) {
        setCurrentQuestion(state.question);
      }
      if (state.leaderboard) {
        setLeaderboard(state.leaderboard);
      }
      if (state.state === 'finished') {
        setShowPodium(true);
      }
      if (state.state === 'lobby' || state.state === 'ready') {
        setShowPodium(false);
      }
    });

    socket.on('player:private', (state) => {
      setPrivateState(state);
    });

    socket.on('player:joined', ({ token }) => {
      setMyToken(token);
      setJoined(true);
      localStorage.setItem('ai_human_token', token);
    });

    socket.on('player:kicked', (reason) => {
      alert(reason);
      setJoined(false);
      setMyToken('');
      localStorage.removeItem('ai_human_token');
    });

    socket.on('player:error', (msg) => {
      setJoinError(msg);
    });

    const savedToken = localStorage.getItem('ai_human_token');
    const savedName = localStorage.getItem('ai_human_name');
    if (savedToken && savedName && code) {
      setPlayerName(savedName);
      socket.emit('player:reconnect', { token: savedToken });
      setJoined(true);
    }

    return () => {
      if (socket) {
        socket.off('connect');
        socket.off('game:state');
        socket.off('player:private');
        socket.off('player:joined');
        socket.off('player:kicked');
        socket.off('player:error');
      }
    };
  }, []);

  useEffect(() => {
    if (!gameState || gameState.state !== 'question') return;

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((gameState.questionEndsAt - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 100);

    return () => clearInterval(interval);
  }, [gameState]);

  const handleJoin = () => {
    if (!gameCode || !playerName) {
      setJoinError('Моля, въведете код и име');
      return;
    }
    localStorage.setItem('ai_human_name', playerName);
    socket.emit('player:join', {
      token: myToken,
      name: playerName,
      gameCode: gameCode.toUpperCase()
    });
  };

  const handleAnswer = (choice) => {
    if (!joined || gameState?.state !== 'question') return;
    setSelectedAnswer(choice);
    socket.emit('player:answer', { choice });
  };

  if (!joined) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-sm sm:max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-4xl sm:text-5xl font-extrabold text-primary tracking-tight">PGITECH</CardTitle>
            <CardDescription className="text-base">Въведи кода от учителя</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Input
                type="text"
                placeholder="Код на играта"
                value={gameCode}
                onChange={(e) => setGameCode(e.target.value.toUpperCase())}
                maxLength={6}
                className="text-center text-lg tracking-widest font-mono"
              />
            </div>
            <div className="space-y-2">
              <Input
                type="text"
                placeholder="Твоето име"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                maxLength={20}
              />
            </div>
            {joinError && <p className="text-destructive text-sm text-center">{joinError}</p>}
            <Button onClick={handleJoin} className="w-full h-12 text-base font-semibold">
              Влез в играта
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (showPodium && gameState?.state === 'finished') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl sm:text-3xl">Играта свърши!</CardTitle>
            <div className="mt-4 space-y-1">
              <p className="text-xl font-semibold">Твоят резултат: <span className="text-primary">{privateState?.score || 0}</span> точки</p>
              <p className="text-lg text-muted-foreground">Ранг: <span className="text-primary font-bold">#{privateState?.rank || '-'}</span></p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex justify-center gap-2 sm:gap-4 flex-wrap">
              {leaderboard.slice(0, 3).map((player, i) => (
                <div 
                  key={i} 
                  className={`p-3 sm:p-4 bg-card rounded-lg text-center min-w-[80px] sm:min-w-[100px] ${i === 0 ? 'bg-primary/20 border-2 border-primary' : ''}`}
                >
                  <div className="text-2xl sm:text-3xl font-bold text-primary mb-1">#{i + 1}</div>
                  <div className="text-xs sm:text-sm font-medium truncate max-w-[80px] sm:max-w-[100px]">{player.name}</div>
                  <div className="text-sm text-primary font-semibold">{player.score}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!gameState || gameState.state === 'lobby') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="pt-6 text-center">
            <div className="w-10 h-10 border-4 border-muted border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
            <h2 className="text-xl font-semibold mb-2">Изчакване на играча...</h2>
            <p className="text-muted-foreground">Код: <span className="font-mono font-bold text-primary">{gameCode}</span></p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (gameState.state === 'ready') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-extrabold text-primary">PGITECH</CardTitle>
            <CardDescription className="text-base mt-2">Играта започва скоро!</CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-2">
            <p className="text-muted-foreground">Брой въпроси: <span className="font-semibold">{gameState.totalQuestions}</span></p>
            <p className="text-muted-foreground">Играчи: <span className="font-semibold">{gameState.playersCount}</span></p>
            {privateState && (
              <div className="mt-4 p-4 bg-accent/20 rounded-lg border border-accent">
                <p className="font-medium">Твоето име: {playerName}</p>
                <p className="text-primary font-bold text-lg">Точки: {privateState.score}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (gameState.state === 'question' && currentQuestion) {
    const qType = currentQuestion.questionType || 'code';
    const progress = ((15 - timeLeft) / 15) * 100;

    return (
      <div className="min-h-screen bg-background p-2 sm:p-4 flex flex-col">
        <div className="flex items-center justify-between bg-card border rounded-lg p-2 sm:p-4 mb-2 sm:mb-3">
          <span className="text-sm sm:text-base font-medium">Въпрос {gameState.currentQuestionIndex + 1}/{gameState.totalQuestions}</span>
          <span className={`text-xl sm:text-2xl font-bold ${timeLeft <= 5 ? 'text-destructive' : 'text-primary'}`}>{timeLeft}с</span>
        </div>
        
        <div className="h-1 bg-muted rounded-full mb-2 sm:mb-3 overflow-hidden">
          <div 
            className="h-full bg-primary transition-all duration-100 ease-linear" 
            style={{ width: `${progress}%` }}
          ></div>
        </div>

        <div className="flex-1 mb-2 sm:mb-3">
          {qType === 'code' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 h-full">
              <div className="bg-card border rounded-lg p-2 sm:p-4">
                <h3 className="text-xs sm:text-sm text-muted-foreground text-center mb-2">{currentQuestion.leftTitle || 'Ляв код'}</h3>
                <pre className="bg-black/50 rounded p-2 sm:p-3 font-mono text-xs overflow-auto max-h-[150px] sm:max-h-[200px] whitespace-pre-wrap">{currentQuestion.leftCode || 'Няма код'}</pre>
              </div>
              <div className="bg-card border rounded-lg p-2 sm:p-4">
                <h3 className="text-xs sm:text-sm text-muted-foreground text-center mb-2">{currentQuestion.rightTitle || 'Десен код'}</h3>
                <pre className="bg-black/50 rounded p-2 sm:p-3 font-mono text-xs overflow-auto max-h-[150px] sm:max-h-[200px] whitespace-pre-wrap">{currentQuestion.rightCode || 'Няма код'}</pre>
              </div>
            </div>
          )}
          
          {qType === 'multiple_choice' && (
            <div className="bg-card border rounded-lg p-4 sm:p-6 text-center">
              <h2 className="text-lg sm:text-xl">{currentQuestion.questionText}</h2>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-2 sm:mb-3">
          <Button
            onClick={() => handleAnswer(0)}
            variant={selectedAnswer === 0 ? 'default' : 'secondary'}
            className={`h-auto py-3 sm:py-4 text-xs sm:text-sm text-left ${selectedAnswer === 0 ? 'bg-red-600 hover:bg-red-600' : ''}`}
            disabled={selectedAnswer !== null}
          >
            Лявата е от човек, дясната е ИИ
          </Button>
          <Button
            onClick={() => handleAnswer(1)}
            variant={selectedAnswer === 1 ? 'default' : 'secondary'}
            className={`h-auto py-3 sm:py-4 text-xs sm:text-sm text-left ${selectedAnswer === 1 ? 'bg-blue-600 hover:bg-blue-600' : ''}`}
            disabled={selectedAnswer !== null}
          >
            Дясната е от човек, лявата е ИИ
          </Button>
          <Button
            onClick={() => handleAnswer(2)}
            variant={selectedAnswer === 2 ? 'default' : 'secondary'}
            className={`h-auto py-3 sm:py-4 text-xs sm:text-sm text-left ${selectedAnswer === 2 ? 'bg-yellow-600 hover:bg-yellow-600' : ''}`}
            disabled={selectedAnswer !== null}
          >
            И двете са от човек
          </Button>
          <Button
            onClick={() => handleAnswer(3)}
            variant={selectedAnswer === 3 ? 'default' : 'secondary'}
            className={`h-auto py-3 sm:py-4 text-xs sm:text-sm text-left ${selectedAnswer === 3 ? 'bg-green-600 hover:bg-green-600' : ''}`}
            disabled={selectedAnswer !== null}
          >
            И двете са от ИИ
          </Button>
        </div>

        <div className="bg-card border rounded-lg p-2 sm:p-4">
          <h3 className="text-sm font-semibold mb-2">Класиране</h3>
          <div className="space-y-1 max-h-[120px] sm:max-h-[150px] overflow-auto no-scrollbar">
            {leaderboard.slice(0, 5).map((player, i) => (
              <div key={i} className="flex items-center gap-2 py-1 border-b border-border last:border-0">
                <span className="w-6 font-bold text-primary">#{i + 1}</span>
                <span className="flex-1 truncate text-sm">{player.name}</span>
                <span className="text-primary font-semibold">{player.score}т</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (gameState.state === 'pause' || gameState.state === 'reveal') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <h2 className="text-2xl font-semibold">Следващ въпрос след...</h2>
            <div className="text-6xl font-bold text-primary my-4">
              {Math.ceil((gameState.pauseEndsAt - Date.now()) / 1000)}
            </div>
            {privateState?.revealMessage && (
              <p className="bg-primary/20 border border-primary rounded-lg p-3 text-primary font-medium">{privateState.revealMessage}</p>
            )}
          </CardHeader>
          <CardContent>
            <div className="bg-card border rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-2">Класиране</h3>
              <div className="space-y-1 max-h-[150px] overflow-auto no-scrollbar">
                {leaderboard.slice(0, 5).map((player, i) => (
                  <div key={i} className="flex items-center gap-2 py-1 border-b border-border last:border-0">
                    <span className="w-6 font-bold text-primary">#{i + 1}</span>
                    <span className="flex-1 truncate text-sm">{player.name}</span>
                    <span className="text-primary font-semibold">{player.score}т</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="pt-6 text-center">
          <div className="w-10 h-10 border-4 border-muted border-t-primary rounded-full animate-spin mx-auto"></div>
          <h2 className="text-xl font-semibold mt-4">Loading...</h2>
        </CardContent>
      </Card>
    </div>
  );
}