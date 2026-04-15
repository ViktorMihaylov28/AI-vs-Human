import { useState, useEffect } from 'react';
import io from 'socket.io-client';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

const QRCode = dynamic(() => import('qrcode'), { ssr: false });

let socket = null;

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || '';
const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export default function AdminPage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [gameState, setGameState] = useState(null);
  const [players, setPlayers] = useState([]);
  const [activeTab, setActiveTab] = useState('lobby');
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({
    questionsCount: 20,
    questionTime: 15,
    pointsPerQuestion: 100,
    pauseBetweenQuestions: 5,
    gameMode: 'classic',
    timeBonus: true,
    shuffleQuestions: true,
  });
  const [notification, setNotification] = useState('');

  useEffect(() => {
    const savedToken = localStorage.getItem('admin_token');
    if (savedToken) {
      setToken(savedToken);
      setLoggedIn(true);
      connectSocket(savedToken);
    }
  }, []);

  const connectSocket = (authToken) => {
    if (socket) socket.disconnect();

    const socketUrl = SOCKET_URL || window.location.origin;
    socket = io(socketUrl, {
      path: SOCKET_URL ? '/socket.io' : undefined,
      auth: { token: authToken }
    });

    socket.on('connect', () => {
      console.log('Admin connected');
    });

    socket.on('admin:update', (state) => {
      setGameState(state);
    });

    socket.on('players:update', (playerList) => {
      setPlayers(playerList);
    });

    socket.on('game:timer', ({ remainingMs }) => {
      // Timer handled by state
    });

    socket.on('game:pauseTimer', ({ remainingMs }) => {
      // Pause timer handled by state
    });

    socket.on('disconnect', () => {
      console.log('Admin disconnected');
    });
  };

  const handleLogin = async () => {
    try {
      const apiBase = API_URL || '';
      const res = await fetch(`${apiBase}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (data.token) {
        setToken(data.token);
        setLoggedIn(true);
        localStorage.setItem('admin_token', data.token);
        connectSocket(data.token);
      } else {
        showNotification(data.error || 'Грешка при вход');
      }
    } catch (err) {
      showNotification('Грешка при вход');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    setLoggedIn(false);
    setToken('');
    if (socket) socket.disconnect();
  };

  const apiRequest = async (endpoint, options = {}) => {
    const apiBase = API_URL || '';
    const res = await fetch(`${apiBase}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
      },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
  };

  const createGame = async () => {
    try {
      await apiRequest('/api/admin/game/create', { method: 'POST' });
      showNotification('Играта е създадена!');
    } catch (err) {
      showNotification(err.message);
    }
  };

  const startGame = async () => {
    try {
      await apiRequest('/api/admin/game/start', { method: 'POST' });
      showNotification('Играта започна!');
    } catch (err) {
      showNotification(err.message);
    }
  };

  const nextQuestion = async () => {
    try {
      await apiRequest('/api/admin/game/next', { method: 'POST' });
    } catch (err) {
      showNotification(err.message);
    }
  };

  const endGame = async () => {
    if (!confirm('Край на играта?')) return;
    try {
      await apiRequest('/api/admin/game/end', { method: 'POST' });
      showNotification('Играта приключи!');
    } catch (err) {
      showNotification(err.message);
    }
  };

  const saveSettings = async () => {
    try {
      await apiRequest('/api/admin/game/settings', {
        method: 'POST',
        body: JSON.stringify(settings),
      });
      setShowSettings(false);
      showNotification('Настройките са запазени!');
    } catch (err) {
      showNotification(err.message);
    }
  };

  const kickPlayer = async (playerToken) => {
    try {
      await apiRequest('/api/admin/game/kick', {
        method: 'POST',
        body: JSON.stringify({ playerToken }),
      });
      showNotification('Играчът е изгонен!');
    } catch (err) {
      showNotification(err.message);
    }
  };

  const showNotification = (msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(''), 3000);
  };

  if (!loggedIn) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <CardTitle className="text-4xl sm:text-5xl font-extrabold text-primary">PGITECH</CardTitle>
            <CardDescription className="text-base mt-2">Админ панел</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Потребител</Label>
              <Input
                id="username"
                type="text"
                placeholder="Потребител"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Парола</Label>
              <Input
                id="password"
                type="password"
                placeholder="Парола"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>
            <Button onClick={handleLogin} className="w-full h-11 text-base font-semibold">
              Вход
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const state = gameState?.state || 'lobby';
  const isLobby = state === 'lobby' || state === 'ready';
  const isPlaying = state === 'question' || state === 'pause' || state === 'reveal';

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {notification && (
        <div className="fixed top-4 right-4 bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium z-50 animate-in fade-in slide-in-from-top-2">
          {notification}
        </div>
      )}

      <header className="flex items-center justify-between bg-card border-b p-3 sm:p-4">
        <span className="text-xl sm:text-2xl font-bold text-primary">PGITECH</span>
        <div className="flex items-center gap-2 sm:gap-4">
          {gameState?.gameCode && (
            <span className="bg-background border-2 border-primary rounded px-2 sm:px-4 py-1 text-sm sm:text-lg font-bold tracking-widest text-primary">
              {gameState.gameCode}
            </span>
          )}
          <span className="bg-primary/20 text-primary rounded px-2 sm:px-3 py-1 text-xs sm:text-sm font-semibold hidden sm:inline">
            {gameState?.playersCount || 0} играчи
          </span>
          <Button variant="outline" size="icon" onClick={() => setShowSettings(true)}>
            ⚙️
          </Button>
          <Button variant="secondary" onClick={handleLogout} className="text-xs sm:text-sm px-2 sm:px-4">
            Изход
          </Button>
        </div>
      </header>

      <nav className="flex bg-card border-b overflow-x-auto">
        <button
          onClick={() => setActiveTab('lobby')}
          className={`px-4 sm:px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'lobby'
              ? 'text-primary border-primary'
              : 'text-muted-foreground border-transparent hover:text-foreground'
          }`}
        >
          Лоби
        </button>
        <button
          onClick={() => setActiveTab('game')}
          className={`px-4 sm:px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'game'
              ? 'text-primary border-primary'
              : 'text-muted-foreground border-transparent hover:text-foreground'
          }`}
        >
          Игра
        </button>
        <button
          onClick={() => setActiveTab('players')}
          className={`px-4 sm:px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'players'
              ? 'text-primary border-primary'
              : 'text-muted-foreground border-transparent hover:text-foreground'
          }`}
        >
          Играчи ({players.length})
        </button>
      </nav>

      <main className="flex-1 p-3 sm:p-6 max-w-4xl mx-auto w-full">
        {activeTab === 'lobby' && (
          <div>
            {isLobby ? (
              <Card>
                <CardHeader className="text-center">
                  <CardTitle>Играта е готова!</CardTitle>
                  {gameState?.gameCode && (
                    <>
                      <div className="bg-white p-4 rounded-lg inline-block mx-auto mt-4">
                        <QRCode value={`${window.location.origin}?code=${gameState.gameCode}`} size={120} />
                      </div>
                      <p className="text-3xl sm:text-4xl font-bold tracking-widest text-primary mt-4">{gameState.gameCode}</p>
                    </>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-3 sm:gap-4">
                    <div className="bg-background border rounded-lg p-3 sm:p-4 text-center">
                      <div className="text-2xl sm:text-3xl font-bold text-primary">{gameState?.playersCount || 0}</div>
                      <div className="text-xs text-muted-foreground mt-1">Играчи</div>
                    </div>
                    <div className="bg-background border rounded-lg p-3 sm:p-4 text-center">
                      <div className="text-2xl sm:text-3xl font-bold text-primary">{settings.questionsCount}</div>
                      <div className="text-xs text-muted-foreground mt-1">Въпроси</div>
                    </div>
                    <div className="bg-background border rounded-lg p-3 sm:p-4 text-center">
                      <div className="text-2xl sm:text-3xl font-bold text-primary">{settings.questionTime}с</div>
                      <div className="text-xs text-muted-foreground mt-1">Време</div>
                    </div>
                  </div>
                  {state === 'lobby' && (
                    <Button onClick={createGame} className="w-full h-12 text-base font-bold">
                      Създай игра
                    </Button>
                  )}
                  {state === 'ready' && (
                    <Button onClick={startGame} className="w-full h-12 text-base font-bold bg-green-600 hover:bg-green-700">
                      🚀 Старт на играта!
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader className="text-center">
                  <CardTitle>Готов ли си?</CardTitle>
                  <CardDescription>Създай игра и покани играчи!</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button onClick={createGame} className="w-full h-12 text-base font-semibold">
                    Създай игра
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {activeTab === 'game' && (
          <div className="space-y-4 sm:space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">⏱️ Таймер</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-5xl sm:text-6xl font-bold text-primary text-center">
                    {gameState?.state === 'question'
                      ? Math.max(0, Math.ceil((gameState.questionEndsAt - Date.now()) / 1000))
                      : gameState?.state === 'pause'
                      ? Math.max(0, Math.ceil((gameState.pauseEndsAt - Date.now()) / 1000))
                      : '15'}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">📊 Прогрес</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-primary">
                        {(gameState?.currentQuestionIndex >= 0 ? gameState.currentQuestionIndex + 1 : 0)}/{gameState?.totalQuestions || 0}
                      </div>
                      <div className="text-xs text-muted-foreground">Въпрос</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-primary">{gameState?.answeredPlayers || 0}</div>
                      <div className="text-xs text-muted-foreground">Отговорили</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">📈 Разпределение</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {['Лява е Човек', 'Дясна е Човек', 'Двете са Човек', 'Двете са ИИ'].map((label, i) => (
                  <div key={i} className="flex items-center gap-2 sm:gap-3">
                    <span className="text-xs sm:text-sm text-muted-foreground w-20 sm:w-28 truncate">{label}</span>
                    <div className="flex-1 h-4 sm:h-6 bg-background rounded overflow-hidden">
                      <div
                        className="h-full transition-all duration-300"
                        style={{
                          width: `${gameState?.answerCounts?.[i]
                            ? (gameState.answerCounts[i] / (gameState.answeredPlayers || 1)) * 100
                            : 0}%`,
                          background: ['#ef4444', '#3b82f6', '#eab308', '#22c55e'][i],
                        }}
                      />
                    </div>
                    <span className="text-sm font-semibold w-6 sm:w-8 text-right">{gameState?.answerCounts?.[i] || 0}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button onClick={nextQuestion} className="flex-1 h-12 text-base">
                ⏭️ {state === 'pause' ? 'Покажи отговора' : 'Следващ'}
              </Button>
              <Button onClick={endGame} variant="destructive" className="h-12 text-base">
                ⏹️ Край
              </Button>
            </div>
          </div>
        )}

        {activeTab === 'players' && (
          <Card>
            <CardHeader>
              <CardTitle>👥 Играчи ({players.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-2">#</th>
                      <th className="text-left py-2 px-2">Име</th>
                      <th className="text-left py-2 px-2">Точки</th>
                      <th className="text-left py-2 px-2">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {players.map((player, i) => (
                      <tr key={player.token} className="border-b last:border-0">
                        <td className="py-2 px-2">{i + 1}</td>
                        <td className="py-2 px-2 font-medium">{player.name}</td>
                        <td className="py-2 px-2 text-primary font-semibold">{player.score}</td>
                        <td className="py-2 px-2">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => kickPlayer(player.token)}
                          >
                            Изгони
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      {showSettings && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>⚙️ Настройки</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="questionsCount">Брой въпроси</Label>
                  <Input
                    id="questionsCount"
                    type="number"
                    value={settings.questionsCount}
                    onChange={(e) => setSettings({ ...settings, questionsCount: parseInt(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="questionTime">Време за въпрос</Label>
                  <Input
                    id="questionTime"
                    type="number"
                    value={settings.questionTime}
                    onChange={(e) => setSettings({ ...settings, questionTime: parseInt(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pointsPerQuestion">Точки за въпрос</Label>
                  <Input
                    id="pointsPerQuestion"
                    type="number"
                    value={settings.pointsPerQuestion}
                    onChange={(e) => setSettings({ ...settings, pointsPerQuestion: parseInt(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pauseBetweenQuestions">Пауза между въпроси</Label>
                  <Input
                    id="pauseBetweenQuestions"
                    type="number"
                    value={settings.pauseBetweenQuestions}
                    onChange={(e) => setSettings({ ...settings, pauseBetweenQuestions: parseInt(e.target.value) })}
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setShowSettings(false)}>
                Отказ
              </Button>
              <Button onClick={saveSettings}>Запази</Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );
}