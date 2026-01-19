# Swagger / OpenAPI Documentation

Полная документация по использованию Swagger для генерации типизированного API клиента.

## Доступ к Swagger UI

После запуска сервера, Swagger UI доступен по адресу:

```
http://localhost:3000/api
```

На Render или другом хостинге:
```
https://your-api-url.onrender.com/api
```

## Получение OpenAPI спецификации

JSON спецификация доступна по адресу:
```
http://localhost:3000/api-json
```

## Генерация API клиента с Orval и React Query

### Шаг 1: Установка зависимостей на фронтенде

```bash
npm install @tanstack/react-query axios
npm install -D orval
```

### Шаг 2: Создание конфигурации Orval

Создайте файл `orval.config.ts` в корне вашего фронтенд проекта:

```typescript
import { defineConfig } from 'orval';

export default defineConfig({
  api: {
    input: {
      target: 'http://localhost:3000/api-json',
      // Или для продакшена:
      // target: 'https://your-api-url.onrender.com/api-json',
    },
    output: {
      mode: 'tags-split',
      target: 'src/api/generated',
      schemas: 'src/api/generated/models',
      client: 'react-query',
      mock: false,
      override: {
        mutator: {
          path: 'src/api/mutator/custom-instance.ts',
          name: 'customInstance',
        },
      },
    },
  },
});
```

### Шаг 3: Создание custom instance для axios

Создайте файл `src/api/mutator/custom-instance.ts`:

```typescript
import Axios, { AxiosRequestConfig } from 'axios';

export const AXIOS_INSTANCE = Axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
});

// Добавление токена к каждому запросу
AXIOS_INSTANCE.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

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

export default customInstance;
```

### Шаг 4: Добавление скрипта в package.json

```json
{
  "scripts": {
    "generate:api": "orval"
  }
}
```

### Шаг 5: Генерация API клиента

```bash
npm run generate:api
```

Это создаст типизированные функции и хуки React Query в `src/api/generated/`.

### Шаг 6: Использование в компонентах

#### Пример 1: Регистрация

```typescript
import { useAuthControllerRegister } from '@/api/generated/auth/auth';

function RegisterForm() {
  const registerMutation = useAuthControllerRegister();

  const handleSubmit = async (data: CreateUserDto) => {
    try {
      const response = await registerMutation.mutateAsync({
        data,
      });
      
      // Сохраняем токен
      localStorage.setItem('access_token', response.access_token);
      
      // Редирект или обновление UI
      console.log('User registered:', response.user);
    } catch (error) {
      console.error('Registration failed:', error);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Форма регистрации */}
    </form>
  );
}
```

#### Пример 2: Получение встреч

```typescript
import { useMeetingsControllerFindAll } from '@/api/generated/meetings/meetings';

function MeetingsList() {
  const { data: meetings, isLoading, error } = useMeetingsControllerFindAll({
    filter: 'current',
  });

  if (isLoading) return <div>Загрузка...</div>;
  if (error) return <div>Ошибка: {error.message}</div>;

  return (
    <div>
      {meetings?.map((meeting) => (
        <div key={meeting._id}>
          <h3>{meeting.title}</h3>
          <p>{meeting.question}</p>
          <span>Фаза: {meeting.currentPhase}</span>
        </div>
      ))}
    </div>
  );
}
```

#### Пример 3: Создание встречи

```typescript
import { useMeetingsControllerCreate } from '@/api/generated/meetings/meetings';

function CreateMeetingForm() {
  const createMeetingMutation = useMeetingsControllerCreate();

  const handleCreate = async () => {
    try {
      const meeting = await createMeetingMutation.mutateAsync({
        data: {
          title: 'Новая встреча',
          question: 'Обсуждаем важный вопрос',
          participantIds: ['user1', 'user2'],
        },
      });
      
      console.log('Meeting created:', meeting);
    } catch (error) {
      console.error('Failed to create meeting:', error);
    }
  };

  return (
    <button onClick={handleCreate} disabled={createMeetingMutation.isLoading}>
      {createMeetingMutation.isLoading ? 'Создание...' : 'Создать встречу'}
    </button>
  );
}
```

#### Пример 4: Изменение фазы встречи

