# AI или Човек? - Multiplayer Quiz Game

## Описание

**„AI или Човек?"** е мултиплейър quiz игра, вдъхновена от Kahoot, в която играчите трябва да разпознаят дали даден код е написан от **човек** или **изкуствен интелект (AI)**.

Играта показва **две изображения със код**, а играчите трябва да изберат правилния отговор.

### Възможни отговори:
1. Лявата е от човек, дясната е ИИ
2. Дясната е от човек, лявата е ИИ
3. И двете са от човек
4. И двете са от ИИ

### Система за точки:
- Верен отговор: **500 + до 500 бонус точки** (за бързина)
- Максимум: **1000 точки** за въпрос
- Грешен отговор: **0 точки**

---

## 🚀 Бързо стартиране

### 1. Инсталиране на зависимостите

```bash
npm install
```

### 2. Стартиране на сървъра

```bash
npm start
```

### 3. Отворете в браузъра:
- **Играчи**: http://localhost:3000
- **Хост панел**: http://localhost:3000/host.html
- **Админ панел**: http://localhost:3000/admin.html

---

## 📁 Структура на проекта

```
project/
├── server.js              # Основен backend сървър
├── database.js            # Модул за работа с база данни
├── health.js              # Health check endpoints
├── metrics.js             # Prometheus metrics
├── package.json           # Зависимости
├── .env.example          # Примерни средищни променливи
├── Dockerfile             # Docker image
├── docker-compose.yml     # Docker compose
├── docker-compose.prod.yml # Production Docker compose
├── nginx.conf            # Nginx конфигурация
├── ecosystem.config.js    # PM2 конфигурация
│
├── public/
│   ├── index.html         # Страница за играчи
│   ├── host.html          # Host панел
│   ├── admin.html         # Админ панел
│   ├── client.js          # Socket.io клиентска логика
│   ├── sounds.js          # Звукови ефекти
│   ├── notifications.js   # Toast известия
│   ├── style.css          # Стилуе
│   ├── sw.js              # Service Worker за PWA
│   └── manifest.json      # PWA манифест
│
└── tests/                # Тестове
```

---

## 🎮 Ръководство за игра

### За Хоста:

1. Отворете http://localhost:3000/host.html
2. Играчите се присъединяват чрез http://localhost:3000
3. Натиснете **"Старт"** за да започне играта
4. Използвайте **"Следващ"** за да преминете към следващия въпрос
5. Можете да **"Прекрати въпроса"** ако искате да спрете текущия

### За Играчите:

1. Отворете http://localhost:3000
2. Въведете вашия прякор (nickname)
3. Натиснете **"Влез в играта"**
4. Изчакайте въпросите и изберете отговор
5. Можете да използвате клавиши **1-4** за бърз отговор

---

## 🔐 Админ панел

### Вход:
- **Username**: `teacher` / **Password**: `teach*123`
- **Username**: `admin` / **Password**: `admin@123`

### Функционалности:
- **Управление на въпроси**: добавяне, редактиране, изтриване
- **Импорт/Експорт**: CSV формат за въпроси
- **Стартиране на игра**: контрол на играта
- **Бан система**: забранени играчи
- **IP блокиране**: блокиране на IP адреси
- **История**: преглед на минали игри
- **Статистика**: топ играчи, брой игри и др.

---

## 🔌 API Endpoints

### Health & Metrics
- `GET /health` - Health check с детайли
- `GET /health/live` - Liveness probe
- `GET /health/ready` - Readiness probe
- `GET /metrics` - Prometheus metrics

### Admin API (изисква JWT token)
- `POST /api/admin/login` - Вход
- `GET /api/admin/verify` - Проверка на токен
- `GET /api/admin/questions` - Списък с въпроси
- `POST /api/admin/questions` - Създаване на въпрос
- `PUT /api/admin/questions/:id` - Редактиране
- `DELETE /api/admin/questions/:id` - Изтриване
- `GET /api/admin/game/state` - Състояние на играта
- `POST /api/admin/game/start` - Стартиране
- `POST /api/admin/game/end` - Приключване
- `GET /api/admin/stats` - Статистики
- `GET /api/admin/bans` - Списък с бани
- `GET /api/admin/game-history` - История на игрите

---

## 🐳 Docker

### Development
```bash
docker-compose up -d
```

### Production
```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Build image
```bash
docker build -t ai-or-human .
```

---

## ⚙️ Конфигурация

Копирайте `.env.example` в `.env` и редактирайте:

```bash
cp .env.example .env
```

### Важни променливи:

| Променлива | Описание | По подразбиране |
|-----------|---------|-----------------|
| `PORT` | Порт на сървъра | 3000 |
| `JWT_SECRET` | Секретен ключ за JWT (променете в production!) | - |
| `QUESTION_TIME_SECONDS` | Време за въпрос | 15 |
| `QUESTIONS_PER_GAME` | Брой въпроси | 20 |
| `MAX_LOGIN_ATTEMPTS` | Макс. опити за вход | 5 |
| `DATA_RETENTION_DAYS` | Дни за съхранение на резултати | 30 |

---

## 🧪 Тестване

```bash
npm test
```

---

## 📊 Мониторинг

### Prometheus Metrics
Достъпни на `/metrics` endpoint:

- `http_requests_total` - Брой HTTP заявки
- `http_request_duration_seconds` - Продължителност на заявки
- `socket_connections_total` - Брой Socket.io връзки
- `game_sessions_total` - Брой игри
- `questions_answered_total` - Брой отговорени въпроси
- `correct_answers_total` - Брой верни отговори

---

## 🔒 Сигурност

- **JWT Authentication** за админ панел
- **Rate Limiting** за API endpoints
- **Account Lockout** след неуспешни опити за вход
- **IP Blocking** за забранени адреси
- **CSRF Protection** чрез helmet
- **SQLite** с WAL режим за производителност

---

## 🎨 UI/UX Функционалности

- **Responsive дизайн** - работи на мобилни устройства
- **Тъмен режим** - по подразбиране
- **Звукови ефекти** - Web Audio API
- **Анимации** - плавни CSS transitions
- **Toast известия** - за събития
- **PWA поддръжка** - можете да инсталирате като app
- **Keyboard shortcuts** - 1-4 за отговори
- **Автоматичен reconnect** - при загуба на връзка

---

## 🛠️ Технологии

### Backend
- **Node.js** - JavaScript runtime
- **Express** - HTTP сървър
- **Socket.IO** - Real-time комуникация
- **better-sqlite3** - SQLite база данни
- **bcrypt** - Хеширане на пароли
- **jsonwebtoken** - JWT authentication
- **helmet** - Security headers
- **winston** - Logging
- **prom-client** - Prometheus metrics

### Frontend
- **HTML5/CSS3** - Semantic markup & styling
- **Vanilla JavaScript** - No frameworks
- **Web Audio API** - Звукови ефекти
- **Service Worker** - PWA offline support

---

## 📝 License

MIT License

---

## 🤝 Принос

Pull requests са добре дошли. За големи промени, моля първо отворете issue за обсъждане.
