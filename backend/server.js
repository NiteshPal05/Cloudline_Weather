import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import mongoose from "mongoose";
import Favorite from "./models/Favorite.js";
import User from "./models/User.js";
import Razorpay from "razorpay";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";





dotenv.config();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const app = express();
const PORT = 5001;

app.use(cors());
app.use(express.json());


async function cleanupLegacyFavoriteIndexes() {
  try {
    const indexes = await Favorite.collection.indexes();
    const legacy = indexes.find((idx) => idx.name === "city_1" && idx.unique);
    if (legacy) {
      await Favorite.collection.dropIndex("city_1");
      console.log("Dropped legacy favorites index city_1");
    }
  } catch (err) {
    console.error("Favorite index cleanup error:", err.message);
  }
}

function signToken(user) {
  return jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Please login first" });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Please login first" });
  }
}

// ===== ExchangeRate-API cache =====
let rateCache = {
  usdToInr: null,
  expiresAt: 0,
};

async function getUsdToInrRate() {
  const now = Date.now();
  if (rateCache.usdToInr && now < rateCache.expiresAt) {
    return rateCache.usdToInr;
  }

  const apiKey = process.env.EXCHANGE_RATE_API_KEY;
  if (!apiKey) {
    throw new Error("EXCHANGE_RATE_API_KEY missing in .env");
  }

  const url = `https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`;
  const res = await axios.get(url);

  const usdToInr = res.data?.conversion_rates?.INR;
  if (!usdToInr) {
    throw new Error("Failed to fetch USD->INR rate");
  }

  rateCache = {
    usdToInr,
    expiresAt: now + 60 * 60 * 1000, // 1 hour cache
  };

  return usdToInr;
}

// ===== Weather API (free endpoints) =====
app.get("/api/weather", async (req, res) => {
  try {
    const city = req.query.city?.trim();
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);

    let currentUrl = "";
    let forecastUrl = "";

    if (city) {
      currentUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=metric&appid=${process.env.OPENWEATHER_API_KEY}`;
      forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&units=metric&appid=${process.env.OPENWEATHER_API_KEY}`;
    } else if (Number.isFinite(lat) && Number.isFinite(lon)) {
      currentUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${process.env.OPENWEATHER_API_KEY}`;
      forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${process.env.OPENWEATHER_API_KEY}`;
    } else {
      return res.status(400).json({ error: "City or coordinates are required" });
    }

    const [currentRes, forecastRes] = await Promise.all([
      axios.get(currentUrl),
      axios.get(forecastUrl),
    ]);

    res.json({
      current: currentRes.data,
      forecast: forecastRes.data,
    });
  } catch (error) {
    console.error("API error:", error.response?.data || error.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});
const suggestCache = new Map();
const SUGGEST_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedSuggestion(key) {
  const cached = suggestCache.get(key);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    suggestCache.delete(key);
    return null;
  }
  return cached.data;
}

function setCachedSuggestion(key, data) {
  suggestCache.set(key, {
    data,
    expiresAt: Date.now() + SUGGEST_TTL,
  });
}

app.get("/api/suggest", async (req, res) => {
  try {
    const q = req.query.q?.trim();
    if (!q) return res.json([]);

    const cacheKey = q.toLowerCase();
    const cached = getCachedSuggestion(cacheKey);
    if (cached) return res.json(cached);

    const geoUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(
      q
    )}&limit=5&appid=${process.env.OPENWEATHER_API_KEY}`;

    const geoRes = await axios.get(geoUrl);

    const enriched = await Promise.all(
      geoRes.data.map(async (c) => {
        try {
          const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${c.lat}&lon=${c.lon}&units=metric&appid=${process.env.OPENWEATHER_API_KEY}`;
          const w = await axios.get(weatherUrl);
          return {
            name: c.name,
            state: c.state || "",
            country: c.country || "",
            temp: Math.round(w.data.main.temp),
          };
        } catch {
          return {
            name: c.name,
            state: c.state || "",
            country: c.country || "",
            temp: null,
          };
        }
      })
    );

    setCachedSuggestion(cacheKey, enriched);
    res.json(enriched);
  } catch (err) {
    console.error("Suggest error:", err.response?.data || err.message);
    res.status(500).json({ error: "Suggestion failed" });
  }
});

function latLonToTile(lat, lon, zoom) {
  const latRad = (lat * Math.PI) / 180;
  const n = 2 ** zoom;
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return { x, y };
}

function fallbackTileSvg(lat, lon, zoom) {
  const safeLat = Number.isFinite(lat) ? lat.toFixed(2) : "--";
  const safeLon = Number.isFinite(lon) ? lon.toFixed(2) : "--";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#e8eef8"/>
      <stop offset="100%" stop-color="#cfd9e7"/>
    </linearGradient>
    <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
      <path d="M 48 0 L 0 0 0 48" fill="none" stroke="rgba(37,69,122,0.18)" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <rect width="512" height="512" fill="url(#grid)"/>
  <circle cx="256" cy="256" r="42" fill="#1c63b8" stroke="rgba(255,255,255,0.85)" stroke-width="4"/>
  <text x="256" y="266" text-anchor="middle" font-size="18" fill="#ffffff" font-family="Segoe UI, Arial">Rain</text>
  <text x="256" y="430" text-anchor="middle" font-size="18" fill="#143762" font-family="Segoe UI, Arial">Precipitation tile unavailable</text>
  <text x="256" y="456" text-anchor="middle" font-size="14" fill="#24456f" font-family="Segoe UI, Arial">lat ${safeLat}, lon ${safeLon}, z ${zoom}</text>
</svg>`;
}

async function fetchPrecipTileBuffer(z, x, y) {
  const tileUrl = `https://tile.openweathermap.org/map/precipitation_new/${z}/${x}/${y}.png?appid=${process.env.OPENWEATHER_API_KEY}`;
  const tileRes = await axios.get(tileUrl, { responseType: "arraybuffer" });
  return tileRes.data;
}

