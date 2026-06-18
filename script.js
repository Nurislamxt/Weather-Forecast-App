const API_KEY = "D6fbdefe8a292092e91d95cf09ff913e"; 
const BASE_URL = "https://api.openweathermap.org/data/2.5";
const DEFAULT_CITY = "Tashkent";

// --- Хранилище DOM-селекторов (UI) ---
const ui = {
    input: document.getElementById('city-input'),
    btnSearch: document.getElementById('search-btn'),
    btnClear: document.getElementById('clear-btn'),
    btnLocation: document.getElementById('location-btn'),
    btnTheme: document.getElementById('theme-toggle'),
    themeIcon: document.getElementById('theme-icon'),
    cardWeather: document.getElementById('weather-card'),
    cardError: document.getElementById('error-message'),
    loader: document.getElementById('skeleton-loader'),
    
    current: {
        city: document.getElementById('city-name'),
        temp: document.getElementById('temperature'),
        icon: document.getElementById('weather-icon'),
        desc: document.getElementById('weather-description'),
        humidity: document.getElementById('humidity'),
        wind: document.getElementById('wind-speed')
    },
    
    forecast: {
        hourly: document.getElementById('hourly-forecast'),
        daily: document.getElementById('daily-forecast')
    }
};

// --- Точка входа в приложение ---
document.addEventListener('DOMContentLoaded', () => {
    initTheme();          // 1. Применяем цветовую тему (день/ночь)
    checkNetworkStatus(); // 2. Проверяем интернет соединения
    loadLastCity();       // 3. Загружаем сохраненный или дефолтный город
});

// Слушаем изменения статуса сети во время работы приложения
window.addEventListener('online', checkNetworkStatus);
window.addEventListener('offline', checkNetworkStatus);


// --- Асинхронная логика запросов (API) ---

/**
 * Запрос данных по названию города
 */
async function fetchWeatherByCity(city) {
    if (!checkNetworkStatus()) return;
    
    setLoadingState(true);
    try {
        const [currentRes, forecastRes] = await Promise.all([
            fetch(`${BASE_URL}/weather?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric&lang=ru`),
            fetch(`${BASE_URL}/forecast?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric&lang=ru`)
        ]);

        await handleResponses(currentRes, forecastRes);
        saveLastCity(city);
    } catch (error) {
        showError(error.message);
    } finally {
        setLoadingState(false);
    }
}

/**
 * Запрос данных по географическим координатам
 */
async function fetchWeatherByCoords(lat, lon) {
    if (!checkNetworkStatus()) return;

    setLoadingState(true);
    try {
        const [currentRes, forecastRes] = await Promise.all([
            fetch(`${BASE_URL}/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&lang=ru`),
            fetch(`${BASE_URL}/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&lang=ru`)
        ]);

        const currentData = await handleResponses(currentRes, forecastRes);
        saveLastCity(currentData.name);
    } catch (error) {
        showError(error.message);
    } finally {
        setLoadingState(false);
    }
}

/**
 * Унифицированный обработчик ответов серверов OpenWeather
 */
async function handleResponses(currentRes, forecastRes) {
    if (!currentRes.ok || !forecastRes.ok) {
        if (currentRes.status === 404) throw new Error('Город не найден. Проверьте правильность написания.');
        throw new Error('Не удалось получить данные с сервера погоды.');
    }

    const currentData = await currentRes.json();
    const forecastData = await forecastRes.json();

    // Отрисовка всех блоков
    renderCurrentWeather(currentData);
    renderHourlyForecast(forecastData.list);
    renderDailyForecast(forecastData.list);
    updateWeatherTheme(currentData.weather[0].main);

    return currentData;
}


// --- Функции Рендеринга Интерфейса (UI) ---

function renderCurrentWeather(data) {
    ui.cardError.classList.add('hidden');
    
    ui.current.city.textContent = `${data.name}, ${data.sys.country}`;
    ui.current.temp.textContent = Math.round(data.main.temp);
    ui.current.desc.textContent = data.weather[0].description;
    ui.current.humidity.textContent = `${data.main.humidity}%`;
    ui.current.wind.textContent = `${data.wind.speed} м/с`;
    ui.current.icon.src = `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`;
    ui.current.icon.alt = data.weather[0].description;
    
    ui.cardWeather.classList.remove('hidden');
}

