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

// Configure upload directory - use absolute path for production
const uploadDir = path.resolve(__dirname, process.env.UPLOAD_DIR || "uploads");

// Ensure upload directory exists with proper permissions
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  // Set directory permissions (read/write/execute for owner, read/execute for group/others)
  fs.chmodSync(uploadDir, 0o755);
}

// Serve uploaded files - important for production
app.use('/uploads', express.static(uploadDir, {
  setHeaders: (res, filePath) => {
    // Set proper cache headers for files
    res.setHeader('Cache-Control', 'public, max-age=86400');
  }
}));

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

// Setup multer with better error handling
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF, JPEG, and PNG files are allowed.'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { 
    fileSize: 5 * 1024 * 1024, // 5 MB
    files: 4 // Maximum of 4 files
  }
});

// Error handling middleware for file uploads
const handleUploadErrors = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    // A Multer error occurred when uploading
    return res.status(400).json({
      success: false,
      error: err.code === 'LIMIT_FILE_SIZE' 
        ? 'File size too large. Maximum 5MB allowed.' 
        : 'File upload error'
    });
  } else if (err) {
    // An unknown error occurred
    return res.status(400).json({ 
      success: false, 
      error: err.message || 'File upload failed' 
    });
  }
  next();
};

// Save employee route with improved error handling
app.post("/save-employee", 
  upload.fields([
    { name: "emp_experience_doc", maxCount: 1 },
    { name: "emp_ssc_doc", maxCount: 1 },
    { name: "emp_inter_doc", maxCount: 1 },
    { name: "emp_grad_doc", maxCount: 1 }
  ]),
  handleUploadErrors,
  async (req, res) => {
    try {
      const {
        emp_name, emp_email, emp_dob, emp_mobile, emp_address, emp_city,
        emp_state, emp_zipcode, emp_bank, emp_account, emp_ifsc, emp_job_role,
        emp_department, emp_experience_status, emp_company_name, emp_years_of_experience,
        emp_joining_date, emp_terms_accepted
      } = req.body;

      // Validate required fields
      if (!emp_name || !emp_email || !emp_job_role || !emp_department) {
        return res.status(400).json({
          success: false,
          error: "Missing required fields (name, email, job role, or department)"
        });
      }

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
        employeeId: result.rows[0].id,
        files: {
          experience: req.files["emp_experience_doc"]?.[0]?.filename,
          ssc: req.files["emp_ssc_doc"]?.[0]?.filename,
          inter: req.files["emp_inter_doc"]?.[0]?.filename,
          grad: req.files["emp_grad_doc"]?.[0]?.filename
        }
      });

    } catch (err) {
      console.error("Error saving employee:", err);
      
      // Delete any uploaded files if there was an error
      if (req.files) {
        Object.values(req.files).forEach(files => {
          files.forEach(file => {
            try {
              fs.unlinkSync(path.join(uploadDir, file.filename));
            } catch (unlinkErr) {
              console.error("Error deleting uploaded file:", unlinkErr);
            }
          });
        });
      }

      // Handle duplicate email error
      if (err.code === '23505') {
        return res.status(409).json({ 
          success: false, 
          error: "Email already exists" 
        });
      }

      res.status(500).json({ 
        success: false, 
        error: "Internal server error" 
      });
    }
  }
);

// List employees with file URLs
app.get("/employees", async (req, res) => {
 try {
    const result = await client.query(`
      SELECT id, emp_name, emp_email, emp_dob, emp_mobile, emp_address, emp_city,
             emp_state, emp_zipcode, emp_bank, emp_account, emp_ifsc, emp_job_role,
             emp_department, emp_experience_status, emp_company_name, emp_years_of_experience,
             emp_joining_date, emp_experience_doc, emp_ssc_doc, emp_inter_doc, emp_grad_doc,
             emp_terms_accepted, created_at
      FROM emp_onboarding 
      ORDER BY created_at DESC
    `);
    
    // Add full URLs to file paths
    const employees = result.rows.map(emp => {
      const baseUrl = `${req.protocol}://${req.get('host')}/uploads/`;
      const withUrls = { ...emp };
      
      // Add full URLs for each document
      ['emp_experience_doc', 'emp_ssc_doc', 'emp_inter_doc', 'emp_grad_doc'].forEach(field => {
        if (emp[field]) {
          withUrls[`${field}_url`] = baseUrl + emp[field];
        }
      });
      return withUrls;
    });

    res.json(employees);
  } catch (error) {
    console.error("Error fetching data:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Get single employee by ID
app.get("/employees/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await client.query("SELECT * FROM emp_onboarding WHERE id = $1", [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Employee not found" });
    }
    
    const employee = result.rows[0];
    const baseUrl = `${req.protocol}://${req.get('host')}/uploads/`;
    
    // Add full URLs for each document
    ['emp_experience_doc', 'emp_ssc_doc', 'emp_inter_doc', 'emp_grad_doc'].forEach(field => {
      if (employee[field]) {
        employee[`${field}_url`] = baseUrl + employee[field];
      }
    });
    
    res.json(employee);
  } catch (error) {
    console.error("Error fetching employee:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Health check with DB and filesystem check
app.get("/health", async (req, res) => {
  try {
    // Check database connection
    await client.query("SELECT 1");
    
    // Check filesystem access
    const testFilePath = path.join(uploadDir, 'healthcheck.tmp');
    fs.writeFileSync(testFilePath, 'healthcheck');
    fs.readFileSync(testFilePath);
    fs.unlinkSync(testFilePath);
    
    res.status(200).json({ 
      status: "OK", 
      time: new Date().toISOString(),
      database: "connected",
      filesystem: "accessible"
    });
  } catch (err) {
    console.error("Health check failed:", err);
    res.status(500).json({ 
      status: "ERROR", 
      error: err.message,
      database: err.message.includes('database') ? 'disconnected' : 'connected',
      filesystem: err.message.includes('filesystem') ? 'inaccessible' : 'accessible'
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Upload directory: ${uploadDir}`);
});
