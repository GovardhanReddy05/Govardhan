require('dotenv').config();
const express = require("express");
const multer = require("multer");
const path = require("path");
const { Client } = require("pg");
const cors = require("cors");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// Allow frontend access
app.use(cors({
  origin: [
    process.env.FRONTEND_URL,
    "http://localhost:3001",
    "http://127.0.0.1:5500",
    "http://localhost:5500"
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));

// Fix favicon error
app.get('/favicon.ico', (req, res) => res.status(204).end());

// PostgreSQL setup
const client = new Client({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'new_employee_db',
  password: process.env.DB_PASSWORD || 'Reddy@988',
  port: process.env.DB_PORT || 5432,
});

// Connect and create table
const connectToDatabase = async () => {
  try {
    await client.connect();
    console.log("Connected to PostgreSQL database");

    await client.query(`
      CREATE TABLE IF NOT EXISTS emp_onboarding (
        id SERIAL PRIMARY KEY,
        emp_name VARCHAR(255) NOT NULL,
        emp_email VARCHAR(255) UNIQUE NOT NULL,
        emp_dob DATE,
        emp_mobile VARCHAR(20),
        emp_address TEXT,
        emp_city VARCHAR(100),
        emp_state VARCHAR(100),
        emp_zipcode VARCHAR(20),
        emp_bank VARCHAR(255),
        emp_account VARCHAR(50),
        emp_ifsc VARCHAR(20),
        emp_job_role VARCHAR(255),
        emp_department VARCHAR(255),
        emp_experience_status BOOLEAN,
        emp_company_name VARCHAR(255),
        emp_years_of_experience INTEGER,
        emp_joining_date DATE,
        emp_experience_doc VARCHAR(255),
        emp_ssc_doc VARCHAR(255),
        emp_inter_doc VARCHAR(255),
        emp_grad_doc VARCHAR(255),
        emp_terms_accepted BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log("Verified emp_onboarding table exists");
  } catch (err) {
    console.error("Database connection error:", err.message);
    setTimeout(connectToDatabase, 5000);
  }
};
connectToDatabase();

// Setup multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueName + path.extname(file.originalname));
  }
});
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type.'), false);
  }
};
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5 MB
});

// Save employee route
app.post("/save-employee", upload.fields([
  { name: "emp_experience_doc", maxCount: 1 },
  { name: "emp_ssc_doc", maxCount: 1 },
  { name: "emp_inter_doc", maxCount: 1 },
  { name: "emp_grad_doc", maxCount: 1 }
]), async (req, res) => {
  try {
    const {
      emp_name, emp_email, emp_dob, emp_mobile, emp_address, emp_city,
      emp_state, emp_zipcode, emp_bank, emp_account, emp_ifsc, emp_job_role,
      emp_department, emp_experience_status, emp_company_name, emp_years_of_experience,
      emp_joining_date, emp_terms_accepted
    } = req.body;

    const values = [
      emp_name,
      emp_email,
      emp_dob,
      emp_mobile,
      emp_address,
      emp_city,
      emp_state,
      emp_zipcode,
      emp_bank,
      emp_account,
      emp_ifsc,
      emp_job_role,
      emp_department,
      emp_experience_status === 'true',
      emp_company_name || null,
      emp_years_of_experience ? parseInt(emp_years_of_experience) : null,
      emp_joining_date,
      req.files["emp_experience_doc"]?.[0]?.filename || null,
      req.files["emp_ssc_doc"]?.[0]?.filename || null,
      req.files["emp_inter_doc"]?.[0]?.filename || null,
      req.files["emp_grad_doc"]?.[0]?.filename || null,
      emp_terms_accepted === 'true'
    ];

    const query = `
      INSERT INTO emp_onboarding (
        emp_name, emp_email, emp_dob, emp_mobile, emp_address, emp_city,
        emp_state, emp_zipcode, emp_bank, emp_account, emp_ifsc, emp_job_role,
        emp_department, emp_experience_status, emp_company_name, emp_years_of_experience,
        emp_joining_date, emp_experience_doc, emp_ssc_doc, emp_inter_doc, emp_grad_doc,
        emp_terms_accepted
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
      RETURNING id
    `;

    const result = await client.query(query, values);

    res.status(201).json({
      success: true,
      message: "Employee added successfully",
      employeeId: result.rows[0].id
    });

  } catch (err) {
    console.error("Error saving employee:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// List employees
app.get("/employees", async (req, res) => {
  try {
    const result = await client.query("SELECT * FROM emp_onboarding");
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching data:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", time: new Date().toISOString() });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
