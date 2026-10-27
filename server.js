
const express = require("express");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;
const dataDir = process.env.DATA_DIR || path.join(__dirname, "data");

fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "attendance.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    roll_no TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    department TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    attendance_date TEXT NOT NULL,
    period INTEGER NOT NULL CHECK (period BETWEEN 1 AND 7),
    status TEXT NOT NULL CHECK (status IN ('Present', 'Absent')),
    UNIQUE (student_id, attendance_date, period),
    FOREIGN KEY (student_id) REFERENCES students(id)
  );
`);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/students", (req, res) => {
  res.json(
    db.prepare("SELECT * FROM students ORDER BY roll_no").all()
  );
});

app.post("/api/students", (req, res) => {
  const { roll_no, name, department } = req.body;

  if (
    typeof roll_no !== "string" || !roll_no.trim() ||
    typeof name !== "string" || !name.trim() ||
    typeof department !== "string" || !department.trim()
  ) {
    return res.status(400).json({
      error: "All student fields are required."
    });
  }

  try {
    const student = {
      roll_no: roll_no.trim(),
      name: name.trim(),
      department: department.trim()
    };

    const result = db.prepare(`
      INSERT INTO students (roll_no, name, department)
      VALUES (@roll_no, @name, @department)
    `).run(student);

    res.status(201).json({
      id: Number(result.lastInsertRowid),
      ...student
    });
  } catch (error) {
    if (String(error.code).includes("SQLITE_CONSTRAINT")) {
      return res.status(409).json({
        error: "Roll number already exists."
      });
    }

    res.status(500).json({ error: "Database error." });
  }
});

app.post("/api/attendance", (req, res) => {
  const { date, records } = req.body;

  if (
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Array.isArray(records)
  ) {
    return res.status(400).json({
      error: "Provide a valid date and attendance records."
    });
  }

  const studentExists = db.prepare(
    "SELECT id FROM students WHERE id = ?"
  );

  const saveRecord = db.prepare(`
    INSERT INTO attendance
      (student_id, attendance_date, period, status)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(student_id, attendance_date, period)
    DO UPDATE SET status = excluded.status
  `);

  try {
    const saveAll = db.transaction(items => {
      for (const record of items) {
        const studentId = Number(record.student_id);
        const period = Number(record.period);

        if (
          !studentExists.get(studentId) ||
          !Number.isInteger(period) ||
          period < 1 || period > 7 ||
          !["Present", "Absent"].includes(record.status)
        ) {
          throw new Error("Invalid student, period, or status.");
        }

        saveRecord.run(studentId, date, period, record.status);
      }
    });

    saveAll(records);
    res.json({ message: "Attendance saved successfully." });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/attendance", (req, res) => {
  const date = String(req.query.date || "");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({
      error: "Date must be in YYYY-MM-DD format."
    });
  }

  const records = db.prepare(`
    SELECT student_id, period, status
    FROM attendance
    WHERE attendance_date = ?
  `).all(date);

  res.json(records);
});

app.get("/api/monthly", (req, res) => {
  const month = String(req.query.month || "");

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({
      error: "Month must be in YYYY-MM format."
    });
  }

  const students = db.prepare(
    "SELECT * FROM students ORDER BY roll_no"
  ).all();

  const totals = db.prepare(`
    SELECT student_id,
      SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) AS present,
      SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) AS absent
    FROM attendance
    WHERE substr(attendance_date, 1, 7) = ?
    GROUP BY student_id
  `).all(month);

  const totalsByStudent = new Map(
    totals.map(item => [item.student_id, item])
  );

  res.json(students.map(student => {
    const totals = totalsByStudent.get(student.id) || {};
    const present = Number(totals.present || 0);
    const absent = Number(totals.absent || 0);
    const total = present + absent;

    return {
      ...student,
      present,
      absent,
      total,
      percentage: total
        ? Number((present / total * 100).toFixed(2))
        : 0
    };
  }));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Attendance app running at http://localhost:${PORT}`);
});
