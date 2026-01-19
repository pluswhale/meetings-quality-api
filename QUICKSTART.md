# 🚀 Quick Start Guide

Быстрое руководство по запуску Meetings Quality API.

## Минимальная установка (5 минут)

### 1. Установите зависимости

```bash
npm install
```

### 2. Настройте MongoDB Atlas

1. Перейдите на [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register)
2. Создайте бесплатный кластер (M0)
3. Создайте пользователя базы данных
4. Добавьте IP `0.0.0.0/0` в Network Access (для разработки)
5. Получите connection string (кнопка "Connect" → "Connect your application")

### 3. Создайте .env файл

```bash
cp env.example .env
```

Отредактируйте `.env` и вставьте ваш MongoDB URI:

```env
MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/meetings-quality?retryWrites=true&w=majority
JWT_SECRET=my-super-secret-key-123
JWT_EXPIRATION=7d
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
```

### 4. Запустите сервер

```bash
npm run start:dev
```

Сервер запустится на `http://localhost:3000` 🎉

---

## Тестирование API

### Способ 1: cURL

**Регистрация:**
```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "Test User",
    "email": "test@example.com",
    "password": "password123"
  }'
```

Скопируйте `access_token` из ответа.

**Создание встречи:**
```bash
curl -X POST http://localhost:3000/meetings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "title": "Тестовая встреча",
    "question": "Как настроить API?"
  }'
```

### Способ 2: Postman

1. Импортируйте коллекцию или создайте новую
2. Создайте запрос `POST http://localhost:3000/auth/register`
3. Добавьте Body → raw → JSON с данными пользователя
4. Сохраните токен из ответа
5. Используйте токен в заголовке Authorization для других запросов

### Способ 3: Thunder Client (VS Code)

1. Установите расширение Thunder Client
2. Создайте новый запрос
3. Следуйте шагам как в Postman

---

## Подключение фронтенда

### REST API

```typescript
const API_URL = 'http://localhost:3000';

// Регистрация
const response = await fetch(`${API_URL}/auth/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fullName: 'Ivan Ivanov',
    email: 'ivan@example.com',
    password: 'password123'
  })
});

const { access_token } = await response.json();

// Получение встреч
const meetings = await fetch(`${API_URL}/meetings`, {
  headers: { 'Authorization': `Bearer ${access_token}` }
});
```

### WebSocket

```typescript
import io from 'socket.io-client';

const socket = io('http://localhost:3000', {
  transports: ['websocket'],
});

// Присоединиться к встрече
socket.emit('joinMeeting', meetingId);

// Слушать изменения фазы
socket.on('phaseChanged', (data) => {
  console.log('Фаза изменилась:', data);
  // Обновить UI
});
```

---

## Структура полного flow

### 1. Создание пользователей

```bash
# Пользователь 1
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"fullName": "Иван", "email": "ivan@test.com", "password": "123456"}'

# Пользователь 2
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"fullName": "Петр", "email": "petr@test.com", "password": "123456"}'
```

### 2. Создание встречи (от Ивана)

```bash
curl -X POST http://localhost:3000/meetings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer IVAN_TOKEN" \
  -d '{
    "title": "Планирование спринта",
    "question": "Что делаем в следующем спринте?",
    "participantIds": ["IVAN_ID", "PETR_ID"]
  }'
```

### 3. Переход в фазу оценки (от Ивана - создателя)

```bash
curl -X PATCH http://localhost:3000/meetings/MEETING_ID/phase \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer IVAN_TOKEN" \
  -d '{"phase": "evaluation"}'
```

### 4. Отправка оценок (от участников)

```bash
# Иван оценивает
curl -X POST http://localhost:3000/meetings/MEETING_ID/evaluations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer IVAN_TOKEN" \
  -d '{
    "understandingScore": 85,
    "influences": [
      {"participantId": "PETR_ID", "influencePercentage": 100}
    ],
    "emotionalEvaluations": [
      {"targetParticipantId": "PETR_ID", "emotionalScale": 80, "isToxic": false}
    ]
  }'

# Петр оценивает
curl -X POST http://localhost:3000/meetings/MEETING_ID/evaluations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer PETR_TOKEN" \
  -d '{
    "understandingScore": 90,
    "influences": [
      {"participantId": "IVAN_ID", "influencePercentage": 100}
    ],
    "emotionalEvaluations": [
      {"targetParticipantId": "IVAN_ID", "emotionalScale": 70, "isToxic": false}
    ]
  }'
```

### 5. Переход в фазу резюме (от Ивана)

```bash
curl -X PATCH http://localhost:3000/meetings/MEETING_ID/phase \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer IVAN_TOKEN" \
  -d '{"phase": "summary"}'
```

### 6. Отправка резюме (от участников)

```bash
# Иван создает задачу
curl -X POST http://localhost:3000/meetings/MEETING_ID/summaries \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer IVAN_TOKEN" \
  -d '{
    "taskDescription": "Настроить CI/CD",
    "deadline": "2026-02-01T00:00:00.000Z",
    "contributionImportance": 90
  }'

# Петр создает задачу
curl -X POST http://localhost:3000/meetings/MEETING_ID/summaries \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer PETR_TOKEN" \
  -d '{
    "taskDescription": "Написать документацию",
    "deadline": "2026-02-05T00:00:00.000Z",
    "contributionImportance": 85
  }'
```

### 7. Завершение встречи (от Ивана)

```bash
curl -X PATCH http://localhost:3000/meetings/MEETING_ID/phase \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer IVAN_TOKEN" \
  -d '{"phase": "finished"}'
```

### 8. Получение статистики

```bash
curl http://localhost:3000/meetings/MEETING_ID/statistics \
  -H "Authorization: Bearer IVAN_TOKEN"
```

---

## Troubleshooting

### Ошибка подключения к MongoDB

```
MongooseServerSelectionError: Could not connect to any servers
```

**Решение:**
1. Проверьте правильность connection string в `.env`
2. Убедитесь, что IP адрес добавлен в Network Access на MongoDB Atlas
3. Проверьте username и password в connection string

### Ошибка JWT

```
401 Unauthorized
```

**Решение:**
1. Проверьте, что токен передается в заголовке: `Authorization: Bearer <token>`
2. Токен не должен содержать лишних пробелов
3. Проверьте срок действия токена

### Порт уже занят

```
Error: listen EADDRINUSE: address already in use :::3000
```

**Решение:**
```bash
# Найти процесс на порту 3000
lsof -ti:3000

# Убить процесс
kill -9 $(lsof -ti:3000)

# Или измените PORT в .env
PORT=3001
```

---

## Полезные команды

```bash
# Запуск в режиме разработки
npm run start:dev

# Сборка проекта
npm run build

# Запуск production версии
npm run start:prod

# Форматирование кода
npm run format

# Линтинг
npm run lint
```

---

## Следующие шаги

1. ✅ API запущен и работает
2. 📖 Изучите [полную документацию](README.md)
3. 🔌 Изучите [API endpoints](API.md)
4. 🎨 Подключите фронтенд
5. 🔒 Настройте production окружение

---

## Контакты и поддержка

При возникновении проблем:
- Проверьте логи сервера
- Убедитесь, что все environment variables установлены
- Проверьте версию Node.js (требуется v16+)
