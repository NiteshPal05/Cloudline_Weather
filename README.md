# Cloudline Weather

Cloudline Weather is a full-stack MERN weather dashboard with personalized cities, live location weather, premium plan flow, and animated weather UI.

## Live Demo
- Frontend: [https://cloudlineweather.netlify.app/](https://cloudlineweather.netlify.app/)

## Features
- City search with weather + 5-day forecast
- Hourly temperature chart (`chart.js`)
- Live location weather (browser geolocation)
- Dynamic weather icons (amCharts icon pack)
- Animated backgrounds by weather/day/night
- User authentication:
  - Email/password
  - Google login
- User-specific favorites (MongoDB)
- Premium plan system:
  - Ads Free / Basic / Pro
  - Monthly and annual billing
  - Razorpay payment integration
  - Pro upgrade discount when Basic is already active
- Pro cards:
  - Precipitation summary (`mm` + rain probability)
  - Real precipitation map (`leaflet` + OpenWeather tiles)
  - Moon insights card

## Tech Stack
- Frontend: React, Vite, Tailwind CSS, Chart.js, React Leaflet
- Backend: Node.js, Express, MongoDB, Mongoose, JWT, Razorpay
- APIs: OpenWeather, ExchangeRate-API, Google Identity

## Project Structure
```text
weather_dashboard/
  backend/
    models/
    server.js
    package.json
  frontend/
    src/
    public/
    package.json
```

## Environment Variables

### Backend (`backend/.env`)
```env
OPENWEATHER_API_KEY=your_openweather_key
MONGODB_URI=your_mongodb_atlas_uri
JWT_SECRET=your_jwt_secret
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
GOOGLE_CLIENT_ID=your_google_client_id
EXCHANGE_RATE_API_KEY=your_exchange_rate_api_key
```

### Frontend (`frontend/.env`)
```env
VITE_API_BASE_URL=http://localhost:5001
VITE_RAZORPAY_KEY_ID=your_razorpay_key_id
VITE_GOOGLE_CLIENT_ID=your_google_client_id
```

## Local Setup

### 1. Clone
```bash
git clone https://github.com/NiteshPal05/Cloudline_Weather.git
cd Cloudline_Weather
```

### 2. Backend
```bash
cd backend
npm install
npx nodemon server.js
```

### 3. Frontend
```bash
cd ../frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173` by default.

## Build
```bash
cd frontend
npm run build
npm run preview
```

## Deployment

### Frontend (Netlify)
- Root directory: `frontend`
- Build command: `npm run build`
- Publish directory: `dist`
- Set frontend env vars in Netlify dashboard

### Backend (Render)
- Root directory: `backend`
- Build command: `npm install`
- Start command: `node server.js`
- Set backend env vars in Render dashboard
- Update CORS allowlist with Netlify domain

## Important Notes
- Use MongoDB Atlas in production (not local Compass URI)
- Keep all secrets in hosting environment variables
- Do not commit API keys or secrets to GitHub
- `dist` folder is generated output and is normally ignored in Git

## Main Dependencies

### Frontend
- `react`
- `vite`
- `chart.js`
- `react-chartjs-2`
- `leaflet`
- `react-leaflet`
- `tailwindcss`

### Backend
- `express`
- `mongoose`
- `axios`
- `cors`
- `dotenv`
- `jsonwebtoken`
- `bcryptjs`
- `google-auth-library`
- `razorpay`

## License
This project is for learning and portfolio use.
