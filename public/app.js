
const $ = id => document.getElementById(id);

const today = new Date();
const localDate = [
  today.getFullYear(),
  String(today.getMonth() + 1).padStart(2, "0"),
  String(today.getDate()).padStart(2, "0")
].join("-");

$("attendance-date").value = localDate;
$("report-month").value = localDate.slice(0, 7);

let students = [];
let reportRows = [];

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}

function message(id, text, error = false) {
  $(id).textContent = text;
  $(id).classList.toggle("error", error);
}

async function loadStudents() {
  students = await api("/api/students");
  $("student-list").replaceChildren();

  for (const student of students) {
    const tr = document.createElement("tr");

    for (const value of [
      student.roll_no, student.name, student.department
    ]) {
      const td = document.createElement("td");
      td.textContent = value;
      tr.appendChild(td);
    }

    $("student-list").appendChild(tr);
  }

  renderAttendance();
}

$("student-form").addEventListener("submit", async event => {
  event.preventDefault();

  try {
    await api("/api/students", {
      method: "POST",
      body: JSON.stringify({
        roll_no: $("roll_no").value,
        name: $("student-name").value,
        department: $("department").value
      })
    });

    $("student-form").reset();
    message("student-message", "Student added successfully.");
    await loadStudents();
  } catch (error) {
    message("student-message", error.message, true);
  }
});

function renderAttendance(saved = []) {
  const head = $("attendance-head");
  const body = $("attendance-body");
  head.replaceChildren();
  body.replaceChildren();

  const header = document.createElement("tr");

  for (const label of [
    "Roll number", "Student name",
    "Period 1", "Period 2", "Period 3", "Period 4",
    "Period 5", "Period 6", "Period 7"
  ]) {
    const th = document.createElement("th");
    th.textContent = label;
    header.appendChild(th);
  }

  head.appendChild(header);

  for (const student of students) {
    const tr = document.createElement("tr");

    for (const value of [student.roll_no, student.name]) {
      const td = document.createElement("td");
      td.textContent = value;
      tr.appendChild(td);
    }

    for (let period = 1; period <= 7; period++) {
      const td = document.createElement("td");
      const select = document.createElement("select");
      select.dataset.studentId = student.id;
      select.dataset.period = period;

      for (const value of ["", "Present", "Absent"]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value || "Select";
        select.appendChild(option);
      }

      const previous = saved.find(record =>
        Number(record.student_id) === Number(student.id) &&
        Number(record.period) === period
      );

      if (previous) select.value = previous.status;
      td.appendChild(select);
      tr.appendChild(td);
    }

    body.appendChild(tr);
  }
}

$("load-attendance").addEventListener("click", async () => {
  try {
    const date = $("attendance-date").value;
    const records = await api(
      `/api/attendance?date=${encodeURIComponent(date)}`
    );
    renderAttendance(records);
    message("attendance-message", "Attendance records loaded.");
  } catch (error) {
    message("attendance-message", error.message, true);
  }
});

function setAll(status) {
  document.querySelectorAll("#attendance-body select").forEach(select => {
    select.value = status;
  });
}

$("all-present").addEventListener("click", () => setAll("Present"));
$("all-absent").addEventListener("click", () => setAll("Absent"));

$("save-attendance").addEventListener("click", async () => {
  try {
    const date = $("attendance-date").value;

    const records = [...document.querySelectorAll("#attendance-body select")]
      .filter(select => select.value)
      .map(select => ({
        student_id: Number(select.dataset.studentId),
        period: Number(select.dataset.period),
        status: select.value
      }));

    await api("/api/attendance", {
      method: "POST",
      body: JSON.stringify({ date, records })
    });

    message("attendance-message", "Attendance saved successfully.");
  } catch (error) {
    message("attendance-message", error.message, true);
  }
});

async function loadReport() {
  const month = $("report-month").value;
  reportRows = await api(`/api/monthly?month=${encodeURIComponent(month)}`);

  const body = $("report-body");
  body.replaceChildren();

  for (const student of reportRows) {
    const tr = document.createElement("tr");
    const values = [
      student.roll_no, student.name, student.present,
      student.absent, student.total, `${student.percentage}%`
    ];

    for (const value of values) {
      const td = document.createElement("td");
      td.textContent = value;
      tr.appendChild(td);
    }

    const alertCell = document.createElement("td");
    alertCell.textContent = student.total === 0
      ? "No records"
      : student.percentage < 75
        ? "Below 75%"
        : "OK";
    alertCell.className = student.total > 0 && student.percentage < 75
      ? "alert"
      : "good";
    tr.appendChild(alertCell);
    body.appendChild(tr);
  }

  message("report-message", `Report generated for ${month}.`);
}

$("load-report").addEventListener("click", async () => {
  try {
    await loadReport();
  } catch (error) {
    message("report-message", error.message, true);
  }
});

$("export-csv").addEventListener("click", () => {
  if (!reportRows.length) {
    message("report-message", "Generate the monthly report first.", true);
    return;
  }

  const rows = [
    ["Roll number", "Name", "Department", "Present", "Absent", "Total", "Percentage"],
    ...reportRows.map(s => [
      s.roll_no, s.name, s.department, s.present,
      s.absent, s.total, `${s.percentage}%`
    ])
  ];

  const csv = rows.map(row =>
    row.map(value =>
      `"${String(value).replace(/"/g, '""')}"`
    ).join(",")
  ).join("\r\n");

  const blob = new Blob(["\uFEFF" + csv], {
    type: "text/csv;charset=utf-8;"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `attendance-${$("report-month").value}.csv`;
  link.click();
  URL.revokeObjectURL(url);
});

loadStudents().catch(error => {
  message("student-message", error.message, true);
});
