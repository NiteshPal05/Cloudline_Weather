import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { Line } from "react-chartjs-2";
import deleteIcon from "./assets/delete-button-svgrepo-com.svg";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from "chart.js";
import "leaflet/dist/leaflet.css";
import {
  CircleMarker,
  MapContainer,
  TileLayer,
  Tooltip as LeafletTooltip,
} from "react-leaflet";

function PrecipMap({ lat, lon, city, apiBase, zoom }) {
  return (
    <MapContainer
      center={[lat, lon]}
      zoom={zoom}
      scrollWheelZoom={false}
      className="precip-map-live"
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <TileLayer url={`${apiBase}/api/precip-tile/{z}/{x}/{y}.png`} opacity={0.62} />
      <CircleMarker
        center={[lat, lon]}
        radius={12}
        pathOptions={{
          color: "#ffffff",
          weight: 2,
          fillColor: "#1c63b8",
          fillOpacity: 0.95,
        }}
      >
        <LeafletTooltip direction="top" offset={[0, -6]} permanent>
          {city}
        </LeafletTooltip>
      </CircleMarker>
    </MapContainer>
  );
}


ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
);

export default function App() {
  const [city, setCity] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [favorites, setFavorites] = useState([]);
  const [activePlans, setActivePlans] = useState(() => {
    const now = Date.now();
    const parsePlans = (value) => {
      if (!value) return {};
      try {
        const parsed = JSON.parse(value);
        if (!parsed) return {};
        if (parsed.id && parsed.expiresAt) {
          return parsed.expiresAt > now ? { [parsed.id]: parsed } : {};
        }
        if (typeof parsed !== "object") return {};
        return Object.fromEntries(
          Object.entries(parsed).filter(
            ([, plan]) => plan && plan.id && plan.expiresAt > now,
          ),
        );
      } catch {
        return {};
      }
    };

    return {
      ...parsePlans(localStorage.getItem("activePlans")),
      ...parsePlans(localStorage.getItem("activePlan")),
    };
  });
  const [billing, setBilling] = useState("monthly");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [userEmail, setUserEmail] = useState(
    localStorage.getItem("userEmail") || "",
  );
  const [showLogin, setShowLogin] = useState(false);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const key = import.meta.env.VITE_RAZORPAY_KEY_ID;
  const API = import.meta.env.VITE_API_BASE_URL;
  const [suggestions, setSuggestions] = useState([]);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const bgCanvasRef = useRef(null);
  const sidebarTouchStartX = useRef(0);
  const sidebarTouchCurrentX = useRef(0);

  const plans = [
    {
      id: "Ads Free",
      name: "Ads Free",
      monthly: 1,
      annual: 10,
      features: ["No ads", "Clean experience"],
    },
    {
      id: "Basic",
      name: "Basic",
      monthly: 5,
      annual: 50,
      features: ["Charts", "Air quality"],
    },
    {
      id: "Pro",
      name: "Pro",
      monthly: 10,
      annual: 100,
      features: ["Alerts", "Premium maps"],
    },
  ];

  function getPrice(plan) {
    return billing === "monthly" ? plan.monthly : plan.annual;
  }

  const themeInfo = useMemo(() => {
    const weather = data?.current?.weather?.[0];
    const id = Number(weather?.id || 0);
    const icon = String(weather?.icon || "");
    const temp = Number(data?.current?.main?.temp ?? 20);
    const isDay = icon.includes("d");

    let theme = "day";
    if (id >= 200 && id <= 232) theme = "rain";
    else if (id >= 300 && id <= 531) theme = "rain";
    else if (id >= 600 && id <= 622) theme = "snow";
    else if (id >= 701 && id <= 781) theme = "cloud";
    else if (id === 800) theme = isDay ? "day" : "night";
    else if (id >= 801 && id <= 804) theme = isDay ? "cloud" : "night";
    else theme = isDay ? "day" : "night";

    const tempBand = temp >= 32 ? "hot" : temp <= 10 ? "cold" : "mild";

    return { theme, tempBand, isDay, temp };
  }, [data]);

  const basicPlan = plans.find((plan) => plan.id === "Basic");
  const basicPriceForTerm = basicPlan ? getPrice(basicPlan) : 0;

  function loadStoredPlans(email) {
    const now = Date.now();
    const parsePlans = (value) => {
      if (!value) return {};
      try {
        const parsed = JSON.parse(value);
        if (!parsed) return {};
        if (parsed.id && parsed.expiresAt) {
          return parsed.expiresAt > now ? { [parsed.id]: parsed } : {};
        }
        if (typeof parsed !== "object") return {};
        return Object.fromEntries(
          Object.entries(parsed).filter(
            ([, plan]) => plan && plan.id && plan.expiresAt > now,
          ),
        );
      } catch {
        return {};
      }
    };

    const byUser = {
      ...parsePlans(localStorage.getItem(`activePlans:${email}`)),
      ...parsePlans(localStorage.getItem(`activePlan:${email}`)),
    };
    const global = {
      ...parsePlans(localStorage.getItem("activePlans")),
      ...parsePlans(localStorage.getItem("activePlan")),
    };
    return { ...global, ...byUser };
  }

  function persistPlans(nextPlans, email) {
    localStorage.setItem("activePlans", JSON.stringify(nextPlans));
    if (email) {
      localStorage.setItem(`activePlans:${email}`, JSON.stringify(nextPlans));
    }
  }

  async function fetchWeather(cityName = city) {
    try {
      const cleanCity = typeof cityName === "string" ? cityName.trim() : "";
      if (!cleanCity) return;

      setError("");
      const res = await fetch(
        `${API}/api/weather?city=${encodeURIComponent(cleanCity)}`,
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setData(json);
    } catch (err) {
      setError(err.message);
    }
  }

  async function fetchWeatherByCoords(lat, lon) {
    try {
      setError("");
      const res = await fetch(`${API}/api/weather?lat=${lat}&lon=${lon}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setData(json);
      if (json?.current?.name) {
        setCity(json.current.name);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  function useLiveLocation() {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported on this device");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        fetchWeatherByCoords(latitude, longitude);
        setSidebarOpen(false);
      },
      (geoError) => {
        if (geoError.code === 1) setError("Location permission denied");
        else if (geoError.code === 2) setError("Location unavailable");
        else if (geoError.code === 3) setError("Location request timed out");
        else setError("Failed to get location");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  }

  async function handleAuth(mode = "login") {
    try {
      const path = mode === "signup" ? "/api/auth/signup" : "/api/auth/login";
      const res = await fetch(`${API}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authEmail, password: authPassword }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Auth failed");
      setToken(json.token);
      setUserEmail(json.email);
      localStorage.setItem("token", json.token);
      localStorage.setItem("userEmail", json.email);
      setActivePlans(loadStoredPlans(json.email));
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  function logout() {
    setToken("");
    setUserEmail("");
    setFavorites([]);
    localStorage.removeItem("token");
    localStorage.removeItem("userEmail");
    setActivePlans({});
  }

  async function handleGoogleCredential(credential) {
    try {
      const res = await fetch(`${API}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Google auth failed");
      setToken(json.token);
      setUserEmail(json.email);
      localStorage.setItem("token", json.token);
      localStorage.setItem("userEmail", json.email);
      setActivePlans(loadStoredPlans(json.email));
      setShowLogin(false);
    } catch (err) {
      setError(err.message);
    }
  }

  function startGoogle() {
    if (!window.google?.accounts?.id) {
      setError("Google script not loaded");
      return;
    }
    if (!googleClientId) {
      setError("Google client id missing");
      return;
    }
    window.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: (response) => {
        handleGoogleCredential(response.credential);
      },
    });
    window.google.accounts.id.prompt();
  }

  function getDailyForecast(list) {
    const days = {};
    list.forEach((item) => {
      const date = new Date(item.dt * 1000).toLocaleDateString("en-US", {
        weekday: "short",
      });

      if (!days[date]) {
        days[date] = {
          temp_min: item.main.temp_min,
          temp_max: item.main.temp_max,
          weather: item.weather[0],
        };
      } else {
        days[date].temp_min = Math.min(days[date].temp_min, item.main.temp_min);
        days[date].temp_max = Math.max(days[date].temp_max, item.main.temp_max);
      }
    });
    return Object.entries(days).slice(0, 5);
  }

  async function loadFavorites() {
    if (!token) {
      setFavorites([]);
      return;
    }
    try {
      const res = await fetch(`${API}/api/favorites`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const favs = await res.json();
      if (!res.ok) throw new Error(favs.error || "Failed to load favorites");
      const cities = favs.map((f) => f.city).filter(Boolean);
      setFavorites(cities);

      if (cities.length > 0) {
        fetchWeather(cities[0]);
      }
    } catch (err) {
      setFavorites([]);
      setError(err.message);
    }
  }

  useEffect(() => {
    loadFavorites();
  }, [token]);

  useEffect(() => {
    const q = city.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API}/api/suggest?q=${encodeURIComponent(q)}`,
        );
        const data = await res.json();
        setSuggestions(data);
      } catch (e) {
        setSuggestions([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [city]);

  async function addFavorite() {
    if (!token) {
      setShowLogin(true);
      return;
    }
    const trimmed = city.trim();
    if (!trimmed) return;
    if (favorites.includes(trimmed)) return;

    const res = await fetch(`${API}/api/favorites`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ city: trimmed }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Failed to save favorite");
      return;
    }

    setFavorites([json.city || trimmed, ...favorites]);
  }

  function loadFavorite(name) {
    setCity(name);
    fetchWeather(name);
    setSidebarOpen(false);
  }

  function windDirLabel(deg) {
    if (deg === null || deg === undefined) return "--";
    const dirs = [
      "N",
      "NNE",
      "NE",
      "ENE",
      "E",
      "ESE",
      "SE",
      "SSE",
      "S",
      "SSW",
      "SW",
      "WSW",
      "W",
      "WNW",
      "NW",
      "NNW",
    ];
    const idx = Math.round(deg / 22.5) % 16;
    return dirs[idx];
  }

  function dewPointC(tempC, humidity) {
    if (tempC === null || tempC === undefined) return null;
    if (humidity === null || humidity === undefined) return null;
    return tempC - (100 - humidity) / 5;
  }

  function getWeatherIcon(weather) {
    const id = Number(weather?.id || 0);
    const isDay = String(weather?.icon || "").includes("d");
    const base = "/weather-icons/animated";

    if (id >= 200 && id <= 232) return `${base}/thunder.svg`;
    if (id >= 300 && id <= 321) return `${base}/rainy-1.svg`;
    if (id >= 500 && id <= 504) return `${base}/rainy-3.svg`;
    if (id === 511) return `${base}/snowy-6.svg`;
    if (id >= 520 && id <= 531) return `${base}/rainy-7.svg`;
    if (id >= 600 && id <= 622) return `${base}/snowy-5.svg`;
    if (id >= 701 && id <= 781) return `${base}/cloudy.svg`;

    if (id === 800) return `${base}/${isDay ? "day" : "night"}.svg`;
    if (id === 801) return `${base}/${isDay ? "cloudy-day-1" : "cloudy-night-1"}.svg`;
    if (id === 802) return `${base}/${isDay ? "cloudy-day-2" : "cloudy-night-2"}.svg`;
    if (id === 803 || id === 804) return `${base}/${isDay ? "cloudy-day-3" : "cloudy-night-3"}.svg`;

    return `${base}/cloudy.svg`;
  }

  function precipitationTodayMm() {
    if (!data?.forecast?.list) return 0;
    return data.forecast.list
      .slice(0, 8)
      .reduce((sum, item) => sum + (item.rain?.["3h"] || 0), 0);
  }

  function precipitationPopPercent() {
    if (!data?.forecast?.list) return 0;
    const pops = data.forecast.list.slice(0, 8).map((item) => item.pop || 0);
    const maxPop = Math.max(...pops, 0);
    return Math.round(maxPop * 100);
  }

  function mapZoomForCity() {
    const population = data?.forecast?.city?.population || 0;
    if (population > 8000000) return 7;
    if (population > 2500000) return 8;
    if (population > 700000) return 9;
    if (population > 150000) return 10;
    return 11;
  }

  function moonPhaseLabel(date = new Date()) {
    const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14);
    const lunarCycle = 29.53058867;
    const daysSince = (date.getTime() - knownNewMoon) / 86400000;
    const phase = ((daysSince % lunarCycle) + lunarCycle) % lunarCycle;

    if (phase < 1.84566) return "New Moon";
    if (phase < 5.53699) return "Waxing Crescent";
    if (phase < 9.22831) return "First Quarter";
    if (phase < 12.91963) return "Waxing Gibbous";
    if (phase < 16.61096) return "Full Moon";
    if (phase < 20.30228) return "Waning Gibbous";
    if (phase < 23.99361) return "Last Quarter";
    return "Waning Crescent";
  }

  function moonIlluminationPercent(date = new Date()) {
    const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14);
    const lunarCycle = 29.53058867;
    const daysSince = (date.getTime() - knownNewMoon) / 86400000;
    const phase = ((daysSince % lunarCycle) + lunarCycle) % lunarCycle;
    const illumination = (1 - Math.cos((2 * Math.PI * phase) / lunarCycle)) / 2;
    return Math.round(illumination * 100);
  }

  function formatTime(unixTs) {
    if (!unixTs) return "--";
    return new Date(unixTs * 1000).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function planIsActive(planId) {
    return Boolean(activePlans[planId] && activePlans[planId].expiresAt > Date.now());
  }

  function handleSidebarTouchStart(event) {
    const x = event.touches?.[0]?.clientX ?? 0;
    sidebarTouchStartX.current = x;
    sidebarTouchCurrentX.current = x;
  }

  function handleSidebarTouchMove(event) {
    sidebarTouchCurrentX.current = event.touches?.[0]?.clientX ?? sidebarTouchCurrentX.current;
  }

  function handleSidebarTouchEnd() {
    const deltaX = sidebarTouchCurrentX.current - sidebarTouchStartX.current;
    if (deltaX < -70) {
      setSidebarOpen(false);
    }
  }

  useEffect(() => {
    document.body.setAttribute("data-theme", themeInfo.theme);
    document.body.setAttribute("data-temp", themeInfo.tempBand);
  }, [themeInfo]);

  useEffect(() => {
    const canvas = bgCanvasRef.current;
    if (!canvas) return undefined;

    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    let animationFrameId;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const rainDrops = [];
    const snowflakes = [];
    const isRain = themeInfo.theme === "rain";
    const isSnow = themeInfo.theme === "snow";

    const rainCount = themeInfo.tempBand === "hot" ? 190 : 150;
    const snowCount = themeInfo.tempBand === "cold" ? 130 : 90;

    for (let i = 0; i < rainCount; i += 1) {
      rainDrops.push({
        x: Math.random() * width,
        y: Math.random() * height,
        length: Math.random() * 18 + 10,
        speed: Math.random() * 10 + 10,
      });
    }

    for (let i = 0; i < snowCount; i += 1) {
      snowflakes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 3 + 1,
        speed: Math.random() * 1.2 + 0.4,
        wind: Math.random() * 0.6 - 0.3,
      });
    }

    const drawRain = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = themeInfo.theme === "rain" ? "rgba(176, 205, 244, 0.52)" : "rgba(198, 218, 255, 0.45)";
      ctx.lineWidth = 1;
      ctx.lineCap = "round";

      rainDrops.forEach((drop) => {
        ctx.beginPath();
        ctx.moveTo(drop.x, drop.y);
        ctx.lineTo(drop.x - 2, drop.y + drop.length);
        ctx.stroke();

        drop.y += drop.speed;
        drop.x -= 0.6;
        if (drop.y > height || drop.x < -8) {
          drop.y = -drop.length;
          drop.x = Math.random() * width;
        }
      });
    };

    const drawSnow = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "rgba(255, 255, 255, 0.82)";

      snowflakes.forEach((flake) => {
        ctx.beginPath();
        ctx.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);
        ctx.fill();

        flake.y += flake.speed;
        flake.x += flake.wind;

        if (flake.y > height) {
          flake.y = -flake.radius;
          flake.x = Math.random() * width;
        }
        if (flake.x > width) flake.x = 0;
        if (flake.x < 0) flake.x = width;
      });
    };

    const animate = () => {
      if (isRain) drawRain();
      else if (isSnow) drawSnow();
      else ctx.clearRect(0, 0, width, height);
      animationFrameId = requestAnimationFrame(animate);
    };

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener("resize", handleResize);
    animate();

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationFrameId);
      ctx.clearRect(0, 0, width, height);
    };
  }, [themeInfo]);

  function activePlanSummary() {
    const now = Date.now();
    const summary = Object.values(activePlans)
      .filter((plan) => plan.expiresAt > now)
      .sort((a, b) => a.expiresAt - b.expiresAt)
      .map(
        (plan) =>
          `${plan.id} active until ${new Date(plan.expiresAt).toLocaleDateString()}`,
      );
    return summary.length ? summary.join(" | ") : "No active plan";
  }

  async function deleteFavorite(name) {
    if (!token) {
      setShowLogin(true);
      return;
    }
    await fetch(`${API}/api/favorites/${encodeURIComponent(name)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    setFavorites((prev) => {
      const next = prev.filter((c) => c !== name);
      if (city === name) {
        const nextCity = next[0] || "";
        setCity(nextCity);
        if (nextCity) {
          fetchWeather(nextCity);
        } else {
          setData(null);
        }
      }
      return next;
    });
  }

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);
    const g = document.createElement("script");
    g.src = "https://accounts.google.com/gsi/client";
    g.async = true;
    document.body.appendChild(g);
  }, []);

  async function handlePremium(planId, planPriceUSD) {
    if (planIsActive(planId)) {
      alert(
        `${planId} is already active until ${new Date(activePlans[planId].expiresAt).toLocaleDateString()}.`,
      );
      return;
    }
    if (!token) {
      setShowLogin(true);
      return;
    }
    if (!key) {
      alert("Razorpay key missing. Check VITE_RAZORPAY_KEY_ID in .env");
      return;
    }

    const basicDiscount =
      planId === "Pro" && planIsActive("Basic") ? basicPriceForTerm : 0;
    const chargeUSD = Math.max(planPriceUSD - basicDiscount, 1);

    // 1. Create order from backend (USD -> INR conversion happens there)
    const orderRes = await fetch(`${API}/api/razorpay/order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ amountUSD: chargeUSD }),
    });

    const { order } = await orderRes.json();

    // 2. Open Razorpay Checkout (charges INR)
    const options = {
      key,
      amount: order.amount,
      currency: order.currency,
      name: "Weather Premium",
      description: `Plan: ${planId} • $${chargeUSD} (${billing})`,
      order_id: order.id,
      handler: async function (response) {
        const verifyRes = await fetch(`${API}/api/razorpay/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(response),
        });
        const result = await verifyRes.json();
        if (result.success) {
          const days = billing === "annual" ? 365 : 30;
          const expiresAt = Date.now() + days * 24 * 60 * 60 * 1000;
          const nextPlans = {
            ...activePlans,
            [planId]: {
              id: planId,
              term: billing,
              expiresAt,
            },
          };
          if (planId === "Pro") {
            const basicExpiry = nextPlans.Basic?.expiresAt || 0;
            nextPlans.Basic = {
              id: "Basic",
              term: nextPlans.Basic?.term || billing,
              expiresAt: Math.max(basicExpiry, expiresAt),
            };
          }

          setActivePlans(nextPlans);
          persistPlans(nextPlans, userEmail);
          alert("Payment successful! Premium unlocked.");
        } else {
          alert("Payment verification failed.");
        }
      },
      theme: { color: "#4cc9f0" },
    };

    const rzp = new window.Razorpay(options);
    rzp.open();
  }

  return (
    <div className="app">
      <div className={`weather-anim weather-anim--${themeInfo.theme}`} aria-hidden="true">
        {themeInfo.isDay && (
          <div className="weather-sun">
            <span />
            <span />
          </div>
        )}
        {(themeInfo.theme === "cloud" || themeInfo.theme === "rain") && (
          <>
            <div className="weather-cloud weather-cloud-a" />
            <div className="weather-cloud weather-cloud-b" />
            <div className="weather-cloud weather-cloud-c" />
          </>
        )}
      </div>
      <canvas ref={bgCanvasRef} className="weather-canvas" aria-hidden="true" />
      <button
        className="sidebar-toggle"
        onClick={() => setSidebarOpen((prev) => !prev)}
        aria-label="Toggle menu"
      >
        {sidebarOpen ? "✕" : "☰"}
      </button>
      {sidebarOpen && (
        <button
          className="sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close menu"
        />
      )}
      <aside
        className={`sidebar ${sidebarOpen ? "open" : ""}`}
        onTouchStart={handleSidebarTouchStart}
        onTouchMove={handleSidebarTouchMove}
        onTouchEnd={handleSidebarTouchEnd}
      >
        <div className="search-box">
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Search city..."
          />
          <button onClick={() => fetchWeather()}>Search</button>

          {suggestions.length > 0 && (
            <div className="suggestions">
              {suggestions.map((s, i) => (
                <button
                  key={`${s.name}-${s.country}-${i}`}
                  className="suggestion-item"
                  onClick={() => {
                    setCity(s.name);
                    setSuggestions([]);
                    fetchWeather(s.name);
                    setSidebarOpen(false);
                  }}
                >
                  <span>
                    {s.name}
                    {s.state ? `, ${s.state}` : ""}, {s.country}
                  </span>
                  <span className="suggestion-temp">
                    {s.temp !== null ? `${s.temp}°C` : "--"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button className="save-btn" onClick={addFavorite}>
          Save City
        </button>
        <button className="location-btn" onClick={useLiveLocation}>
          Use My Location
        </button>

        <div className="favorites">
          {favorites.map((c) => {
            const isActive = c.toLowerCase() === city.toLowerCase();
            return (
              <div key={c} className={`fav-row ${isActive ? "active" : ""}`}>
                <button className="fav-item" onClick={() => loadFavorite(c)}>
                  {c}
                </button>
                <button
                  className="fav-del"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteFavorite(c);
                  }}
                  aria-label={`Delete ${c}`}
                  title="Delete"
                >
                  <img src={deleteIcon} alt="" aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>

        <div className="profile-wrapper">
          <div
            className="profile-icon"
            onClick={() => setShowProfileMenu((s) => !s)}
          >
            {userEmail ? userEmail[0]?.toUpperCase() : "U"}
          </div>
          {showProfileMenu && (
            <div className="profile-menu">
              <div className="profile-line">{userEmail || "Guest"}</div>
              <div className="profile-line small">{activePlanSummary()}</div>
              {token ? (
                <button className="profile-logout" onClick={logout}>
                  Logout
                </button>
              ) : (
                <button
                  className="profile-logout"
                  onClick={() => setShowLogin(true)}
                >
                  Login
                </button>
              )}
            </div>
          )}
        </div>
      </aside>

      <main className="main">
        <div className="header">
          <h1 className="title">Cloudline</h1>
          <p className="subtitle">
            {" "}
            Real-time forecasts, air insights, and personalized city dashboards
            in one elegant view.
          </p>
        </div>

        {error && <p className="error">{error}</p>}
        {!data && <p className="hint">Search a city to see weather.</p>}

        {data && (
          <div className="grid">
            <div className="glass hero hero-center">
              <h2 className="hero-city">{data.current.name}</h2>
              <p className="hero-temp">{Math.round(data.current.main.temp)}°</p>
              <p className="hero-desc">{data.current.weather[0].description}</p>
              <p className="hero-hl">
                H:
                {Math.round(
                  getDailyForecast(data.forecast.list)[0]?.[1]?.temp_max ??
                    data.current.main.temp,
                )}
                ° L:
                {Math.round(
                  getDailyForecast(data.forecast.list)[0]?.[1]?.temp_min ??
                    data.current.main.temp,
                )}
                °
              </p>
            </div>

            <div className="glass wide">
              <h3>Hourly Forecast</h3>
              <div className="hourly">
                {data.forecast.list.slice(0, 8).map((item) => (
                  <div className="hour-card" key={item.dt}>
                    <p className="hour">
                      {new Date(item.dt * 1000).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        hour12: true,
                      })}
                    </p>
                    <img
                      src={getWeatherIcon(item.weather[0])}
                      alt={item.weather[0].description || "weather icon"}
                    />
                    <p className="hour-temp">{Math.round(item.main.temp)}°C</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass tall">
              <h3>5‑Day Forecast</h3>
              <div className="daily">
                {getDailyForecast(data.forecast.list).map(([day, info]) => (
                  <div className="daily-row" key={day}>
                    <span>{day}</span>
                    <img
                      src={getWeatherIcon(info.weather)}
                      alt={info.weather?.description || "weather icon"}
                    />
                    <span>{Math.round(info.temp_min)}°</span>
                    <span>{Math.round(info.temp_max)}°</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass wind-card">
              <h3 className="wind-title">Wind</h3>
              <div className="wind-row">
                <span>Wind</span>
                <span>{Math.round(data.current.wind.speed * 3.6)} kph</span>
              </div>
              <div className="wind-row">
                <span>Gusts</span>
                <span>
                  {data.current.wind.gust
                    ? `${Math.round(data.current.wind.gust * 3.6)} kph`
                    : "--"}
                </span>
              </div>
              <div className="wind-row">
                <span>Direction</span>
                <span>
                  {data.current.wind.deg ?? "--"}°{" "}
                  {windDirLabel(data.current.wind.deg)}
                </span>
              </div>
            </div>

            <div className="glass humidity-card metric-card">
              <div className="humidity-title">Humidity</div>
              <div className="humidity-value">
                {data.current.main.humidity}%
              </div>
              <div className="humidity-note">
                The dew point is{" "}
                {Math.round(
                  dewPointC(data.current.main.temp, data.current.main.humidity),
                )}
                ° right now.
              </div>
            </div>

            <div className="glass feels-card metric-card">
              <div className="feels-title">Feels Like</div>
              <div className="feels-value">
                {Math.round(data.current.main.feels_like)}°
              </div>
              <div className="feels-note">
                It feels{" "}
                {data.current.main.feels_like >= data.current.main.temp
                  ? "warmer"
                  : "cooler"}{" "}
                than the actual temperature.
              </div>
            </div>

            <div className="glass visibility-card metric-card">
              <div className="visibility-title">Visibility</div>
              <div className="visibility-value">
                {Math.round(data.current.visibility / 1000)} km
              </div>
              <div className="visibility-note">
                Perfectly clear view right now.
              </div>
            </div>

            {(planIsActive("Basic") || planIsActive("Pro")) && (
              <>
                <div className="glass feature-card metric-card">
                  <div className="feature-title">Air Quality</div>
                  <div className="feature-big">
                    {data.current.airQuality ?? "N/A"}
                  </div>
                  <div className="feature-sub">
                    Data not available on free API
                  </div>
                  <div className="aq-bar">
                    <span className="aq-scale" />
                  </div>
                  <div className="feature-note">
                    Upgrade API to show live AQI; currently showing placeholder.
                  </div>
                </div>

                {planIsActive("Pro") && (
                  <div className="glass pro-precip">
                    <div className="pro-card-title">Precipitation</div>
                    <div className="pro-big">
                      {precipitationTodayMm().toFixed(1)} mm
                    </div>
                    <div className="pro-sub">Today</div>
                  <div className="pro-note">
                      {precipitationTodayMm().toFixed(1)} mm expected, rain
                      probability up to {precipitationPopPercent()}% in the next
                      24 hours.
                    </div>
                  </div>
                )}

                <div className="glass feature-card metric-card">
                  <div className="feature-title">UV Index</div>
                  <div className="feature-big">
                    {data.current.uvIndex ?? "N/A"}
                  </div>
                  <div className="feature-sub">Moderate</div>
                  <div className="aq-bar uv-bar">
                    <span className="aq-scale" />
                  </div>
                  <div className="feature-note">
                    Use sun protection during peak hours.
                  </div>
                </div>

                <div className="glass feature-card metric-card">
                  <div className="feature-title">Pressure</div>
                  <div className="feature-big">
                    {data.current.main.pressure ?? "--"} hPa
                  </div>
                  <div className="feature-note">
                    Sea-level pressure reading.
                  </div>
                </div>

                <div className="glass feature-card metric-card">
                  <div className="feature-title">Averages</div>
                  <div className="feature-big">+2°</div>
                  <div className="feature-sub">above average daily high</div>
                  <div className="feature-note">
                    Today H:{Math.round(data.current.main.temp_max)}° | Avg H:{" "}
                    {Math.round(data.current.main.temp_max - 2)}°
                  </div>
                </div>

                <div className="glass wide">
                  <h3>Temperature Chart (Next 24h)</h3>
                  <div className="chart-box">
                    <Line
                      data={{
                        labels: data.forecast.list.slice(0, 8).map((item) =>
                          new Date(item.dt * 1000).toLocaleTimeString("en-US", {
                            hour: "numeric",
                            hour12: true,
                          }),
                        ),
                        datasets: [
                          {
                            label: "Temp °C",
                            data: data.forecast.list
                              .slice(0, 8)
                              .map((item) => item.main.temp),
                            borderColor: "#4cc9f0",
                            backgroundColor: "rgba(76, 201, 240, 0.2)",
                          },
                        ],
                      }}
                      options={{
                        plugins: { legend: { display: false } },
                        scales: {
                          x: { ticks: { color: "#cbd5e1" } },
                          y: { ticks: { color: "#cbd5e1" } },
                        },
                      }}
                    />
                  </div>
                </div>

                {planIsActive("Pro") && (
                  <>
                    <div className="glass pro-precip-map wide">
                      <div className="pro-card-title">Precipitation Map</div>
                      <PrecipMap
                        lat={data.current.coord.lat}
                        lon={data.current.coord.lon}
                        city={data.current.name}
                        apiBase={API}
                        zoom={mapZoomForCity()}
                      />
                    </div>

                    <div className="glass pro-moon">
                      <div className="pro-card-title">{moonPhaseLabel()}</div>
                      <div className="moon-row">
                        <div className="moon-stats">
                          <div className="moon-item">
                            <span>Illumination</span>
                            <strong>{moonIlluminationPercent()}%</strong>
                          </div>
                          <div className="moon-item">
                            <span>Moonrise (approx)</span>
                            <strong>{formatTime(data.current.sys.sunrise + 12 * 3600)}</strong>
                          </div>
                          <div className="moon-item">
                            <span>Moonset (approx)</span>
                            <strong>{formatTime(data.current.sys.sunset + 8 * 3600)}</strong>
                          </div>
                        </div>
                        <div className="moon-visual" />
                      </div>
                    </div>
                  </>
                )}
              </>
            )}

            {/* Pricing Section */}
            <div className="glass pricing">
              <div className="pricing-header">
                <h3>Premium Section</h3>
                <div className="toggle">
                  <button
                    className={billing === "monthly" ? "active" : ""}
                    onClick={() => setBilling("monthly")}
                  >
                    Monthly
                  </button>
                  <button
                    className={billing === "annual" ? "active" : ""}
                    onClick={() => setBilling("annual")}
                  >
                    Annual
                  </button>
                </div>
              </div>
              {!(planIsActive("Basic") || planIsActive("Pro")) && (
                <div className="cta-upgrade">
                  Unlock AQI, UV, pressure, and averages — upgrade to Premium to
                  see full insights.
                </div>
              )}

              <div className="pricing-grid">
                {plans.map((p) => (
                  <div key={p.id} className="price-card">
                    <h4>{p.name}</h4>
                    <p className="price">${getPrice(p)}</p>
                    <ul>
                      {p.features.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                    <button
                      className={`premium-btn ${planIsActive(p.id) ? "active" : ""}`}
                      onClick={() => {
                        if (!token) {
                          setShowLogin(true);
                          return;
                        }
                        handlePremium(p.id, getPrice(p));
                      }}
                    >
                      {planIsActive(p.id)
                        ? "Activated"
                        : p.id === "Pro" && planIsActive("Basic")
                          ? `Upgrade to Pro (-$${basicPriceForTerm})`
                          : `Choose ${p.name}`}
                    </button>
                  </div>
                ))}
              </div>
              <div className="pricing-links">
                <a href="/privacy.html" target="_blank" rel="noreferrer">
                  Privacy Policy
                </a>
              </div>
            </div>
          </div>
        )}
      </main>

      {showLogin && (
        <div className="modal-backdrop" onClick={() => setShowLogin(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Login to continue</h3>
            <input
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              placeholder="Email"
              type="email"
            />
            <input
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              placeholder="Password"
              type="password"
            />
            <div className="auth-actions">
              <button
                onClick={() => {
                  handleAuth("login");
                  setShowLogin(false);
                }}
              >
                Login
              </button>
              <button
                onClick={() => {
                  handleAuth("signup");
                  setShowLogin(false);
                }}
              >
                Signup
              </button>
            </div>
            <button className="google-btn" onClick={startGoogle}>
              Continue with Google
            </button>
            {userEmail && (
              <div className="auth-status">
                Logged in as {userEmail} •{" "}
                <button onClick={logout}>Logout</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