app.get("/api/precip-tile/:z/:x/:y.png", async (req, res) => {
  try {
    const z = Number(req.params.z);
    const x = Number(req.params.x);
    const y = Number(req.params.y);

    if (![z, x, y].every(Number.isFinite)) {
      return res.status(400).json({ error: "z, x and y are required" });
    }

    const buffer = await fetchPrecipTileBuffer(z, x, y);
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=600");
    return res.send(buffer);
  } catch (err) {
    console.error("Precip tile xyz error:", err.response?.data || err.message);
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "public, max-age=120");
    return res.status(200).send(fallbackTileSvg(null, null, "xyz"));
  }
});

app.get("/api/precip-tile", async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const zoom = Number(req.query.z || 6);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return res.status(400).json({ error: "lat and lon are required" });
    }

    const { x, y } = latLonToTile(lat, lon, zoom);
    const buffer = await fetchPrecipTileBuffer(zoom, x, y);

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=600");
    return res.send(buffer);
  } catch (err) {
    console.error("Precip tile error:", err.response?.data || err.message);
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const zoom = Number(req.query.z || 6);
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "public, max-age=120");
    return res.status(200).send(fallbackTileSvg(lat, lon, zoom));
  }
});

// ===== Auth =====
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });
    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ error: "Email already registered" });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ email, passwordHash });
    const token = signToken(user);
    res.json({ token, email: user.email });
  } catch (err) {
    res.status(500).json({ error: "Signup failed" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });
    const token = signToken(user);
    res.json({ token, email: user.email });
  } catch (err) {
    res.status(500).json({ error: "Login failed" });
  }
});

app.post("/api/auth/google", async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: "Missing credential" });

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const email = payload.email;
    if (!email) return res.status(400).json({ error: "Email not found in token" });

    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({ email, passwordHash: "__google__" });
    }
    const token = signToken(user);
    res.json({ token, email: user.email });
  } catch (err) {
    res.status(500).json({ error: "Google login failed" });
  }
});

// ===== Razorpay: create order (USD->INR) =====
app.post("/api/razorpay/order", authMiddleware, async (req, res) => {
  try {
    const { amountUSD } = req.body;
    if (!amountUSD) {
      return res.status(400).json({ error: "amountUSD required" });
    }

    const rate = await getUsdToInrRate();
    const amountINR = Math.round(amountUSD * rate);

    const options = {
      amount: amountINR * 100, // paise
      currency: "INR",
      receipt: "receipt_" + Date.now(),
    };

    const order = await razorpay.orders.create(options);
    res.json({ order, amountINR, rate });
  } catch (err) {
    console.error("Rate/Order error:", err.response?.data || err.message);
    res.status(500).json({ error: "Order creation failed" });
  }
});

// ===== Razorpay: verify payment =====
app.post("/api/razorpay/verify", async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature === razorpay_signature) {
      return res.json({ success: true });
    } else {
      return res.status(400).json({ success: false });
    }
  } catch (err) {
    res.status(500).json({ error: "Verification failed" });
  }
});

// ===== Favorites =====
app.post("/api/favorites", authMiddleware, async (req, res) => {
  try {
    const rawCity = req.body.city;
    const city = typeof rawCity === "string" ? rawCity.trim() : "";
    if (!city) return res.status(400).json({ error: "City is required" });

    const fav = await Favorite.create({
      city,
      cityNormalized: city.toLowerCase(),
      user: req.user.id,
    });
    res.json(fav);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: "City already saved" });
    }
    res.status(500).json({ error: "Failed to save favorite" });
  }
});

app.get("/api/favorites", authMiddleware, async (req, res) => {
  try {
    const favs = await Favorite.find({ user: req.user.id })
      .sort({ _id: -1 })
      .select("city _id");
    res.json(favs);
  } catch (err) {
    res.status(500).json({ error: "Failed to load favorites" });
  }
});

app.delete("/api/favorites/:city", authMiddleware, async (req, res) => {
  try {
    const city = decodeURIComponent(req.params.city || "").trim().toLowerCase();
    const result = await Favorite.deleteOne({
      user: req.user.id,
      cityNormalized: city,
    });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "City not found" });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete favorite" });
  }
});

// ===== Connect DB then start server =====
mongoose
  .connect(process.env.MONGODB_URI)
  .then(async () => {
    await cleanupLegacyFavoriteIndexes();
    console.log("MongoDB connected");
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => console.error("MongoDB error:", err));
