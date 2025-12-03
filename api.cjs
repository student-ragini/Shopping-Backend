// api.cjs
const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const app = express();

// ----------------- MIDDLEWARE -----------------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// CORS: allow frontend origins (loose by default)
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
  })
);

// ---- Global preflight handler (safe, does not register a 'path' route) ----
app.use((req, res, next) => {
  // set CORS headers for all requests (prevents missing headers)
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    req.headers["access-control-request-headers"] || "Content-Type"
  );
  // If browser preflight (OPTIONS) -> respond 204
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  next();
});

// static files for backend (optional)
app.use(express.static(path.join(__dirname, "public")));

// ----------------- MONGO CONFIG -----------------
const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://ragini_user:Ragini%402728@cluster0.nq1itcw.mongodb.net/ishopdb?retryWrites=true&w=majority&appName=Cluster0";

const DB_NAME = process.env.DB_NAME || "ishopdb";

const client = new MongoClient(MONGO_URI, {});

// helper to get db
async function getDb() {
  if (!client.topology || !client.topology.isConnected?.()) {
    await client.connect();
    console.log("Mongo client connected");
  }
  return client.db(DB_NAME);
}

/* ---------------- ROUTES (only important ones shown) ---------------- */

/* PROFILE GET */
app.get("/customers/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    console.log("GET /customers/:userId called for:", userId);
    const db = await getDb();

    const customer = await db.collection("tblcustomers").findOne(
      { UserId: userId },
      { projection: { Password: 0 } }
    );

    if (!customer) {
      let fallback = null;
      if (/^[0-9a-fA-F]{24}$/.test(userId)) {
        fallback = await db
          .collection("tblcustomers")
          .findOne({ _id: new ObjectId(userId) }, { projection: { Password: 0 } });
      }
      if (!customer && !fallback) {
        console.log("GET /customers -> user not found for", userId);
        return res.status(404).json({ success: false, message: "User not found" });
      }
      return res.json({ success: true, customer: fallback });
    }

    return res.json({ success: true, customer });
  } catch (err) {
    console.error("GET /customers/:userId error:", err);
    res.status(500).json({ success: false, message: "Error fetching profile" });
  }
});

/* PROFILE UPDATE (PUT) */
app.put("/customers/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    console.log("PUT /customers/:userId called for:", userId);
    console.log("Request body:", req.body);

    const {
      FirstName,
      LastName,
      DateOfBirth,
      Email,
      Gender,
      Address,
      PostalCode,
      State,
      Country,
      Mobile,
      Password,
    } = req.body;

    const db = await getDb();

    // Build update document safely
    const updateDoc = {
      $set: {
        FirstName: FirstName || "",
        LastName: LastName || "",
        DateOfBirth: DateOfBirth ? new Date(DateOfBirth) : null,
        Email: Email || "",
        Gender: Gender || "",
        Address: Address || "",
        PostalCode: PostalCode || "",
        State: State || "",
        Country: Country || "",
        Mobile: Mobile || "",
      },
    };

    if (Password && String(Password).trim() !== "") {
      if (String(Password).trim().length < 6) {
        return res.status(400).json({
          success: false,
          message: "New password must be at least 6 characters.",
        });
      }
      const hashed = await bcrypt.hash(String(Password).trim(), 10);
      updateDoc.$set.Password = hashed;
    }

    // Try multiple filters to match user: UserId / userId / _id
    const filters = [{ UserId: userId }, { userId: userId }];
    if (/^[0-9a-fA-F]{24}$/.test(userId)) {
      try {
        filters.push({ _id: new ObjectId(userId) });
      } catch (e) {
        // ignore
      }
    }

    console.log("Attempting update with filters:", filters);

    const result = await db.collection("tblcustomers").findOneAndUpdate(
      { $or: filters },
      updateDoc,
      { returnDocument: "after", projection: { Password: 0 } }
    );

    if (!result.value) {
      console.log("No document matched for update. Filters tried:", filters);
      return res.status(404).json({ success: false, message: "User not found" });
    }

    console.log("Update succeeded, new doc:", result.value);

    return res.json({
      success: true,
      message: "Profile updated successfully",
      customer: result.value,
    });
  } catch (err) {
    console.error("PUT /customers/:userId error:", err);
    return res.status(500).json({ success: false, message: "Profile update failed" });
  }
});

/* fallback endpoints and other routes (kept minimal for brevity) */
app.use((req, res) => {
  const isApi =
    req.path.startsWith("/products") ||
    req.path.startsWith("/get") ||
    req.path.startsWith("/categories") ||
    req.path.startsWith("/admin") ||
    req.path.startsWith("/customer") ||
    req.path.startsWith("/createorder") ||
    req.path.startsWith("/addtocart") ||
    req.path.startsWith("/login") ||
    req.path.startsWith("/orders") ||
    req.path.startsWith("/customers");

  if (isApi) {
    return res.status(404).json({ error: "API endpoint not found" });
  }

  return res.status(200).json({
    message: "Shopping Backend API is running. Frontend is deployed separately.",
    path: req.path,
  });
});

// ----------------- START SERVER -----------------
const PORT = process.env.PORT || 4400;
app.listen(PORT, () =>
  console.log(`API Starter http://127.0.0.1:${PORT}`)
);