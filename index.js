import express from "express";
import bodyParser from "body-parser";
import path from "path";
import pg from "pg";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import session from "express-session";

dotenv.config();
const app = express();
const port = 3000;
const __dirname = path.resolve();

app.use(express.static(path.join(__dirname, "public")));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  })
);
const db = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT || 5432,
});
db.connect();
export default db;

let lists = {
  personal: [],
  work: [],
  completed: [],
};
const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
  req.session.username;
  req.session.email;
  if (req.session.userId) {
    return next();
  }
  res.redirect("/login-signup");
}

app.get("/login-signup", (req, res) => {
  res.render("auth.ejs");
});

app.post("/login", async (req, res) => {
  const { username, email, password } = req.body;
  try {
    const result = await db.query("SELECT * FROM users WHERE email = ($1)", [
      email,
    ]);
    const user = result.rows[0];
    req.session.username = user.username;
    console.log(user.id);
    if (user) {
      if (await bcrypt.compare(password, user.password)) {
        req.session.userId = user.id;
        console.log(req.session.userId);
        res.redirect("/");
      }
    } else {
      res.send("Invalid Credentials.");
    }
  } catch (err) {
    console.error("Error logging in:", err);
    res.status(500).send("server error");
  }
});

app.post("/signup", async (req, res) => {
  const { username, email, password } = req.body;
  const formattedPassword = await bcrypt.hash(password, 10);

  const userCheck = await db.query("SELECT * FROM users WHERE email = $1", [
    email,
  ]);
  if (userCheck.rows.length > 0) {
    return res.status(400).send("User already exists");
  } else {
    try {
      const result = await db.query(
        "INSERT INTO users (username , email, password) values ($1, $2, $3)",
        [username, email, formattedPassword]
      );
      res.redirect("/login-signup");
    } catch (err) {
      console.error("Error registering user:", err);
      res.status(500).send("Server error");
    }
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Session destruction error:", err);
      return res.redirect("/dashboard");
    }
    res.redirect("/login-signup");
  });
});

app.get("/", isAuthenticated, async (req, res) => {
  const today = new Date();
  const options = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  };
  const day = today.toLocaleDateString("en-US", options);
  // Calendar logic
  const { month: queryMonth, year: queryYear } = req.query;

  let year = queryYear ? parseInt(queryYear) : today.getFullYear();
  let month = queryMonth ? parseInt(queryMonth) : today.getMonth();

  const calendarData = generateCalendar(month, year);

  const result = await db.query("SELECT * FROM lists WHERE user_id = $1", [
    req.session.userId,
  ]);
  let newListItems = result.rows.filter(
    (item) => !["personal", "work", "completed"].includes(item.type)
  );

  //calendar tasks management
  const calendarTasksResult = await db.query(
    "SELECT id, TO_CHAR(date, 'DD-MM-YYYY') AS date, task FROM calendar_tasks WHERE user_id = ($1)",
    [req.session.userId]
  );
  const calendarTasks = calendarTasksResult.rows;
  const dates = calendarTasksResult.rows.map((row) => row.date);

  //username
  const usernameResult = await db.query(
    "SELECT username FROM users WHERE id = $1",
    [req.session.userId]
  );
  const username = usernameResult.rows[0].username;

  res.render("index.ejs", {
    newItem: newListItems,
    year: year,
    months: months,
    calendarData: calendarData,
    month: month,
    currDate: day,
    calendarTasks: calendarTasks,
    dates: dates,
    username: username,
  });
});

function generateCalendar(month, year) {
  const start = new Date(year, month, 1).getDay();
  const endDate = new Date(year, month + 1, 0).getDate();
  const end = new Date(year, month, endDate).getDay();
  const endDateprev = new Date(year, month, 0).getDate();

  const dates = [];

  for (let i = start; i > 0; i--) {
    dates.push({ day: endDateprev - i + 1, className: "inactive" });
  }

  for (let i = 1; i <= endDate; i++) {
    const today = new Date();
    const isToday =
      i === today.getDate() &&
      month === today.getMonth() &&
      year === today.getFullYear();
    dates.push({ day: i, className: isToday ? "today" : "" });
  }

  for (let i = end; i < 6; i++) {
    dates.push({ day: i - end + 1, className: "inactive" });
  }

  return dates;
}

