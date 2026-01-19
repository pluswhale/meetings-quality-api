# Frontend Orval Configuration

Правильная конфигурация Orval для вашего фронтенда.

## 📝 Создайте orval.config.ts на фронтенде

```typescript
import { defineConfig } from 'orval';

export default defineConfig({
  api: {
    input: {
      // Option 1: Use generated file from backend repo (recommended)
      target: '../meetings-quality-api/generated/openapi.json',
      
      // Option 2: Use deployed static file
      // target: 'https://meetings-quality-api.onrender.com/generated/openapi.json',
      
      // Option 3: Use live API endpoint
      // target: 'https://meetings-quality-api.onrender.com/api-json',
    },
    output: {
      mode: 'tags-split',
      target: './src/api/generated',
      client: 'react-query',
      baseUrl: 'https://meetings-quality-api.onrender.com',  // ⚠️ NO /api at the end!
      override: {
        mutator: {
          path: './src/api/axios-instance.ts',
          name: 'customInstance',
        },
        query: {
          useQuery: true,
          useMutation: true,
          signal: true,
        },
      },
    },
    hooks: {
      afterAllFilesWrite: 'prettier --write',
    },
  },
});
```

## 🔧 Создайте src/api/axios-instance.ts

```typescript
import Axios, { AxiosRequestConfig, AxiosError } from 'axios';

export const AXIOS_INSTANCE = Axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'https://meetings-quality-api.onrender.com',
  withCredentials: true,
});

// Request interceptor - добавляем токен
AXIOS_INSTANCE.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - обработка ошибок
AXIOS_INSTANCE.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token');
      // Опционально: редирект на login
      // window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const customInstance = <T>(
  config: AxiosRequestConfig,
  options?: AxiosRequestConfig,
): Promise<T> => {
  const source = Axios.CancelToken.source();
  
  const promise = AXIOS_INSTANCE({
    ...config,
    ...options,
    cancelToken: source.token,
  }).then(({ data }) => data);

  // @ts-ignore
  promise.cancel = () => {
    source.cancel('Query was cancelled');
  };

  return promise;
};

export type ErrorType<Error> = AxiosError<Error>;

export default customInstance;
```

## 🚀 Генерация API клиента

```bash
npx orval
```

## ❌ Что было не так в вашей конфигурации

### 1. Неправильный URL для OpenAPI:
```typescript
// ❌ НЕПРАВИЛЬНО
target: 'https://meetings-quality-api.onrender.com/api/docs/json',

// ✅ ПРАВИЛЬНО - один из вариантов:
target: '../meetings-quality-api/generated/openapi.json',  // Локальный файл
target: 'https://meetings-quality-api.onrender.com/generated/openapi.json',  // Deployed file
target: 'https://meetings-quality-api.onrender.com/api-json',  // Live endpoint
```

### 2. Неправильный baseUrl:
```typescript
// ❌ НЕПРАВИЛЬНО
baseUrl: 'https://meetings-quality-api.onrender.com/api',

// ✅ ПРАВИЛЬНО
baseUrl: 'https://meetings-quality-api.onrender.com',
```

Endpoints в вашем API уже содержат `/auth`, `/meetings`, `/tasks` и т.д., поэтому `/api` в baseUrl НЕ нужен.

## 🔄 Development vs Production

### Локальная разработка:
```typescript
// orval.config.ts
input: {
  target: '../meetings-quality-api/generated/openapi.json',
},

// .env.local
VITE_API_URL=http://localhost:3002
```

### Production:
```typescript
// orval.config.ts
input: {
  target: 'https://meetings-quality-api.onrender.com/generated/openapi.json',
},

// .env.production
VITE_API_URL=https://meetings-quality-api.onrender.com
```

## 📋 Workflow

### Когда меняется API на backend:

1. **Backend разработчик:**
   ```bash
   npm run openapi:generate
   git add generated/openapi.json
   git commit -m "feat: add new endpoint"
   git push
   ```

2. **На Render (автоматически):**
   ```bash
   npm install; npm run openapi:generate; npm run build
   # Файл generated/openapi.json теперь доступен по /generated/openapi.json
   ```

3. **Frontend разработчик:**
   ```bash
   git pull  # Если используете локальный файл
   npx orval  # Регенерируем клиент
   ```

## ✅ Проверка

После деплоя на Render, проверьте что файл доступен:

```bash
curl https://meetings-quality-api.onrender.com/generated/openapi.json
```

Вы должны увидеть JSON с OpenAPI спецификацией.

## 🎯 Рекомендуемый подход

**Для монорепо или когда backend и frontend в одной директории:**
```typescript
target: '../meetings-quality-api/generated/openapi.json',
```

**Для отдельных репозиториев:**
```typescript
target: 'https://meetings-quality-api.onrender.com/generated/openapi.json',
```

Это самый надежный способ - файл всегда актуален после деплоя!