```typescript
import { useMeetingsControllerChangePhase } from '@/api/generated/meetings/meetings';
import { MeetingPhase } from '@/api/generated/models';

function MeetingControls({ meetingId }: { meetingId: string }) {
  const changePhase = useMeetingsControllerChangePhase();

  const handlePhaseChange = async (phase: MeetingPhase) => {
    try {
      await changePhase.mutateAsync({
        id: meetingId,
        data: { phase },
      });
      
      // Обновить UI или показать уведомление
      console.log('Phase changed to:', phase);
    } catch (error) {
      console.error('Failed to change phase:', error);
    }
  };

  return (
    <div>
      <button onClick={() => handlePhaseChange(MeetingPhase.EVALUATION)}>
        Перейти к оценке
      </button>
      <button onClick={() => handlePhaseChange(MeetingPhase.SUMMARY)}>
        Перейти к резюме
      </button>
      <button onClick={() => handlePhaseChange(MeetingPhase.FINISHED)}>
        Завершить встречу
      </button>
    </div>
  );
}
```

#### Пример 5: Отправка оценки

```typescript
import { useMeetingsControllerSubmitEvaluation } from '@/api/generated/meetings/meetings';

function EvaluationForm({ meetingId }: { meetingId: string }) {
  const submitEvaluation = useMeetingsControllerSubmitEvaluation();

  const handleSubmit = async () => {
    try {
      await submitEvaluation.mutateAsync({
        id: meetingId,
        data: {
          understandingScore: 85,
          influences: [
            {
              participantId: 'user2',
              influencePercentage: 60,
            },
          ],
          emotionalEvaluations: [
            {
              targetParticipantId: 'user2',
              emotionalScale: 80,
              isToxic: false,
            },
          ],
        },
      });
      
      console.log('Evaluation submitted');
    } catch (error) {
      console.error('Failed to submit evaluation:', error);
    }
  };

  return (
    <button onClick={handleSubmit} disabled={submitEvaluation.isLoading}>
      Отправить оценку
    </button>
  );
}
```

### Шаг 7: Настройка React Query Provider

В вашем `main.tsx` или `App.tsx`:

```typescript
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* Ваше приложение */}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
```

## Автоматическая регенерация API

Для автоматической регенерации при изменении API, можете использовать:

```bash
# Watch mode (требует установки nodemon)
npm install -D nodemon

# Добавьте в package.json
"scripts": {
  "generate:api:watch": "nodemon --watch http://localhost:3000/api-json --exec npm run generate:api"
}
```

## Типизация

Все типы автоматически генерируются из Swagger схем:

```typescript
import type {
  CreateMeetingDto,
  MeetingResponseDto,
  MeetingPhase,
  MeetingStatus,
  SubmitEvaluationDto,
  TaskResponseDto,
} from '@/api/generated/models';

// Используйте типы в вашем коде
const meeting: MeetingResponseDto = {
  _id: '123',
  title: 'Meeting',
  // ... полная типизация
};
```

## Преимущества

✅ **Полная типизация** - TypeScript типы для всех запросов и ответов  
✅ **Автоматическая генерация** - код генерируется из OpenAPI спецификации  
✅ **React Query интеграция** - готовые хуки с кешированием и оптимистичными обновлениями  
✅ **Централизованная настройка** - все запросы проходят через custom instance  
✅ **Автоматическая авторизация** - токен добавляется ко всем запросам  
✅ **Обработка ошибок** - встроенная обработка ошибок через React Query

## Swagger Tags

API разделено на следующие группы:

- **auth** - Аутентификация и авторизация
- **users** - Управление пользователями  
- **meetings** - Управление встречами
- **tasks** - Управление задачами

## Документация эндпоинтов

Полная документация всех эндпоинтов доступна в Swagger UI:

```
http://localhost:3000/api
```

Там вы найдете:
- Описание каждого эндпоинта
- Примеры запросов и ответов
- Схемы данных
- Возможность тестировать API прямо из браузера

## Troubleshooting

### CORS ошибки

Убедитесь, что `FRONTEND_URL` в `.env` указывает на ваш фронтенд:

```env
FRONTEND_URL=http://localhost:3001
```

### Ошибки генерации

Если Orval не может получить спецификацию:

1. Убедитесь, что сервер запущен
2. Проверьте URL в `orval.config.ts`
3. Проверьте, что `/api-json` доступен

### 401 Unauthorized

Убедитесь, что токен сохраняется и добавляется к запросам:

```typescript
// После успешного логина
localStorage.setItem('access_token', response.access_token);

// Токен автоматически добавляется через interceptor
```

## Production Build

Для продакшена:

1. Измените `target` в `orval.config.ts` на production URL
2. Сгенерируйте API клиент перед сборкой
3. Добавьте в CI/CD pipeline:

```yaml
- name: Generate API client
  run: npm run generate:api
  
- name: Build
  run: npm run build
```