//accessing calendar tasks wrt dates
app.post("/tasks", async (req, res) => {
  const { taskDate } = req.body;
  console.log("Received taskDate:", taskDate);

  const [day, monthName, year] = taskDate.split("-");
  const monthNumber = new Date(`${monthName} 1`).getMonth() + 1;
  const formattedDate = `${year}-${monthNumber
    .toString()
    .padStart(2, "0")}-${day}`;

  console.log("Formatted taskDate:", formattedDate);

  try {
    const result = await db.query(
      "SELECT * FROM calendar_tasks WHERE date = $1 AND user_id = $2",
      [formattedDate, req.session.userId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

//posting tasks in calendar
app.post("/add-tasks", async (req, res) => {
  let task = req.body.task;
  let date = req.body.date;
  try {
    const result = await db.query(
      "INSERT INTO calendar_tasks (date,task,user_id) VALUES ($1,$2,$3) RETURNING *",
      [date, task, req.session.userId]
    );
    console.log("Inserted Task:", result.rows[0]);
    res.redirect("/");
  } catch (err) {
    console.error("Error inserting task:", err);
    res.status(500).send("Error saving task.");
  }
});

//delete tasks in calendar
app.post("/delete-task", async (req, res) => {
  const { id } = req.body;

  try {
    await db.query(
      "DELETE FROM calendar_tasks WHERE id = $1 AND user_id = $2",
      [id, req.session.userId]
    );
    res.json({ message: `Task with ID ${id} deleted successfully!` });
  } catch (err) {
    console.error("Error deleting task:", err);
    res.status(500).json({ error: "Failed to delete task" });
  }
});

//Adding list type in sidebar
app.post("/newlist", async (req, res) => {
  let newItems = req.body.addlist;
  try {
    const result = await db.query(
      "INSERT INTO lists (type, user_id) VALUES ($1,$2)",
      [newItems, req.session.userId]
    );
  } catch (err) {
    console.log(err, "error creating list type");
  }
  res.redirect("/");
});
//deleting list in sidebar
app.post("/delete", async (req, res) => {
  const itemId = req.body.id;
  console.log(itemId);
  try {
    const result = await db.query(
      "DELETE FROM lists WHERE id = $1 AND user_id = $2",
      [itemId, req.session.userId]
    );
    console.log(`Item with id ${itemId} deleted`);
  } catch (err) {
    console.log(err, "error deleting list item");
  }
  res.redirect("/");
});

app.get("/dashboard", (req, res) => {
  res.redirect("/");
});

app.get("/:listType", async (req, res) => {
  const listType = req.params.listType;

  try {
    const listTypeResult = await db.query(
      "SELECT id FROM lists WHERE type = $1",
      [listType]
    );
    if (listTypeResult.rows.length === 0) {
      return res.status(404).send("List not found");
    }

    const listType_id = listTypeResult.rows[0].id;

    try {
      const result = await db.query(
        "SELECT * FROM tasks WHERE list_id = $1 AND user_id = $2",
        [listType_id, req.session.userId]
      );
      const tasks = result.rows;

      res.render("index2.ejs", {
        listType: listType,
        items: tasks,
        newItem: [listType],
      });
    } catch (err) {
      console.log(err);
      res.status(404).send("Error fetching tasks");
    }
  } catch (err) {
    console.log(err);
    res.status(404).send("Error fetching list ID");
  }
});

//post tasks
app.post("/:listType/post", async (req, res) => {
  const listType = req.params.listType;
  let newTask = req.body.task;

  try {
    const listTypeResult = await db.query(
      "SELECT id FROM lists WHERE type = $1",
      [listType]
    );
    const listType_id = listTypeResult.rows[0].id;

    try {
      const result = await db.query(
        "INSERT INTO tasks (task , list_id, user_id) VALUES ($1 , $2, $3)",
        [newTask, listType_id, req.session.userId]
      );
    } catch (err) {
      console.log(err);
      res.status(404).send("List not found");
    }
  } catch (err) {
    console.log(err);
    res.status(404).send("Error fetching list ID");
  }
  res.redirect(`/${listType}`);
});

app.post("/:listType/delete", async (req, res) => {
  const listType = req.params.listType;
  const index = parseInt(req.body.index);
  try {
    const listTypeResult = await db.query(
      "SELECT id FROM lists WHERE type = $1",
      [listType]
    );
    const listType_id = listTypeResult.rows[0].id;

    const taskResult = await db.query(
      "SELECT id FROM tasks WHERE list_id = $1 AND user_id = $2 ORDER BY id ASC LIMIT 1 OFFSET $3",
      [listType_id, req.session.userId, index]
    );

    if (taskResult.rows.length === 0) {
      return res.status(404).send("Task not found");
    }

    const task_id = taskResult.rows[0].id;

    await db.query("DELETE FROM tasks WHERE id = $1 AND user_id = $2", [
      task_id,
      req.session.userId,
    ]);
    console.log(`Task with ID ${task_id} deleted successfully.`);
    res.redirect(`/${listType}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error deleting task");
  }
});

app.post("/:listType/complete", async (req, res) => {
  const listType = req.params.listType;
  const index = parseInt(req.body.index);
  try {
    const result = await db.query(
      "SELECT id FROM tasks WHERE list_id = (SELECT id FROM lists WHERE type = $1) AND user_id = $2 ORDER BY id ASC LIMIT 1 OFFSET $3",
      [listType, req.session.userId, index]
    );
    console.log(
      "listType:",
      listType,
      "userId:",
      req.session.userId,
      "index:",
      index
    );
    console.log(result.rows);
    if (result.rows.length === 0) {
      return res.status(404).send("Task not found");
    }

    const taskId = result.rows[0].id;

    const completedListResult = await db.query(
      "SELECT id FROM lists WHERE type = $1",
      ["completed"]
    );
    const completedListId = completedListResult.rows[0].id;

    await db.query(
      "UPDATE tasks SET list_id = $1 WHERE id = $2 AND user_id = $3",
      [completedListId, taskId, req.session.userId]
    );

    res.redirect(`/${listType}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error marking task as completed");
  }
});

app.listen(port, () => {
  console.log(`API is running at http://localhost:${port}`);
});