function renderHourlyForecast(list) {
    ui.forecast.hourly.innerHTML = '';
    // Вырезаем первые 8 элементов (интервал 24 часа с шагом в 3 часа от API)
    const hourlyData = list.slice(0, 8);
    
    hourlyData.forEach(item => {
        const time = new Date(item.dt * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        const temp = Math.round(item.main.temp);
        const icon = item.weather[0].icon;

        const html = `
            <div class="hourly-item">
                <span>${time}</span>
                <img src="https://openweathermap.org/img/wn/${icon}.png" alt="icon">
                <span class="hourly-temp">${temp}°</span>
            </div>
        `;
        ui.forecast.hourly.insertAdjacentHTML('beforeend', html);
    });
}

function renderDailyForecast(list) {
    ui.forecast.daily.innerHTML = '';
    const dailyData = {};

    // Группировка 3-часовых логов в суточные массивы для расчета точных min/max
    list.forEach(item => {
        const date = item.dt_txt.split(' ')[0];
        if (!dailyData[date]) {
            dailyData[date] = { min: item.main.temp_min, max: item.main.temp_max, icon: item.weather[0].icon, dt: item.dt };
        } else {
            dailyData[date].min = Math.min(dailyData[date].min, item.main.temp_min);
            dailyData[date].max = Math.max(dailyData[date].max, item.main.temp_max);
        }
    });

    const days = Object.values(dailyData).slice(0, 5);
    
    days.forEach((day, index) => {
        const dateObj = new Date(day.dt * 1000);
        let dayName = dateObj.toLocaleDateString('ru-RU', { weekday: 'long' });
        
        if (index === 0) dayName = 'Сегодня';
        if (index === 1) dayName = 'Завтра';

        const html = `
            <div class="daily-item">
                <span class="daily-day">${dayName}</span>
                <img class="daily-icon" src="https://openweathermap.org/img/wn/${day.icon}.png" alt="icon">
                <div class="daily-temp">
                    ${Math.round(day.min)}° <span>${Math.round(day.max)}°</span>
                </div>
            </div>
        `;
        ui.forecast.daily.insertAdjacentHTML('beforeend', html);
    });
}


// --- Управление системными состояниями и UX ---

function getUserLocation() {
    if (!navigator.geolocation) {
        showError("Геолокация не поддерживается вашим браузером.");
        return;
    }

    setLoadingState(true);
    navigator.geolocation.getCurrentPosition(
        (position) => {
            fetchWeatherByCoords(position.coords.latitude, position.coords.longitude);
        },
        () => {
            setLoadingState(false);
            showError("Доступ к геопозиции отклонен или недоступен.");
        }
    );
}

function updateWeatherTheme(weatherMain) {
    // Удаляем исключительно классы погодных условий, не ломая light-mode
    document.body.classList.remove('theme-clear', 'theme-clouds', 'theme-rain', 'theme-snow');
    const condition = weatherMain.toLowerCase();
    
    if (condition.includes('clear')) document.body.classList.add('theme-clear');
    else if (condition.includes('cloud')) document.body.classList.add('theme-clouds');
    else if (condition.includes('rain') || condition.includes('drizzle')) document.body.classList.add('theme-rain');
    else if (condition.includes('snow')) document.body.classList.add('theme-snow');
}

function initTheme() {
    const savedTheme = localStorage.getItem('weatherAppTheme');
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
        ui.themeIcon.textContent = '🌙';
    } else {
        document.body.classList.remove('light-mode');
        ui.themeIcon.textContent = '☀️';
    }
}

function setLoadingState(isLoading) {
    ui.input.disabled = isLoading;
    ui.btnSearch.disabled = isLoading;
    ui.btnLocation.disabled = isLoading;

    if (isLoading) {
        ui.loader.classList.remove('hidden');
        ui.cardWeather.classList.add('hidden');
        ui.cardError.classList.add('hidden');
    } else {
        ui.loader.classList.add('hidden');
    }
}

function showError(message) {
    ui.cardWeather.classList.add('hidden');
    ui.loader.classList.add('hidden');
    ui.cardError.textContent = message;
    ui.cardError.classList.remove('hidden');
}

function checkNetworkStatus() {
    if (!navigator.onLine) {
        showError("Отсутствует интернет-соединение. Проверьте сеть.");
        return false;
    }
    return true;
}

// --- Использование Local Storage ---
function saveLastCity(city) {
    localStorage.setItem('lastWeatherCity', city);
}

function loadLastCity() {
    const savedCity = localStorage.getItem('lastWeatherCity');
    fetchWeatherByCity(savedCity || DEFAULT_CITY);
}


// --- Привязка событий (Event Listeners) ---

ui.btnSearch.addEventListener('click', () => {
    const city = ui.input.value.trim();
    if (city) fetchWeatherByCity(city);
});

ui.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const city = ui.input.value.trim();
        if (city) fetchWeatherByCity(city);
    }
});

ui.btnClear.addEventListener('click', () => {
    ui.input.value = '';
    ui.input.focus();
});

ui.btnLocation.addEventListener('click', getUserLocation);

ui.btnTheme.addEventListener('click', () => {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');
    ui.themeIcon.textContent = isLight ? '🌙' : '☀️';
    localStorage.setItem('weatherAppTheme', isLight ? 'light' : 'dark');
});
